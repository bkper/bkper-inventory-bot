import express = require('express');
import { Request, Response } from 'express';
import httpContext = require('express-http-context');
import { HttpFunction } from '@google-cloud/functions-framework/build/src/functions';
import { Bkper } from 'bkper';
// import { EventHandlerTransactionChecked } from './EventHandlerTransactionChecked';

require('dotenv').config({path:`${__dirname}/../../.env`})

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
  
    //Sets API key from env for development or from headers
    Bkper.setApiKey(process.env.BKPER_API_KEY ? process.env.BKPER_API_KEY : req.headers['bkper-api-key'] as string);

    console.log("INIT");
  
    //Put OAuth token from header in the http context for later use when calling the API. https://julio.li/b/2016/10/29/request-persistence-express/
    const oauthTokenHeader = 'bkper-oauth-token';
    httpContext.set(oauthTokenHeader, req.headers[oauthTokenHeader]);
    Bkper.setOAuthTokenProvider(async () => httpContext.get(oauthTokenHeader));  
}

async function handleEvent(req: Request, res: Response) {

    init(req, res);

    // try {

    //     let event: bkper.Event = req.body
    //     let result: Result = { result: false };

    //     switch (event.type) {
    //         case 'TRANSACTION_CHECKED':
    //             result = await new EventHandlerTransactionChecked().handleEvent(event);
    //             break;
    //     }

    //     res.send(response(result))

    // } catch (err: any) {
    //     console.error(err);
    //     res.send(response({ error: err.stack ? err.stack.split("\n") : err }))
    // }

    let result = {"result": "TESTE LOCAL"};
    res.send(result);
}

function response(result: Result): string {
    const body = JSON.stringify(result, null, 4);
    return body;
}