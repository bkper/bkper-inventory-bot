import { Book, Transaction } from "bkper";
import { EventHandler } from "./EventHandler";
import { getBookExcCode, getExchangeCodeFromAccount, getGoodExchangeCodeFromAccount } from "./BotService";
import { GOOD_PROP } from "./constants";

export abstract class EventHandlerTransaction extends EventHandler {

    protected abstract getTransactionQuery(transaction: bkper.Transaction): string;
    protected abstract connectedTransactionNotFound(financialBook: Book, inventoryBook: Book, financialTransaction: bkper.Transaction, goodExcCode: string): Promise<string>;
    protected abstract connectedTransactionFound(baseBook: Book, connectedBook: Book, financialTransaction: bkper.Transaction, goodTransaction: Transaction, goodExcCode: string): Promise<string>;

    async processObject(financialBook: Book, inventoryBook: Book, event: bkper.Event): Promise<string> {
        let excCode = getBookExcCode(financialBook);
        let operation = event.data.object as bkper.TransactionOperation;
        let financialTransaction = operation.transaction;

        if (!financialTransaction.posted) {
            return null;
        }

        let iterator = inventoryBook.getTransactions(this.getTransactionQuery(financialTransaction));

        let goodExcCode = await this.getGoodExcCodeFromTransaction(financialTransaction, financialBook);

        if (!this.matchGoodExchange(goodExcCode, excCode)) {
            return null;
        }

        if (await iterator.hasNext()) {
            let goodTransaction = await iterator.next();
            return await this.connectedTransactionFound(financialBook, inventoryBook, financialTransaction, goodTransaction, goodExcCode);
        } else {
            return await this.connectedTransactionNotFound(financialBook, inventoryBook, financialTransaction, goodExcCode)
        }
    }

    private async getGoodExcCodeFromTransaction(fiancialTransaction: bkper.Transaction, financialBook: Book): Promise<string> | null {
        let goodProp = fiancialTransaction.properties[GOOD_PROP];
        let goodAccount = await financialBook.getAccount(goodProp);
        if (goodAccount) {
            // sale
            return await getExchangeCodeFromAccount(goodAccount);
        } else {
            // purchase
            const financialDebitAccount = fiancialTransaction.debitAccount;
            return getGoodExchangeCodeFromAccount(financialDebitAccount);
        }
    }
}