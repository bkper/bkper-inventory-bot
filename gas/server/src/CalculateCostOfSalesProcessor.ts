class CalculateCostOfSalesProcessor {

    private inventoryBook: Bkper.Book;
    private financialBook: Bkper.Book;

    private inventoryBookTransactionsToCreateMap = new Map<string, Bkper.Transaction>();
    private inventoryBookTransactionsToUpdateMap = new Map<string, Bkper.Transaction>();
    private financialBookTransactionsToCreateMap = new Map<string, Bkper.Transaction>();

    private isAnyTransactionLocked = false;

    constructor(inventoryBook: Bkper.Book, financialBook: Bkper.Book) {
        this.inventoryBook = inventoryBook;
        this.financialBook = financialBook;
    }

    generateTemporaryId(): string {
        return `ccsp_id_${Utilities.getUuid()}`;
    }

    getTemporaryId(transaction: Bkper.Transaction): string {
        for (const remoteId of transaction.getRemoteIds()) {
            if (remoteId.startsWith('ccsp_id_')) {
                return remoteId;
            }
        }
        return '';
    }

    private getRemoteId(transaction: Bkper.Transaction): string {
        const remoteIds = transaction.getRemoteIds();
        return remoteIds.length > 0 ? remoteIds[0] : '';
    }

    private checkTransactionLocked(transaction: Bkper.Transaction): void {
        if (transaction.isLocked()) {
            this.isAnyTransactionLocked = true;
        }
    }

    hasLockedTransaction(): boolean {
        return this.isAnyTransactionLocked;
    }

    setInventoryBookTransactionToCreate(transaction: Bkper.Transaction): void {
        this.checkTransactionLocked(transaction);
        // Use remoteId as key since transaction does not have an id yet
        this.inventoryBookTransactionsToCreateMap.set(this.getRemoteId(transaction), transaction);
    }

    setInventoryBookTransactionToUpdate(transaction: Bkper.Transaction): void {
        this.checkTransactionLocked(transaction);
        this.inventoryBookTransactionsToUpdateMap.set(transaction.getId(), transaction);
    }

    setFinancialBookTransactionToCreate(transaction: Bkper.Transaction): void {
        this.checkTransactionLocked(transaction);
        // Use remoteId as key since transaction does not have an id yet
        this.financialBookTransactionsToCreateMap.set(this.getRemoteId(transaction), transaction);
    }

    fireBatchOperations(): void {
        // Fire batch creation of inventory book transactions first in order to get new ids
        const newInventoryBookTransactions = this.fireBatchCreateInventoryBookTransactions();

        // Fix remoteIds references on COGS
        for (const newInventoryBookTx of newInventoryBookTransactions) {

            const oldId = this.getTemporaryId(newInventoryBookTx);
            const newId = newInventoryBookTx.getId();

            const connectedRrTx = this.financialBookTransactionsToCreateMap.get(`${oldId}`);
            if (connectedRrTx) {
                connectedRrTx.addRemoteId(`${newId}`);
            }
        }

        // Fire other batch operations
        this.fireBatchUpdateInventoryBookTransactions();
        this.fireBatchCreateFinancialBookTransactions();
    }

    // Inventory book: create
    private fireBatchCreateInventoryBookTransactions(): Bkper.Transaction[] {
        const inventoryBookTransactionsToCreate = Array.from(this.inventoryBookTransactionsToCreateMap.values());
        if (inventoryBookTransactionsToCreate.length > 0) {
            return this.inventoryBook.batchCreateTransactions(inventoryBookTransactionsToCreate);
        }
        return [];
    }

    // Inventory book: update
    private fireBatchUpdateInventoryBookTransactions(): void {
        const inventoryBookTransactionsToUpdate = Array.from(this.inventoryBookTransactionsToUpdateMap.values());
        if (inventoryBookTransactionsToUpdate.length > 0) {
            this.inventoryBook.batchUpdateTransactions(inventoryBookTransactionsToUpdate, true);
        }
    }

    // Financial book: create
    private fireBatchCreateFinancialBookTransactions(): void {
        const financialBookTransactionsToCreate = Array.from(this.financialBookTransactionsToCreateMap.values());
        if (financialBookTransactionsToCreate.length > 0) {
            this.financialBook.batchCreateTransactions(financialBookTransactionsToCreate);
        }
    }

}
