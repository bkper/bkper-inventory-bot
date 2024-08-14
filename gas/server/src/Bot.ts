BkperApp.setApiKey(PropertiesService.getScriptProperties().getProperty('API_KEY'));

/**
* Template object to pass server parameters to client side
* 
* @public
*/
interface ContextParams {
    book: { id: string, name: string },
    account?: { id: string, name: string },
    group?: { id: string, name: string }
}

function doGet(e: GoogleAppsScript.Events.AppsScriptHttpRequestEvent) {
    // @ts-ignore
    const bookId = e.parameter.bookId;
    // @ts-ignore
    const accountId = e.parameter.accountId;
    // @ts-ignore
    const groupId = e.parameter.groupId;

    return BotViewService.getBotViewTemplate(bookId, accountId, groupId);
}

/**
 * Get Template object from server side
 * 
 * @public
 */
function getContextParams(parameters: { [key: string]: string }): ContextParams {

    // Params
    const bookIdParam = parameters.bookId;
    const accountIdParam = parameters.accountId;
    const groupIdParam = parameters.groupId;

    // Book, Account, Group
    const book = BkperApp.getBook(bookIdParam);
    const inventoryBook = BotService.getInventoryBook(book);
    if (inventoryBook == null) {
        throw 'Inventory Book not found in the collection';
    }

    const group = book.getGroup(groupIdParam);
    let groupName = group ? group.getName() : undefined;

    const account = book.getAccount(accountIdParam);
    let inventoryAccount: Bkper.Account | undefined = undefined;
    if (account) {
        inventoryAccount = inventoryBook.getAccount(account.getName());
    }

    // Return template object
    return {
        book: { id: inventoryBook.getId(), name: inventoryBook.getName() },
        account: inventoryAccount ? { id: inventoryAccount.getId(), name: inventoryAccount.getName() } : undefined,
        group: group ? { id: inventoryBook.getGroup(groupName).getId(), name: groupName } : undefined
    }
}

/**
 * Get the accounts to calculate COGS
 * 
 * @public
 */
function getAccountsToCalculate(contextParams: ContextParams): { accountId: string, accountName: string }[] {
    const book = BkperApp.getBook(contextParams.book.id);
    const inventoryBook = BotService.getInventoryBook(book);
    let accountsToCalculate: { accountId: string, accountName: string }[] = [];
    if (contextParams.account) {
        const account = inventoryBook.getAccount(contextParams.account.id);
        accountsToCalculate.push({ accountId: account.getId(), accountName: account.getName() });
    } else {
        const accounts = inventoryBook.getAccounts();
        for (const account of accounts) {
            if (account.getType() == BkperApp.AccountType.ASSET) {
                accountsToCalculate.push({ accountId: account.getId(), accountName: account.getName() });
            }
        }
    }
    return accountsToCalculate;
}

/**
 * Check if Inventory Book has pending tasks
 * 
 * @public
 */
function validate(bookId: string): void {
    const book = BkperApp.getBook(bookId);
    const inventoryBook = BotService.getInventoryBook(book);
    if (BotService.hasPendingTasks(inventoryBook)) {
        throw `Cannot start operation: Inventory Book has pending tasks`;
    }
}

/**
 * Calculate cost of sales for goods
 * 
 * @public
 */
function calculateCostOfSales(contextParams: ContextParams, toDate?: string): Summary | undefined {
    // Log user inputs
    console.log(`book id: ${contextParams.book.id}, account id: ${contextParams.account?.id}, date input: ${toDate}`);

    let accountsToCalculate = getAccountsToCalculate(contextParams)

    for (const account of accountsToCalculate) {
        const summary = CostOfSalesService.calculateCostOfSalesForAccount(contextParams.book.id, account.accountId, toDate);
        console.log("SUMARY: ", summary.json())
        // return summary.json();
    }

    return undefined;
}