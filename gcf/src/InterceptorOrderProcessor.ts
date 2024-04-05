import { Account, AccountType, Amount, Book } from "bkper";
import { Result } from ".";
import { isInventoryBook } from "./BotService";
import { GOOD_PROP, PRICE_PROP, QUANTITY_PROP } from "./constants";

export class InterceptorOrderProcessor {

    async intercept(baseBook: Book, event: bkper.Event): Promise<Result> {

        if (event.agent.id == 'exchange-bot') {
            return { result: false };
        }

        if (isInventoryBook(baseBook)) {
            return { result: false };
        }

        let operation = event.data.object as bkper.TransactionOperation;
        let transactionPayload = operation.transaction;

        if (!transactionPayload.posted) {
            return { result: false };
        }

        const quantity = this.getQuantity(baseBook, transactionPayload);
        if (quantity == null) {
            return { result: false };
        }
        if (quantity.eq(0)) {
            throw `Quantity must not be zero`;
        }

        if (this.isPurchase(baseBook, transactionPayload)) {
            return this.processPurchase(baseBook, transactionPayload);
        }

        // if (this.isSale(baseBook, transactionPayload)) {
        //     return this.processSale(baseBook, transactionPayload);
        // }

        return { result: false };

    }

    // protected async processSale(baseBook: Book, transactionPayload: bkper.Transaction): Promise<Result> {
    //     let exchangeAccount = this.getExchangeAccountOnSale(baseBook, transactionPayload);

    //     let responses: string[] = await Promise.all(
    //         [
    //             this.postFees(baseBook, exchangeAccount, transactionPayload),
    //             this.postInterestOnSale(baseBook, exchangeAccount, transactionPayload),
    //             this.postInstrumentTradeOnSale(baseBook, exchangeAccount, transactionPayload)
    //         ]);

    //     responses = responses.filter(r => r != null).filter(r => typeof r === "string")

    //     return { result: responses };
    // }

    private async processPurchase(baseBook: Book, transactionPayload: bkper.Transaction): Promise<Result> {
        let buyerAccount = transactionPayload.debitAccount;
        let responses: string[] = await Promise.all(
            [
                // this.postFees(baseBook, exchangeAccount, transactionPayload),
                // this.postInterestOnPurchase(baseBook, exchangeAccount, transactionPayload),
                this.postGoodTradeOnPurchase(baseBook, buyerAccount, transactionPayload)
            ]);
        responses = responses.filter(r => r != null).filter(r => typeof r === "string")
        return { result: responses };
    }

    private isPurchase(baseBook: Book, transactionPayload: bkper.Transaction): boolean {
        if (this.getGood(transactionPayload) == null) {
            return false;
        }
        return true;
    }


    private isSale(baseBook: Book, transactionPayload: bkper.Transaction): boolean {

        // if (this.getInstrument(transactionPayload) == null) {
        //     return false;
        // }

        // if (this.getTradeDate(transactionPayload) == null) {
        //     return false;
        // }

        // let exchangeAccount = transactionPayload.creditAccount;
        // if (this.getFeesAccountName(exchangeAccount) == null) {
        //     return false;
        // }

        return true;
    }

    private getQuantity(book: Book, transactionPayload: bkper.Transaction): Amount {
        let quantityProp = transactionPayload.properties[QUANTITY_PROP];
        if (quantityProp == null) {
            return null;
        }
        return book.parseValue(quantityProp);
    }

    private async postGoodTradeOnPurchase(baseBook: Book, buyerAccount: bkper.Account, transactionPayload: bkper.Transaction): Promise<string> {
        let goodAccount = await this.getGoodAccount(baseBook, transactionPayload);
        let quantity = this.getQuantity(baseBook, transactionPayload);
        const amount = new Amount(transactionPayload.amount);
        const price = amount.div(quantity);
        let tx = await baseBook.newTransaction()
            .setAmount(amount)
            .from(buyerAccount)
            .to(goodAccount)
            .setDescription(transactionPayload.description)
            .setDate(transactionPayload.date)
            .setProperty(QUANTITY_PROP, quantity.toString())
            .setProperty(PRICE_PROP, price.toString())
            .addRemoteId(`${GOOD_PROP}_${transactionPayload.id}`)
            .post();
        return `${tx.getDate()} ${tx.getAmount()} ${await tx.getCreditAccountName()} ${await tx.getDebitAccountName()} ${tx.getDescription()}`;
    }

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