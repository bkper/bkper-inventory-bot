namespace CostOfSalesService {

    export function resetCostOfSalesForAccount(inventoryBookId: string, goodAccountId: string): Summary {
        let summary = new Summary(goodAccountId);

        let inventoryBook = BkperApp.getBook(inventoryBookId);
        let goodAccount = inventoryBook.getAccount(goodAccountId);
        let goodExcCode = BotService.getExchangeCode(goodAccount);

        let financialBook = BotService.getFinancialBook(inventoryBook, goodExcCode);
        if (financialBook == null) {
            return summary;
        }

        let iterator = inventoryBook.getTransactions(helper.getAccountQuery(goodAccount.getName()));

        const transactions: Bkper.Transaction[] = [];
        while (iterator.hasNext()) {
            let tx = iterator.next();
            transactions.push(tx);
        }

        // Processor
        const processor = new ResetCostOfSalesProcessor(inventoryBook, financialBook);

        for (let tx of transactions) {

            // Log operation status
            console.log(`processing transaction: ${tx.getId()}`);

            if (tx.isChecked()) {
                tx.setChecked(false);
            }

            // Reset sale transactions
            if (tx.getAgentId() == 'inventory-bot') {
                if (tx.getProperty(constants.PURCHASE_LOG_PROP)) {
                    // Trash COGs transactions connected to liquidations
                    let transactionIterator = financialBook.getTransactions(`remoteId:${tx.getId()}`);
                    if (transactionIterator.hasNext()) {
                        let COGsTransaction = transactionIterator.next();
                        if (COGsTransaction.isChecked()) {
                            COGsTransaction.setChecked(false);
                        }
                        // Store transaction to be trashed
                        processor.setFinancialBookTransactionToTrash(COGsTransaction);
                    }

                    // Remove liquidation properties: purchase_log, total_cost
                    tx.deleteProperty(constants.PURCHASE_LOG_PROP).deleteProperty(constants.TOTAL_COST_PROP);
                    // Store transaction to be updated
                    processor.setInventoryBookTransactionToUpdate(tx);
                }

                // Reset purchase transactions
                if (!tx.getProperty(constants.ORIGINAL_QUANTITY_PROP)) {
                    // Trash splitted transaction
                    processor.setInventoryBookTransactionToTrash(tx);
                } else {
                    // Reset parent transaction
                    const txAmount = tx.getAmount();
                    const txGoodPurchaseCost = BkperApp.newAmount(tx.getProperty(constants.GOOD_PURCHASE_COST_PROP));
                    const txAdditionalCosts = BkperApp.newAmount(tx.getProperty(constants.ADD_COSTS_PROP));

                    const unitGoodPurchaseCost = txGoodPurchaseCost.div(txAmount);
                    const unitAdditionalCosts = txAdditionalCosts.div(txAmount);

                    const originalAmount = BkperApp.newAmount(tx.getProperty(constants.ORIGINAL_QUANTITY_PROP));
                    const originalGoodPurchaseCost = originalAmount.times(unitGoodPurchaseCost);
                    const originalAdditionalCosts = originalAmount.times(unitAdditionalCosts);

                    tx.setAmount(originalAmount);
                    tx.setProperty(constants.GOOD_PURCHASE_COST_PROP, originalGoodPurchaseCost.toString());
                    tx.setProperty(constants.ADD_COSTS_PROP, originalAdditionalCosts.toString());
                    tx.setProperty(constants.TOTAL_COST_PROP, originalGoodPurchaseCost.plus(originalAdditionalCosts).toString());

                    // Store transaction to be updated
                    processor.setInventoryBookTransactionToUpdate(tx);
                }
            }
        }

        // Abort if any transaction is locked
        if (processor.hasLockedTransaction()) {
            return summary.lockError();
        }

        // Fire batch operations
        processor.fireBatchOperations();

        // Update account
        goodAccount.deleteProperty(constants.NEEDS_REBUILD_PROP).update();

        return summary.resetingAsync();
    }

}