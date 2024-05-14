import { Book } from "bkper";
import { InterceptorOrderProcessorDelete } from "./InterceptorOrderProcessorDelete";
import { Result } from ".";
import { ADDITIONAL_COST_PROP, ADDITIONAL_COST_TX_IDS } from "./constants";
import { getGoodPurchaseRootTx } from "./BotService";

export class InterceptorOrderProcessorDeleteFinancial extends InterceptorOrderProcessorDelete {

    async intercept(financialBook: Book, event: bkper.Event): Promise<Result> {

        let operation = event.data.object as bkper.TransactionOperation;
        let transactionPayload = operation.transaction;

        if (!transactionPayload.posted) {
            return { result: false };
        }

        let responses: string[] = [];

        // Delete additional cost transactions posted by the user
        const additionalCostTransactionIds = JSON.parse(transactionPayload.properties[ADDITIONAL_COST_TX_IDS]);
        for (const additionalCostTransactionId of additionalCostTransactionIds) {
            const addCostTx = await financialBook.getTransaction(additionalCostTransactionId);
            await addCostTx.uncheck();
            let response1 = await addCostTx.remove();
            if (response1) {
                responses.push(await this.buildDeleteResponse(response1));
                // Delete additional cost transactions posted by the bot
                const response2 = await this.deleteTransactionByRemoteId(financialBook, `${ADDITIONAL_COST_PROP}_${additionalCostTransactionId}`);
                if (response2) {
                    responses.push(await this.buildDeleteResponse(response2));
                }
            }
        }

        // let response = await this.deleteTransactionByRemoteId(financialBook, `${GOOD_PROP}_${transactionPayload.id}`);
        // if (response) {
        //     await this.deleteOnInventoryBook(financialBook, response.getId());
        // } else {
        //     await this.deleteOnInventoryBook(financialBook, transactionPayload.properties[PURCHASE_CODE_PROP]);
        // }

        return { result: responses.length > 0 ? responses : false };
    }

    private async removeAdditionalCostFromGoodTx(baseBook: Book, purchaseCodeProp: string, additionalCostTxId: string): Promise<void> {
        const rootPurchaseTx = await getGoodPurchaseRootTx(baseBook, purchaseCodeProp);
        if (rootPurchaseTx) {
            let additionalCostTxIds = rootPurchaseTx.getProperty(ADDITIONAL_COST_TX_IDS);
            if (additionalCostTxIds) {
                let remoteIds: string[] = JSON.parse(additionalCostTxIds);
                const index = remoteIds.indexOf(additionalCostTxId);
                if (index != -1) {
                    remoteIds.splice(index, 1);
                }
                additionalCostTxIds = remoteIds.length > 0 ? JSON.stringify(remoteIds) : '';
                await rootPurchaseTx.setProperty(ADDITIONAL_COST_TX_IDS, additionalCostTxIds).update();
            }
        }
    }
}
