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

    private getRemoteId(transaction: Bkper.Transaction): string {
        const remoteIds = transaction.getRemoteIds();
        return remoteIds?.length > 0 ? remoteIds[0] : '';
    }

    generateTemporaryId(): string {
        return `temp_id_${Utilities.getUuid()}`;
    }

    private getTemporaryId(transaction: Bkper.Transaction): string {
        for (const remoteId of transaction.getRemoteIds()) {
            if (remoteId.startsWith('temp_id_')) {
                return remoteId;
            }
        }
        return '';
    }

    private linkNewIdsToOlsIds(newInventoryBookTransactions: Bkper.Transaction[]): void {
        for (const transaction of newInventoryBookTransactions) {
            const oldId = this.getTemporaryId(transaction);
            const newId = transaction.getId();

            // Update remoteId on new inventory book transactions
            const connectedInventoryTx = this.inventoryBookTransactionsToCreateMap.get(`${oldId}`);
            if (connectedInventoryTx) {
                connectedInventoryTx.addRemoteId(`${newId}`);
            }
        }
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
        const newInventoryBookTransactions = this.fireBatchCreateInventoryBookTransactions();
        this.fireBatchUpdateInventoryBookTransactions();
        this.fireBatchCreateFinancialBookTransactions();

        // Update remoteId on new inventory book transactions
        this.linkNewIdsToOlsIds(newInventoryBookTransactions);
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
    private fireBatchCreateFinancialBookTransactions(): Bkper.Transaction[] {
        const financialBookTransactionsToCreate = Array.from(this.financialBookTransactionsToCreateMap.values());
        if (financialBookTransactionsToCreate.length > 0) {
            return this.financialBook.batchCreateTransactions(financialBookTransactionsToCreate);
        }
        return [];
    }

}
