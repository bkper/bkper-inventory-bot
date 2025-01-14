var expect = require('chai').expect;

describe('helper', () => {

    describe('#getAccountQuery(goodAccountName: string, beforeDate?: string): string', () => {
        it('should return the query string for the good account without beforeDate', () => {

            const goodAccountName = 'Test Account';
            const query = helper.getAccountQuery(goodAccountName);

            expect(query).to.equal(`account:'${goodAccountName}'`);
        });
    });

    describe('#getAccountQuery(goodAccountName: string, beforeDate?: string): string', () => {
        it('should return the query string for the good account with beforeDate', () => {

            const goodAccountName = 'Test Account';
            const beforeDate = '2024-01-01';
            const query = helper.getAccountQuery(goodAccountName, beforeDate);

            expect(query).to.equal(`account:'${goodAccountName}' before:${beforeDate}`);
        });
    });

});