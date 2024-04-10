import { Book } from "bkper";
import { InterceptorOrderProcessorDelete } from "./InterceptorOrderProcessorDelete";
import { Result } from ".";
import { GOOD_PROP } from "./constants";

export class InterceptorOrderProcessorDeleteFinancial extends InterceptorOrderProcessorDelete {

    async intercept(financialBook: Book, event: bkper.Event): Promise<Result> {

        let operation = event.data.object as bkper.TransactionOperation;
        let transactionPayload = operation.transaction;

        if (!transactionPayload.posted) {
            return {result: false};
        }

        let responses: string[] = [];

        // let response1 = await this.deleteTransaction(financialBook, `${FEES_PROP}_${transactionPayload.id}`);
        // if (response1) {
        //     responses.push(await this.buildDeleteResponse(response1));
        // }
        // let response2 = await this.deleteTransaction(financialBook, `${INTEREST_PROP}_${transactionPayload.id}`);
        // if (response2) {
        //     responses.push(await this.buildDeleteResponse(response2));
        // }
        let response3 = await this.deleteTransaction(financialBook, `${GOOD_PROP}_${transactionPayload.id}`);
        if (response3) {
            await this.deleteOnInventoryBook(financialBook, response3.getId());
        } else {
            await this.deleteOnInventoryBook(financialBook, transactionPayload.id);
        }

        return {result: responses.length > 0 ? responses : false};
    }

}
