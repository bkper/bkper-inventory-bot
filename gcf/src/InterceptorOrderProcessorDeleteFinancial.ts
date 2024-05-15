import { Book } from "bkper";
import { InterceptorOrderProcessorDelete } from "./InterceptorOrderProcessorDelete";
import { Result } from ".";
import { ADDITIONAL_COST_PROP, ADDITIONAL_COST_TX_IDS, GOOD_PROP, PURCHASE_CODE_PROP, PURCHASE_INVOICE_PROP } from "./constants";
import { getGoodPurchaseRootTx } from "./BotService";

export class InterceptorOrderProcessorDeleteFinancial extends InterceptorOrderProcessorDelete {

    async intercept(financialBook: Book, event: bkper.Event): Promise<Result> {

        let operation = event.data.object as bkper.TransactionOperation;
        let transactionPayload = operation.transaction;

        if (!transactionPayload.posted) {
            return { result: false };
        }

        let responses: string[] = [];

        // deleted transaction is the root good purchase transaction
        if (transactionPayload.properties[GOOD_PROP] != undefined && (transactionPayload.properties[PURCHASE_CODE_PROP] == transactionPayload.properties[PURCHASE_INVOICE_PROP])) {
            // Delete additional cost transactions posted by the user
            if (transactionPayload.properties[ADDITIONAL_COST_TX_IDS] != undefined) {
                const additionalCostTransactionIds = JSON.parse(transactionPayload.properties[ADDITIONAL_COST_TX_IDS]);
                for (const additionalCostTransactionId of additionalCostTransactionIds) {
                    const addCostTx = await financialBook.getTransaction(additionalCostTransactionId);
                    await addCostTx.uncheck();
                    const response1 = await addCostTx.remove();
                    if (response1) {
                        responses.push(await this.buildDeleteResponse(response1));
                        // Delete additional cost transactions posted by the bot
                        const response2 = await this.deleteTransactionByRemoteId(financialBook, `${ADDITIONAL_COST_PROP}_${additionalCostTransactionId}`);
                        if (response2) {
                            responses.push(await this.buildDeleteResponse(response2));
                        }
                    }
                }
            }
    
            // Delete good purchase transactions posted by the bot (from buyer to good account)
            const response = await this.deleteTransactionByRemoteId(financialBook, `${GOOD_PROP}_${transactionPayload.id}`);
            if (response) {
                responses.push(await this.buildDeleteResponse(response));
                const response2 = await this.deleteOnInventoryBook(financialBook, response.getId());
                if (response2) {
                    responses.push(await this.buildDeleteResponse(response2));
                }
            }
        }

        // deleted transaction is the first additional cost transaction posted by the user (from supplier to buyer)
        if (transactionPayload.properties[GOOD_PROP] != undefined && (transactionPayload.properties[PURCHASE_CODE_PROP] != transactionPayload.properties[PURCHASE_INVOICE_PROP])) {
            const response = await this.deleteTransactionByRemoteId(financialBook, `${ADDITIONAL_COST_PROP}_${transactionPayload.id}`);
            if (response) {
                responses.push(await this.buildDeleteResponse(response));
                console.log("*** TODO: UPDATE INVENTORY TRANSACTION COSTS ***")
                console.log("*** TODO: UPDATE GOOD PURCHASE TRANSACTIONS add_cost_transactions PROPERTY ***")
            }
        }

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
