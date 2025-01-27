import { Book } from "bkper-js";
import { Result } from "./index.js";
import { getInventoryBook } from "./BotService.js";

export abstract class EventHandler {

    protected abstract processObject(baseBook: Book, connectedBook: Book, event: bkper.Event): Promise<string | undefined>;

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

        const logtag = `Handling ${event.type} event on book ${baseBook.getName()} from user ${event.user?.username ?? 'unknown'}`;
        console.time(logtag);

        if (inventoryBook) {
            try {
                let response = await this.processObject(baseBook, inventoryBook, event);
                if (response) {
                    responses.push(response);
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.timeEnd(logtag);
                return { error: errorMessage };
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
        goodExcCode = goodExcCode.trim();
        if (goodExcCode != excCode) {
            return false;
        }
        return true;
    }

}