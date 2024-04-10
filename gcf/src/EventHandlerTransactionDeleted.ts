import { Book, Transaction } from "bkper";
import { Result } from ".";
import { isInventoryBook } from "./BotService";
import { EventHandlerTransaction } from "./EventHandlerTransaction";
import { InterceptorOrderProcessorDeleteFinancial } from "./InterceptorOrderProcessorDeleteFinancial";
import { InterceptorOrderProcessorDeleteGoods } from "./InterceptorOrderProcessorDeleteGoods";

export class EventHandlerTransactionDeleted extends EventHandlerTransaction {

    async intercept(book: Book, event: bkper.Event): Promise<Result> {
        let result: Result;
        if (isInventoryBook(book)) {
            result = await new InterceptorOrderProcessorDeleteGoods().intercept(book, event);
        } else {
            result = await new InterceptorOrderProcessorDeleteFinancial().intercept(book, event);
        }
        return result;
    }

    protected getTransactionQuery(transaction: bkper.Transaction): string {
        return `remoteId:${transaction.id}`;
    }

    protected connectedTransactionNotFound(financialBook: Book, goodBook: Book, financialTransaction: bkper.Transaction, goodExcCode: string): Promise<string> {
        return null;
    }

    protected async connectedTransactionFound(financialBook: Book, goodBook: Book, financialTransaction: bkper.Transaction, goodTransaction: Transaction, goodExcCode: string): Promise<string> {
        let bookAnchor = super.buildBookAnchor(goodBook);

        if (goodTransaction.isChecked()) {
            goodTransaction.uncheck();
        }

        // await flagStockAccountForRebuildIfNeeded(stockTransaction);

        await goodTransaction.remove();

        let amountFormatted = goodBook.formatValue(goodTransaction.getAmount())

        let record = `DELETED: ${goodTransaction.getDateFormatted()} ${amountFormatted} ${await goodTransaction.getCreditAccountName()} ${await goodTransaction.getDebitAccountName()} ${goodTransaction.getDescription()}`;

        return `${bookAnchor}: ${record}`;
    }

}