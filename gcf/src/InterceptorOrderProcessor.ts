import { Account, AccountType, Amount, Book } from "bkper";
import { Result } from ".";
import { isInventoryBook } from "./BotService";
import { QUANTITY_PROP } from "./constants";

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

        return this.processPurchase(baseBook, transactionPayload);

        // if (this.isPurchase(baseBook, transactionPayload)) {
        //     return this.processPurchase(baseBook, transactionPayload);
        // }

        // if (this.isSale(baseBook, transactionPayload)) {
        //     return this.processSale(baseBook, transactionPayload);
        // }

        // return { result: false };

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

    protected async processPurchase(baseBook: Book, transactionPayload: bkper.Transaction): Promise<Result> {
        let responses: string[] = await Promise.all(
            [
                this.postFees(baseBook, exchangeAccount, transactionPayload),
                this.postInterestOnPurchase(baseBook, exchangeAccount, transactionPayload),
                this.postInstrumentTradeOnPurchase(baseBook, exchangeAccount, transactionPayload)
            ]);
        responses = responses.filter(r => r != null).filter(r => typeof r === "string")
        return { result: responses };
    }

    protected isPurchase(baseBook: Book, transactionPayload: bkper.Transaction): boolean {

        // if (this.getInstrument(transactionPayload) == null) {
        //     return false;
        // }

        // if (this.getTradeDate(transactionPayload) == null) {
        //     return false;
        // }

        // let exchangeAccount = transactionPayload.debitAccount;

        // if (this.getFeesAccountName(exchangeAccount) == null) {
        //     return false;
        // }

        return true;
    }


    protected isSale(baseBook: Book, transactionPayload: bkper.Transaction): boolean {

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

    protected getQuantity(book: Book, transactionPayload: bkper.Transaction): Amount {
        let quantityProp = transactionPayload.properties[QUANTITY_PROP];
        if (quantityProp == null) {
            return null;
        }
        return book.parseValue(quantityProp);
    }

}