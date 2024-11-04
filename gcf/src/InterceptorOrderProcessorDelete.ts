import { Book, Transaction } from "bkper-js";
import { uncheckAndRemove } from "./BotService.js";

export abstract class InterceptorOrderProcessorDelete {

	// (already refatored to ts:strict)
	protected async cascadeDelete(book: Book, transaction: bkper.Transaction): Promise<Transaction | undefined> {
		return await this.cascadeDeleteTransactions(book, transaction, ``);
	}

	protected async cascadeDeleteTransactions(book: Book, remoteTx: bkper.Transaction, prefix: string): Promise<Transaction | undefined> {
		let tx = (await book.listTransactions(`remoteId:${prefix}${remoteTx.id}`)).getFirst();
		if (tx) {
			if (tx.isChecked()) {
				tx = await tx.uncheck();
			}
			const response = await tx.remove();
			return response;
		}
		return undefined;
	}

	protected async buildDeleteResponse(tx: Transaction): Promise<string> {
		return `DELETED: ${tx.getDateFormatted()} ${tx.getAmount()} ${await tx.getCreditAccountName()} ${await tx.getDebitAccountName()} ${tx.getDescription()}`
	}

	protected async deleteTransactionByRemoteId(book: Book, remoteId: string): Promise<Transaction | null> {
		let tx = (await book.listTransactions(`remoteId:${remoteId}`)).getFirst();
		if (tx) {
			tx = await uncheckAndRemove(tx);
			return tx;
		}
		return null;
	}

}