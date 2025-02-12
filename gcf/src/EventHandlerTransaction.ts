import { Book, Transaction } from "bkper-js";
import { EventHandler } from "./EventHandler.js";
import { getBookExcCode, getExchangeCodeFromAccount, getGoodExchangeCodeFromAccount } from "./BotService.js";
import { GOOD_PROP } from "./constants.js";

export abstract class EventHandlerTransaction extends EventHandler {

    protected abstract connectedTransactionNotFound(financialBook: Book, inventoryBook: Book, financialTransaction: bkper.Transaction, goodExcCode?: string): Promise<string | undefined>;
    protected abstract connectedTransactionFound(eventBook: Book, connectedBook: Book, financialTransaction: bkper.Transaction, goodTransaction: Transaction, goodExcCode?: string): Promise<string | undefined>;

    /**
     * Returns the remoteId query to find the matching transaction between Financial and Inventory Books
     * @param transaction The transaction to find the match for
     * @returns Query string in the format "remoteId:<transaction.id>"
     */
    protected getTransactionQuery(transaction: bkper.Transaction): string {
        return `remoteId:${transaction.id}`;
    }

    async processObject(financialBook: Book, inventoryBook: Book, event: bkper.Event): Promise<string | undefined> {
        if (!event.data) {
            return undefined;
        }
        let excCode = getBookExcCode(financialBook);
        let operation = event.data.object as bkper.TransactionOperation;
        let financialTransaction = operation.transaction;

        if (!financialTransaction || !financialTransaction.posted) {
            return undefined;
        }

        // Get the good exchange code from transaction and verify if it matches the book's exchange code
        // If they don't match, skip processing the transaction
        let goodExcCode = await this.getGoodExcCodeFromTransaction(financialTransaction, financialBook);
        if (goodExcCode && excCode && !this.matchGoodExchange(goodExcCode, excCode)) {
            return undefined;
        }
        
        let goodTransaction = (await inventoryBook.listTransactions(this.getTransactionQuery(financialTransaction))).getFirst();
        if (goodTransaction) {
            return await this.connectedTransactionFound(financialBook, inventoryBook, financialTransaction, goodTransaction, goodExcCode);
        } else {
            return await this.connectedTransactionNotFound(financialBook, inventoryBook, financialTransaction, goodExcCode)
        }
    }

    private async getGoodExcCodeFromTransaction(fiancialTransaction: bkper.Transaction, financialBook: Book): Promise<string | undefined> {
        if (!fiancialTransaction.properties) {
            return undefined;
        }
        let goodProp = fiancialTransaction.properties[GOOD_PROP];
        let goodAccount = await financialBook.getAccount(goodProp);
        if (goodAccount) {
            // sale
            return await getExchangeCodeFromAccount(goodAccount);
        } else {
            // purchase
            const financialDebitAccount = fiancialTransaction.debitAccount;
            if (financialDebitAccount) {
                return getGoodExchangeCodeFromAccount(financialDebitAccount);
            }
        }
        return undefined;
    }
}
