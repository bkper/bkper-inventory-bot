namespace CostOfSalesService {

    export function calculateCostOfSalesForAccount(inventoryBookId: string, goodAccountId: string, toDate: string): Summary {
        const inventoryBook = BkperApp.getBook(inventoryBookId);
        if (!toDate) {
            toDate = inventoryBook.formatDate(new Date());
        }

        const goodAccount = new GoodAccount(inventoryBook.getAccount(goodAccountId));

        const summary = new Summary(goodAccount.getId());

        // if (stockAccount.needsRebuild()) {
        //     // Fire reset async
        //     RealizedResultsService.resetRealizedResultsForAccountAsync(stockBook, stockAccount, false);
        //     return summary.rebuild();
        // }

        const goodExcCode = goodAccount.getExchangeCode();
        const financialBook = BotService.getFinancialBook(inventoryBook, goodExcCode);
        // Skip
        if (financialBook == null) {
            return summary;
        }

        const beforeDate = BotService.getBeforeDateIsoString(inventoryBook, toDate);
        const iterator = inventoryBook.getTransactions(BotService.getAccountQuery(goodAccount, false, beforeDate));

        let goodAccountSaleTransactions: Bkper.Transaction[] = [];
        let goodAccountPurchaseTransactions: Bkper.Transaction[] = [];

        while (iterator.hasNext()) {
            const tx = iterator.next();
            // Filter only unchecked
            if (tx.isChecked()) {
                continue;
            }
            if (BotService.isSale(tx)) {
                goodAccountSaleTransactions.push(tx);
            }
            if (BotService.isPurchase(tx)) {
                goodAccountPurchaseTransactions.push(tx);
            }
        }

        goodAccountSaleTransactions = goodAccountSaleTransactions.sort(BotService.compareToFIFO);
        goodAccountPurchaseTransactions = goodAccountPurchaseTransactions.sort(BotService.compareToFIFO);


        // Processor
        const processor = new CalculateCostOfSalesProcessor(inventoryBook, financialBook);

        // Process sales
        for (const saleTransaction of goodAccountSaleTransactions) {
            if (goodAccountSaleTransactions.length > 0) {
                processSale(financialBook, inventoryBook, goodAccount, saleTransaction, goodAccountPurchaseTransactions, summary, processor);
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

    function processSale(financialBook: Bkper.Book, inventoryBook: Bkper.Book, goodAccount: GoodAccount, saleTransaction: Bkper.Transaction, purchaseTransactions: Bkper.Transaction[], summary: Summary, processor: CalculateCostOfSalesProcessor): void {

        // Log operation status
        console.log(`processing sale: ${saleTransaction.getId()}`);

        // Sale info: quantity, prices, exchange rates
        let soldQuantity = saleTransaction.getAmount();

        let saleCost = BkperApp.newAmount(0);
        let purchaseLogEntries: PurchaseLogEntry[] = [];

        // Control liquidation status
        let purchaseProcessed = false;

        for (const purchaseTransaction of purchaseTransactions) {

            // Log operation status
            console.log(`processing purchase: ${purchaseTransaction.getId()}`);

            let saleLiquidationLogEntries: LiquidationLogEntry[] = [];

            if (purchaseTransaction.isChecked()) {
                // Only process unchecked purchases
                continue;
            }

            // Processing purchase
            purchaseProcessed = true;

            // Purchase info: quantity, costs, purchase code
            const purchaseQuantity = purchaseTransaction.getAmount();

            const goodPurchaseCost = BotService.getGoodPurchaseCost(purchaseTransaction);
            const additionalPurchaseCost = BotService.getAdditionalPurchaseCosts(purchaseTransaction);

            const purchaseCode = BotService.getPurchaseCode(purchaseTransaction);

            // // Sold quantity GTE purchase quantity: update & check purchase transaction
            // if (soldQuantity.gte(purchaseQuantity)) {

            //     const saleAmount = salePrice.times(purchaseQuantity);
            //     const purchaseAmount = purchasePrice.times(purchaseQuantity);
            //     const fwdSaleAmount = fwdSalePrice.times(purchaseQuantity);
            //     const fwdPurchaseAmount = fwdPurchasePrice.times(purchaseQuantity);

            //     // Historical gain
            //     let histGain = saleAmount.minus(purchaseAmount);
            //     let histGainBaseNoFx = BotService.calculateGainBaseNoFX(histGain, purchaseExcRate, saleExcRate, shortSale);
            //     let histGainBaseWithFx = BotService.calculateGainBaseWithFX(purchaseAmount, purchaseExcRate, saleAmount, saleExcRate);

            //     // Fair gain
            //     let gain = fwdSaleAmount.minus(fwdPurchaseAmount);
            //     let gainBaseNoFx = BotService.calculateGainBaseNoFX(gain, fwdPurchaseExcRate, fwdSaleExcRate, shortSale);
            //     let gainBaseWithFx = BotService.calculateGainBaseWithFX(fwdPurchaseAmount, fwdPurchaseExcRate, fwdSaleAmount, fwdSaleExcRate);

            //     if (!shortSale) {
            //         purchaseTotal = purchaseTotal.plus(purchaseAmount);
            //         saleTotal = saleTotal.plus(saleAmount);
            //         fwdPurchaseTotal = fwdPurchaseTotal.plus(fwdPurchaseAmount);
            //         fwdSaleTotal = fwdSaleTotal.plus(fwdSaleAmount);

            //         // Historical
            //         histGainTotal = histGainTotal.plus(histGain);
            //         histGainBaseNoFxTotal = histGainBaseNoFxTotal.plus(histGainBaseNoFx);
            //         histGainBaseWithFxTotal = histGainBaseWithFxTotal.plus(histGainBaseWithFx);
            //         // Fair
            //         gainTotal = gainTotal.plus(gain);
            //         gainBaseNoFxTotal = gainBaseNoFxTotal.plus(gainBaseNoFx);
            //         gainBaseWithFxTotal = gainBaseWithFxTotal.plus(gainBaseWithFx);

            //         purchaseLogEntries.push(logPurchase(stockBook, purchaseQuantity, purchasePrice, purchaseTransaction, purchaseExcRate));
            //         if (fwdPurchasePrice) {
            //             fwdPurchaseLogEntries.push(logPurchase(stockBook, purchaseQuantity, fwdPurchasePrice, purchaseTransaction, fwdPurchaseExcRate));
            //         } else {
            //             fwdPurchaseLogEntries.push(logPurchase(stockBook, purchaseQuantity, purchasePrice, purchaseTransaction, purchaseExcRate));
            //         }
            //     }

            //     purchaseTransaction
            //         .setProperty(PURCHASE_PRICE_PROP, purchasePrice.toString())
            //         .setProperty(PURCHASE_AMOUNT_PROP, purchaseAmount.toString())
            //         .setProperty(PURCHASE_EXC_RATE_PROP, purchaseExcRate?.toString())
            //         .setProperty(FWD_PURCHASE_AMOUNT_PROP, fwdPurchaseAmount?.toString())
            //         ;
            //     if (shortSale) {
            //         shortSaleLiquidationLogEntries.push(logLiquidation(purchaseTransaction, purchasePrice, purchaseExcRate));
            //         purchaseTransaction
            //             .setProperty(SALE_PRICE_PROP, salePrice.toString())
            //             .setProperty(SALE_EXC_RATE_PROP, saleExcRate?.toString())
            //             .setProperty(SALE_AMOUNT_PROP, saleAmount.toString())
            //             .setProperty(FWD_SALE_EXC_RATE_PROP, fwdSaleExcRate?.toString())
            //             .setProperty(FWD_SALE_PRICE_PROP, fwdSalePrice?.toString())
            //             .setProperty(FWD_SALE_AMOUNT_PROP, fwdSaleAmount?.toString())
            //             .setProperty(SALE_DATE_PROP, saleTransaction.getProperty(DATE_PROP) || saleTransaction.getDate())
            //             .setProperty(SHORT_SALE_PROP, 'true')
            //             ;
            //         if (historical) {
            //             // Record Historical gain (using the same prop key as before)
            //             purchaseTransaction.setProperty(GAIN_AMOUNT_PROP, histGain.toString());
            //         } else {
            //             // Record both Historical & Fair gains
            //             purchaseTransaction
            //                 .setProperty(GAIN_AMOUNT_HIST_PROP, histGain.toString())
            //                 .setProperty(GAIN_AMOUNT_PROP, gain.toString())
            //                 ;
            //         }
            //     } else {
            //         longSaleLiquidationLogEntries.push(logLiquidation(saleTransaction, salePrice, saleExcRate));
            //         purchaseTransaction.setProperty(LIQUIDATION_LOG_PROP, JSON.stringify(longSaleLiquidationLogEntries));
            //     }

            //     // Store transaction to be updated
            //     purchaseTransaction.setChecked(true);
            //     processor.setStockBookTransactionToUpdate(purchaseTransaction);

            //     if (shortSale) {
            //         if (historical) {
            //             // Record Historical results (using the same accounts and remoteIds as before)
            //             addRealizedResult(baseBook, stockAccount, financialBook, unrealizedAccount, purchaseTransaction, histGain, histGainBaseNoFx, false, processor);
            //             addFxResult(stockAccount, stockExcCode, baseBook, unrealizedFxBaseAccount, purchaseTransaction, histGainBaseWithFx, histGainBaseNoFx, summary, false, processor);
            //             // MTM
            //             if (autoMtM) {
            //                 addMarkToMarket(stockBook, purchaseTransaction, stockAccount, financialBook, unrealizedAccount, purchasePrice, false, processor);
            //             }
            //         } else {
            //             // Record both Historical & Fair results
            //             addRealizedResult(baseBook, stockAccount, financialBook, unrealizedHistAccount, purchaseTransaction, histGain, histGainBaseNoFx, true, processor);
            //             addRealizedResult(baseBook, stockAccount, financialBook, unrealizedAccount, purchaseTransaction, gain, gainBaseNoFx, false, processor);
            //             addFxResult(stockAccount, stockExcCode, baseBook, unrealizedFxHistBaseAccount, purchaseTransaction, histGainBaseWithFx, histGainBaseNoFx, summary, true, processor);
            //             addFxResult(stockAccount, stockExcCode, baseBook, unrealizedFxBaseAccount, purchaseTransaction, gainBaseWithFx, gainBaseNoFx, summary, false, processor);
            //             // MTM
            //             if (autoMtM) {
            //                 addMarkToMarket(stockBook, purchaseTransaction, stockAccount, financialBook, unrealizedHistAccount, purchasePrice, true, processor);
            //                 addMarkToMarket(stockBook, purchaseTransaction, stockAccount, financialBook, unrealizedAccount, purchasePrice, false, processor);
            //             }
            //         }
            //     }

            //     soldQuantity = soldQuantity.minus(purchaseQuantity);

            //     // Sold quantity LT purchase quantity: update purchase + update & check splitted purchase transaction
            // } else {
            const remainingBuyQuantity = purchaseQuantity.minus(soldQuantity);
            const partialBuyQuantity = purchaseQuantity.minus(remainingBuyQuantity);
            soldQuantity = soldQuantity.minus(partialBuyQuantity);

            // Cost of sale
            const unitGoodCost = goodPurchaseCost.div(purchaseQuantity);
            const unitAdditionalCosts = additionalPurchaseCost.div(purchaseQuantity);
            const unitTotalCostOfSale = unitGoodCost.plus(unitAdditionalCosts);

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


            saleLiquidationLogEntries.push(logLiquidation(saleTransaction, unitTotalCostOfSale));
            splittedPurchaseTransaction.setProperty(constants.LIQUIDATION_LOG_PROP, JSON.stringify(saleLiquidationLogEntries));

            // Store transaction to be created: generate temporaty id in order to wrap up connections later
            splittedPurchaseTransaction
                .setChecked(true)
                .addRemoteId(`${processor.generateTemporaryId()}`)
                ;
            processor.setInventoryBookTransactionToCreate(splittedPurchaseTransaction);

            purchaseLogEntries.push(logPurchase(partialBuyQuantity, unitTotalCostOfSale, purchaseTransaction));

            // }
            // Break loop if sale is fully processed, otherwise proceed to next purchase
            if (soldQuantity.lte(0)) {
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
        // // Sold quantity GT zero: update sale + update & check splitted sale transaction
        // else if (soldQuantity.round(inventoryBook.getFractionDigits()).gt(0)) {

        //     let remainingSaleQuantity = saleTransaction.getAmount().minus(soldQuantity);

        //     if (!remainingSaleQuantity.eq(0)) {

        //         saleTransaction
        //             .setProperty(SALE_EXC_RATE_PROP, saleExcRate?.toString())
        //             .setProperty(FWD_SALE_EXC_RATE_PROP, fwdSaleExcRate?.toString())
        //             .setAmount(soldQuantity)
        //             ;
        //         // Store transaction to be updated
        //         processor.setStockBookTransactionToUpdate(saleTransaction);

        //         let splittedSaleTransaction = stockBook.newTransaction()
        //             .setDate(saleTransaction.getDate())
        //             .setAmount(remainingSaleQuantity)
        //             .setCreditAccount(saleTransaction.getCreditAccount())
        //             .setDebitAccount(saleTransaction.getDebitAccount())
        //             .setDescription(saleTransaction.getDescription())
        //             .setProperty(ORDER_PROP, saleTransaction.getProperty(ORDER_PROP))
        //             .setProperty(DATE_PROP, saleTransaction.getProperty(DATE_PROP))
        //             .setProperty(PARENT_ID, saleTransaction.getId())
        //             .setProperty(SALE_PRICE_PROP, salePrice.toString())
        //             .setProperty(SALE_EXC_RATE_PROP, saleExcRate?.toString())
        //             .setProperty(FWD_SALE_PRICE_PROP, fwdSalePrice?.toString())
        //             .setProperty(FWD_SALE_EXC_RATE_PROP, fwdSaleExcRate?.toString())
        //             ;
        //         if (shortSaleLiquidationLogEntries.length > 0) {
        //             splittedSaleTransaction.setProperty(LIQUIDATION_LOG_PROP, JSON.stringify(shortSaleLiquidationLogEntries));
        //         }
        //         if (purchaseLogEntries.length > 0) {
        //             splittedSaleTransaction
        //                 .setProperty(PURCHASE_AMOUNT_PROP, purchaseTotal.toString())
        //                 .setProperty(SALE_AMOUNT_PROP, saleTotal.toString())
        //                 .setProperty(PURCHASE_LOG_PROP, JSON.stringify(purchaseLogEntries))
        //                 ;
        //             if (historical) {
        //                 // Record Historical gain (using the same prop key as before)
        //                 splittedSaleTransaction.setProperty(GAIN_AMOUNT_PROP, histGainTotal.toString());
        //             } else {
        //                 // Record both Historical & Fair gains
        //                 splittedSaleTransaction
        //                     .setProperty(GAIN_AMOUNT_HIST_PROP, histGainTotal.toString())
        //                     .setProperty(GAIN_AMOUNT_PROP, gainTotal.toString())
        //                     ;
        //             }
        //             if (fwdPurchaseLogEntries.length > 0) {
        //                 splittedSaleTransaction
        //                     .setProperty(FWD_PURCHASE_AMOUNT_PROP, !fwdPurchaseTotal.eq(0) ? fwdPurchaseTotal?.toString() : null)
        //                     .setProperty(FWD_SALE_AMOUNT_PROP, !fwdSaleTotal.eq(0) ? fwdSaleTotal.toString() : null)
        //                     .setProperty(FWD_PURCHASE_LOG_PROP, JSON.stringify(fwdPurchaseLogEntries))
        //                     ;
        //             }
        //         }

        //         // Store transaction to be created: generate temporaty id in order to wrap up connections later
        //         splittedSaleTransaction
        //             .setChecked(true)
        //             .addRemoteId(`${processor.generateTemporaryId()}`)
        //             ;
        //         processor.setStockBookTransactionToCreate(splittedSaleTransaction);

        //         // Override to have the RR, FX and MTM associated to the splitted tx
        //         saleTransaction = splittedSaleTransaction;
        //     }

        // }


        // Record Historical results (using the same accounts and remoteIds as before)
        addCostOfSales(financialBook, saleTransaction, saleCost, processor);
    }

    function addCostOfSales(financialBook: Bkper.Book, saleTransaction: Bkper.Transaction, saleCost: Bkper.Amount, processor: CalculateCostOfSalesProcessor) {
        let financialGoodAccount: Bkper.Account = financialBook.getAccount(saleTransaction.getCreditAccountName());

        // link cost transaction in fanancial book to sale transaction into inventory book
        const remoteId = saleTransaction.getId();
        const description = `#cost_of_sale ${saleTransaction.getDescription()}`;

        const costOfSaleTransaction = financialBook.newTransaction()
            .addRemoteId(remoteId)
            .setDate(saleTransaction.getDate())
            .setAmount(saleCost)
            .setDescription(description)
            .from(financialGoodAccount)
            .to('Cost of sales')
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
            rt: excRate?.toString()
        }
    }

    function logPurchase(quantity: Bkper.Amount, unitTotalCost: Bkper.Amount, transaction: Bkper.Transaction, excRate?: Bkper.Amount): PurchaseLogEntry {
        return {
            qt: quantity.toString(),
            uc: unitTotalCost.toString(),
            dt: transaction.getDate(),
            rt: excRate?.toString()
        }
    }
}