BkperApp.setApiKey(PropertiesService.getScriptProperties().getProperty('API_KEY'));

const INVENTORY_BOOK_PROP = 'inventory_book';

function doGet(e: GoogleAppsScript.Events.AppsScriptHttpRequestEvent) {

    // @ts-ignore
    let bookId = e.parameter.bookId;
    // @ts-ignore
    let accountId = e.parameter.accountId;
    // @ts-ignore
    let groupId = e.parameter.groupId;

    return BotViewService.getBotViewTemplate(bookId, accountId, groupId);
}