BkperApp.setApiKey(PropertiesService.getScriptProperties().getProperty('API_KEY'));

const GOOD_EXC_CODE_PROP = 'good_exc_code';
const INVENTORY_BOOK_PROP = 'inventory_book';
const NEEDS_REBUILD_PROP = 'needs_rebuild';


function doGet(e: GoogleAppsScript.Events.AppsScriptHttpRequestEvent) {

    // @ts-ignore
    let bookId = e.parameter.bookId;
    // @ts-ignore
    let accountId = e.parameter.accountId;
    // @ts-ignore
    let groupId = e.parameter.groupId;

    return BotViewService.getBotViewTemplate(bookId, accountId, groupId);
}

function validate(bookId: string): void {
    // Check if Inventory Book has pending tasks
    const book = BkperApp.getBook(bookId);
    const inventoryBook = BotService.getInventoryBook(book);
    if (BotService.hasPendingTasks(inventoryBook)) {
        throw `Cannot start operation: Inventory Book has pending tasks`;
    }
}

function calculateCostOfSales(bookId: string, accountId: string, toDate: string): Summary {

    // Log user inputs
    console.log(`book id: ${bookId}, account id: ${accountId}, date input: ${toDate}`);

    if (accountId) {
        const summary = CostOfSalesService.calculateCostOfSalesForAccount(bookId, accountId, toDate);
        return summary.json();
    }

}