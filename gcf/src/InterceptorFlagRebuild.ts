import { Book } from "bkper-js";
import { Result } from "./index.js";
import { getGoodAccount, isInventoryBook } from "./BotService.js";
import { NEEDS_REBUILD_PROP } from "./constants.js";

export class InterceptorFlagRebuild {

    async intercept(eventBook: Book, event: bkper.Event): Promise<Result> {
        if (isInventoryBook(eventBook) && event.agent?.id != 'inventory-bot') {
            if (event.data) {
                if (!event.data.object) {
                    return { result: false };
                }
                let operation = event.data.object as bkper.TransactionOperation;
                let transactionPayload = operation.transaction;
                let transaction = await eventBook.getTransaction(transactionPayload!.id!);
                
                let goodAccount = transaction ? await getGoodAccount(transaction) : null;
                
                if (goodAccount && goodAccount.getProperty(NEEDS_REBUILD_PROP) == null) {
                    await goodAccount.setProperty(NEEDS_REBUILD_PROP, 'TRUE').update();
                    const msg = `Flagging account ${goodAccount.getName()} for rebuild`;
                    return { warning: msg, result: msg };
                }
            }
        }
        return { result: false };
    }

}