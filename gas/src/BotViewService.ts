namespace BotViewService {

    export function getBotViewTemplate(bookId: string, accountId: string, groupId: string): GoogleAppsScript.HTML.HtmlOutput {

        const book = BkperApp.getBook(bookId);
        const account = book.getAccount(accountId);
        const group = book.getGroup(groupId);

        const inventoryBook = BotService.getInventoryBook(book);
        if (inventoryBook == null) {
            throw 'Inventory Book not found in the collection';
        }

        const template = HtmlService.createTemplateFromFile('BotView');

        template.book = { id: inventoryBook.getId(), name: inventoryBook.getName() };

        return template.evaluate().setTitle('Inventory Bot');  
    }

}
