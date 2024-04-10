import { Book, Transaction } from "bkper";
import { getInventoryBook } from "./BotService";

export abstract class InterceptorOrderProcessorDelete {

    protected cascadeDelete(book: Book, transaction: bkper.Transaction) {
      if (!book) {
        return;
      }
      this.cascadeDeleteTransactions(book, transaction, ``);
    }
  
    protected async cascadeDeleteTransactions(book: Book, remoteTx: bkper.Transaction, prefix: string) {
      let iterator = book.getTransactions(`remoteId:${prefix}${remoteTx.id}`);
      if (await iterator.hasNext()) {
        let tx = await iterator.next();
        if (tx.isChecked()) {
          tx = await tx.uncheck();
        }
        await tx.remove();
      }
    }

    protected async buildDeleteResponse(tx: Transaction): Promise<string> {
        return `DELETED: ${tx.getDateFormatted()} ${tx.getAmount()} ${await tx.getCreditAccountName()} ${await tx.getDebitAccountName()} ${tx.getDescription()}`
    }

    protected async deleteTransaction(book: Book, remoteId: string): Promise<Transaction> {
        let iterator = book.getTransactions(`remoteId:${remoteId}`);
        if (await iterator.hasNext()) {
            let tx = await iterator.next();
            if (tx.isChecked()) {
                tx = await tx.uncheck();
            }
            tx = await tx.remove();
            return tx;
        }
        return null;
    }

    protected async deleteOnInventoryBook(financialBook: Book, remoteId: string): Promise<Transaction> {
        let inventoryBook = getInventoryBook(financialBook);
        const deletedInventoryTx = await this.deleteTransaction(inventoryBook, remoteId);
        if (deletedInventoryTx) {
            this.cascadeDelete(financialBook, deletedInventoryTx.json());
        }
        return deletedInventoryTx;
    }

}