// @ts-nocheck
import { Book, Transaction } from "bkper-js";
import { uncheckAndRemove } from "./BotService.js";

export abstract class InterceptorOrderProcessorDelete {

	protected async cascadeDelete(book: Book, transaction: bkper.Transaction): Promise<Transaction> {
		if (!book) {
			return null;
		}
		return await this.cascadeDeleteTransactions(book, transaction, ``);
	}

	protected async cascadeDeleteTransactions(book: Book, remoteTx: bkper.Transaction, prefix: string): Promise<Transaction> {
		const iterator = book.getTransactions(`remoteId:${prefix}${remoteTx.id}`);
		if (await iterator.hasNext()) {
			let tx = await iterator.next();
			if (tx.isChecked()) {
				tx = await tx.uncheck();
			}
			const response = await tx.remove();
			return response;
		}
		return null;
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