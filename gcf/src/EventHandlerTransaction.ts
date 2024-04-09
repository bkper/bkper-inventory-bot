import { Book, Transaction } from "bkper";
import { EventHandler } from "./EventHandler";
import { getBookExcCode, getGoodExchangeCodeFromAccount } from "./BotService";

export abstract class EventHandlerTransaction extends EventHandler {

    protected abstract getTransactionQuery(transaction: bkper.Transaction): string;
    protected abstract connectedTransactionNotFound(financialBook: Book, goodBook: Book, financialTransaction: bkper.Transaction, goodExcCode: string): Promise<string>;
    protected abstract connectedTransactionFound(baseBook: Book, connectedBook: Book, financialTransaction: bkper.Transaction, goodTransaction: Transaction, goodExcCode: string): Promise<string>;

    async processObject(financialBook: Book, goodBook: Book, event: bkper.Event): Promise<string> {
        let excCode = getBookExcCode(financialBook);
        let operation = event.data.object as bkper.TransactionOperation;
        let financialTransaction = operation.transaction;

        if (!financialTransaction.posted) {
            return null;
        }

        let iterator = goodBook.getTransactions(this.getTransactionQuery(financialTransaction));

        let goodExcCode = this.getGoodExcCodeFromTransaction(financialTransaction);

        if (!this.matchGoodExchange(goodExcCode, excCode)) {
            return null;
        }

        if (await iterator.hasNext()) {
            let goodTransaction = await iterator.next();
            return await this.connectedTransactionFound(financialBook, goodBook, financialTransaction, goodTransaction, goodExcCode);
        } else {
            return await this.connectedTransactionNotFound(financialBook, goodBook, financialTransaction, goodExcCode)
        }
    }

    private getGoodExcCodeFromTransaction(fiancialTransaction: bkper.Transaction) {

        let financialCreditAccount = fiancialTransaction.creditAccount;
        let financialDebitAccount = fiancialTransaction.debitAccount;

        let goodExcCode = getGoodExchangeCodeFromAccount(financialCreditAccount);
        if (goodExcCode == null) {
            goodExcCode = getGoodExchangeCodeFromAccount(financialDebitAccount);
        }
        return goodExcCode;
    }
}