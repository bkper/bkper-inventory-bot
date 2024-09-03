import { Book } from "bkper-js";
import { Result } from "./index.js";
import { getInventoryBook } from "./BotService.js";

export abstract class EventHandler {

    protected abstract processObject(baseBook: Book, connectedBook: Book, event: bkper.Event): Promise<string>;

    protected async intercept(baseBook: Book, event: bkper.Event): Promise<Result> {
        return { result: false };
    }

    async handleEvent(event: bkper.Event): Promise<Result> {

        let baseBook = new Book(event.book);

        let interceptionResponse = await this.intercept(baseBook, event);
        if (interceptionResponse.result) {
            return interceptionResponse;
        }

        let responses: string[] = [];
        let inventoryBook = getInventoryBook(baseBook);

        const logtag = `Handling ${event.type} event on book ${baseBook.getName()} from user ${event.user.username}`;
        console.time(logtag);

        if (inventoryBook) {
            let response = await this.processObject(baseBook, inventoryBook, event);
            if (response) {
                responses.push(response);
            }
        } else {
            return { result: 'Inventory book not found in the collection (property inventory_book = true)' };
        }

        console.timeEnd(logtag);

        if (responses.length == 0) {
            return { result: false };
        }

        return { result: responses };
    }

    protected matchGoodExchange(goodExcCode: string, excCode: string): boolean {
        if (goodExcCode == null || goodExcCode.trim() == '') {
            return false;
        }
        goodExcCode = goodExcCode.trim();
        if (excCode != null && goodExcCode != excCode) {
            return false;
        }
        return true;
    }

}