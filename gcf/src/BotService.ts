import { Account, AccountType, Amount, Bkper, Book, Transaction } from 'bkper';

import { EXC_CODE_PROP, GOOD_EXC_CODE_PROP, GOOD_PROP, INVENTORY_BOOK_PROP, PURCHASE_CODE_PROP, QUANTITY_PROP } from './constants';

export function isInventoryBook(book: Book): boolean {
    if (book.getProperty(INVENTORY_BOOK_PROP)) {
        return true;
    }
    return false;
}

// returns the quantity property from a transaction or null if it does not exist
export function getQuantity(book: Book, transaction: bkper.Transaction): Amount {
    let quantityStr = transaction.properties[QUANTITY_PROP];
    if (quantityStr == null || quantityStr.trim() == '') {
        return null;
    }
    return book.parseValue(quantityStr).abs();
}

// returns the inventory book from a collection or null if it does not exist
export function getInventoryBook(book: Book): Book {
    if (book.getCollection() == null) {
        return null;
    }
    let connectedBooks = book.getCollection().getBooks();
    for (const connectedBook of connectedBooks) {
        if (connectedBook.getProperty(INVENTORY_BOOK_PROP)) {
            return connectedBook;
        }
    }
    return null;
}

// returns the financial book in the collection corresponding to the excCode or null if it does not exist
export async function getFinancialBook(book: Book, excCode?: string): Promise<Book> {
    if (book.getCollection() == null) {
        return null;
    }
    let connectedBooks = book.getCollection().getBooks();
    for (const connectedBook of connectedBooks) {
        let excCodeConnectedBook = getBookExcCode(connectedBook);
        if (excCode == excCodeConnectedBook) {
            return Bkper.getBook(connectedBook.getId());
        }
    }
    return null;
}

export function getBookExcCode(book: Book): string {
    return book.getProperty(EXC_CODE_PROP, 'exchange_code');
}

// returns the excCode from an account based on its groups good_exc_code property
export function getGoodExchangeCodeFromAccount(account: bkper.Account): string {
    if (account == null || account.type == AccountType.INCOMING || account.type == AccountType.OUTGOING) {
        return null;
    }
    let groups = account.groups;
    if (groups != null) {
        for (const group of groups) {
            if (group == null) {
                continue;
            }

            let goodExchange = group.properties[GOOD_EXC_CODE_PROP];
            if (goodExchange != null && goodExchange.trim() != '') {
                return goodExchange;
            }
        }
    }

    return null;
}

// returns the excCode from an account based on its groups good_exc_code property
export async function getExchangeCodeFromAccount(account: Account): Promise<string> | null {
    if (account.getType() == AccountType.INCOMING || account.getType() == AccountType.OUTGOING) {
        return null;
    }
    let groups = await account.getGroups();
    if (groups != null) {
        for (const group of groups) {
            if (group == null) {
                continue;
            }
            let excCode = group.getProperty(GOOD_EXC_CODE_PROP);
            if (excCode != null && excCode.trim() != '') {
                return excCode;
            }
        }
    }
    return null;
}

// returns the good account (asset account) from the transaction (purchase or sale)
export async function getGoodAccount(goodTransaction: Transaction): Promise<Account> {
    if (await isSale(goodTransaction)) {
        return await goodTransaction.getCreditAccount();
    }
    if (await isPurchase(goodTransaction)) {
        return await goodTransaction.getDebitAccount();
    }
    return null;
}

export async function isSale(transaction: Transaction): Promise<boolean> {
    return transaction.isPosted() && (await transaction.getDebitAccount()).getType() == AccountType.OUTGOING;
}

export async function isPurchase(transaction: Transaction): Promise<boolean> {
    return transaction.isPosted() && (await transaction.getCreditAccount()).getType() == AccountType.INCOMING;
}

// returns the good purchase root transaction based on the purchase code property
export async function getGoodPurchaseRootTx(book: Book, purchaseCodeProp: string): Promise<Transaction> {
    // get good purchase transaction from buyer
    const iterator = book.getTransactions(`remoteId:${GOOD_PROP}_${purchaseCodeProp.toLowerCase()}`);
    let goodPurchaseTx: Transaction = null;
    if (await iterator.hasNext()) {
        goodPurchaseTx = await iterator.next();
    }
    // get root purchase transaction from supplier
    return await getRootTransaction(book, goodPurchaseTx);
}

export async function getRootTransaction(book: Book, transaction: Transaction): Promise<Transaction> {
    if (transaction) {
        const remoteIds = transaction.getRemoteIds();
        const purchaseCodeProp = transaction.getProperty(PURCHASE_CODE_PROP).toLowerCase();
    
        for (const remoteId of remoteIds) {
            if (remoteId != `${GOOD_PROP}_${purchaseCodeProp}`) {
                const rootTxId = remoteId.split('_')[1];
                const rootTx = await book.getTransaction(rootTxId);
                return rootTx;
            }
        }
    }
    return null;
}

export function buildBookAnchor(book: Book) {
    return `<a href='https://app.bkper.com/b/#transactions:bookId=${book.getId()}'>${book.getName()}</a>`;
}

export async function uncheckAndRemove(transaction: Transaction): Promise<Transaction> {
    if (transaction.isChecked()) {
        transaction = await transaction.uncheck();
    }
    transaction = await transaction.remove();
    return transaction;
}

export function getnormalizedAccName(accountName: string): string {
    return accountName.replace(' ', '_').toLowerCase();
}