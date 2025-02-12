import { Account, AccountType, Amount, Bkper, Book, Transaction } from 'bkper-js';

import { COGS_CALC_DATE_PROP, CREDIT_NOTE_PROP, TOTAL_CREDITS_PROP, EXC_CODE_PROP, GOOD_PURCHASE_COST_PROP, INVENTORY_BOOK_PROP, NEEDS_REBUILD_PROP, ORIGINAL_QUANTITY_PROP, QUANTITY_PROP, TOTAL_ADDITIONAL_COSTS_PROP, TOTAL_COST_PROP } from './constants.js';

export function isInventoryBook(book: Book): boolean {
    if (book.getProperty(INVENTORY_BOOK_PROP)) {
        return true;
    }
    return false;
}

// returns the quantity property from a transaction or null if it does not exist
export function getQuantity(transaction: bkper.Transaction): Amount | undefined {
    let quantityStr = transaction.properties?.[QUANTITY_PROP];
    if (quantityStr == undefined || quantityStr.trim() == '') {
        return undefined;
    }
    return new Amount(quantityStr);
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

export function buildBookAnchor(book?: Book): string | undefined {
    return book ? `<a href='https://app.bkper.com/b/#transactions:bookId=${book.getId()}'>${book.getName()}</a>` : undefined;
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

export async function flagInventoryAccountForRebuildIfNeeded(financialBook: Book, inventoryTransaction: Transaction): Promise<string | undefined> {
    let inventoryAccount = await getGoodAccount(inventoryTransaction);
    if (inventoryAccount) {
        let lastTxDate = getCOGSCalculationDateValue(inventoryAccount);
        if (lastTxDate != null && inventoryTransaction.getDateValue() != undefined && inventoryTransaction.getDateValue()! <= +lastTxDate) {
            await inventoryAccount.setProperty(NEEDS_REBUILD_PROP, 'TRUE').update();
            const inventoryBook = getInventoryBook(financialBook);
            return buildBookAnchor(inventoryBook) ? `${buildBookAnchor(inventoryBook)}: Flagging account for rebuild` : 'Flagging account for rebuild';
        }
    }
    return undefined;
}

export async function flagInventoryAccountForRebuild(financialBook: Book, inventoryTransaction: Transaction): Promise<string | undefined> {
    let inventoryAccount = await getGoodAccount(inventoryTransaction);
    if (inventoryAccount) {
        await inventoryAccount.setProperty(NEEDS_REBUILD_PROP, 'TRUE').update();
        const inventoryBook = getInventoryBook(financialBook);
        return buildBookAnchor(inventoryBook) ? `${buildBookAnchor(inventoryBook)}: Flagging account for rebuild` : 'Flagging account for rebuild';
    }
    return undefined;
}

/**
 * Updates an inventory transaction with new cost and quantity information based on a financial transaction.
 * This method is used to:
 * 1. Process credit notes by adjusting purchase costs and quantities
 * 2. Add additional costs to existing inventory transactions
 * 3. Update total costs and maintain transaction history by adding remote IDs
 * 4. Handle deletion of transactions by reversing cost and quantity adjustments
 * 
 * @param financialTransaction The financial transaction containing cost/credit information
 * @param connectedTransaction The inventory transaction to update
 * @param onDelete Optional flag indicating if this is a deletion operation. When true, costs and quantities are reversed instead of added.
 */
export async function updateGoodTransaction(financialTransaction: bkper.Transaction, connectedTransaction: Transaction, onDelete?: boolean): Promise<void> {
    // Get current values from the inventory transaction
    const currentAmount = connectedTransaction.getAmount();
    const currentGoodPurchaseCost = connectedTransaction.getProperty(GOOD_PURCHASE_COST_PROP);
    const financialTransactionAmount = financialTransaction.amount;
    const currentTotalCost = connectedTransaction.getProperty(TOTAL_COST_PROP);

    // Validate required data exists
    if (currentAmount == undefined || currentGoodPurchaseCost == undefined || financialTransactionAmount == undefined || currentTotalCost == undefined) {
        console.log(`ERROR (updateGoodTransaction): connectedTransaction or financialTransaction is missing required data`);
        return;
    }

    // Get current additional costs, defaulting to 0 if none exist
    let currentTotalAdditionalCosts = new Amount(0);
    if (connectedTransaction.getProperty(TOTAL_ADDITIONAL_COSTS_PROP)) {
        currentTotalAdditionalCosts = new Amount(connectedTransaction.getProperty(TOTAL_ADDITIONAL_COSTS_PROP)!);
    }

    // Get current total credits, defaulting to 0 if none exist
    let currentTotalCredits = new Amount(0);
    if (connectedTransaction.getProperty(TOTAL_CREDITS_PROP)) {
        currentTotalCredits = new Amount(connectedTransaction.getProperty(TOTAL_CREDITS_PROP)!);
    }

    // Get current original_quantity, defaulting to 0 if none exist
    let currentOriginalQuantity = new Amount(0);
    if (connectedTransaction.getProperty(ORIGINAL_QUANTITY_PROP)) {
        currentOriginalQuantity = new Amount(connectedTransaction.getProperty(ORIGINAL_QUANTITY_PROP)!);
    }

    // Calculate new costs based on transaction type (credit note vs additional cost)
    let additionalCost = new Amount(0);
    let creditValue = new Amount(0);
    let creditQuantity = new Amount(0);
    if (financialTransaction.properties?.[CREDIT_NOTE_PROP]) {
        // For credit notes: reduce the purchase cost by credit amount (increase the purchase cost on deletion)
        creditValue = new Amount(financialTransactionAmount!);
        creditQuantity = getQuantity(financialTransaction) ? new Amount(getQuantity(financialTransaction)!.toNumber()) : new Amount(0);
    } else {
        // For additional costs: keep purchase cost same but add additional cost
        additionalCost = new Amount(financialTransactionAmount!);
    }

    // Calculate final values and update the transaction
    const newGoodPurchaseCost = onDelete ? new Amount(currentGoodPurchaseCost).plus(creditValue) : new Amount(currentGoodPurchaseCost).minus(creditValue);
    const newOriginalQuantity = onDelete ? currentOriginalQuantity.plus(creditQuantity) : currentOriginalQuantity.minus(creditQuantity);
    const newTotalAdditionalCosts = onDelete ? currentTotalAdditionalCosts.minus(additionalCost) : currentTotalAdditionalCosts.plus(additionalCost);
    const newTotalCredits = onDelete ? currentTotalCredits.minus(creditValue) : currentTotalCredits.plus(creditValue);
    const newTotalCosts = newGoodPurchaseCost.plus(newTotalAdditionalCosts);
    const newAmount = onDelete ? ((financialTransaction.properties?.[CREDIT_NOTE_PROP]) ? currentAmount.plus(creditQuantity) : currentAmount) : ((financialTransaction.properties?.[CREDIT_NOTE_PROP]) ? currentAmount.minus(creditQuantity) : currentAmount);

    console.log("updateGoodTransaction: PASSOU");

    await connectedTransaction
        .setAmount(newAmount)
        .setProperty(TOTAL_ADDITIONAL_COSTS_PROP, newTotalAdditionalCosts.toNumber() != 0 ? newTotalAdditionalCosts.toString() : null)
        .setProperty(TOTAL_CREDITS_PROP, newTotalCredits.toNumber() != 0 ? newTotalCredits.toString() : null)
        .setProperty(GOOD_PURCHASE_COST_PROP, newGoodPurchaseCost.toString())
        .setProperty(ORIGINAL_QUANTITY_PROP, newOriginalQuantity.toString())
        .setProperty(TOTAL_COST_PROP, newTotalCosts.toString())
        .addRemoteId(financialTransaction.id!)
        .update();
}