namespace CostOfSalesService {

    export function calculateCostOfSalesForAccount(inventoryBookId: string, goodAccountId: string, toDate: string): Summary {
        const inventoryBook = BkperApp.getBook(inventoryBookId);
        if (!toDate) {
            toDate = inventoryBook.formatDate(new Date());
        }

        // let stockAccount = new StockAccount(stockBook.getAccount(stockAccountId));

        const summary = new Summary(stockAccount.getId());
    }

}
