namespace BotViewService {

    export function getBotViewTemplate(bookId: string, accountId: string, groupId: string): GoogleAppsScript.HTML.HtmlOutput {

        const book = BkperApp.getBook(bookId);
        const inventoryBook = BotService.getInventoryBook(book);
        if (inventoryBook == null) {
            throw 'Inventory Book not found in the collection';
        }

        let account = {
            id: '',
            name: ''
        }
        if (accountId != '${account.id}') {
            account.id = accountId;
            account.name = book.getAccount(accountId).getName();
        }

        let group = {
            id: '',
            name: ''
        }
        if (groupId != '${group.id}') {
            group.id = groupId;
            group.name = book.getGroup(groupId).getName();
        }

        const template = HtmlService.createTemplateFromFile('BotView');

        template.book = { id: inventoryBook.getId(), name: inventoryBook.getName() };
        template.account = { id: account.id, name: account.name };
        template.group = { id: group.id, name: group.name };
        
        return template.evaluate().setTitle('Inventory Bot');  
    }

}
