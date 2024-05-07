import { Account, AccountType, Amount, Book, Transaction } from "bkper";
import { Result } from ".";
import { getQuantity, isInventoryBook } from "./BotService";
import { ADDITIONAL_COST_PROP, ADDITIONAL_COST_TX_IDS, GOOD_PROP, PURCHASE_CODE_PROP, PURCHASE_COST_PROP, PURCHASE_INVOICE_PROP, QUANTITY_PROP } from "./constants";

export class InterceptorOrderProcessor {

    async intercept(baseBook: Book, event: bkper.Event): Promise<Result> {

        // prevent response to Exchange Bot transactions
        if (event.agent.id == 'exchange-bot') {
            return { result: false };
        }

        // prevent response to transactions posted in the inventory book
        if (isInventoryBook(baseBook)) {
            return { result: false };
        }

        let operation = event.data.object as bkper.TransactionOperation;
        let transactionPayload = operation.transaction;

        if (!transactionPayload.posted) {
            return { result: false };
        }

        if (this.isGoodPurchase(transactionPayload)) {
            // prevent response to transactions posted without quantity or quantity = 0
            const quantity = getQuantity(baseBook, transactionPayload);
            if (quantity == null) {
                return { result: false };
            }
            if (quantity.eq(0)) {
                throw `Quantity must not be zero`;
            }
            return this.processGoodPurchase(baseBook, transactionPayload);
        }

        if (this.isAdditionalCost(transactionPayload)) {
            return this.processAdditionalCost(baseBook, transactionPayload);
        }

        return { result: false };

    }

    private isGoodPurchase(transactionPayload: bkper.Transaction): boolean {
        if (transactionPayload.creditAccount.type != AccountType.LIABILITY) {
            return false;
        }
        if (transactionPayload.properties[GOOD_PROP] == null) {
            return false;
        }
        if (transactionPayload.properties[PURCHASE_INVOICE_PROP] == null) {
            return false;
        }
        if (transactionPayload.properties[PURCHASE_CODE_PROP] != transactionPayload.properties[PURCHASE_INVOICE_PROP]) {
            return false;
        }
        return true;
    }

    private isAdditionalCost(transactionPayload: bkper.Transaction): boolean {
        if (transactionPayload.creditAccount.type != AccountType.LIABILITY) {
            return false;
        }
        if (transactionPayload.properties[GOOD_PROP] == null) {
            return false;
        }
        if (transactionPayload.properties[PURCHASE_CODE_PROP] == null) {
            return false;
        }
        return true;
    }

    // post aditional financial transaction from Buyer to Good (asset) in response to good purchase transaction from Supplier to Buyer
    private async processGoodPurchase(baseBook: Book, transactionPayload: bkper.Transaction): Promise<Result> {
        let buyerAccount = transactionPayload.debitAccount;
        let responses: string[] = await Promise.all(
            [
                // this.postFees(baseBook, exchangeAccount, transactionPayload),
                // this.postInterestOnPurchase(baseBook, exchangeAccount, transactionPayload),
                this.postGoodTradeOnPurchase(baseBook, buyerAccount, transactionPayload)
            ]);
        responses = responses.filter(r => r != null).filter(r => typeof r === "string");

        return { result: responses };
    }

    // post aditional financial transaction from Buyer to Good (asset) in response to service purchase transaction from Supplier to Buyer
    private async processAdditionalCost(baseBook: Book, transactionPayload: bkper.Transaction): Promise<Result> {
        let buyerAccount = transactionPayload.debitAccount;
        let responses: string[] = await Promise.all(
            [
                // this.postFees(baseBook, exchangeAccount, transactionPayload),
                // this.postInterestOnPurchase(baseBook, exchangeAccount, transactionPayload),
                this.postAdditionalCostOnPurchase(baseBook, buyerAccount, transactionPayload)
            ]);
        responses = responses.filter(r => r != null).filter(r => typeof r === "string");

        return { result: responses };
    }

