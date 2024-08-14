class Summary {

    private accountId: string;
    private result: string = 'Nothing to calculate';
    private error = false;

    constructor(accountId: string) {
        this.accountId = accountId;
    }

    getAccountId(): string {
        return this.accountId;
    }

    getResult(): string {
        return this.result;
    }

    done(msg?: string): this {
        if (msg) {
            this.result = msg;
            return this;
        }
        this.result = `Done! ${JSON.stringify(this.result)}`;
        return this;
    }

    rebuild(): this {
        this.result = 'Account needs rebuild: reseting...';
        return this;
    }

    resetingAsync(): this {
        this.result = 'Reseting...';
        return this;
    }

    calculatingAsync(): this {
        this.result = 'Calculating...';
        return this;
    }

    lockError(): this {
        this.error = true;
        this.result = 'Cannot proceed: collection has locked/closed book(s)';
        return this;
    }

    quantityError(): this {
        this.error = true;
        this.result = 'Cannot proceed: sales quantity is greater than quantity purchased';
        return this;
    }

    json(): this {
        this.result = JSON.stringify(this.result);
        return this;
    }

}