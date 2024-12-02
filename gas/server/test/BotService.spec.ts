import { expect } from 'chai';

import { AccountMock } from './AccountMock';


describe('BotService', () => {

    describe('#getAccountQuery(goodAccount: bkper.Account, beforeDate?: string): string', () => {
        it('should return the query string for the good account without beforeDate', () => {

            const accountName = 'Test Account';
            const account = new AccountMock(accountName);
            const query = BotService.getAccountQuery(account);

            expect(query).to.equal(`account:'${accountName}'`);
        });
    });

});