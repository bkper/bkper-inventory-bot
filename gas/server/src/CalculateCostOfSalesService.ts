namespace CostOfSalesService {

    export function calculateCostOfSalesForAccount(inventoryBookId: string, goodAccountId: string, toDate?: string): Summary {
        const inventoryBook = BkperApp.getBook(inventoryBookId);
        if (!toDate) {
            toDate = inventoryBook.formatDate(new Date());
        }

        let goodAccount = new GoodAccount(inventoryBook.getAccount(goodAccountId));

        const summary = new Summary(goodAccountId);

        if (goodAccount.needsRebuild()) {
            // Fire reset async
            CostOfSalesService.resetCostOfSalesForAccount(inventoryBookId, goodAccountId);
            return summary.rebuild();
        }

        const goodExcCode = BotService.getExchangeCode(goodAccount.getAccount());
        const financialBook = BotService.getFinancialBook(inventoryBook, goodExcCode);

        // Skip
        if (financialBook == null) {
            return summary;
        }

        const beforeDate = BotService.getBeforeDateIsoString(inventoryBook, toDate);
        const iterator = inventoryBook.getTransactions(helper.getAccountQuery(goodAccount.getName(), beforeDate));

        let goodAccountSaleTransactions: Bkper.Transaction[] = [];
        let goodAccountPurchaseTransactions: Bkper.Transaction[] = [];

        let totalSalesQuantity = 0;
        let totalPurchasedQuantity = 0;

        while (iterator.hasNext()) {
            const tx = iterator.next();
            // Filter only unchecked
            if (tx.isChecked()) {
                continue;
            }
            if (BotService.isSale(tx)) {
                goodAccountSaleTransactions.push(tx);
                totalSalesQuantity += tx.getAmount().toNumber();
            }
            if (BotService.isPurchase(tx)) {
                goodAccountPurchaseTransactions.push(tx);
                totalPurchasedQuantity += tx.getAmount().toNumber();
            }
        }

        if (totalSalesQuantity == 0) {
            return summary;
        }
        // Total sales quantity cannot be greater than available quantity in inventory
        if (totalSalesQuantity > totalPurchasedQuantity) {
            return summary.quantityError();
        }

        goodAccountSaleTransactions = goodAccountSaleTransactions.sort(BotService.compareToFIFO);
        goodAccountPurchaseTransactions = goodAccountPurchaseTransactions.sort(BotService.compareToFIFO);

        // Processor
        const processor = new CalculateCostOfSalesProcessor(inventoryBook, financialBook);

        // Process sales
        for (const saleTransaction of goodAccountSaleTransactions) {
            if (goodAccountSaleTransactions.length > 0) {
                processSale(financialBook, inventoryBook, saleTransaction, goodAccountPurchaseTransactions, summary, processor);
            }
            // Abort if any transaction is locked
            if (processor.hasLockedTransaction()) {
                return summary.lockError();
            }
        }

        // Fire batch operations
        // processor.fireBatchOperations();

        // storeLastCalcTxDate(goodAccount, goodAccountSaleTransactions);

        return summary.calculatingAsync();
    }

    function storeLastCalcTxDate(goodAccount: GoodAccount, goodAccountSaleTransactions: Bkper.Transaction[]) {
        let lastSaleTx = goodAccountSaleTransactions.length > 0 ? goodAccountSaleTransactions[goodAccountSaleTransactions.length - 1] : null;

        let lastTxDateValue = lastSaleTx != null ? lastSaleTx.getDateValue() : null;
        let lastTxDate = lastSaleTx != null ? lastSaleTx.getDate() : null;

        let goodAccountLastTxDateValue = goodAccount.getCOGSCalculationDateValue();
        if (lastTxDateValue != null && (goodAccountLastTxDateValue == null || lastTxDateValue > goodAccountLastTxDateValue)) {
            goodAccount.setCOGSCalculationDate(lastTxDate || '').update();
        }
    }

    function processSale(financialBook: Bkper.Book, inventoryBook: Bkper.Book, saleTransaction: Bkper.Transaction, purchaseTransactions: Bkper.Transaction[], summary: Summary, processor: CalculateCostOfSalesProcessor): void {

        // Log operation status
        console.log(`processing sale: ${saleTransaction.getId()}`);

        // Sale info: quantity, prices, exchange rates
        let soldQuantity = saleTransaction.getAmount();

        let saleCost = BkperApp.newAmount(0);
        let purchaseLogEntries: PurchaseLogEntry[] = [];

        for (const transaction of purchaseTransactions) {

            // Log operation status
            console.log(`processing purchase: ${transaction.getId()}`);

            let saleLiquidationLog: LiquidationLogEntry;

            if (transaction.isChecked()) {
                // Only process unchecked purchases
                continue;
            }

            // Original purchase info: quantity and price
            const originalQuantity = BkperApp.newAmount(transaction.getProperty(ORIGINAL_QUANTITY_PROP));
            const transactionQuantity = transaction.getAmount();
            const transactionCost = BkperApp.newAmount(transaction.getProperty(TOTAL_COST_PROP));

            let additionalCosts = BkperApp.newAmount(0);
            let creditNote: CreditNote = { amount: BkperApp.newAmount(0), quantity: 0 };
            if (originalQuantity.toNumber() == transactionQuantity.toNumber()) {
                // transaction hasn't been previously processed in FIFO execution
                ({ additionalCosts, creditNote } = BotService.getAdditionalCostsAndCreditNotes(financialBook, transaction));
            }

            let updatedQuantity = transactionQuantity.minus(creditNote.quantity);
            let updatedCost = transactionCost.minus(additionalCosts).plus(creditNote.amount);

            // Additional costs & credit notes to update purchase transaction if needed
            if (purchaseTransaction.getProperty(ORIGINAL_QUANTITY_PROP) == undefined) {
                // transaction hasn't been previously updated in FIFO execution
                const { additionalCosts, creditNote } = BotService.getAdditionalCostsAndCreditNotes(financialBook, purchaseTransaction);
                updatedQuantity = purchaseTransaction.getAmount().minus(creditNote.quantity);
                updatedGoodPurchaseCost = goodPurchaseCost.plus(additionalCosts).minus(creditNote.amount);
            } else {
                updatedQuantity = quantity;
                const costOfSalePerUnit = JSON.parse(purchaseTransaction.getProperty(LIQUIDATION_LOG_PROP)).uc;
                updatedGoodPurchaseCost = quantity.times(costOfSalePerUnit);
            }
            
            // Purchase info: quantity, costs, purchase code
            const costOfSalePerUnit = updatedGoodPurchaseCost.div(updatedQuantity);

            const purchaseCode = BotService.getPurchaseCode(purchaseTransaction);

            // Sold quantity GTE purchase quantity: update & check purchase transaction
            if (soldQuantity.gte(updatedQuantity)) {
                saleCost = saleCost.plus(costOfSalePerUnit.times(updatedQuantity));

                saleLiquidationLog = logLiquidation(saleTransaction, costOfSalePerUnit);
                if (saleTransaction.getProperty(LIQUIDATION_LOG_PROP) != undefined) {
                    const liquidationLog = JSON.parse(saleTransaction.getProperty(LIQUIDATION_LOG_PROP));
                    saleLiquidationLog.uc = costOfSalePerUnit.toString();
                }
                purchaseTransaction
                    .setProperty(LIQUIDATION_LOG_PROP, JSON.stringify(saleLiquidationLog))
                    .setProperty(ORIGINAL_QUANTITY_PROP, quantity.toString())
                    .setProperty(ORIGINAL_GOOD_PURCHASE_COST_PROP, goodPurchaseCost.toString())
                    .setProperty(ADD_COSTS_PROP, additionalCosts.toString())
                    .setProperty(CREDIT_NOTE_PROP, JSON.stringify(creditNote))
                    ;

                // Store transaction to be updated
                purchaseTransaction.setChecked(true);
                processor.setInventoryBookTransactionToUpdate(purchaseTransaction);

                purchaseLogEntries.push(logPurchase(updatedQuantity, costOfSalePerUnit, purchaseTransaction));
                soldQuantity = soldQuantity.minus(updatedQuantity);

                // Sold quantity LT purchase quantity: update purchase + update & check splitted purchase transaction
            } else {
                const remainingBuyQuantity = updatedPurchaseQuantity.minus(soldQuantity);
                const partialBuyQuantity = updatedPurchaseQuantity.minus(remainingBuyQuantity);

                saleCost = saleCost.plus(partialBuyQuantity.times(costOfSalePerUnit));

                purchaseTransaction
                    .setAmount(remainingBuyQuantity)
                    .setProperty(GOOD_PURCHASE_COST_PROP, unitGoodCost.times(remainingBuyQuantity).toString())
                    .setProperty(ADD_COSTS_PROP, unitAdditionalCosts.times(remainingBuyQuantity).toString())
                    .setProperty(TOTAL_COST_PROP, unitTotalCostOfSale.times(remainingBuyQuantity).toString())
                    ;
                // Store transaction to be updated
                processor.setInventoryBookTransactionToUpdate(purchaseTransaction);

                let splittedPurchaseTransaction = inventoryBook.newTransaction()
                    .setDate(purchaseTransaction.getDate())
                    .setAmount(partialBuyQuantity)
                    .setCreditAccount(purchaseTransaction.getCreditAccount())
                    .setDebitAccount(purchaseTransaction.getDebitAccount())
                    .setDescription(purchaseTransaction.getDescription())
                    .setProperty(ORDER_PROP, purchaseTransaction.getProperty(ORDER_PROP))
                    .setProperty(PARENT_ID, purchaseTransaction.getId())
                    .setProperty(PURCHASE_CODE_PROP, purchaseCode.toString())
                    .setProperty(GOOD_PURCHASE_COST_PROP, unitGoodCost.times(partialBuyQuantity).toString())
                    .setProperty(ADD_COSTS_PROP, unitAdditionalCosts.times(partialBuyQuantity).toString())
                    .setProperty(TOTAL_COST_PROP, unitTotalCostOfSale.times(partialBuyQuantity).toString())
                    ;

                saleLiquidationLog = logLiquidation(saleTransaction, unitTotalCostOfSale);
                splittedPurchaseTransaction.setProperty(LIQUIDATION_LOG_PROP, JSON.stringify(saleLiquidationLog));
                splittedPurchaseTransaction.setChecked(true);

                processor.setInventoryBookTransactionToCreate(splittedPurchaseTransaction);

                purchaseLogEntries.push(logPurchase(partialBuyQuantity, unitTotalCostOfSale, purchaseTransaction));

                soldQuantity = soldQuantity.minus(partialBuyQuantity);
            }
            // Break loop if sale is fully processed, otherwise proceed to next purchase
            if (soldQuantity.eq(0)) {
                break;
            }
        }

        // // Sold quantity EQ zero: update & check sale transaction
        // if (soldQuantity.round(inventoryBook.getFractionDigits()).eq(0)) {
        //     if (purchaseLogEntries.length > 0) {
        //         saleTransaction
        //             .setProperty(TOTAL_COST_PROP, saleCost.toString())
        //             .setProperty(PURCHASE_LOG_PROP, JSON.stringify(purchaseLogEntries))
        //             ;
        //     }

        //     // Store transaction to be updated
        //     saleTransaction.setChecked(true);
        //     processor.setInventoryBookTransactionToUpdate(saleTransaction);

        // }

        // // post cost of sale transaction in financial book
        // addCostOfSales(financialBook, saleTransaction, saleCost, processor);
    }

    function addCostOfSales(financialBook: Bkper.Book, saleTransaction: Bkper.Transaction, saleCost: Bkper.Amount, processor: CalculateCostOfSalesProcessor) {
        let financialGoodAccount: Bkper.Account = financialBook.getAccount(saleTransaction.getCreditAccountName());

        // link COGS transaction in fanancial book to sale transaction in inventory book
        const remoteId = saleTransaction.getId();
        const description = `#cost_of_sale ${saleTransaction.getDescription()}`;

        const costOfSaleTransaction = financialBook.newTransaction()
            .addRemoteId(remoteId)
            .setDate(saleTransaction.getDate())
            .setAmount(saleCost)
            .setDescription(description)
            .from(financialGoodAccount)
            .to('Cost of sales')
            .setProperty(QUANTITY_SOLD_PROP, `${saleTransaction.getAmount().toNumber()}`)
            .setProperty(SALE_INVOICE_PROP, `${saleTransaction.getProperty(SALE_INVOICE_PROP)}`)
            .setChecked(true)
            ;

        // Store transaction to be created
        processor.setFinancialBookTransactionToCreate(costOfSaleTransaction);
    }

    function logLiquidation(transaction: Bkper.Transaction, costOfSalePerUnit: Bkper.Amount, excRate?: Bkper.Amount): LiquidationLogEntry {
        return {
            id: transaction.getId(),
            dt: transaction.getDate(),
            qt: transaction.getAmount().toString(),
            uc: costOfSalePerUnit.toString(),
            rt: excRate?.toString() || ''
        }
    }

    function logPurchase(quantity: Bkper.Amount, costOfSalePerUnit: Bkper.Amount, transaction: Bkper.Transaction, excRate?: Bkper.Amount): PurchaseLogEntry {
        return {
            id: transaction.getId(),
            qt: quantity.toString(),
            uc: costOfSalePerUnit.toString(),
            rt: excRate?.toString() || ''
        }
    }
}