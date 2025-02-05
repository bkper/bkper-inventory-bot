import { Account, AccountType, Amount, Book, Group, Transaction } from "bkper-js";
import { EventHandlerTransaction } from "./EventHandlerTransaction.js";
import { buildBookAnchor, getCOGSCalculationDateValue, getGoodExchangeCodeFromAccount, getQuantity, updateGoodTransaction } from "./BotService.js";
import { CREDIT_NOTE_PROP, GOOD_BUY_ACCOUNT_NAME, GOOD_EXC_CODE_PROP, GOOD_PROP, GOOD_PURCHASE_COST_PROP, GOOD_SELL_ACCOUNT_NAME, NEEDS_REBUILD_PROP, ORDER_PROP, ORIGINAL_QUANTITY_PROP, PURCHASE_CODE_PROP, PURCHASE_INVOICE_PROP, SALE_AMOUNT_PROP, SALE_INVOICE_PROP, TOTAL_COST_PROP } from "./constants.js";
import { Result } from "./index.js";
import { InterceptorFlagRebuild } from "./InterceptorFlagRebuild.js";

export class EventHandlerTransactionChecked extends EventHandlerTransaction {

    async intercept(baseBook: Book, event: bkper.Event): Promise<Result> {
        let response = await new InterceptorFlagRebuild().intercept(baseBook, event);
        return response;
    }

    protected getTransactionQuery(transaction: bkper.Transaction): string {
        // checking sale transactions
        if (transaction.creditAccount && transaction.creditAccount.type == AccountType.INCOMING) {
            return `remoteId:${transaction.id}`;
        } else if (transaction.properties && transaction.properties[CREDIT_NOTE_PROP] == undefined) {
            if (transaction.properties && transaction.debitAccount) {
                // checking purchase transactions
                return `remoteId:${transaction.properties[PURCHASE_CODE_PROP]}_${transaction.debitAccount.normalizedName}`;
            }
        } else if (transaction.properties && transaction.properties[CREDIT_NOTE_PROP] != undefined) {
            // checking credit note transactions
            if (transaction.properties && transaction.creditAccount) {
                // checking purchase transactions
                return `remoteId:${transaction.properties[PURCHASE_CODE_PROP]}_${transaction.creditAccount.normalizedName}`;
            }
        }
        return '';
    }

    // add additional cost to inventory purchase transaction total cost property
    protected async connectedTransactionFound(financialBook: Book, inventoryBook: Book, financialTransaction: bkper.Transaction, connectedTransaction: Transaction): Promise<string | undefined> {
        if (financialTransaction.id && financialTransaction.creditAccount && financialTransaction.debitAccount && financialTransaction.properties) {
            // prevent bot response when checking more than once the same good purchase transaction
            for (const remoteId of connectedTransaction.getRemoteIds()) {
                if (remoteId == financialTransaction.id) {
                    return undefined;
                }
            }

            // prevent bot response when checking transactions from inventory book
            if (financialBook.getId() == inventoryBook.getId()) {
                return undefined;
            }

            // prevent bot response when checking root financial transaction
            if (financialTransaction.creditAccount.type == AccountType.LIABILITY || financialTransaction.debitAccount.type == AccountType.LIABILITY) {
                return undefined;
            }

            // update additional cost properties and transaction quantities on purchases or credit notes
            updateGoodTransaction(financialTransaction, connectedTransaction);

            const bookAnchor = buildBookAnchor(inventoryBook);
            const record = `${connectedTransaction.getDate()} ${connectedTransaction.getAmount()} ${await connectedTransaction.getCreditAccountName()} ${await connectedTransaction.getDebitAccountName()} ${connectedTransaction.getDescription()}`;
            return `FOUND: ${bookAnchor}: ${record}`;
        }
        console.log('ERROR (connectedTransactionFound): financialTransaction is missing required fields');
        return undefined;
    }

