namespace BotService {

    export function getInventoryBook(book: Bkper.Book): Bkper.Book | null {
        if (book.getCollection() == null) {
            return null;
        }
        const connectedBooks = book.getCollection().getBooks();
        for (const connectedBook of connectedBooks) {
            if (connectedBook.getProperty(constants.INVENTORY_BOOK_PROP)) {
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

    export function getFinancialBook(book: Bkper.Book, excCode: string | null): Bkper.Book | null {
        if (book.getCollection() == null || excCode == null) {
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

    export function isSale(transaction: Bkper.Transaction): boolean {
        return transaction.isPosted() && transaction.getDebitAccount().getType() == BkperApp.AccountType.OUTGOING;
    }

    export function isPurchase(transaction: Bkper.Transaction): boolean {
        return transaction.isPosted() && transaction.getCreditAccount().getType() == BkperApp.AccountType.INCOMING;
    }

    export function getExcCode(book: Bkper.Book): string {
        return book.getProperty(constants.EXC_CODE_PROP, 'exchange_code');
    }

    export function getExchangeCode(account: Bkper.Account): string | null {
        if (account.getType() == BkperApp.AccountType.INCOMING || account.getType() == BkperApp.AccountType.OUTGOING) {
            return null;
        }
        const groups = account.getGroups();
        if (groups != null) {
            for (const group of groups) {
                if (group == null) {
                    continue;
                }
                const exchange = group.getProperty(constants.GOOD_EXC_CODE_PROP);
                if (exchange != null && exchange.trim() != '') {
                    return exchange;
                }
            }
        }
        return null;
    }

    export function getGoodPurchaseCost(purchaseTransaction: Bkper.Transaction): Bkper.Amount {
        return BkperApp.newAmount(purchaseTransaction.getProperty(constants.GOOD_PURCHASE_COST_PROP));
    }

    export function getAdditionalPurchaseCosts(purchaseTransaction: Bkper.Transaction): Bkper.Amount {
        const addCosts = purchaseTransaction.getProperty(constants.ADD_PURCHASE_COSTS_PROP);
        if (addCosts) {
            return BkperApp.newAmount(purchaseTransaction.getProperty(constants.ADD_PURCHASE_COSTS_PROP));
        } else {
            return BkperApp.newAmount(0);
        }
    }

    export function getTotalPurchaseCost(purchaseTransaction: Bkper.Transaction): Bkper.Amount {
        return BkperApp.newAmount(purchaseTransaction.getProperty(constants.TOTAL_COST_PROP));
    }

    export function getPurchaseCode(purchaseTransaction: Bkper.Transaction): string {
        return purchaseTransaction.getProperty(constants.PURCHASE_CODE_PROP);
    }

    export function compareToFIFO(tx1: Bkper.Transaction, tx2: Bkper.Transaction): number {

        let ret = tx1.getDateValue() - tx2.getDateValue();

        if (ret == 0) {
            const order1 = tx1.getProperty(constants.ORDER_PROP) ? +tx1.getProperty(constants.ORDER_PROP) : 0;
            const order2 = tx2.getProperty(constants.ORDER_PROP) ? +tx2.getProperty(constants.ORDER_PROP) : 0;
            ret = order1 - order2;
        }

        if (ret == 0 && tx1.getCreatedAt() && tx2.getCreatedAt()) {
            ret = tx1.getCreatedAt().getMilliseconds() - tx2.getCreatedAt().getMilliseconds();
        }

        return ret;
    }

    export function getBeforeDateIsoString(book: Bkper.Book, toDateIsoString: string): string {
        const toDate = book.parseDate(toDateIsoString);
        let beforeDate = new Date();
        beforeDate.setTime(toDate.getTime());
        beforeDate.setDate(beforeDate.getDate() + 1);
        return Utilities.formatDate(beforeDate, book.getTimeZone(), 'yyyy-MM-dd');
    }

}
