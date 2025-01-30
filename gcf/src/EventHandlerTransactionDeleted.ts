import { Book, Transaction } from "bkper-js";
import { Result } from "./index.js";
import { buildBookAnchor, isInventoryBook } from "./BotService.js";
import { EventHandlerTransaction } from "./EventHandlerTransaction.js";
import { InterceptorOrderProcessorDeleteFinancial } from "./InterceptorOrderProcessorDeleteFinancial.js";
import { InterceptorOrderProcessorDeleteGoods } from "./InterceptorOrderProcessorDeleteGoods.js";
import { GOOD_PROP, PURCHASE_CODE_PROP } from "./constants.js";

export class EventHandlerTransactionDeleted extends EventHandlerTransaction {

    async intercept(book: Book, event: bkper.Event): Promise<Result> {
        let result: Result;
        if (isInventoryBook(book)) {
            result = await new InterceptorOrderProcessorDeleteGoods().intercept(book, event);
            console.log("RESULT: ", result);
        } else {
            result = await new InterceptorOrderProcessorDeleteFinancial().intercept(book, event);
        }
        return result;
    }

    protected getTransactionQuery(transaction: bkper.Transaction): string {
        if (transaction.properties && transaction.properties[GOOD_PROP]) {
            return `remoteId:${transaction.id}`;
        }
        return `remoteId:${transaction.properties?.[PURCHASE_CODE_PROP] ?? ''}_${transaction.debitAccount?.normalizedName ?? ''}`;

    }

    protected connectedTransactionNotFound(financialBook: Book, inventoryBook: Book, financialTransaction: bkper.Transaction, goodExcCode: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const result = 'Transaction not found in Inventory book';
            resolve(result);
        });
    }

    protected async connectedTransactionFound(financialBook: Book, inventoryBook: Book, financialTransaction: bkper.Transaction, goodTransaction: Transaction, goodExcCode: string): Promise<string> {
        let bookAnchor = buildBookAnchor(inventoryBook);

        if (goodTransaction.isChecked()) {
            goodTransaction.uncheck();
        }

        // await flagStockAccountForRebuildIfNeeded(stockTransaction);

        await goodTransaction.remove();

        let amountFormatted = inventoryBook.formatValue(goodTransaction.getAmount())

        let record = `DELETED: ${goodTransaction.getDateFormatted()} ${amountFormatted} ${await goodTransaction.getCreditAccountName()} ${await goodTransaction.getDebitAccountName()} ${goodTransaction.getDescription()}`;

        return `${bookAnchor}: ${record}`;
    }

}