import { Book, Transaction } from "bkper";
import { uncheckAndRemove } from "./BotService";

export abstract class InterceptorOrderProcessorDelete {

    protected cascadeDelete(book: Book, transaction: bkper.Transaction) {
      if (!book) {
        return;
      }
      // this.cascadeDeleteTransactions(book, transaction, ``);
      // this.cascadeDeleteTransactions(book, transaction, `additional_cost_`);
      // this.cascadeDeleteTransactions(getBaseBook(book), transaction, `fx_`);
    }
  
    protected async cascadeDeleteTransactions(book: Book, remoteTx: bkper.Transaction, prefix: string) {

    }

    protected async buildDeleteResponse(tx: Transaction): Promise<string> {
        return `DELETED: ${tx.getDateFormatted()} ${tx.getAmount()} ${await tx.getCreditAccountName()} ${await tx.getDebitAccountName()} ${tx.getDescription()}`
    }

    protected async deleteTransactionByRemoteId(book: Book, remoteId: string): Promise<Transaction> {
        let iterator = book.getTransactions(`remoteId:${remoteId}`);
        if (await iterator.hasNext()) {
            let tx = await iterator.next();
            tx = await uncheckAndRemove(tx);
            return tx;
        }
        return null;
    }

}