import { Book, Transaction } from "bkper-js";
import { buildBookAnchor, uncheckAndRemove } from "./BotService.js";
import { ORIGINAL_QUANTITY_PROP } from "./constants.js";

export abstract class InterceptorOrderProcessorDelete {

	protected async cascadeDeleteInventoryTransactions(inventoryBook: Book, remoteTx: bkper.Transaction): Promise<Transaction[] | undefined> {
		let responses: Transaction[] | undefined = undefined;

		// splitted purchase transactions in inventory book
		if (remoteTx.properties?.[ORIGINAL_QUANTITY_PROP]) {
			const splittedTransactions = (await inventoryBook.listTransactions(`parent_id:'${remoteTx.id}'`)).getItems();
			for (const splittedTransaction of splittedTransactions) {
				responses = [];
				responses.push(await uncheckAndRemove(splittedTransaction));
			}
			return responses;
		}

		return responses;
	}

	protected async cascadeDeleteFinancialTransactions(financialBook: Book, remoteTx: bkper.Transaction): Promise<Transaction[] | undefined> {
		let responses: Transaction[] | undefined = undefined;
		
		// COGS transaction in financial book
		let tx = (await financialBook.listTransactions(`remoteId:${remoteTx.id}`)).getFirst();
		if (tx) {
			if (tx.isChecked()) {
				tx = await tx.uncheck();
			}
			responses = [];
			responses.push(await tx.trash());
			return responses;
		}
		
		return responses;
	}

    protected async buildDeleteResults(responses: Transaction[], book?: Book): Promise<string[]> {
        let results: string[] = [];
        for (const response of responses) {
            const bookAnchor = book ? buildBookAnchor(book) : undefined;
            bookAnchor ? results.push(`${bookAnchor}: ${await this.buildDeleteResponse(response)}`) : results.push(`${await this.buildDeleteResponse(response)}`);
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