import { Book } from "bkper-js";
import { Result } from "./index.js";
import { isInventoryBook } from "./BotService.js";
import { EventHandlerTransaction } from "./EventHandlerTransaction.js";
import { InterceptorOrderProcessorDeleteFinancial } from "./InterceptorOrderProcessorDeleteFinancial.js";
import { InterceptorOrderProcessorDeleteGoods } from "./InterceptorOrderProcessorDeleteGoods.js";

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

    protected connectedTransactionNotFound(inventoryBook: Book, financialTransaction: bkper.Transaction, goodExcCode?: string): Promise<string | undefined> {
        return new Promise((resolve, reject) => {
            const result = undefined;
            resolve(result);
        });
    }

    protected connectedTransactionFound(): Promise<string | undefined> {
        return new Promise((resolve, reject) => {
            const result = undefined;
            resolve(result);
        });
    }

}