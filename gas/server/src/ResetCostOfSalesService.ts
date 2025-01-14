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

        return summary;
    }

}