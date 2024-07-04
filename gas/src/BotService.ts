namespace BotService {

    export function getInventoryBook(book: Bkper.Book): Bkper.Book {
        if (book.getCollection() == null) {
            return null;
        }
        const connectedBooks = book.getCollection().getBooks();
        for (const connectedBook of connectedBooks) {
            if (connectedBook.getProperty(INVENTORY_BOOK_PROP)) {
                return connectedBook;
            }
            const fractionDigits = connectedBook.getFractionDigits();
            if (fractionDigits == 0) {
                return connectedBook;
            }
        }
        return null;
    }

    export function hasPendingTasks(book: Bkper.Book): boolean {
        return (book.getBacklog().getCount() > 0) ? true : false;
    }

    export function getFinancialBook(book: Bkper.Book, excCode?: string): Bkper.Book {
        if (book.getCollection() == null) {
            return null;
        }
        const connectedBooks = book.getCollection().getBooks();
        for (const connectedBook of connectedBooks) {
            const excCodeConnectedBook = getExcCode(connectedBook);
            const fractionDigits = connectedBook.getFractionDigits();
            if (fractionDigits != 0 && excCode == excCodeConnectedBook) {
                return BkperApp.getBook(connectedBook.getId());
            }
        }
        return null;
    }

    export function getAccountQuery(goodAccount: GoodAccount, full: boolean, beforeDate?: string) {
        let query = `account:'${goodAccount.getName()}'`;

        // if (!full && goodAccount.getForwardedDate()) {
        //     query += ` after:${goodAccount.getForwardedDate()}`
        // }

        if (beforeDate) {
            query += ` before:${beforeDate}`
        }
        return query;
    }

    export function getExcCode(book: Bkper.Book): string {
        return book.getProperty(EXC_CODE_PROP, 'exchange_code');
    }

    export function getBeforeDateIsoString(book: Bkper.Book, toDateIsoString: string): string {
        const toDate = book.parseDate(toDateIsoString);
        let beforeDate = new Date();
        beforeDate.setTime(toDate.getTime());
        beforeDate.setDate(beforeDate.getDate() + 1);
        return Utilities.formatDate(beforeDate, book.getTimeZone(), 'yyyy-MM-dd');
    }

}
