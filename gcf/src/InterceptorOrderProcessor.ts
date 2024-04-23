import { Account, AccountType, Amount, Book } from "bkper";
import { Result } from ".";
import { getQuantity, isInventoryBook } from "./BotService";
import { GOOD_PROP, PURCHASE_CODE_PROP, PURCHASE_INVOICE_PROP, PURCHASE_PRICE_PROP, QUANTITY_PROP } from "./constants";

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

        // prevent response to transactions posted without quantity or quantity = 0
        const quantity = getQuantity(baseBook, transactionPayload);
        if (quantity == null) {
            return { result: false };
        }
        if (quantity.eq(0)) {
            throw `Quantity must not be zero`;
        }

        if (this.isPurchase(transactionPayload)) {
            return this.processPurchase(baseBook, transactionPayload);
        }

        // if (this.isSale(transactionPayload)) {
        //     return this.processSale(baseBook, transactionPayload);
        // }

        return { result: false };

    }

    private isPurchase(transactionPayload: bkper.Transaction): boolean {
        if (this.getGood(transactionPayload) == null) {
            return false;
        }
        if (transactionPayload.creditAccount.type != AccountType.LIABILITY) {
            return false;
        }
        return true;
    }

    // post aditional financial transactions in response to the initial purchase transaction from Supplier to Buyer
    private async processPurchase(baseBook: Book, transactionPayload: bkper.Transaction): Promise<Result> {
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

    private async postGoodTradeOnPurchase(baseBook: Book, buyerAccount: bkper.Account, transactionPayload: bkper.Transaction): Promise<string> {
        let goodAccount = await this.getGoodAccount(baseBook, transactionPayload);
        let quantity = getQuantity(baseBook, transactionPayload);
        const amount = new Amount(transactionPayload.amount);
        const price = amount.div(quantity);
        let tx = await baseBook.newTransaction()
            .setAmount(amount)
            .from(buyerAccount)
            .to(goodAccount)
            .setDescription(transactionPayload.description)
            .setDate(transactionPayload.date)
            .setProperty(QUANTITY_PROP, quantity.toString())
            .setProperty(PURCHASE_PRICE_PROP, price.toString())
            .setProperty(PURCHASE_INVOICE_PROP, transactionPayload.properties[PURCHASE_INVOICE_PROP])
            .setProperty(PURCHASE_CODE_PROP, transactionPayload.properties[PURCHASE_CODE_PROP])
            .addRemoteId(`${GOOD_PROP}_${transactionPayload.id}`)
            .post();
        return `${tx.getDate()} ${tx.getAmount()} ${await tx.getCreditAccountName()} ${await tx.getDebitAccountName()} ${tx.getDescription()}`;
    }

    // private isSale(transactionPayload: bkper.Transaction): boolean {
    //     if (this.getGood(transactionPayload) == null) {
    //         return false;
    //     }
    //     if (transactionPayload.creditAccount.type != AccountType.INCOMING) {
    //         return false;
    //     }
    //     return true;
    // }

    // post aditional financial transactions in response to the initial sale transaction from Customer to Bank Account
    // private async processSale(baseBook: Book, transactionPayload: bkper.Transaction): Promise<Result> {
    //     let customerAccount = transactionPayload.creditAccount;
    //     let responses: string[] = await Promise.all(
    //         [
    //             // this.postFees(baseBook, exchangeAccount, transactionPayload),
    //             // this.postInterestOnSale(baseBook, exchangeAccount, transactionPayload),
    //             this.postGoodTradeOnSale(baseBook, customerAccount, transactionPayload)
    //         ]);
    //     responses = responses.filter(r => r != null).filter(r => typeof r === "string");

    //     return { result: responses };
    // }

    // private async postGoodTradeOnSale(baseBook: Book, customerAccount: bkper.Account, transactionPayload: bkper.Transaction): Promise<string> {
    //     let goodAccount = await this.getGoodAccount(baseBook, transactionPayload);
    //     let quantity = getQuantity(baseBook, transactionPayload);
    //     const amount = new Amount(transactionPayload.amount);
    //     const price = amount.div(quantity);
    //     let tx = await baseBook.newTransaction()
    //         .setAmount(amount)
    //         .from(goodAccount)
    //         .to(customerAccount)
    //         .setDescription(transactionPayload.description)
    //         .setDate(transactionPayload.date)
    //         .setProperty(QUANTITY_PROP, quantity.toString())
    //         .setProperty(PRICE_PROP, price.toString())
    //         .addRemoteId(`${GOOD_PROP}_${transactionPayload.id}`)
    //         .post();
    //     return `${tx.getDate()} ${tx.getAmount()} ${await tx.getCreditAccountName()} ${await tx.getDebitAccountName()} ${tx.getDescription()}`;
    // }

    private async getGoodAccount(baseBook: Book, transactionPayload: bkper.Transaction): Promise<Account> {
        let good = this.getGood(transactionPayload);
        let goodAccount = await baseBook.getAccount(good);
        if (goodAccount == null) {
            goodAccount = await baseBook.newAccount().setName(good).setType(AccountType.ASSET).create();
        }
        return goodAccount;
    }

    private getGood(transactionPayload: bkper.Transaction): string {
        return transactionPayload.properties[GOOD_PROP];
    }

}