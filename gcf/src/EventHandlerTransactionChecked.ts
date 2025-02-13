import { Account, AccountType, Amount, Book, Group, Transaction } from "bkper-js";
import { EventHandlerTransaction } from "./EventHandlerTransaction.js";
import { buildBookAnchor, getCOGSCalculationDateValue, getGoodExchangeCodeFromAccount, getQuantity } from "./BotService.js";
import { GOOD_BUY_ACCOUNT_NAME, GOOD_EXC_CODE_PROP, GOOD_PROP, GOOD_PURCHASE_COST_PROP, GOOD_SELL_ACCOUNT_NAME, NEEDS_REBUILD_PROP, ORDER_PROP, ORIGINAL_QUANTITY_PROP, PURCHASE_CODE_PROP, PURCHASE_INVOICE_PROP, SALE_AMOUNT_PROP, SALE_INVOICE_PROP, TOTAL_COST_PROP } from "./constants.js";
import { Result } from "./index.js";
import { InterceptorFlagRebuild } from "./InterceptorFlagRebuild.js";

export class EventHandlerTransactionChecked extends EventHandlerTransaction {

    async intercept(eventBook: Book, event: bkper.Event): Promise<Result> {
        let response = await new InterceptorFlagRebuild().intercept(eventBook, event);
        return response;
    }

    // financial transaction had been already replicated in the inventory book
    protected async connectedTransactionFound(inventoryBook: Book, goodTransaction: Transaction): Promise<string | undefined> {
        const bookAnchor = buildBookAnchor(inventoryBook);
        const record = `${goodTransaction.getDate()} ${goodTransaction.getAmount()} ${await goodTransaction.getCreditAccountName()} ${await goodTransaction.getDebitAccountName()} ${goodTransaction.getDescription()}`;
        return `FOUND: ${bookAnchor} ${record}`;
    }

    // create purchase (Buy) or sale (Sell) transactions in the inventory book in response to the financial transactions
    protected async connectedTransactionNotFound(inventoryBook: Book, financialTransaction: bkper.Transaction, goodExcCode: string): Promise<string | undefined> {
        if (financialTransaction.creditAccount && financialTransaction.debitAccount && financialTransaction.date && financialTransaction.id && financialTransaction.properties) {

            const quantity = getQuantity(financialTransaction);
            const financialCreditAccount = financialTransaction.creditAccount;
            const purchaseInvoice = financialTransaction.properties[PURCHASE_INVOICE_PROP];
            const saleInvoice = financialTransaction.properties[SALE_INVOICE_PROP];

            // prevent bot response when transaction is missing quantity or is not a purchase or sale transaction
            if (quantity == undefined || quantity.eq(0) || (financialCreditAccount.type != AccountType.ASSET && financialCreditAccount.type != AccountType.INCOMING)) {
                return undefined;
            }
            if (purchaseInvoice == undefined) {
                // it's not a purchase transaction
                if (saleInvoice == undefined || financialCreditAccount.type != AccountType.INCOMING) {
                    // it's not also a sale transaction
                    return undefined;
                }
            }

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
                    .setProperty(SALE_AMOUNT_PROP, new Amount(financialTransaction.amount ?? 0).toString())
                    .setProperty(GOOD_EXC_CODE_PROP, goodExcCode)
                    .post()
                    ;

                const inventoryBookAnchor = buildBookAnchor(inventoryBook);
                const record = `${newTransaction.getDate()} ${newTransaction.getAmount()} ${goodAccount.getName()} ${goodSellAccount.getName()} ${newTransaction.getDescription()}`;
                const needsRebuild = await this.checkLastTxDate(goodAccount, financialTransaction);

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
                        .setProperty(PURCHASE_CODE_PROP, financialTransaction.properties[PURCHASE_CODE_PROP])
                        .setProperty(ORIGINAL_QUANTITY_PROP, quantity.toString())
                        .setProperty(GOOD_PURCHASE_COST_PROP, new Amount(financialTransaction.amount ?? 0).toString())
                        .setProperty(ORDER_PROP, financialTransaction.properties[ORDER_PROP])
                        .setProperty(GOOD_EXC_CODE_PROP, goodExcCode)
                        .setProperty(TOTAL_COST_PROP, new Amount(financialTransaction.amount ?? 0).toString())
                        .post()
                        ;

                    const inventoryBookAnchor = buildBookAnchor(inventoryBook);
                    const record = `${newTransaction.getDate()} ${newTransaction.getAmount()} ${goodBuyAccount.getName()} ${goodAccount.getName()} ${newTransaction.getDescription()}`;
                    const needsRebuild = await this.checkLastTxDate(goodAccount, financialTransaction);

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

    private async checkLastTxDate(goodAccount: Account, transaction: bkper.Transaction): Promise<boolean> {
        let lastTxDate = getCOGSCalculationDateValue(goodAccount);
        if (lastTxDate != null && (transaction.dateValue != undefined && transaction.dateValue <= +lastTxDate)) {
            await goodAccount.setProperty(NEEDS_REBUILD_PROP, 'TRUE').update();
            return true;
        }
        return false;
    }

    // returns the good account from the inventory book corresponding to the good account in the financial book (creates the account if it doesn't exist)
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