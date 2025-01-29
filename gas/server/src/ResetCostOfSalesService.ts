namespace CostOfSalesService {

    export function resetCostOfSalesForAccount(inventoryBookId: string, goodAccountId: string): Summary {
        const summary = new Summary(goodAccountId);

        const inventoryBook = BkperApp.getBook(inventoryBookId);
        const goodAccount = new GoodAccount(inventoryBook.getAccount(goodAccountId));

        const goodExcCode = BotService.getExchangeCode(goodAccount.getAccount());
        const financialBook = BotService.getFinancialBook(inventoryBook, goodExcCode);
        if (financialBook == null) {
            return summary;
        }

        const iterator = inventoryBook.getTransactions(helper.getAccountQuery(goodAccount.getName()));

        const transactions: Bkper.Transaction[] = [];
        while (iterator.hasNext()) {
            const tx = iterator.next();
            transactions.push(tx);
        }

        // Processor
        const processor = new ResetCostOfSalesProcessor(inventoryBook, financialBook);

        for (const tx of transactions) {
            // Log operation status
            console.log(`processing transaction: ${tx.getId()}`);

            if (tx.isChecked()) {
                tx.setChecked(false);
            }

            if (tx.getAgentId() == 'inventory-bot') {
                // Reset sale transactions
                if (tx.getProperty(PURCHASE_LOG_PROP)) {
                    // Trash COGs transactions connected to liquidations
                    const transactionIterator = financialBook.getTransactions(`remoteId:${tx.getId()}`);
                    if (transactionIterator.hasNext()) {
                        const COGsTransaction = transactionIterator.next();
                        if (COGsTransaction.isChecked()) {
                            COGsTransaction.setChecked(false);
                        }
                        // Store transaction to be trashed
                        processor.setFinancialBookTransactionToTrash(COGsTransaction);
                    }

                    // Remove liquidation properties: purchase_log, total_cost
                    tx.deleteProperty(PURCHASE_LOG_PROP).deleteProperty(TOTAL_COST_PROP);
                    // Store transaction to be updated
                    processor.setInventoryBookTransactionToUpdate(tx);
                    continue;
                }

                // Reset purchase transactions
                if (tx.getProperty(LIQUIDATION_LOG_PROP)) {
                    // Trash splitted transaction
                    if (!tx.getProperty(ORIGINAL_QUANTITY_PROP)) {
                        processor.setInventoryBookTransactionToTrash(tx);
                    } else {
                        // Reset parent transaction
                        const txAmount = tx.getAmount();
                        const txGoodPurchaseCost = BkperApp.newAmount(tx.getProperty(GOOD_PURCHASE_COST_PROP));
                        const txAdditionalCosts = tx.getProperty(ADD_COSTS_PROP) ? BkperApp.newAmount(tx.getProperty(ADD_COSTS_PROP)) : BkperApp.newAmount(0);

                        const unitGoodPurchaseCost = txGoodPurchaseCost.div(txAmount);
                        const unitAdditionalCosts = txAdditionalCosts.div(txAmount);

                        const originalAmount = BkperApp.newAmount(tx.getProperty(ORIGINAL_QUANTITY_PROP));
                        const originalGoodPurchaseCost = originalAmount.times(unitGoodPurchaseCost);
                        const originalAdditionalCosts = originalAmount.times(unitAdditionalCosts);

                        tx.setAmount(originalAmount);
                        tx.setProperty(GOOD_PURCHASE_COST_PROP, originalGoodPurchaseCost.toString());
                        tx.setProperty(ADD_COSTS_PROP, originalAdditionalCosts.toString());
                        tx.setProperty(TOTAL_COST_PROP, originalGoodPurchaseCost.plus(originalAdditionalCosts).toString());

                        // remove liquidation log
                        tx.deleteProperty(LIQUIDATION_LOG_PROP);

                        // Store transaction to be updated
                        processor.setInventoryBookTransactionToUpdate(tx);
                    }
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
        goodAccount.clearNeedsRebuild();
        goodAccount.setCOGSCalculationDate('');
        goodAccount.update();

        return summary.resetingAsync();
    }

}