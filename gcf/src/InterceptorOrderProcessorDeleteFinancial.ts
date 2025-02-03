import { AccountType, Amount, Book, Transaction } from "bkper-js";
import { InterceptorOrderProcessorDelete } from "./InterceptorOrderProcessorDelete.js";
import { Result } from "./index.js";
import { ADDITIONAL_COST_PROP, ADDITIONAL_COST_TX_IDS, GOOD_PROP, PURCHASE_CODE_PROP, PURCHASE_INVOICE_PROP, QUANTITY_PROP, TOTAL_ADDITIONAL_COSTS_PROP, TOTAL_COST_PROP } from "./constants.js";
import { buildBookAnchor, flagInventoryAccountForRebuildIfNeeded, getGoodPurchaseRootTx, getInventoryBook } from "./BotService.js";

export class InterceptorOrderProcessorDeleteFinancial extends InterceptorOrderProcessorDelete {

    async intercept(financialBook: Book, event: bkper.Event): Promise<Result> {
        if (!event.data) {
            return { result: false };
        }
        let operation = event.data.object as bkper.TransactionOperation;
        let transactionPayload = operation.transaction;

        if (transactionPayload && !transactionPayload.posted) {
            return { result: false };
        }

        let responses: string[] = [];

        if (transactionPayload && transactionPayload.properties && transactionPayload.debitAccount && transactionPayload.id) {

            // deleted transaction is the purchase transaction
            if (transactionPayload.properties[QUANTITY_PROP] != undefined && (transactionPayload.properties[PURCHASE_CODE_PROP] == transactionPayload.properties[PURCHASE_INVOICE_PROP])) {

            }

            // deleted transaction is the sale transaction
            if (transactionPayload.properties[GOOD_PROP] != undefined && transactionPayload.debitAccount.type == AccountType.INCOMING) {
                const deletedTxs = await this.deleteOnInventoryBook(financialBook, transactionPayload.id);
                if (deletedTxs) {
                    const rebuildFlagMsg = await flagInventoryAccountForRebuildIfNeeded(deletedTxs[0]);
                    responses = responses.concat(await this.buildResults(deletedTxs));
                    if (rebuildFlagMsg) {
                        responses.push(rebuildFlagMsg);
                    }
                }
            }

            // deleted transaction is the COGS calculated transaction
            if (transactionPayload.agentId == 'inventory-bot' && transactionPayload.description?.includes('#cost_of_sale')) {
                const inventoryBook = getInventoryBook(financialBook);
                if (inventoryBook && transactionPayload.remoteIds) {
                    for (const remoteId of transactionPayload.remoteIds) {
                        let inventoryBookTransaction = await inventoryBook.getTransaction(remoteId);
                        if (inventoryBookTransaction) {
                            const response = await flagInventoryAccountForRebuildIfNeeded(inventoryBookTransaction);
                            if (response) {
                                responses.push(response);
                            }
                            break;
                        }
                    }
                }
            }

            return { result: responses.length > 0 ? responses : false };
        }

        return { result: false };
    }

    protected async deleteOnInventoryBook(financialBook: Book, remoteId: string): Promise<Transaction[] | undefined> {
        let responses: Transaction[] | undefined = undefined;
        let inventoryBook = getInventoryBook(financialBook);
        const deletedInventoryTx = inventoryBook ? await this.deleteTransactionByRemoteId(inventoryBook, remoteId) : undefined;
        if (deletedInventoryTx) {
            responses = [deletedInventoryTx];
            const cascadedResponses = await this.cascadeDeleteTransactions(financialBook, deletedInventoryTx.json());
            if (cascadedResponses) {
                responses = responses.concat(cascadedResponses);
            }
        }
        return responses;
    }

}