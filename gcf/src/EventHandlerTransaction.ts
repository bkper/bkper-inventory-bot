import { Book, Transaction } from "bkper-js";
import { EventHandler } from "./EventHandler.js";
import { getBookExcCode, getExchangeCodeFromAccount, getGoodExchangeCodeFromAccount } from "./BotService.js";
import { GOOD_PROP } from "./constants.js";

export abstract class EventHandlerTransaction extends EventHandler {

    protected abstract getTransactionQuery(transaction: bkper.Transaction): string;
    protected abstract connectedTransactionNotFound(financialBook: Book, inventoryBook: Book, financialTransaction: bkper.Transaction, goodExcCode: string | undefined): Promise<string>;
    protected abstract connectedTransactionFound(baseBook: Book, connectedBook: Book, financialTransaction: bkper.Transaction, goodTransaction: Transaction, goodExcCode: string | undefined): Promise<string>;

    async processObject(financialBook: Book, inventoryBook: Book, event: bkper.Event): Promise<string | null> {
        if (!event.data) {
            return null;
        }
        let excCode = getBookExcCode(financialBook);
        let operation = event.data.object as bkper.TransactionOperation;
        let financialTransaction = operation.transaction;

        if (!financialTransaction || !financialTransaction.posted) {
            return null;
        }

        let goodTransaction = (await inventoryBook.listTransactions(this.getTransactionQuery(financialTransaction))).getFirst();

        let goodExcCode = await this.getGoodExcCodeFromTransaction(financialTransaction, financialBook);

        if (goodExcCode && excCode&& !this.matchGoodExchange(goodExcCode, excCode)) {
            return null;
        }

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
