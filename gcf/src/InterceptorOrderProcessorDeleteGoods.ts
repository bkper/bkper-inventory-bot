import { Book } from "bkper";
import { Result } from ".";
import { InterceptorOrderProcessorDelete } from "./InterceptorOrderProcessorDelete";
import { getExchangeCodeFromAccount, getFinancialBook, getGoodAccount } from "./BotService";

export class InterceptorOrderProcessorDeleteGoods extends InterceptorOrderProcessorDelete {

    async intercept(inventoryBook: Book, event: bkper.Event): Promise<Result> {

        let operation = event.data.object as bkper.TransactionOperation;
        let transactionPayload = operation.transaction;

        if (!transactionPayload.posted) {
            return {result: false};
        }

        let goodTx = await inventoryBook.getTransaction(transactionPayload.id);
        let goodAccount = await getGoodAccount(goodTx);
        if (!goodAccount) {
            return {result: false};
        }

        let goodExcCode = await getExchangeCodeFromAccount(goodAccount);
        let financialBook = await getFinancialBook(inventoryBook, goodExcCode);

        this.cascadeDelete(financialBook, transactionPayload);

        return {result: `DELETED: ${goodTx.getDateFormatted()} ${goodTx.getAmount()} ${await goodTx.getCreditAccountName()} ${await goodTx.getDebitAccountName()} ${goodTx.getDescription()}`};
    }

}