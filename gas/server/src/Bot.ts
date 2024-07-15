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
    const account = book.getAccount(accountIdParam);
    const group = book.getGroup(groupIdParam);

    // Return template object
    return {
        book: { id: book.getId(), name: book.getName() },
        account: account ? { id: account.getId(), name: account.getName() } : undefined,
        group: group ? { id: group.getId(), name: group.getName() } : undefined
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
function calculateCostOfSales(bookId: string, accountId: string, toDate?: string): Summary {
    // Log user inputs
    console.log(`book id: ${bookId}, account id: ${accountId}, date input: ${toDate}`);

    if (accountId) {
        const summary = CostOfSalesService.calculateCostOfSalesForAccount(bookId, accountId, toDate);
        return summary.json();
    }

}