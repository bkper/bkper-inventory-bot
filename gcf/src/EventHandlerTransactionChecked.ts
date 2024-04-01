import { Result } from ".";

export class EventHandlerTransactionChecked {

    async handleEvent(event: bkper.Event): Promise<Result> {

        let user = event.user.username;

        return { result: `${user} CHECKED!!!` };
    }

}