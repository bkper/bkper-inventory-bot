namespace BotService {

    const ADDITIONAL_COSTS_CREDITS_QUERY_RANGE = 2;

    export function getInventoryBook(book: Bkper.Book): Bkper.Book | null {
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
        return book.getProperty(EXC_CODE_PROP, 'exchange_code');
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
                const exchange = group.getProperty(GOOD_EXC_CODE_PROP);
                if (exchange != null && exchange.trim() != '') {
                    return exchange;
                }
            }
        }
        return null;
    }

    export function getGoodPurchaseCost(purchaseTransaction: Bkper.Transaction): Bkper.Amount {
        return BkperApp.newAmount(purchaseTransaction.getProperty(GOOD_PURCHASE_COST_PROP));
    }

    export function getAdditionalPurchaseCosts(financialBookbook: Bkper.Book, inventoryTransaction: Bkper.Transaction): Bkper.Amount {
        let totalAdditionalCosts = BkperApp.newAmount(0);

        // get the range in months to query for the additional cost and credit note transactions
        const transactionDate = helper.parseDate(inventoryTransaction.getDate());

        const beforeDate = new Date(transactionDate.getTime());
        beforeDate.setMonth(beforeDate.getMonth() + ADDITIONAL_COSTS_CREDITS_QUERY_RANGE);
        const beforeDateIsoString = Utilities.formatDate(beforeDate, financialBookbook.getTimeZone(), 'yyyy-MM-dd');

        const afterDate = new Date(transactionDate.getTime());
        afterDate.setMonth(beforeDate.getMonth() - ADDITIONAL_COSTS_CREDITS_QUERY_RANGE);
        const afterDateIsoString = Utilities.formatDate(afterDate, financialBookbook.getTimeZone(), 'yyyy-MM-dd');
        
        const inventoryAccountName = inventoryTransaction.getDebitAccount().getName();
        const query = helper.getAccountQuery(inventoryAccountName, beforeDateIsoString, afterDateIsoString);
        console.log("QUERY: ", query);

        const purchaseCode = inventoryTransaction.getProperty(PURCHASE_CODE_PROP);
        const transactions = financialBookbook.getTransactions(query);
        const financialAccountId = financialBookbook.getAccount(inventoryAccountName).getId();
        while (transactions.hasNext()) {
            const tx = transactions.next();
            console.log("TX: ", tx.getId());
            console.log("DEBIT ACCOUNT: ", tx.getDebitAccount().getName());
            console.log("CREDIT ACCOUNT: ", tx.getCreditAccount().getName());
            if (tx.isChecked() && tx.getDebitAccount().getId() == financialAccountId && tx.getProperty(PURCHASE_CODE_PROP) == purchaseCode && (tx.getProperty(PURCHASE_INVOICE_PROP) != undefined && tx.getProperty(PURCHASE_INVOICE_PROP) != purchaseCode)) {
                console.log("ENTROU")
                totalAdditionalCosts = totalAdditionalCosts.plus(tx.getAmount());
            }
        }

        return totalAdditionalCosts;
    }

    export function getTotalPurchaseCost(purchaseTransaction: Bkper.Transaction): Bkper.Amount {
        return BkperApp.newAmount(purchaseTransaction.getProperty(TOTAL_COST_PROP));
    }

    export function getPurchaseCode(purchaseTransaction: Bkper.Transaction): string {
        return purchaseTransaction.getProperty(PURCHASE_CODE_PROP);
    }

    export function compareToFIFO(tx1: Bkper.Transaction, tx2: Bkper.Transaction): number {

        let ret = tx1.getDateValue() - tx2.getDateValue();

        if (ret == 0) {
            const order1 = tx1.getProperty(ORDER_PROP) ? +tx1.getProperty(ORDER_PROP) : 0;
            const order2 = tx2.getProperty(ORDER_PROP) ? +tx2.getProperty(ORDER_PROP) : 0;
            ret = order1 - order2;
        }

        if (ret == 0 && tx1.getCreatedAt() && tx2.getCreatedAt()) {
            ret = tx1.getCreatedAt().getMilliseconds() - tx2.getCreatedAt().getMilliseconds();
        }

        return ret;
    }

    /**
     * Gets the ISO date string for the day after the provided date
     * @param book The book to get timezone from
     * @param toDateIsoString The reference date in ISO format
     * @returns The next day's date in ISO format yyyy-MM-dd
     */
    export function getBeforeDateIsoString(book: Bkper.Book, toDateIsoString: string): string {
        const toDate = book.parseDate(toDateIsoString);
        let beforeDate = new Date();
        beforeDate.setTime(toDate.getTime());
        beforeDate.setDate(beforeDate.getDate() + 1);
        return Utilities.formatDate(beforeDate, book.getTimeZone(), 'yyyy-MM-dd');
    }

}
