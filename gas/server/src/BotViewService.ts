namespace BotViewService {

    export function getBotViewTemplate(bookId: string, accountId: string, groupId: string): GoogleAppsScript.HTML.HtmlOutput {

        const book = BkperApp.getBook(bookId);
        if (book.getAccount(accountId) == null) {
            throw 'Select an account to calculate';
        }
        const inventoryBook = BotService.getInventoryBook(book);
        if (inventoryBook == null) {
            throw 'Inventory Book not found in the collection';
        }

        // Account, Group
        const group = book.getGroup(groupId);
        let groupName = group ? group.getName() : undefined;

        const accountName = book.getAccount(accountId).getName();
        const account = inventoryBook.getAccount(accountName);

        const template = HtmlService.createTemplateFromFile('BotView');

        template.book = { id: inventoryBook.getId(), name: inventoryBook.getName() };
        template.account = account ? { id: account.getId(), name: account.getName() } : undefined;
        template.group = group ? { id: inventoryBook.getGroup(groupName).getId(), name: groupName } : undefined;

        return template.evaluate().setTitle('Inventory Bot');
    }

}
