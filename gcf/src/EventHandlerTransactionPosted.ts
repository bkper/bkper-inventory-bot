import { Bkper } from "bkper-js";
import { Result } from "./index.js";
import { InterceptorOrderProcessor } from "./InterceptorOrderProcessor.js";

export class EventHandlerTransactionPosted {

  async handleEvent(event: bkper.Event): Promise<Result> {

    // TODO: use "baseBook"? will model have a base book?
    let baseBook = await Bkper.getBook(event.bookId!);
    const response = await new InterceptorOrderProcessor().intercept(baseBook, event)
    if (response) {
      return response;
    }
    return { result: false };
  }

}