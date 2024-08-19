import { Book } from "bkper";
import { Result } from ".";
import { getGoodAccount, isInventoryBook } from "./BotService";
import { NEEDS_REBUILD_PROP } from "./constants";

export class InterceptorFlagRebuild {

    async intercept(baseBook: Book, event: bkper.Event): Promise<Result> {
        if (isInventoryBook(baseBook) && event.agent.id != 'inventory-bot') {
            let operation = event.data.object as bkper.TransactionOperation;
            let transactionPayload = operation.transaction;
            let transaction = await baseBook.getTransaction(transactionPayload.id);
            
            let goodAccount = await getGoodAccount(transaction);
            
            if (goodAccount && goodAccount.getProperty(NEEDS_REBUILD_PROP) == null) {
                goodAccount.setProperty(NEEDS_REBUILD_PROP, 'TRUE').update();
                const msg = `Flagging account ${goodAccount.getName()} for rebuild`;
                return { warning: msg, result: msg };
            }
        }
        return { result: false };
    }

}