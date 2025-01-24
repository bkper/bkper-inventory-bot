import { Account, AccountType, Amount, Bkper, Book, Transaction } from 'bkper-js';

import { COGS_CALC_DATE_PROP, EXC_CODE_PROP, GOOD_EXC_CODE_PROP, GOOD_PROP, INVENTORY_BOOK_PROP, PURCHASE_CODE_PROP, QUANTITY_PROP } from './constants.js';

export function isInventoryBook(book: Book): boolean {
    if (book.getProperty(INVENTORY_BOOK_PROP)) {
        return true;
    }
    return false;
}

// returns the quantity property from a transaction or null if it does not exist
export function getQuantity(book: Book, transaction: bkper.Transaction): Amount | undefined {
    let quantityStr = transaction.properties?.[QUANTITY_PROP];
    if (quantityStr == undefined || quantityStr.trim() == '') {
        return undefined;
    }
    return book.parseValue(quantityStr)?.abs();
}

// returns the inventory book from a collection or null if it does not exist
export function getInventoryBook(book: Book): Book | undefined {
    if (book.getCollection() == undefined) {
        return undefined;
    }
    let connectedBooks = book.getCollection()!.getBooks();
    for (const connectedBook of connectedBooks) {
        if (connectedBook.getProperty(INVENTORY_BOOK_PROP)) {
            return connectedBook;
        }
    }
    return undefined;
}

// returns the financial book in the collection corresponding to the excCode or undefined if it does not exist
export async function getFinancialBook(book: Book, excCode?: string): Promise<Book | undefined> {
    if (book.getCollection() == undefined) {
        return undefined;
    }
    let connectedBooks = book.getCollection()!.getBooks();
    for (const connectedBook of connectedBooks) {
        let excCodeConnectedBook = getBookExcCode(connectedBook);
        if (excCode == excCodeConnectedBook) {
            return Bkper.getBook(connectedBook.getId());
        }
    }
    return undefined;
}

export function getBookExcCode(book: Book): string | undefined {
    return book.getProperty(EXC_CODE_PROP, 'exchange_code');
}

// returns the excCode from an account based on its groups good_exc_code property
export function getGoodExchangeCodeFromAccount(account: bkper.Account): string | undefined {
    if (account.type == AccountType.INCOMING || account.type == AccountType.OUTGOING) {
        return undefined;
    }
    let groups = account.groups;
    if (groups != undefined) {
        for (const group of groups) {
            let goodExchange = group.properties?.[EXC_CODE_PROP];
            if (goodExchange != undefined && goodExchange.trim() != '') {
                return goodExchange;
            }
        }
    }

    return undefined;
}

// returns the excCode from an account based on its groups good_exc_code property
export async function getExchangeCodeFromAccount(account: Account): Promise<string | undefined> {
    if (account.getType() == AccountType.INCOMING || account.getType() == AccountType.OUTGOING) {
        return undefined;
    }
    let groups = await account.getGroups();
    if (groups != null) {
        for (const group of groups) {
            let excCode = group.getProperty(EXC_CODE_PROP);
            if (excCode != undefined && excCode.trim() != '') {
                return excCode;
            }
        }
    }
    return undefined;
}

// returns the good account (asset account) from the transaction (purchase or sale)
export async function getGoodAccount(goodTransaction: Transaction): Promise<Account | undefined> {
    if (await isSale(goodTransaction)) {
        return await goodTransaction.getCreditAccount();
    }
    if (await isPurchase(goodTransaction)) {
        return await goodTransaction.getDebitAccount();
    }
    return undefined;
}

export async function isSale(transaction: Transaction): Promise<boolean> {
    return (transaction.isPosted() == true) && (await transaction.getDebitAccount())?.getType() == AccountType.OUTGOING;
}

export async function isPurchase(transaction: Transaction): Promise<boolean> {
    return (transaction.isPosted() == true) && (await transaction.getCreditAccount())?.getType() == AccountType.INCOMING;
}

// returns the good purchase root transaction based on the purchase code property
export async function getGoodPurchaseRootTx(book: Book, purchaseCodeProp: string): Promise<Transaction | undefined> {
    // get good purchase transaction from buyer
    const goodPurchaseTx = (await book.listTransactions(`remoteId:${GOOD_PROP}_${purchaseCodeProp.toLowerCase()}`)).getFirst();
    // get root purchase transaction from supplier
    return await getRootTransaction(book, goodPurchaseTx);
}

export async function getRootTransaction(book: Book, transaction?: Transaction): Promise<Transaction | undefined> {
    if (transaction) {
        const remoteIds = transaction.getRemoteIds();
        const purchaseCodeProp = transaction.getProperty(PURCHASE_CODE_PROP)?.toLowerCase();

        for (const remoteId of remoteIds) {
            if (remoteId != `${GOOD_PROP}_${purchaseCodeProp}`) {
                const rootTxId = remoteId.split('_')[1];
                const rootTx = await book.getTransaction(rootTxId);
                return rootTx;
            }
        }
    }
    return undefined;
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

export function getCOGSCalculationDateValue(account: Account): number | null {
    const cogsCalcDate = account.getProperty(COGS_CALC_DATE_PROP);
    if (cogsCalcDate) {
        return +(cogsCalcDate.replace(/-/g, ""));
    }
    return null
}