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
            return summary.setResult(`Cannot proceed: financial book not found for good account ${goodAccount.getName()}`);
        }

        const beforeDate = BotService.getBeforeDateIsoString(inventoryBook, toDate);
        const iterator = inventoryBook.getTransactions(helper.getAccountQuery(goodAccount.getName(), beforeDate));

        let goodAccountSaleTransactions: Bkper.Transaction[] = [];
        let goodAccountPurchaseTransactionsMap: Map<string, Bkper.Transaction> = new Map();
        let goodAccountCreditNoteTransactionsMap: Map<string, Bkper.Transaction> = new Map();

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
                goodAccountPurchaseTransactionsMap.set(tx.getProperty(PURCHASE_CODE_PROP), tx);
                totalPurchasedQuantity += tx.getAmount().toNumber();
            }
            if (BotService.isCreditNote(tx)) {
                goodAccountCreditNoteTransactionsMap.set(tx.getProperty(PURCHASE_CODE_PROP), tx);
                totalPurchasedQuantity -= tx.getAmount().toNumber();
            }
        }

        if (totalSalesQuantity == 0) {
            return summary;
        }
        // Total sales quantity cannot be greater than available quantity in inventory
        if (totalSalesQuantity > totalPurchasedQuantity) {
            return summary.salequantityError();
        }

        // Processor
        const processor = new CalculateCostOfSalesProcessor(inventoryBook, financialBook);

        // process credit notes before sales
        for (const [purchaseCode, creditNoteTx] of goodAccountCreditNoteTransactionsMap.entries()) {
            const purchaseTransaction = goodAccountPurchaseTransactionsMap.get(purchaseCode);
            if (purchaseTransaction) {
                const creditNoteQuantity = BkperApp.newAmount(creditNoteTx.getAmount().toNumber());
                const remainingQuantity = purchaseTransaction.getAmount().minus(creditNoteQuantity);
                
                if (remainingQuantity.toNumber() < 0) {
                    return summary.creditNoteQuantityError();
                } else {
                    // split purchase transaction
                    let splittedPurchaseTransaction = inventoryBook.newTransaction()
                    .setDate(purchaseTransaction.getDate())
                    .setAmount(creditNoteQuantity)
                    .setCreditAccount(purchaseTransaction.getCreditAccount())
                    .setDebitAccount(purchaseTransaction.getDebitAccount())
                    .setDescription(purchaseTransaction.getDescription())
                    .setProperty(PARENT_ID, purchaseTransaction.getId())
                    .setProperty(PURCHASE_CODE_PROP, purchaseCode.toString())
                    .setProperty(CREDIT_NOTE_PROP, creditNoteTx.getProperty(CREDIT_NOTE_PROP))
                    .setChecked(true)
                    ;

                    // Store transaction to be created
                    processor.setInventoryBookTransactionToCreate(splittedPurchaseTransaction);

                    // update purchase transaction
                    purchaseTransaction.setAmount(remainingQuantity);
                    processor.setInventoryBookTransactionToUpdate(purchaseTransaction);
                    goodAccountPurchaseTransactionsMap.set(purchaseCode, purchaseTransaction);
                }
            }
        }

        goodAccountSaleTransactions = goodAccountSaleTransactions.sort(BotService.compareToFIFO);
        const goodAccountPurchaseTransactions = Array.from(goodAccountPurchaseTransactionsMap.values()).sort(BotService.compareToFIFO);

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

        storeLastCalcTxDate(goodAccount, goodAccountSaleTransactions);

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
        console.log(`processing sale: ${saleTransaction.getId()} - ${saleTransaction.getDescription()}`);

        // Sale info: quantity, prices, exchange rates
        let soldQuantity = saleTransaction.getAmount();

        let saleCost = BkperApp.newAmount(0);
        let purchaseLogEntries: PurchaseLogEntry[] = [];

        for (const purchaseTransaction of purchaseTransactions) {

            if (purchaseTransaction.isChecked()) {
                // Only process unchecked purchases
                continue;
            }

            // Log operation status
            console.log(`processing purchase: ${purchaseTransaction.getId()} - ${purchaseTransaction.getDescription()}`);

            // Original purchase info: quantity and price
            const purchaseCode = purchaseTransaction.getProperty(PURCHASE_CODE_PROP);
            const originalQuantity = BkperApp.newAmount(purchaseTransaction.getProperty(ORIGINAL_QUANTITY_PROP));
            const transactionQuantity = purchaseTransaction.getAmount();
            const transactionCost = BkperApp.newAmount(purchaseTransaction.getProperty(TOTAL_COST_PROP));

            let additionalCosts = BkperApp.newAmount(0);
            let creditNote: CreditNote = { amount: BkperApp.newAmount(0), quantity: 0 };
            if (originalQuantity.toNumber() == transactionQuantity.toNumber()) {
                // transaction hasn't been previously processed in FIFO execution. Get additional costs & credit notes to update purchase transaction
                ({ additionalCosts, creditNote } = getAdditionalCostsAndCreditNotes(financialBook, inventoryBook, purchaseTransaction));
            }

            // Updated purchase info: quantity, costs, purchase code
            let updatedQuantity = transactionQuantity.minus(creditNote.quantity);
            let updatedCost = transactionCost.plus(additionalCosts).minus(creditNote.amount);

            const costOfSalePerUnit = updatedCost.div(updatedQuantity);

            // Sold quantity is greater than or equal to purchase quantity
            if (soldQuantity.gte(updatedQuantity)) {

                // compute COGS
                saleCost = saleCost.plus(updatedCost);

                // update & check purchase transaction
                const liquidationLog = getLiquidationLog(saleTransaction, costOfSalePerUnit);
                purchaseTransaction
                    .setProperty(TOTAL_COST_PROP, updatedCost.toString())
                    .setProperty(LIQUIDATION_LOG_PROP, JSON.stringify(liquidationLog))
                    ;

                if (purchaseTransaction.getProperty(ADD_COSTS_PROP) == null && !additionalCosts.eq(0)) {
                    purchaseTransaction.setProperty(ADD_COSTS_PROP, additionalCosts.toString());
                }

                if (purchaseTransaction.getProperty(CREDIT_NOTE_PROP) == null && !creditNote.amount.eq(0)) {
                    purchaseTransaction.setProperty(CREDIT_NOTE_PROP, JSON.stringify({ quantity: creditNote.quantity, amount: creditNote.amount.toNumber() }));
                }

                purchaseTransaction.setChecked(true);

                // Store transaction to be updated
                processor.setInventoryBookTransactionToUpdate(purchaseTransaction);

                // store purchase log entry
                purchaseLogEntries.push(getPurchaseLog(updatedQuantity, costOfSalePerUnit, purchaseTransaction));

                // update sold quantity
                soldQuantity = soldQuantity.minus(updatedQuantity);

            } else {
                // Sold quantity is less than purchase quantity: split and update purchase transaction
                const remainingQuantity = updatedQuantity.minus(soldQuantity);
                const partialBuyQuantity = updatedQuantity.minus(remainingQuantity);
                const splittedCost = partialBuyQuantity.times(costOfSalePerUnit)
                const remainingCost = updatedCost.minus(splittedCost)

                // compute COGS
                saleCost = saleCost.plus(splittedCost);

                // update purchase transaction
                purchaseTransaction
                    .setAmount(remainingQuantity)
                    .setProperty(TOTAL_COST_PROP, remainingCost.toString())
                    ;

                if (purchaseTransaction.getProperty(ADD_COSTS_PROP) == null && !additionalCosts.eq(0)) {
                    purchaseTransaction.setProperty(ADD_COSTS_PROP, additionalCosts.toString());
                }

                if (purchaseTransaction.getProperty(CREDIT_NOTE_PROP) == null && !creditNote.amount.eq(0)) {
                    purchaseTransaction.setProperty(CREDIT_NOTE_PROP, JSON.stringify({ quantity: creditNote.quantity, amount: creditNote.amount.toNumber() }));
                }

                // Store transaction to be updated
                processor.setInventoryBookTransactionToUpdate(purchaseTransaction);

                // create splitted purchase transaction
                const liquidationLog = getLiquidationLog(saleTransaction, costOfSalePerUnit);
                let splittedPurchaseTransaction = inventoryBook.newTransaction()
                    .setDate(purchaseTransaction.getDate())
                    .setAmount(partialBuyQuantity)
                    .setCreditAccount(purchaseTransaction.getCreditAccount())
                    .setDebitAccount(purchaseTransaction.getDebitAccount())
                    .setDescription(purchaseTransaction.getDescription())
                    .setProperty(EXC_CODE_PROP, purchaseTransaction.getProperty(EXC_CODE_PROP))
                    .setProperty(PARENT_ID, purchaseTransaction.getId())
                    .setProperty(PURCHASE_CODE_PROP, purchaseCode.toString())
                    .setProperty(TOTAL_COST_PROP, splittedCost.toString())
                    .setProperty(LIQUIDATION_LOG_PROP, JSON.stringify(liquidationLog))
                    .setProperty(ORDER_PROP, purchaseTransaction.getProperty(ORDER_PROP))
                    .setChecked(true)
                    ;

                // Store transaction to be created: generate temporaty id in order to link up connections later
                splittedPurchaseTransaction.addRemoteId(`${processor.generateTemporaryId()}`);

                // Store transaction to be created
                processor.setInventoryBookTransactionToCreate(splittedPurchaseTransaction);

                // store purchase log entry
                purchaseLogEntries.push(getPurchaseLog(partialBuyQuantity, costOfSalePerUnit, purchaseTransaction));

                // update sold quantity
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
                    .setProperty(TOTAL_COST_PROP, saleCost.toString())
                    .setProperty(PURCHASE_LOG_PROP, JSON.stringify(purchaseLogEntries))
                    .setChecked(true)
                    ;
            }

            // Store transaction to be updated
            processor.setInventoryBookTransactionToUpdate(saleTransaction);
        }

        // post cost of sale transaction in financial book
        addCostOfSales(financialBook, saleTransaction, saleCost, processor);
    }

    function addCostOfSales(financialBook: Bkper.Book, saleTransaction: Bkper.Transaction, saleCost: Bkper.Amount, processor: CalculateCostOfSalesProcessor) {
        let costOfSalesAccount = financialBook.getAccount(COST_OF_SALES_ACCOUNT);
        if (!costOfSalesAccount) {
            costOfSalesAccount = financialBook.newAccount()
                .setName(COST_OF_SALES_ACCOUNT)
                .setType(BkperApp.AccountType.OUTGOING)
                .create();
        }

        let financialGoodAccount: Bkper.Account = financialBook.getAccount(saleTransaction.getCreditAccountName());
        const remoteId = saleTransaction.getId();
        const description = `#cost_of_sale ${saleTransaction.getDescription()}`;

        // link COGS transaction in fanancial book to sale transaction in inventory book
        const costOfSaleTransaction = financialBook.newTransaction()
            .addRemoteId(remoteId)
            .setDate(saleTransaction.getDate())
            .setAmount(saleCost)
            .setDescription(description)
            .from(financialGoodAccount)
            .to(costOfSalesAccount)
            .setProperty(QUANTITY_SOLD_PROP, `${saleTransaction.getAmount().toNumber()}`)
            .setProperty(SALE_INVOICE_PROP, `${saleTransaction.getProperty(SALE_INVOICE_PROP)}`)
            .setChecked(true)
            ;

        // Store transaction to be created
        processor.setFinancialBookTransactionToCreate(costOfSaleTransaction);
    }

    /**
     * Gets additional costs and credit notes associated with a purchase transaction
     * 
     * @param financialBookbook The financial book containing cost transactions
     * @param inventoryBook The inventory book containing quantity transactions
     * @param inventoryTransaction The inventory transaction to find costs/credits for
     * @returns Object containing total additional costs and credit note details
     */
    export function getAdditionalCostsAndCreditNotes(financialBookbook: Bkper.Book, inventoryBook: Bkper.Book, inventoryTransaction: Bkper.Transaction): { additionalCosts: Bkper.Amount, creditNote: CreditNote } {
        // Calculate date range to search for related transactions
        const transactionDate = helper.parseDate(inventoryTransaction.getDate());
        const timeRange = helper.getTimeRange(ADDITIONAL_COSTS_CREDITS_QUERY_RANGE);

        const beforeDate = new Date(transactionDate.getTime() + timeRange);
        const beforeDateIsoString = Utilities.formatDate(beforeDate, financialBookbook.getTimeZone(), 'yyyy-MM-dd');

        const afterDate = new Date(transactionDate.getTime() - timeRange);
        const afterDateIsoString = Utilities.formatDate(afterDate, financialBookbook.getTimeZone(), 'yyyy-MM-dd');

        // Build query to find transactions for the inventory account within date range
        const inventoryAccountName = inventoryTransaction.getDebitAccount().getName();
        const query = helper.getAccountQuery(inventoryAccountName, beforeDateIsoString, afterDateIsoString);

        const purchaseCode = inventoryTransaction.getProperty(PURCHASE_CODE_PROP);
        const transactions = financialBookbook.getTransactions(query);
        const financialAccountId = financialBookbook.getAccount(inventoryAccountName).getId();

        // Initialize totals
        let totalAdditionalCosts = BkperApp.newAmount(0);
        let totalCreditAmount = BkperApp.newAmount(0);
        let totalCreditQuantity = BkperApp.newAmount(0);

        // Process each transaction found
        while (transactions.hasNext()) {
            const tx = transactions.next();

            // Check for additional costs transactions
            if (tx.isChecked() &&
                tx.getDebitAccount().getId() == financialAccountId &&
                tx.getProperty(PURCHASE_CODE_PROP) == purchaseCode &&
                (tx.getProperty(PURCHASE_INVOICE_PROP) != undefined &&
                    tx.getProperty(PURCHASE_INVOICE_PROP) != purchaseCode)) {
                totalAdditionalCosts = totalAdditionalCosts.plus(tx.getAmount());
            } 
            // Check for credit note transactions
            else if (tx.isChecked() && tx.getProperty(CREDIT_NOTE_PROP) != undefined && tx.getProperty(PURCHASE_CODE_PROP) == purchaseCode && tx.getCreditAccount().getId() == financialAccountId) {
                totalCreditAmount = totalCreditAmount.plus(tx.getAmount());
                const quantity = BkperApp.newAmount(tx.getProperty(QUANTITY_PROP) ?? 0).toNumber();
                if (quantity > 0) {
                    totalCreditQuantity = totalCreditQuantity.plus(BkperApp.newAmount(quantity));
                    // check credit note transaction in inventory book
                    const inventoryCreditNoteTx = inventoryBook.getTransactions(`remoteId:${tx.getId()}`);
                    if (inventoryCreditNoteTx.hasNext()) {
                        inventoryCreditNoteTx.next().setChecked(true).update();
                    }
                }
            }
        }

        // Return totals
        return {
            additionalCosts: totalAdditionalCosts,
            creditNote: {
                quantity: totalCreditQuantity.toNumber(),
                amount: totalCreditAmount
            }
        };
    }

    function getLiquidationLog(transaction: Bkper.Transaction, costOfSalePerUnit: Bkper.Amount, excRate?: Bkper.Amount): LiquidationLogEntry {
        return {
            id: transaction.getId(),
            dt: transaction.getDate(),
            qt: transaction.getAmount().toString(),
            uc: costOfSalePerUnit.toString(),
            rt: excRate?.toString() || ''
        }
    }

    function getPurchaseLog(quantity: Bkper.Amount, costOfSalePerUnit: Bkper.Amount, transaction: Bkper.Transaction, excRate?: Bkper.Amount): PurchaseLogEntry {
        return {
            id: transaction.getId(),
            qt: quantity.toString(),
            uc: costOfSalePerUnit.toString(),
            rt: excRate?.toString() || ''
        }
    }
}