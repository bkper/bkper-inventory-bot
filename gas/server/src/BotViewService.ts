namespace BotViewService {

    export function getBotViewTemplate(bookId: string, accountId: string, groupId: string): GoogleAppsScript.HTML.HtmlOutput {

        const book = BkperApp.getBook(bookId);
        const inventoryBook = BotService.getInventoryBook(book);
        if (inventoryBook == null) {
            throw 'Inventory Book not found in the collection';
        }

        // Account, Group
        const account = book.getAccount(accountId);
        const group = book.getGroup(groupId);

        const template = HtmlService.createTemplateFromFile('BotView');

        template.book = { id: inventoryBook.getId(), name: inventoryBook.getName() };
        template.account = account ? { id: account.getId(), name: account.getName() } : undefined;
        template.group = group ? { id: group.getId(), name: group.getName() } : undefined;

        return template.evaluate().setTitle('Inventory Bot');
    }

}
