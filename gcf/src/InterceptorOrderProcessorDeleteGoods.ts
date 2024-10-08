// @ts-nocheck
import { Book } from "bkper-js";
import { Result } from "./index.js";
import { InterceptorOrderProcessorDelete } from "./InterceptorOrderProcessorDelete.js";
import { buildBookAnchor, getExchangeCodeFromAccount, getFinancialBook, getGoodAccount } from "./BotService.js";

export class InterceptorOrderProcessorDeleteGoods extends InterceptorOrderProcessorDelete {

    async intercept(inventoryBook: Book, event: bkper.Event): Promise<Result> {

        const operation = event.data.object as bkper.TransactionOperation;
        const transactionPayload = operation.transaction;

        if (!transactionPayload.posted) {
            return { result: false };
        }

        const goodTx = await inventoryBook.getTransaction(transactionPayload.id);
        const goodAccount = await getGoodAccount(goodTx);
        if (!goodAccount) {
            return { result: false };
        }

        const goodExcCode = await getExchangeCodeFromAccount(goodAccount);
        const financialBook = await getFinancialBook(inventoryBook, goodExcCode);

        const response = await this.cascadeDelete(financialBook, transactionPayload);
        if (response) {
            const bookAnchor = buildBookAnchor(financialBook);
            return { result: `${bookAnchor}: ${await this.buildDeleteResponse(response)}` };
        }

        return { result: false };
    }

}