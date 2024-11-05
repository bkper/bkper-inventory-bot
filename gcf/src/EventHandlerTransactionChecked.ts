// @ts-nocheck
import { Account, AccountType, Amount, Book, Transaction } from "bkper-js";
import { EventHandlerTransaction } from "./EventHandlerTransaction.js";
import { buildBookAnchor, getGoodExchangeCodeFromAccount, getQuantity } from "./BotService.js";
import { GOOD_BUY_ACCOUNT_NAME, GOOD_EXC_CODE_PROP, GOOD_PROP, GOOD_PURCHASE_COST_PROP, GOOD_SELL_ACCOUNT_NAME, ORDER_PROP, ORIGINAL_QUANTITY_PROP, PURCHASE_CODE_PROP, SALE_AMOUNT_PROP, SALE_INVOICE_PROP, TOTAL_ADDITIONAL_COSTS_PROP, TOTAL_COST_PROP } from "./constants.js";

export class EventHandlerTransactionChecked extends EventHandlerTransaction {

    protected getTransactionQuery(transaction: bkper.Transaction): string {
        // checking sale transactions
        if (transaction.creditAccount.type == AccountType.INCOMING) {
            return `remoteId:${transaction.id}`;
        } else {
        // checking purchase transactions
            return `remoteId:${transaction.properties[PURCHASE_CODE_PROP]}_${transaction.debitAccount.normalizedName}`;
        }
    }

    // add additional cost to inventory purchase transaction total cost property
    protected async connectedTransactionFound(financialBook: Book, inventoryBook: Book, financialTransaction: bkper.Transaction, connectedTransaction: Transaction, goodExcCode: string): Promise<string> {
        // prevent bot response when checking more than once the same good purchase transaction
        for (const remoteId of connectedTransaction.getRemoteIds()) {
            if (remoteId == financialTransaction.id) {
                return null;
            }
        }

        // prevent bot response when checking transactions from inventory book
        if (financialBook.getId() == inventoryBook.getId()) {
            return null;
        }

        // prevent bot response when checking root financial transaction
        if (financialTransaction.creditAccount.type == AccountType.LIABILITY) {
            return null;
        }

        // update additional cost and total cost properties in inventory book transaction
        const additionalCost = new Amount(financialTransaction.amount);
        const currentTotalCost = new Amount(connectedTransaction.getProperty(TOTAL_COST_PROP));
        const newTotalCosts = currentTotalCost.plus(additionalCost);

        let currentTotalAdditionalCosts = new Amount(0);
        if (connectedTransaction.getProperty(TOTAL_ADDITIONAL_COSTS_PROP)) {
            currentTotalAdditionalCosts = currentTotalAdditionalCosts.plus(new Amount(connectedTransaction.getProperty(TOTAL_ADDITIONAL_COSTS_PROP)));
        }
        const newTotalAdditionalCosts = currentTotalAdditionalCosts.plus(additionalCost);

        connectedTransaction
            .setProperty(TOTAL_ADDITIONAL_COSTS_PROP, newTotalAdditionalCosts.toString())
            .setProperty(TOTAL_COST_PROP, newTotalCosts.toString())
            .addRemoteId(financialTransaction.id)
            .update();

        let bookAnchor = buildBookAnchor(inventoryBook);
        let record = `${connectedTransaction.getDate()} ${connectedTransaction.getAmount()} ${await connectedTransaction.getCreditAccountName()} ${await connectedTransaction.getDebitAccountName()} ${connectedTransaction.getDescription()}`;
        return `FOUND: ${bookAnchor}: ${record}`;
    }

    // create purchase (Buy) or sale (Sell) transactions in the inventory book in response to the financial transactions
    protected async connectedTransactionNotFound(financialBook: Book, inventoryBook: Book, financialTransaction: bkper.Transaction, goodExcCode: string): Promise<string> {
        // prevent bot response when checking root financial transaction
        let financialCreditAccount = financialTransaction.creditAccount;
        if (financialCreditAccount.type == AccountType.LIABILITY) {
            return null;
        }

        let quantity = getQuantity(inventoryBook, financialTransaction);
        if (quantity == null || quantity.eq(0)) {
            return null;
        }

        let financialDebitAccount = financialTransaction.debitAccount;
        let inventoryBookAnchor = buildBookAnchor(inventoryBook);

        const financialAmount = new Amount(financialTransaction.amount);

        let goodAccount = await inventoryBook.getAccount(financialTransaction.properties[GOOD_PROP]);
        if (goodAccount) {
            // Selling
            let goodSellAccount = await inventoryBook.getAccount(GOOD_SELL_ACCOUNT_NAME);
            if (goodSellAccount == null) {
                goodSellAccount = await new Account(inventoryBook).setName(GOOD_SELL_ACCOUNT_NAME).setType(AccountType.OUTGOING).create();
            }

            let newTransaction = await new Transaction(inventoryBook)
                .setDate(financialTransaction.date)
                .setAmount(quantity)
                .setCreditAccount(goodAccount)
                .setDebitAccount(goodSellAccount)
                .setDescription(financialTransaction.description)
                .addRemoteId(financialTransaction.id)
                .setProperty(SALE_INVOICE_PROP, financialTransaction.properties[SALE_INVOICE_PROP])
                .setProperty(ORDER_PROP, financialTransaction.properties[ORDER_PROP])
                .setProperty(SALE_AMOUNT_PROP, financialAmount.toString())
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
                    goodBuyAccount = await new Account(inventoryBook).setName(GOOD_BUY_ACCOUNT_NAME).setType(AccountType.INCOMING).create();
                }

                let newTransaction = await new Transaction(inventoryBook)
                    .setDate(financialTransaction.date)
                    .setAmount(quantity)
                    .setCreditAccount(goodBuyAccount)
                    .setDebitAccount(goodAccount)
                    .setDescription(financialTransaction.description)
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

                let record = `${newTransaction.getDate()} ${newTransaction.getAmount()} ${goodBuyAccount.getName()} ${goodAccount.getName()} ${newTransaction.getDescription()}`;
                return `BUY: ${inventoryBookAnchor}: ${record}`;
            }
        }

        return null;
    }

    // returns the good account from the inventory book corresponding to the good account in the financial book
    private async getConnectedGoodAccount(inventoryBook: Book, financialAccount: bkper.Account): Promise<Account> {
        let goodExchangeCode = getGoodExchangeCodeFromAccount(financialAccount);
        if (goodExchangeCode != undefined) {
            let goodAccount = await inventoryBook.getAccount(financialAccount.name);
            if (goodAccount == undefined) {
                goodAccount = await new Account(inventoryBook)
                    .setName(financialAccount.name)
                    .setType(financialAccount.type as AccountType)
                    .setProperties(financialAccount.properties)
                    .setArchived(financialAccount.archived);
                if (financialAccount.groups) {
                    for (const financialGroup of financialAccount.groups) {
                        if (financialGroup) {
                            let goodGroup = await inventoryBook.getGroup(financialGroup.name);
                            let goodExcCode = financialGroup.properties[GOOD_EXC_CODE_PROP];
                            if (goodGroup == undefined && goodExcCode != undefined && goodExcCode.trim() != '') {
                                goodGroup = await new Group(inventoryBook)
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