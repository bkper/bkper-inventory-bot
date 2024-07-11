class Summary {

    private accountId: string;
    private result: any = {};
    private error = false;

    constructor(accountId: string) {
        this.accountId = accountId;
    }

    json(): this {
        this.result = JSON.stringify(this.result);
        return this;
    }

}