import { Account, AccountType, Amount, Book, Transaction } from "bkper";
import { EventHandlerTransaction } from "./EventHandlerTransaction";
import { getGoodExchangeCodeFromAccount, getQuantity } from "./BotService";
import { GOOD_BUY_ACCOUNT_NAME, GOOD_EXC_CODE_PROP, GOOD_PROP, GOOD_SELL_ACCOUNT_NAME, ORIGINAL_AMOUNT_PROP, ORIGINAL_QUANTITY_PROP, PURCHASE_PRICE_PROP, SALE_PRICE_PROP } from "./constants";

export class EventHandlerTransactionChecked extends EventHandlerTransaction {

    protected getTransactionQuery(transaction: bkper.Transaction): string {
        return `remoteId:${transaction.id}`;
    }

    // async intercept(baseBook: Book, event: bkper.Event): Promise<Result> {
    //     let response = await new InterceptorFlagRebuild().intercept(baseBook, event);
    //     return response;
    // }

    protected async connectedTransactionFound(financialBook: Book, inventoryBook: Book, financialTransaction: bkper.Transaction, connectedTransaction: Transaction, goodExcCode: string): Promise<string> {
        let bookAnchor = super.buildBookAnchor(inventoryBook);
        let record = `${connectedTransaction.getDate()} ${connectedTransaction.getAmount()} ${await connectedTransaction.getCreditAccountName()} ${await connectedTransaction.getDebitAccountName()} ${connectedTransaction.getDescription()}`;
        return `FOUND: ${bookAnchor}: ${record}`;
    }

    // create purchase (Buy) or sale (Sell) transactions in the inventory book in response to the financial transactions
    protected async connectedTransactionNotFound(financialBook: Book, inventoryBook: Book, financialTransaction: bkper.Transaction, goodExcCode: string): Promise<string> {

        let financialDebitAccount = financialTransaction.debitAccount;
        let inventoryBookAnchor = super.buildBookAnchor(inventoryBook);

        let quantity = getQuantity(inventoryBook, financialTransaction);
        if (quantity == null || quantity.eq(0)) {
            return null;
        }

        const originalAmount = new Amount(financialTransaction.amount);
        const price = originalAmount.div(quantity);

        let goodAccount = await inventoryBook.getAccount(financialTransaction.properties[GOOD_PROP]);
        if (goodAccount) {
            // Selling
            let goodSellAccount = await inventoryBook.getAccount(GOOD_SELL_ACCOUNT_NAME);
            if (goodSellAccount == null) {
                goodSellAccount = await inventoryBook.newAccount().setName(GOOD_SELL_ACCOUNT_NAME).setType(AccountType.OUTGOING).create();
            }

            let newTransaction = await inventoryBook.newTransaction()
                .setDate(financialTransaction.date)
                .setAmount(quantity)
                .setCreditAccount(goodAccount)
                .setDebitAccount(goodSellAccount)
                .setDescription(financialTransaction.description)
                .addRemoteId(financialTransaction.id)
                .setProperty(SALE_PRICE_PROP, price.toString())
                .setProperty(ORIGINAL_QUANTITY_PROP, quantity.toString())
                .setProperty(ORIGINAL_AMOUNT_PROP, originalAmount.toString())
                .setProperty(GOOD_EXC_CODE_PROP, goodExcCode)
                .post()
                ;

            let record = `${newTransaction.getDate()} ${newTransaction.getAmount()} ${goodAccount.getName()} ${goodSellAccount.getName()} ${newTransaction.getDescription()}`;
            return `SELL: ${inventoryBookAnchor}: ${record}`;

        } else {
            goodAccount = await this.getConnectedGoodAccount(inventoryBook, financialDebitAccount);
            if (goodAccount) {
                // Buying
                let goodBuyAccount = await inventoryBook.getAccount(GOOD_BUY_ACCOUNT_NAME);
                if (goodBuyAccount == null) {
                    goodBuyAccount = await inventoryBook.newAccount().setName(GOOD_BUY_ACCOUNT_NAME).setType(AccountType.INCOMING).create();
                }

                let newTransaction = await inventoryBook.newTransaction()
                    .setDate(financialTransaction.date)
                    .setAmount(quantity)
                    .setCreditAccount(goodBuyAccount)
                    .setDebitAccount(goodAccount)
                    .setDescription(financialTransaction.description)
                    .addRemoteId(financialTransaction.id)
                    .setProperty(PURCHASE_PRICE_PROP, price.toString())
                    .setProperty(ORIGINAL_QUANTITY_PROP, quantity.toString())
                    .setProperty(ORIGINAL_AMOUNT_PROP, originalAmount.toString())
                    .setProperty(GOOD_EXC_CODE_PROP, goodExcCode)
                    .post()
                    ;

                let record = `${newTransaction.getDate()} ${newTransaction.getAmount()} ${goodBuyAccount.getName()} ${goodAccount.getName()} ${newTransaction.getDescription()}`;
                return `BUY: ${inventoryBookAnchor}: ${record}`;
            }
        }

        return null;
    }

    // returns the good account from the inventory book corresponding to the good account in the financial book
    private async getConnectedGoodAccount(inventoryBook: Book, financialAccount: bkper.Account): Promise<Account> {
        let goodExchangeCode = getGoodExchangeCodeFromAccount(financialAccount);
        if (goodExchangeCode != null) {
            let goodAccount = await inventoryBook.getAccount(financialAccount.name);
            if (goodAccount == null) {
                goodAccount = inventoryBook.newAccount()
                    .setName(financialAccount.name)
                    .setType(financialAccount.type as AccountType)
                    .setProperties(financialAccount.properties)
                    .setArchived(financialAccount.archived);
                if (financialAccount.groups) {
                    for (const financialGroup of financialAccount.groups) {
                        if (financialGroup) {
                            let goodGroup = await inventoryBook.getGroup(financialGroup.name);
                            let goodExcCode = financialGroup.properties[GOOD_EXC_CODE_PROP];
                            if (goodGroup == null && goodExcCode != null && goodExcCode.trim() != '') {
                                goodGroup = await inventoryBook.newGroup()
                                    .setHidden(financialGroup.hidden)
                                    .setName(financialGroup.name)
                                    .setProperties(financialGroup.properties)
                                    .create()
                                    ;
                            }
                            goodAccount.addGroup(goodGroup);
                        }
                    }
                }
                goodAccount = await goodAccount.create();
            }
            return goodAccount;
        }
        return null;
    }

}