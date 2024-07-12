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

        // const baseBook = BotService.getBaseBook(financialBook);

        return summary;
    }

}