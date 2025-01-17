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

            if (tx.getAgentId() == 'inventory-bot') { }

        }

        return summary.resetingAsync();
    }

}