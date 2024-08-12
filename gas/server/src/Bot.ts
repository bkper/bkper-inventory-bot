BkperApp.setApiKey(PropertiesService.getScriptProperties().getProperty('API_KEY'));

/**
* Template object to pass server parameters to client side
* 
* @public
*/
interface Template {
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
function getTemplate(parameters: { [key: string]: string }): Template {

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
function calculateCostOfSales(template: Template, toDate?: string): Summary | undefined{
    // Log user inputs
    console.log(`book id: ${template.book.id}, account id: ${template.account?.id}, date input: ${toDate}`);

    let accountsToCalculate: string[] = [];
    if (template.account) {
        accountsToCalculate.push(template.account.id);
    } else {
        const book = BkperApp.getBook(template.book.id);
        const inventoryBook = BotService.getInventoryBook(book);
        const accounts = inventoryBook.getAccounts();
        for (const account of accounts) {
            if (account.getType() == BkperApp.AccountType.ASSET) {
                accountsToCalculate.push(account.getId());
            }
        }
    }

    for (const accountId of accountsToCalculate) {
        const summary = CostOfSalesService.calculateCostOfSalesForAccount(template.book.id, accountId, toDate);
        console.log("SUMARY: ", summary.json())
        // return summary.json();
    }

    return undefined;
}