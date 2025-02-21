namespace BotService {

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

    /**
     * Gets additional purchase costs for an inventory transaction from the financial book
     * 
     * @param financialBookbook The financial book to search for additional costs
     * @param inventoryTransaction The inventory transaction to get additional costs for
     * @returns The total additional costs as a Bkper.Amount
     */
    export function getAdditionalCostsAndCreditNotes(financialBookbook: Bkper.Book, inventoryTransaction: Bkper.Transaction): { additionalCosts: Bkper.Amount, creditNote: CreditNote } {
        const transactionDate = helper.parseDate(inventoryTransaction.getDate());
        const timeRange = helper.getTimeRange(ADDITIONAL_COSTS_CREDITS_QUERY_RANGE);

        // Calculate the range in months to query for the additional cost and credit note transactions
        const beforeDate = new Date(transactionDate.getTime() + timeRange);
        const beforeDateIsoString = Utilities.formatDate(beforeDate, financialBookbook.getTimeZone(), 'yyyy-MM-dd');

        const afterDate = new Date(transactionDate.getTime() - timeRange);
        const afterDateIsoString = Utilities.formatDate(afterDate, financialBookbook.getTimeZone(), 'yyyy-MM-dd');

        // Get inventory account details and build query
        const inventoryAccountName = inventoryTransaction.getDebitAccount().getName();
        const query = helper.getAccountQuery(inventoryAccountName, beforeDateIsoString, afterDateIsoString);

        // Search for matching transactions with same purchase code
        const purchaseCode = inventoryTransaction.getProperty(PURCHASE_CODE_PROP);
        const transactions = financialBookbook.getTransactions(query);
        const financialAccountId = financialBookbook.getAccount(inventoryAccountName).getId();

        // Sum up additional costs or creditsfrom matching transactions
        let totalAdditionalCosts = BkperApp.newAmount(0);
        let totalCreditAmount = BkperApp.newAmount(0);
        let totalCreditQuantity = BkperApp.newAmount(0);
        while (transactions.hasNext()) {
            const tx = transactions.next();
            // Only include checked transactions with matching account and purchase code
            if (tx.isChecked() &&
                tx.getDebitAccount().getId() == financialAccountId &&
                tx.getProperty(PURCHASE_CODE_PROP) == purchaseCode &&
                (tx.getProperty(PURCHASE_INVOICE_PROP) != undefined &&
                    tx.getProperty(PURCHASE_INVOICE_PROP) != purchaseCode)) {
                totalAdditionalCosts = totalAdditionalCosts.plus(tx.getAmount());
            } else if (tx.isChecked() && tx.getProperty(CREDIT_NOTE_PROP) != undefined && tx.getProperty(PURCHASE_CODE_PROP) == purchaseCode && tx.getCreditAccount().getId() == financialAccountId) {
                totalCreditAmount = totalCreditAmount.plus(tx.getAmount());
                totalCreditQuantity = totalCreditQuantity.plus(BkperApp.newAmount(tx.getProperty(QUANTITY_PROP) ?? 0));
            }
        }

        return {
            additionalCosts: totalAdditionalCosts,
            creditNote: {
                quantity: totalCreditQuantity.toNumber(),
                amount: totalCreditAmount
            }
        };
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
