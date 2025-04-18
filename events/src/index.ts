import { HttpFunction } from '@google-cloud/functions-framework/build/src/functions.js';
import { Bkper } from 'bkper-js';
import { Request, Response } from 'express';
import 'source-map-support/register.js';
import express from 'express';
import httpContext from 'express-http-context';

import { EventHandlerTransactionPosted } from './EventHandlerTransactionPosted.js';
import { EventHandlerTransactionChecked } from './EventHandlerTransactionChecked.js';
import { EventHandlerTransactionDeleted } from './EventHandlerTransactionDeleted.js';
import { EventHandlerTransactionUnchecked } from './EventHandlerTransactionUnchecked.js';

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url); // get the resolved path to the file
const __dirname = path.dirname(__filename); // get the name of the directory

dotenv.config({ path: `${__dirname}/../../.env` });

const app = express();
app.use(httpContext.middleware);
app.use('/', handleEvent);
export const doPost: HttpFunction = app;

export type Result = {
    result?: string[] | string | boolean,
    error?: string,
    warning?: string
}

function init(req: Request, res: Response) {
    res.setHeader('Content-Type', 'application/json');

    //Put OAuth token from header in the http context for later use when calling the API. https://julio.li/b/2016/10/29/request-persistence-express/
    const oauthTokenHeader = 'bkper-oauth-token';
    httpContext.set(oauthTokenHeader, req.headers[oauthTokenHeader]);

    Bkper.setConfig({
        oauthTokenProvider: process.env.NODE_ENV === 'development' ? async () => import('bkper').then(bkper => bkper.getOAuthToken()) : async () => httpContext.get(oauthTokenHeader),
        apiKeyProvider: async () => process.env.BKPER_API_KEY || req.headers['bkper-api-key'] as string
    })
}

async function handleEvent(req: Request, res: Response) {

    init(req, res);

    try {

        let event: bkper.Event = req.body
        let result: Result = { result: false };

        switch (event.type) {
            case 'TRANSACTION_POSTED':
                result = await new EventHandlerTransactionPosted().handleEvent(event);
                break;
            case 'TRANSACTION_CHECKED':
                result = await new EventHandlerTransactionChecked().handleEvent(event);
                break;
            case 'TRANSACTION_UNCHECKED':
                result = await new EventHandlerTransactionUnchecked().handleEvent(event);
                break;
            case 'TRANSACTION_DELETED':
                result = await new EventHandlerTransactionDeleted().handleEvent(event);
                break;
        }

        res.send(response(result));

    } catch (err: any) {
        console.error(err);
        res.send(response({ error: err.stack ? err.stack.split("\n") : err }));
    }

}

function response(result: Result): string {
    const body = JSON.stringify(result, null, 4);
    return body;
}