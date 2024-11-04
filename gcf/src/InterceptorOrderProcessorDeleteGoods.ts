import { Book } from "bkper-js";
import { Result } from "./index.js";
import { InterceptorOrderProcessorDelete } from "./InterceptorOrderProcessorDelete.js";
import { buildBookAnchor, getExchangeCodeFromAccount, getFinancialBook, getGoodAccount } from "./BotService.js";

export class InterceptorOrderProcessorDeleteGoods extends InterceptorOrderProcessorDelete {

    async intercept(inventoryBook: Book, event: bkper.Event): Promise<Result> {

        const operation = event.data?.object as bkper.TransactionOperation;
        const transactionPayload = operation.transaction;

        if (transactionPayload && !transactionPayload.posted) {
            return { result: false };
        }

        const goodTx = transactionPayload?.id ? await inventoryBook.getTransaction(transactionPayload.id) : undefined;
        const goodAccount = goodTx ? await getGoodAccount(goodTx) : undefined;
        if (!goodAccount) {
            return { result: false };
        }

        const goodExcCode = await getExchangeCodeFromAccount(goodAccount);
        const financialBook = await getFinancialBook(inventoryBook, goodExcCode);

        const response = financialBook && transactionPayload ? await this.cascadeDelete(financialBook, transactionPayload) : undefined;
        if (financialBook && response) {
            const bookAnchor = buildBookAnchor(financialBook);
            return { result: `${bookAnchor}: ${await this.buildDeleteResponse(response)}` };
        }

        return { result: false };
    }

}