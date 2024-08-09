import { Account, AccountType, Amount, Book, Transaction } from "bkper";
import { EventHandlerTransaction } from "./EventHandlerTransaction";
import { buildBookAnchor, getGoodExchangeCodeFromAccount, getQuantity, markAsOnceChecked } from "./BotService";
import { GOOD_BUY_ACCOUNT_NAME, GOOD_EXC_CODE_PROP, GOOD_PROP, GOOD_PURCHASE_COST_PROP, GOOD_SELL_ACCOUNT_NAME, ONCE_CHECKED, ORDER_PROP, ORIGINAL_QUANTITY_PROP, PURCHASE_CODE_PROP, PURCHASE_INVOICE_PROP, SALE_AMOUNT_PROP, TOTAL_ADDITIONAL_COSTS_PROP, TOTAL_COST_PROP } from "./constants";

export class EventHandlerTransactionChecked extends EventHandlerTransaction {

    protected getTransactionQuery(transaction: bkper.Transaction): string {
        console.log(`remoteId:${transaction.properties[PURCHASE_CODE_PROP]}_${transaction.debitAccount.name}`)
        return `remoteId:${transaction.properties[PURCHASE_CODE_PROP]}_${transaction.debitAccount.name}`;
    }

    // add additional cost to inventory purchase transaction total cost property
    protected async connectedTransactionFound(financialBook: Book, inventoryBook: Book, financialTransaction: bkper.Transaction, connectedTransaction: Transaction, goodExcCode: string): Promise<string> {
        // prevent bot response when checking more than once the same good purchase transaction
        if (financialTransaction.properties[ONCE_CHECKED]) {
            return null;
        }

        // prevent bot response when checking transactions from inventory book
        if (financialBook.getId() == inventoryBook.getId()) {
            return null;
        }
        // prevent bot response when checking root financial transaction
        const financialTransactionRemoteIds = financialTransaction.remoteIds;
        if (financialTransactionRemoteIds.length == 0) {
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

        connectedTransaction.setProperty(TOTAL_ADDITIONAL_COSTS_PROP, newTotalAdditionalCosts.toString()).setProperty(TOTAL_COST_PROP, newTotalCosts.toString()).update();

        markAsOnceChecked(financialBook, financialTransaction.id);

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
                goodSellAccount = await inventoryBook.newAccount().setName(GOOD_SELL_ACCOUNT_NAME).setType(AccountType.OUTGOING).create();
            }

            let newTransaction = await inventoryBook.newTransaction()
                .setDate(financialTransaction.date)
                .setAmount(quantity)
                .setCreditAccount(goodAccount)
                .setDebitAccount(goodSellAccount)
                .setDescription(financialTransaction.description)
                .addRemoteId(financialTransaction.id)
                .setProperty(ORDER_PROP, financialTransaction.properties[ORDER_PROP])
                .setProperty(ORIGINAL_QUANTITY_PROP, quantity.toString())
                .setProperty(SALE_AMOUNT_PROP, financialAmount.toString())
                .setProperty(GOOD_EXC_CODE_PROP, goodExcCode)
                .post()
                ;

            markAsOnceChecked(financialBook, financialTransaction.id);

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
                    .addRemoteId(`${financialTransaction.properties[PURCHASE_CODE_PROP]}_${financialDebitAccount.name}`)
                    .setProperty(ORIGINAL_QUANTITY_PROP, quantity.toString())
                    .setProperty(GOOD_PURCHASE_COST_PROP, financialAmount.toString())
                    .setProperty(ORDER_PROP, financialTransaction.properties[ORDER_PROP])
                    .setProperty(PURCHASE_CODE_PROP, financialTransaction.properties[PURCHASE_CODE_PROP])
                    .setProperty(GOOD_EXC_CODE_PROP, goodExcCode)
                    .setProperty(TOTAL_COST_PROP, financialAmount.toString())
                    .post()
                    ;

                markAsOnceChecked(financialBook, financialTransaction.id);

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