    // create purchase (Buy) or sale (Sell) transactions in the inventory book in response to the financial transactions
    protected async connectedTransactionNotFound(financialBook: Book, inventoryBook: Book, financialTransaction: bkper.Transaction, goodExcCode: string): Promise<string | undefined> {
        if (financialTransaction.creditAccount && financialTransaction.debitAccount && financialTransaction.date && financialTransaction.id && financialTransaction.properties) {

            // prevent bot response when checking root financial transaction
            const financialCreditAccount = financialTransaction.creditAccount;
            if (financialCreditAccount.type == AccountType.LIABILITY) {
                return undefined;
            }

            const quantity = getQuantity(financialTransaction);
            const purchaseCode = financialTransaction.properties[PURCHASE_CODE_PROP];
            const purchaseInvoice = financialTransaction.properties[PURCHASE_INVOICE_PROP];
            const saleInvoice = financialTransaction.properties[SALE_INVOICE_PROP];

            if (quantity == undefined || quantity.eq(0) || financialTransaction.properties[CREDIT_NOTE_PROP]) {
                // communicate to the user to first check the good purchase transaction before checking additional costs or credit note transactions
                if (financialTransaction.properties[PURCHASE_CODE_PROP]) {
                    throw new Error(`ERROR: you must first check the good purchase transaction (purchase_code: ${financialTransaction.properties[PURCHASE_CODE_PROP]}) before checking additional costs or credit note transactions.`);
                }
                return undefined;
            }

            // prevent bot response when purchase or sale transactions are missing needed properties
            if (saleInvoice == undefined) {
                if (purchaseCode == undefined || purchaseInvoice == undefined) {
                    return undefined;
                }
            }

            const inventoryBookAnchor = buildBookAnchor(inventoryBook);

            const financialAmount = new Amount(financialTransaction.amount ?? 0);

            let goodAccount = await inventoryBook.getAccount(financialTransaction.properties?.[GOOD_PROP]);
            if (goodAccount) {
                // Selling
                let goodSellAccount = await inventoryBook.getAccount(GOOD_SELL_ACCOUNT_NAME);
                if (goodSellAccount == undefined) {
                    goodSellAccount = await new Account(inventoryBook).setName(GOOD_SELL_ACCOUNT_NAME).setType(AccountType.OUTGOING).create();
                }

                const newTransaction = await new Transaction(inventoryBook)
                    .setDate(financialTransaction.date)
                    .setAmount(quantity)
                    .setCreditAccount(goodAccount)
                    .setDebitAccount(goodSellAccount)
                    .setDescription(financialTransaction.description ?? '')
                    .addRemoteId(financialTransaction.id)
                    .setProperty(SALE_INVOICE_PROP, financialTransaction.properties[SALE_INVOICE_PROP])
                    .setProperty(ORDER_PROP, financialTransaction.properties[ORDER_PROP])
                    .setProperty(SALE_AMOUNT_PROP, financialAmount.toString())
                    .setProperty(GOOD_EXC_CODE_PROP, goodExcCode)
                    .post()
                    ;

                const record = `${newTransaction.getDate()} ${newTransaction.getAmount()} ${goodAccount.getName()} ${goodSellAccount.getName()} ${newTransaction.getDescription()}`;
                const needsRebuild = this.checkLastTxDate(goodAccount, financialTransaction);

                if (needsRebuild) {
                    return `SELL: ${inventoryBookAnchor}: ${record} / WARNING: Transaction date is before the last COGS calculation date. Flagging account ${goodAccount.getName()} for rebuild`;
                } else {
                    return `SELL: ${inventoryBookAnchor}: ${record}`;
                }

            } else {
                const financialDebitAccount = financialTransaction.debitAccount;
                goodAccount = await this.getConnectedGoodAccount(inventoryBook, financialDebitAccount);
                if (goodAccount) {
                    // Buying
                    let goodBuyAccount = await inventoryBook.getAccount(GOOD_BUY_ACCOUNT_NAME);
                    if (goodBuyAccount == null) {
                        goodBuyAccount = await new Account(inventoryBook).setName(GOOD_BUY_ACCOUNT_NAME).setType(AccountType.INCOMING).create();
                    }

                    const newTransaction = await new Transaction(inventoryBook)
                        .setDate(financialTransaction.date)
                        .setAmount(quantity)
                        .setCreditAccount(goodBuyAccount)
                        .setDebitAccount(goodAccount)
                        .setDescription(financialTransaction.description ?? '')
                        .addRemoteId(financialTransaction.id)
                        .addRemoteId(`${financialTransaction.properties[PURCHASE_CODE_PROP]}_${financialDebitAccount.normalizedName}`)
                        .setProperty(ORIGINAL_QUANTITY_PROP, quantity.toString())
                        .setProperty(GOOD_PURCHASE_COST_PROP, financialAmount.toString())
                        .setProperty(ORDER_PROP, financialTransaction.properties[ORDER_PROP])
                        .setProperty(PURCHASE_CODE_PROP, financialTransaction.properties[PURCHASE_CODE_PROP])
                        .setProperty(GOOD_EXC_CODE_PROP, goodExcCode)
                        .setProperty(TOTAL_COST_PROP, financialAmount.toString())
                        .post()
                        ;

                    const record = `${newTransaction.getDate()} ${newTransaction.getAmount()} ${goodBuyAccount.getName()} ${goodAccount.getName()} ${newTransaction.getDescription()}`;
                    const needsRebuild = this.checkLastTxDate(goodAccount, financialTransaction);
                    
                    if (needsRebuild) {
                        return `BUY: ${inventoryBookAnchor}: ${record} / WARNING: Transaction date is before the last COGS calculation date. Flagging account ${goodAccount.getName()} for rebuild`;
                    } else {
                        return `BUY: ${inventoryBookAnchor}: ${record}`;
                    }
                }
            }
        }
        console.log('ERROR (connectedTransactionNotFound): financialTransaction is missing required fields');
        return undefined;
    }