    private async postGoodTradeOnPurchase(baseBook: Book, buyerAccount: bkper.Account, transactionPayload: bkper.Transaction): Promise<string> {
        let goodAccount = await this.getGoodAccount(baseBook, transactionPayload);
        let quantity = getQuantity(baseBook, transactionPayload);
        const amount = new Amount(transactionPayload.amount);
        let tx = await baseBook.newTransaction()
            .setAmount(amount)
            .from(buyerAccount)
            .to(goodAccount)
            .setDescription(transactionPayload.description)
            .setDate(transactionPayload.date)
            .setProperty(QUANTITY_PROP, quantity.toString())
            .setProperty(PURCHASE_COST_PROP, amount.toString())
            .setProperty(PURCHASE_INVOICE_PROP, transactionPayload.properties[PURCHASE_INVOICE_PROP])
            .setProperty(PURCHASE_CODE_PROP, transactionPayload.properties[PURCHASE_CODE_PROP])
            .addRemoteId(`${GOOD_PROP}_${transactionPayload.properties[PURCHASE_CODE_PROP]}`)
            .addRemoteId(`${GOOD_PROP}_${transactionPayload.id}`)
            .post();

        return `${tx.getDate()} ${tx.getAmount()} ${await tx.getCreditAccountName()} ${await tx.getDebitAccountName()} ${tx.getDescription()}`;
    }

    private async postAdditionalCostOnPurchase(baseBook: Book, buyerAccount: bkper.Account, transactionPayload: bkper.Transaction): Promise<string> {
        let goodAccount = await this.getGoodAccount(baseBook, transactionPayload);
        const amount = new Amount(transactionPayload.amount);
        let tx = await baseBook.newTransaction()
            .setAmount(amount)
            .from(buyerAccount)
            .to(goodAccount)
            .setDescription(transactionPayload.description)
            .setDate(transactionPayload.date)
            .setProperty(ADDITIONAL_COST_PROP, amount.toString())
            .setProperty(PURCHASE_INVOICE_PROP, transactionPayload.properties[PURCHASE_INVOICE_PROP])
            .setProperty(PURCHASE_CODE_PROP, transactionPayload.properties[PURCHASE_CODE_PROP])
            .addRemoteId(`${ADDITIONAL_COST_PROP}_${transactionPayload.id}`)
            .post();

        this.addAdditionalCostToGoodTx(baseBook, transactionPayload.properties[PURCHASE_CODE_PROP], transactionPayload.id);

        return `${tx.getDate()} ${tx.getAmount()} ${await tx.getCreditAccountName()} ${await tx.getDebitAccountName()} ${tx.getDescription()}`;
    }

    private async getGoodAccount(baseBook: Book, transactionPayload: bkper.Transaction): Promise<Account> {
        let good = transactionPayload.properties[GOOD_PROP];
        let goodAccount = await baseBook.getAccount(good);
        if (goodAccount == null) {
            goodAccount = await baseBook.newAccount().setName(good).setType(AccountType.ASSET).create();
        }
        return goodAccount;
    }

    private async addAdditionalCostToGoodTx(baseBook: Book, purchaseCodeProp: string, additionalCostTxId: string): Promise<void> {
        // get good purchase transaction from buyer
        let goodPurchaseTx: Transaction = null;
        let iterator = baseBook.getTransactions(`remoteId:${GOOD_PROP}_${purchaseCodeProp}`);
        if (await iterator.hasNext()) {
            goodPurchaseTx = await iterator.next();
        }
        // get root purchase transaction from supplier
        let goodPurchaseTxRemoteIds: string[] = [];
        if (goodPurchaseTx) {
            goodPurchaseTxRemoteIds = goodPurchaseTx.getRemoteIds();
        }
        for (const goodPurchaseTxRemoteId of goodPurchaseTxRemoteIds) {
            if (goodPurchaseTxRemoteId != `${GOOD_PROP}_${purchaseCodeProp}`) {
                const rootPurchaseTxId = goodPurchaseTxRemoteId.split('_')[1];
                const rootPurchaseTx = await baseBook.getTransaction(rootPurchaseTxId);
                // add additional cost transaction ids to root transaction
                if (rootPurchaseTx) {
                    let additionalCostTxIds = rootPurchaseTx.getProperty(ADDITIONAL_COST_TX_IDS);
                    if (additionalCostTxIds) {
                        additionalCostTxIds = `${additionalCostTxIds}, ${additionalCostTxId}`;
                    } else {
                        additionalCostTxIds = `${additionalCostTxId}`;
                    }
                    await rootPurchaseTx.setProperty(ADDITIONAL_COST_TX_IDS, additionalCostTxIds).update();
                }
            }
        }
    }

}