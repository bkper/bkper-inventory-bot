import 'mocha';
import { expect } from 'chai';

import { AccountType } from 'bkper-js';

import { EventHandlerTransactionChecked } from '../dist/EventHandlerTransactionChecked.js';
import { PURCHASE_CODE_PROP } from '../dist/constants.js';

describe('EventHandlerTransactionChecked', () => {

    describe('#getTransactionQuery(transaction: bkper.Transaction): string', () => {
        it('should return the remoteId of the sale transaction in the Inventory Book', () => {

            const transaction = {
                id: '123',
                creditAccount: {
                    type: AccountType.INCOMING,
                },
            };

            const query = new EventHandlerTransactionChecked().getTransactionQuery(transaction);

            expect(query).to.equal(`remoteId:123`);
        });
    });

    describe('#getTransactionQuery(transaction: bkper.Transaction): string', () => {
        it('should return the remoteId of the purchase transaction in the Inventory Book', () => {

            const transaction = {
                id: '123',
                creditAccount: {
                },
                debitAccount: {
                    normalizedName: 'product_a',
                },
                properties: {
                    [PURCHASE_CODE_PROP]: '12B3C4'
                },
            };

            const query = new EventHandlerTransactionChecked().getTransactionQuery(transaction);

            expect(query).to.equal(`remoteId:12B3C4_product_a`);
        });
    });

});