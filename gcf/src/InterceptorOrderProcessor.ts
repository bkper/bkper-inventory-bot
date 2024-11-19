import { Account, AccountType, Amount, Book, Transaction } from "bkper-js";
import { Result } from "./index.js";
import { getGoodPurchaseRootTx, getQuantity, isInventoryBook } from "./BotService.js";
import { ADDITIONAL_COST_PROP, ADDITIONAL_COST_TX_IDS, GOOD_PROP, ORDER_PROP, PURCHASE_CODE_PROP, PURCHASE_INVOICE_PROP, QUANTITY_PROP } from "./constants.js";

export class InterceptorOrderProcessor {

    async intercept(baseBook: Book, event: bkper.Event): Promise<Result> {

        // prevent response to Exchange Bot transactions
        if (event.agent?.id == 'exchange-bot') {
            return { result: false };
        }

        // prevent response to transactions posted in the inventory book
        if (isInventoryBook(baseBook)) {
            return { result: false };
        }

        let operation = event.data?.object as bkper.TransactionOperation;
        let transactionPayload = operation?.transaction;

        if (transactionPayload) {
            if (!transactionPayload.posted) {
                return { result: false };
            }

            if (this.isGoodPurchase(transactionPayload)) {
                // prevent response to transactions posted without quantity or quantity = 0
                const quantity = getQuantity(baseBook, transactionPayload);
                if (quantity == undefined) {
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
        }

        return { result: false };

    }

    private isGoodPurchase(transactionPayload: bkper.Transaction): boolean {
        if (transactionPayload.creditAccount && transactionPayload.creditAccount.type != AccountType.LIABILITY) {
            return false;
        }
        if (transactionPayload.properties) {
            if (transactionPayload.properties[GOOD_PROP] != undefined
                || transactionPayload.properties[PURCHASE_INVOICE_PROP] == undefined
                || transactionPayload.properties[PURCHASE_CODE_PROP] == undefined
                || (transactionPayload.properties[PURCHASE_CODE_PROP] != transactionPayload.properties[PURCHASE_INVOICE_PROP])) {
                return false;
            }
        }
        return true;
    }

    private isAdditionalCost(transactionPayload: bkper.Transaction): boolean {
        if (transactionPayload.creditAccount && transactionPayload.creditAccount.type != AccountType.LIABILITY) {
            return false;
        }
        if (transactionPayload.properties) {
            if (transactionPayload.properties[GOOD_PROP] == undefined
                || transactionPayload.properties[PURCHASE_CODE_PROP] == undefined
                || transactionPayload.properties[PURCHASE_INVOICE_PROP] == undefined) {
                return false;
            }
        }
        return true;
    }

    // post aditional financial transaction from Buyer to Good (asset) in response to good purchase transaction from Supplier to Buyer
    private async processGoodPurchase(baseBook: Book, transactionPayload: bkper.Transaction): Promise<Result> {
        let buyerAccount = transactionPayload.debitAccount;
        if (buyerAccount) {
            let responses: string[] = await Promise.all(
                [
                    // this.postFees(baseBook, exchangeAccount, transactionPayload),
                    // this.postInterestOnPurchase(baseBook, exchangeAccount, transactionPayload),
                    this.postGoodTradeOnPurchase(baseBook, buyerAccount, transactionPayload)
                ]);
            responses = responses.filter(r => r != null).filter(r => typeof r === "string");
            return { result: responses };
        } else {
            return { result: false };
        }
    }

    // post aditional financial transaction from Buyer to Good (asset) in response to service purchase transaction from Supplier to Buyer
    private async processAdditionalCost(baseBook: Book, transactionPayload: bkper.Transaction): Promise<Result> {
        let buyerAccount = transactionPayload.debitAccount;
        if (buyerAccount) {
            let responses: string[] = await Promise.all(
                [
                    // this.postFees(baseBook, exchangeAccount, transactionPayload),
                    // this.postInterestOnPurchase(baseBook, exchangeAccount, transactionPayload),
                    this.postAdditionalCostOnPurchase(baseBook, buyerAccount, transactionPayload)
                ]);
            responses = responses.filter(r => r != null).filter(r => typeof r === "string");
            return { result: responses };
        } else {
            return { result: false };
        }
    }

    private async postGoodTradeOnPurchase(baseBook: Book, buyerAccount: bkper.Account, transactionPayload: bkper.Transaction): Promise<string> {
        const quantity = getQuantity(baseBook, transactionPayload);
        if (quantity && transactionPayload.amount && transactionPayload.date && transactionPayload.properties) {
            const good = transactionPayload.properties![GOOD_PROP];
            const goodAccount = await this.getGoodAccount(baseBook, good);
            const order = this.getOrder(baseBook, transactionPayload);
            const amount = new Amount(transactionPayload.amount);
            const tx = await new Transaction(baseBook)
                .setAmount(amount)
                .from(buyerAccount)
                .to(goodAccount)
                .setDescription(transactionPayload.description ?? '')
                .setDate(transactionPayload.date)
                .setProperty(QUANTITY_PROP, quantity.toString())
                .setProperty(PURCHASE_INVOICE_PROP, transactionPayload.properties[PURCHASE_INVOICE_PROP])
                .setProperty(PURCHASE_CODE_PROP, transactionPayload.properties[PURCHASE_CODE_PROP])
                .setProperty(ORDER_PROP, order)
                .addRemoteId(`${GOOD_PROP}_${transactionPayload.properties[PURCHASE_CODE_PROP]}`)
                .addRemoteId(`${GOOD_PROP}_${transactionPayload.id}`)
                .post();

            return `${tx.getDate()} ${tx.getAmount()} ${await tx.getCreditAccountName()} ${await tx.getDebitAccountName()} ${tx.getDescription()}`;
        }
        return 'ERROR (postGoodTradeOnPurchase): transaction payload is missing required fields';
    }

    private async postAdditionalCostOnPurchase(baseBook: Book, buyerAccount: bkper.Account, transactionPayload: bkper.Transaction): Promise<string> {
        if (transactionPayload.amount && transactionPayload.date && transactionPayload.properties && transactionPayload.id) {
            let good = transactionPayload.properties![GOOD_PROP];
            let goodAccount = await this.getGoodAccount(baseBook, good);
            const amount = new Amount(transactionPayload.amount);
            let tx = await new Transaction(baseBook)
                .setAmount(amount)
                .from(buyerAccount)
                .to(goodAccount)
                .setDescription(transactionPayload.description ?? '')
                .setDate(transactionPayload.date)
                .setProperty(ADDITIONAL_COST_PROP, amount.toString())
                .setProperty(PURCHASE_INVOICE_PROP, transactionPayload.properties[PURCHASE_INVOICE_PROP])
                .setProperty(PURCHASE_CODE_PROP, transactionPayload.properties[PURCHASE_CODE_PROP])
                .addRemoteId(`${ADDITIONAL_COST_PROP}_${transactionPayload.id}`)
                .post();

            this.addAdditionalCostToGoodTx(baseBook, transactionPayload.properties[PURCHASE_CODE_PROP], transactionPayload.id);

            return `${tx.getDate()} ${tx.getAmount()} ${await tx.getCreditAccountName()} ${await tx.getDebitAccountName()} ${tx.getDescription()}`;
        }
        return 'ERROR (postAdditionalCostOnPurchase): transaction payload is missing required fields';
    }

    private async getGoodAccount(baseBook: Book, good: string): Promise<Account> {
        let goodAccount = await baseBook.getAccount(good);
        if (goodAccount == null) {
            goodAccount = await new Account(baseBook).setName(good).setType(AccountType.ASSET).create();
        }
        return goodAccount;
    }

    protected getOrder(book: Book, transactionPayload: bkper.Transaction): string {
        const orderProp = transactionPayload.properties ? transactionPayload.properties[ORDER_PROP] : undefined;
        if (orderProp == undefined) {
            return '';
        }
        const orderAmount = book.parseValue(orderProp);
        if (orderAmount == undefined) {
            return '';
        }
        return orderAmount.round(0).toString();
    }

    private async addAdditionalCostToGoodTx(baseBook: Book, purchaseCodeProp: string, additionalCostTxId: string): Promise<string> {
        const rootPurchaseTx = await getGoodPurchaseRootTx(baseBook, purchaseCodeProp.toLowerCase());
        if (rootPurchaseTx) {
            let additionalCostTxIds = rootPurchaseTx.getProperty(ADDITIONAL_COST_TX_IDS);
            if (additionalCostTxIds) {
                let remoteIds: string[] = JSON.parse(additionalCostTxIds);
                remoteIds.push(additionalCostTxId);
                additionalCostTxIds = JSON.stringify(remoteIds);
            } else {
                let remoteIds: string[] = [`${additionalCostTxId}`];
                additionalCostTxIds = JSON.stringify(remoteIds);
            }
            await rootPurchaseTx.setProperty(ADDITIONAL_COST_TX_IDS, additionalCostTxIds).update();
            return `UPDATED: good purchase transaction on ${rootPurchaseTx.getDate()}, purchase_code: ${purchaseCodeProp}, ${rootPurchaseTx.getDescription()}`;
        } else {
            return `ERROR: root purchase transaction not found`;
        }
    }

}