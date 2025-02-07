import { Bkper } from "bkper-js";
import { Result } from "./index.js";
import { isInventoryBook, uncheckAndRemove } from "./BotService.js";

export class EventHandlerTransactionPosted {

	async handleEvent(event: bkper.Event): Promise<Result> {
		const eventBook = await Bkper.getBook(event.bookId!);

		// prevent response to transactions posted in the inventory book
		if (isInventoryBook(eventBook)) {
			// delete posted transaction and warn the user
			if (event.data) {
				if (!event.data.object) {
					return { result: false };
				}
				const operation = event.data.object as bkper.TransactionOperation;
				const transactionPayload = operation.transaction;
				const transaction = (await eventBook.listTransactions(transactionPayload!.id!)).getFirst();
				if (transaction) {
					await uncheckAndRemove(transaction);
				}
				const warningMsg = `You can't post directly in the Inventory book. Transaction deleted.`;

				return { warning: warningMsg };
			}
		}
		return { result: false };
	}

}