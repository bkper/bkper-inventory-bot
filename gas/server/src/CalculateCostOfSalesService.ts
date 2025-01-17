namespace CostOfSalesService {

    export function calculateCostOfSalesForAccount(inventoryBookId: string, goodAccountId: string, toDate?: string): Summary {
        const inventoryBook = BkperApp.getBook(inventoryBookId);
        if (!toDate) {
            toDate = inventoryBook.formatDate(new Date());
        }

        const goodAccount = inventoryBook.getAccount(goodAccountId);
        const goodExcCode = BotService.getExchangeCode(goodAccount);
        const financialBook = BotService.getFinancialBook(inventoryBook, goodExcCode);

        const summary = new Summary(goodAccountId);
        
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
        processor.fireBatchOperations();

        return summary.calculatingAsync();
    }

    function processSale(financialBook: Bkper.Book, inventoryBook: Bkper.Book, saleTransaction: Bkper.Transaction, purchaseTransactions: Bkper.Transaction[], summary: Summary, processor: CalculateCostOfSalesProcessor): void {

        // Log operation status
        console.log(`processing sale: ${saleTransaction.getId()}`);

        // Sale info: quantity, prices, exchange rates
        let soldQuantity = saleTransaction.getAmount();

        let saleCost = BkperApp.newAmount(0);
        let purchaseLogEntries: PurchaseLogEntry[] = [];

        for (const purchaseTransaction of purchaseTransactions) {

            // Log operation status
            console.log(`processing purchase: ${purchaseTransaction.getId()}`);

            let saleLiquidationLog: LiquidationLogEntry;

            if (purchaseTransaction.isChecked()) {
                // Only process unchecked purchases
                continue;
            }

            // Purchase info: quantity, costs, purchase code
            const purchaseQuantity = purchaseTransaction.getAmount();


            // Cost of sale
            const goodPurchaseCost = BotService.getGoodPurchaseCost(purchaseTransaction);
            const additionalPurchaseCost = BotService.getAdditionalPurchaseCosts(purchaseTransaction);
            const unitGoodCost = goodPurchaseCost.div(purchaseQuantity);
            const unitAdditionalCosts = additionalPurchaseCost.div(purchaseQuantity);
            const unitTotalCostOfSale = unitGoodCost.plus(unitAdditionalCosts);

            const purchaseCode = BotService.getPurchaseCode(purchaseTransaction);

            // Sold quantity GTE purchase quantity: update & check purchase transaction
            if (soldQuantity.gte(purchaseQuantity)) {

                saleCost = saleCost.plus(BotService.getTotalPurchaseCost(purchaseTransaction));

                saleLiquidationLog = logLiquidation(saleTransaction, unitTotalCostOfSale);
                purchaseTransaction.setProperty(constants.LIQUIDATION_LOG_PROP, JSON.stringify(saleLiquidationLog));

                // Store transaction to be updated
                purchaseTransaction.setChecked(true);
                processor.setInventoryBookTransactionToUpdate(purchaseTransaction);

                purchaseLogEntries.push(logPurchase(purchaseQuantity, unitTotalCostOfSale, purchaseTransaction));
                soldQuantity = soldQuantity.minus(purchaseQuantity);

            // Sold quantity LT purchase quantity: update purchase + update & check splitted purchase transaction
            } else {
                const remainingBuyQuantity = purchaseQuantity.minus(soldQuantity);
                const partialBuyQuantity = purchaseQuantity.minus(remainingBuyQuantity);

                saleCost = saleCost.plus(partialBuyQuantity.times(unitTotalCostOfSale));

                purchaseTransaction
                    .setAmount(remainingBuyQuantity)
                    .setProperty(constants.GOOD_PURCHASE_COST_PROP, unitGoodCost.times(remainingBuyQuantity).toString())
                    .setProperty(constants.ADD_PURCHASE_COSTS_PROP, unitAdditionalCosts.times(remainingBuyQuantity).toString())
                    .setProperty(constants.TOTAL_COST_PROP, unitTotalCostOfSale.times(remainingBuyQuantity).toString())
                    ;
                // Store transaction to be updated
                processor.setInventoryBookTransactionToUpdate(purchaseTransaction);

                let splittedPurchaseTransaction = inventoryBook.newTransaction()
                    .setDate(purchaseTransaction.getDate())
                    .setAmount(partialBuyQuantity)
                    .setCreditAccount(purchaseTransaction.getCreditAccount())
                    .setDebitAccount(purchaseTransaction.getDebitAccount())
                    .setDescription(purchaseTransaction.getDescription())
                    .setProperty(constants.ORDER_PROP, purchaseTransaction.getProperty(constants.ORDER_PROP))
                    .setProperty(constants.PARENT_ID, purchaseTransaction.getId())
                    .setProperty(constants.PURCHASE_CODE_PROP, purchaseCode.toString())
                    .setProperty(constants.GOOD_PURCHASE_COST_PROP, unitGoodCost.times(partialBuyQuantity).toString())
                    .setProperty(constants.ADD_PURCHASE_COSTS_PROP, unitAdditionalCosts.times(partialBuyQuantity).toString())
                    .setProperty(constants.TOTAL_COST_PROP, unitTotalCostOfSale.times(partialBuyQuantity).toString())
                    ;

                saleLiquidationLog = logLiquidation(saleTransaction, unitTotalCostOfSale);
                splittedPurchaseTransaction.setProperty(constants.LIQUIDATION_LOG_PROP, JSON.stringify(saleLiquidationLog));

                // Store transaction to be created: generate temporaty id in order to wrap up connections later
                splittedPurchaseTransaction
                    .setChecked(true)
                    .addRemoteId(`${processor.generateTemporaryId()}`)
                    ;
                processor.setInventoryBookTransactionToCreate(splittedPurchaseTransaction);

                purchaseLogEntries.push(logPurchase(partialBuyQuantity, unitTotalCostOfSale, purchaseTransaction));

                soldQuantity = soldQuantity.minus(partialBuyQuantity);
            }
            // Break loop if sale is fully processed, otherwise proceed to next purchase
            if (soldQuantity.eq(0)) {
                break;
            }
        }

        // Sold quantity EQ zero: update & check sale transaction
        if (soldQuantity.round(inventoryBook.getFractionDigits()).eq(0)) {
            if (purchaseLogEntries.length > 0) {
                saleTransaction
                    .setProperty(constants.TOTAL_COST_PROP, saleCost.toString())
                    .setProperty(constants.PURCHASE_LOG_PROP, JSON.stringify(purchaseLogEntries))
                    ;
            }

            // Store transaction to be updated
            saleTransaction.setChecked(true);
            processor.setInventoryBookTransactionToUpdate(saleTransaction);

        }

        // post cost of sale transaction in financial book
        addCostOfSales(financialBook, saleTransaction, saleCost, processor);
    }

    function addCostOfSales(financialBook: Bkper.Book, saleTransaction: Bkper.Transaction, saleCost: Bkper.Amount, processor: CalculateCostOfSalesProcessor) {
        let financialGoodAccount: Bkper.Account = financialBook.getAccount(saleTransaction.getCreditAccountName());

        // link cost transaction in fanancial book to sale transaction in inventory book
        const remoteId = saleTransaction.getId();
        const description = `#cost_of_sale ${saleTransaction.getDescription()}`;

        const costOfSaleTransaction = financialBook.newTransaction()
            .addRemoteId(remoteId)
            .setDate(saleTransaction.getDate())
            .setAmount(saleCost)
            .setDescription(description)
            .from(financialGoodAccount)
            .to('Cost of sales')
            .setProperty(constants.QUANTITY_SOLD_PROP, `${saleTransaction.getAmount().toNumber()}`)
            .setProperty(constants.SALE_INVOICE_PROP, `${saleTransaction.getProperty(constants.SALE_INVOICE_PROP)}`)
            .setChecked(true)
            ;

        // Store transaction to be created
        processor.setFinancialBookTransactionToCreate(costOfSaleTransaction);
    }

    function logLiquidation(transaction: Bkper.Transaction, unitTotalCost: Bkper.Amount, excRate?: Bkper.Amount): LiquidationLogEntry {
        return {
            id: transaction.getId(),
            dt: transaction.getDate(),
            qt: transaction.getAmount().toString(),
            uc: unitTotalCost.toString(),
            rt: excRate?.toString() || ''
        }
    }

    function logPurchase(quantity: Bkper.Amount, unitTotalCost: Bkper.Amount, transaction: Bkper.Transaction, excRate?: Bkper.Amount): PurchaseLogEntry {
        return {
            qt: quantity.toString(),
            uc: unitTotalCost.toString(),
            id: transaction.getId(),
            rt: excRate?.toString() || ''
        }
    }
}