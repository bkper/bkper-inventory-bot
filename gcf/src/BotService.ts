import { Account, AccountType, Amount, Bkper, Book, Transaction } from 'bkper';

import { EXC_CODE_PROP, GOOD_EXC_CODE_PROP, INVENTORY_BOOK_PROP, QUANTITY_PROP } from './constants';

export function isInventoryBook(book: Book): boolean {
    if (book.getProperty(INVENTORY_BOOK_PROP)) {
        return true;
    }
    return false;
}

export function getQuantity(book: Book, transaction: bkper.Transaction): Amount {
    let quantityStr = transaction.properties[QUANTITY_PROP];
    if (quantityStr == null || quantityStr.trim() == '') {
        return null;
    }
    return book.parseValue(quantityStr).abs();
}

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