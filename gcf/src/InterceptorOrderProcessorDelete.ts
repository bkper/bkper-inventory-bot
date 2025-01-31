import { Book, Transaction } from "bkper-js";
import { uncheckAndRemove } from "./BotService.js";
import { ORIGINAL_QUANTITY_PROP } from "./constants.js";

export abstract class InterceptorOrderProcessorDelete {

	protected async cascadeDeleteTransactions(book: Book, remoteTx: bkper.Transaction): Promise<Transaction[] | undefined> {
		let responses: Transaction[] = [];
		// splitted purchase transactions in inventory book
		if (remoteTx.properties?.[ORIGINAL_QUANTITY_PROP]) {
			const splittedTransactions = (await book.listTransactions(`parent_id:'${remoteTx.id}'`)).getItems();
			for (const splittedTransaction of splittedTransactions) {
				await splittedTransaction.uncheck();
				responses.push(await splittedTransaction.trash());
			}
			return responses;
		}

		// COGS transaction in financial book
		let tx = (await book.listTransactions(`remoteId:${remoteTx.id}`)).getFirst();
		if (tx) {
			if (tx.isChecked()) {
				tx = await tx.uncheck();
			}
			responses.push(await tx.trash());
			return responses;
		}
		
		return undefined;
	}

	protected async buildResults(responses: Transaction[]): Promise<string[]> {
        let results: string[] = [];
        for (const response of responses) {
            results.push(`${await this.buildDeleteResponse(response)}`);
        }
        return results;
    }

	protected async buildDeleteResponse(tx: Transaction): Promise<string> {
		return `DELETED: ${tx.getDateFormatted()} ${tx.getAmount()} ${await tx.getCreditAccountName()} ${await tx.getDebitAccountName()} ${tx.getDescription()}`
	}

	protected async deleteTransactionByRemoteId(book: Book, remoteId?: string): Promise<Transaction | undefined> {
		let tx = remoteId ? (await book.listTransactions(`remoteId:${remoteId}`)).getFirst() : undefined;
		if (tx) {
			tx = await uncheckAndRemove(tx);
			return tx;
		}
		return undefined;
	}

}