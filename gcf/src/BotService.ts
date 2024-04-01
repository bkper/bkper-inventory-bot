import { Account, AccountType, Bkper, Book, Group, Transaction } from 'bkper';

import { INVENTORY_BOOK_PROP } from './constants';

export function isInventoryBook(book: Book): boolean {
    if (book.getProperty(INVENTORY_BOOK_PROP)) {
        return true;
    }
    return false;
}