    private checkLastTxDate(goodAccount: Account, transaction: bkper.Transaction): boolean {
        let lastTxDate = getCOGSCalculationDateValue(goodAccount);
        if (lastTxDate != null && (transaction.dateValue != undefined && transaction.dateValue <= +lastTxDate)) {
            goodAccount.setProperty(NEEDS_REBUILD_PROP, 'TRUE').update();
            return true;
        }
        return false;
    }

    // returns the good account from the inventory book corresponding to the good account in the financial book
    private async getConnectedGoodAccount(inventoryBook: Book, financialAccount: bkper.Account): Promise<Account | undefined> {
        const goodExchangeCode = getGoodExchangeCodeFromAccount(financialAccount);
        if (goodExchangeCode != undefined && financialAccount.name && financialAccount.type && financialAccount.properties) {
            let goodAccount = await inventoryBook.getAccount(financialAccount.name);
            if (goodAccount == undefined) {
                goodAccount = new Account(inventoryBook)
                    .setName(financialAccount.name)
                    .setType(financialAccount.type as AccountType)
                    .setProperties(financialAccount.properties)
                    .setArchived(financialAccount.archived ?? false);
                if (financialAccount.groups) {
                    for (const financialGroup of financialAccount.groups) {
                        if (financialGroup && financialGroup.properties && financialGroup.name && financialGroup.hidden) {
                            let goodGroup = await inventoryBook.getGroup(financialGroup.name);
                            const goodExcCode = financialGroup.properties[GOOD_EXC_CODE_PROP];
                            if (goodGroup == undefined && goodExcCode != undefined && goodExcCode.trim() != '') {
                                goodGroup = await new Group(inventoryBook)
                                    .setHidden(financialGroup.hidden)
                                    .setName(financialGroup.name)
                                    .setProperties(financialGroup.properties)
                                    .create()
                                    ;
                            }
                            if (goodGroup) {
                                goodAccount.addGroup(goodGroup);
                            }
                        }
                    }
                }
                goodAccount = await goodAccount.create();
            }
            return goodAccount;
        }
        console.log(`ERROR (getConnectedGoodAccount): financialAccount is missing required fields`);
        return undefined;
    }

}