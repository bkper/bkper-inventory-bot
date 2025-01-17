class ResetCostOfSalesProcessor {

    private inventoryBook: Bkper.Book;
    private financialBook: Bkper.Book;

    private stockBookTransactionsToUpdateMap = new Map<string, Bkper.Transaction>();
    private stockBookTransactionsToTrashMap = new Map<string, Bkper.Transaction>();
    private financialBookTransactionsToTrashMap = new Map<string, Bkper.Transaction>();

    constructor(inventoryBook: Bkper.Book, financialBook: Bkper.Book) {
        this.inventoryBook = inventoryBook;
        this.financialBook = financialBook;
    }

}