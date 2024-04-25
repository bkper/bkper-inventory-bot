namespace BotService {

    export function getInventoryBook(book: Bkper.Book): Bkper.Book {
        if (book.getCollection() == null) {
            return null;
        }
        let connectedBooks = book.getCollection().getBooks();
        for (const connectedBook of connectedBooks) {
            if (connectedBook.getProperty(INVENTORY_BOOK_PROP)) {
                return connectedBook;
            }
            let fractionDigits = connectedBook.getFractionDigits();
            if (fractionDigits == 0) {
                return connectedBook;
            }
        }
        return null;
    }

    export function hasPendingTasks(book: Bkper.Book): boolean {
        return (book.getBacklog().getCount() > 0) ? true : false;
    }
}
