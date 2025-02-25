import { AccountType, Book, Transaction } from "bkper-js";
import { InterceptorOrderProcessorDelete } from "./InterceptorOrderProcessorDelete.js";
import { Result } from "./index.js";
import { GOOD_PROP, PURCHASE_CODE_PROP, PURCHASE_INVOICE_PROP, QUANTITY_PROP, COGS_HASHTAG, NEEDS_REBUILD_PROP } from "./constants.js";
import { flagInventoryAccountForRebuildIfNeeded, getInventoryBook } from "./BotService.js";

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
            if (transactionPayload.properties[QUANTITY_PROP] != undefined && transactionPayload.properties[PURCHASE_CODE_PROP] != undefined && (transactionPayload.properties[PURCHASE_CODE_PROP] == transactionPayload.properties[PURCHASE_INVOICE_PROP])) {
                // delete root purchase transaction in the inventory book and all its splitted transactions
                const deletedTxs = await this.deleteOnInventoryBook(financialBook, transactionPayload.id);
                if (deletedTxs) {
                    responses = responses.concat(await this.buildDeleteResults(deletedTxs, financialBook));
                    const rebuildFlagMsg = await flagInventoryAccountForRebuildIfNeeded(financialBook, deletedTxs[0]);
                    if (rebuildFlagMsg) {
                        responses.push(rebuildFlagMsg);
                    }
                }
            }

            // deleted transaction is the additional cost transaction or credit note transaction
            if (transactionPayload.properties[PURCHASE_CODE_PROP] != undefined && (transactionPayload.properties[PURCHASE_CODE_PROP] != transactionPayload.properties[PURCHASE_INVOICE_PROP])) {
                if (transactionPayload.remoteIds) {
                    // transaction had been already processed by FIFO
                    const inventoryBook = getInventoryBook(financialBook);
                    const goodAccount = await inventoryBook?.getAccount(transactionPayload.debitAccount.name);
                    if (goodAccount) {
                        const purchaseCode = transactionPayload.properties[PURCHASE_CODE_PROP];
                        // query for good account transactions within ADDITIONAL_COSTS_CREDITS_QUERY_RANGE time range and look for the purchase code property
                        // if found and it had already been processed by FIFO, flag the good account for rebuild
                        await goodAccount.setProperty(NEEDS_REBUILD_PROP, 'TRUE').update();
                        const warningMsg = `Flagging account ${goodAccount.getName()} for rebuild`;
                        responses.push(warningMsg);
                    }
                }
            }

            // deleted transaction is the sale transaction
            if (transactionPayload.properties[GOOD_PROP] != undefined && transactionPayload.debitAccount.type == AccountType.INCOMING) {
                const deletedTxs = await this.deleteOnInventoryBook(financialBook, transactionPayload.id);
                if (deletedTxs) {
                    const rebuildFlagMsg = await flagInventoryAccountForRebuildIfNeeded(financialBook, deletedTxs[0]);
                    responses = responses.concat(await this.buildDeleteResults(deletedTxs, financialBook));
                    if (rebuildFlagMsg) {
                        responses.push(rebuildFlagMsg);
                    }
                }
            }

            // deleted transaction is the COGS calculated transaction
            if (transactionPayload.agentId == 'inventory-bot' && transactionPayload.description?.includes(COGS_HASHTAG)) {
                const inventoryBook = getInventoryBook(financialBook);
                if (inventoryBook && transactionPayload.remoteIds) {
                    for (const remoteId of transactionPayload.remoteIds) {
                        let inventoryBookTransaction = (await inventoryBook.listTransactions(remoteId)).getFirst();
                        if (inventoryBookTransaction) {
                            const response = await flagInventoryAccountForRebuildIfNeeded(financialBook, inventoryBookTransaction);
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
            const cascadedResponses = await this.cascadeDeleteInventoryTransactions(inventoryBook!, deletedInventoryTx.json());
            if (cascadedResponses) {
                responses = responses.concat(cascadedResponses);
            }
        }
        return responses;
    }

}