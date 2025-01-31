import { AccountType, Amount, Book, Transaction } from "bkper-js";
import { InterceptorOrderProcessorDelete } from "./InterceptorOrderProcessorDelete.js";
import { Result } from "./index.js";
import { ADDITIONAL_COST_PROP, ADDITIONAL_COST_TX_IDS, GOOD_PROP, PURCHASE_CODE_PROP, PURCHASE_INVOICE_PROP, TOTAL_ADDITIONAL_COSTS_PROP, TOTAL_COST_PROP } from "./constants.js";
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

            // deleted transaction is the root good purchase transaction
            // else if (transactionPayload.properties[GOOD_PROP] != undefined && (transactionPayload.properties[PURCHASE_CODE_PROP] == transactionPayload.properties[PURCHASE_INVOICE_PROP])) {
            //     // Delete additional cost transactions posted by the user
            //     responses = responses.concat(await this.deleteAddCostRootTransactions(financialBook, transactionPayload))
            //     // Delete good purchase transactions posted by the bot (from buyer to good account)
            //     const response = await this.deleteTransactionByRemoteId(financialBook, `${GOOD_PROP}_${transactionPayload.id}`);
            //     if (response) {
            //         responses.push(await this.buildDeleteResponse(response));
            //         // delete transaction in the inventory book
            //         const response2 = await this.deleteOnInventoryBook(financialBook, response.getId());
            //         if (response2) {
            //             responses.push(await this.buildDeleteResponse(response2));
            //         }
            //     }
            // }

            // deleted transaction is the root additional cost transaction posted by the user (from supplier to buyer)
            else if (transactionPayload.properties[GOOD_PROP] != undefined && (transactionPayload.properties[PURCHASE_CODE_PROP] != transactionPayload.properties[PURCHASE_INVOICE_PROP])) {
                if (transactionPayload.amount) {
                    const response = await this.deleteTransactionByRemoteId(financialBook, `${ADDITIONAL_COST_PROP}_${transactionPayload.id}`);
                    if (response) {
                        responses.push(await this.buildDeleteResponse(response));
                        responses.push(await this.removeAdditionalCostFromGoodTx(financialBook, transactionPayload.properties[PURCHASE_CODE_PROP], transactionPayload.id));
                        responses.push(await this.subtractAdditionalCostFromInventoryTx(financialBook, transactionPayload.properties[PURCHASE_CODE_PROP], transactionPayload.amount));
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
                            await flagInventoryAccountForRebuildIfNeeded(inventoryBookTransaction);
                            break;
                        }
                    }
                }
            }
            
            return { result: responses.length > 0 ? responses : false };
        }
        return { result: false };
    }

    private async removeAdditionalCostFromGoodTx(financialBook: Book, purchaseCodeProp: string, rootAdditionalCostTxId: string): Promise<string> {
        let rootPurchaseTx = await getGoodPurchaseRootTx(financialBook, purchaseCodeProp);
        if (rootPurchaseTx) {
            let additionalCostTxIds = rootPurchaseTx.getProperty(ADDITIONAL_COST_TX_IDS);
            if (additionalCostTxIds) {
                let remoteIds: string[] = JSON.parse(additionalCostTxIds);
                const index = remoteIds.indexOf(rootAdditionalCostTxId);
                if (index != -1) {
                    remoteIds.splice(index, 1);
                }
                additionalCostTxIds = remoteIds.length > 0 ? JSON.stringify(remoteIds) : '';

                await rootPurchaseTx.setProperty(ADDITIONAL_COST_TX_IDS, additionalCostTxIds).update();
                return `UPDATED: good purchase transaction on ${rootPurchaseTx.getDate()}, purchase_code: ${purchaseCodeProp}, ${rootPurchaseTx.getDescription()}`;
            } else {
                return `ERROR: transaction not found in add_cost_transactions`;
            }
        } else {
            return `ERROR: transaction not found in add_cost_transactions`;
        }
    }

    private async subtractAdditionalCostFromInventoryTx(financialBook: Book, purchaseCodeProp: string, value: string): Promise<string> {
        const inventoryBook = getInventoryBook(financialBook);
        if (inventoryBook) {
            let bookAnchor = buildBookAnchor(inventoryBook);
            let goodTransaction = (await inventoryBook.listTransactions(`remoteId:${purchaseCodeProp}`)).getFirst();
            const totalCostProp = goodTransaction?.getProperty(TOTAL_COST_PROP);
            const totalAdditionalCostsProp = goodTransaction?.getProperty(TOTAL_ADDITIONAL_COSTS_PROP);
            if (goodTransaction) {
                if (totalCostProp && totalAdditionalCostsProp) {
                    // update additional cost and total cost properties in inventory book transaction
                    const currentTotalCost = new Amount(totalCostProp);
                    const currentAdditionalCosts = new Amount(totalAdditionalCostsProp);
    
                    const costToSubtract = new Amount(value);
    
                    const newTotalCost = currentTotalCost.minus(costToSubtract);
                    const newAdditionalCosts = currentAdditionalCosts.minus(costToSubtract);
    
                    goodTransaction.setProperty(TOTAL_ADDITIONAL_COSTS_PROP, newAdditionalCosts.toString()).setProperty(TOTAL_COST_PROP, newTotalCost.toString()).update();
    
                    let record = `${goodTransaction.getDate()} ${goodTransaction.getAmount()} ${await goodTransaction.getCreditAccountName()} ${await goodTransaction.getDebitAccountName()} ${goodTransaction.getDescription()}`;
                    return `UPDATED: ${bookAnchor}: ${record}`;
                } else {
                    return 'ERROR (subtractAdditionalCostFromInventoryTx): additional_costs or total_cost properties not found';
                }
            } else {
                return `PURCHASE TRANSACTION NOT FOUND IN BOOK ${bookAnchor}`
            }
        }
        return 'ERROR (subtractAdditionalCostFromInventoryTx): Inventory book not found';
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