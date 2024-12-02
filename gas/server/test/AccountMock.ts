export class AccountMock implements Bkper.Account {

    private name: string;


    constructor(name: string) {
        this.name = name;
    }


    addGroup(group: string | Bkper.Group): Bkper.Account {
        throw new Error("Method not implemented.");
    }
    create(): Bkper.Account {
        throw new Error("Method not implemented.");
    }
    deleteProperty(key: string): Bkper.Account {
        throw new Error("Method not implemented.");
    }
    getBalance(): Bkper.Amount {
        throw new Error("Method not implemented.");
    }
    getBalanceRaw(): Bkper.Amount {
        throw new Error("Method not implemented.");
    }
    getDescription(): string {
        throw new Error("Method not implemented.");
    }
    getGroups(): Bkper.Group[] {
        throw new Error("Method not implemented.");
    }
    getId(): string {
        throw new Error("Method not implemented.");
    }
    getName(): string {
        return this.name;
    }
    getNormalizedName(): string {
        throw new Error("Method not implemented.");
    }
    getProperties(): { [key: string]: string; } {
        throw new Error("Method not implemented.");
    }
    getProperty(...keys: string[]): string {
        throw new Error("Method not implemented.");
    }
    getPropertyKeys(): string[] {
        throw new Error("Method not implemented.");
    }
    getType(): Bkper.AccountType {
        throw new Error("Method not implemented.");
    }
    hasTransactionPosted(): boolean {
        throw new Error("Method not implemented.");
    }
    isActive(): boolean {
        throw new Error("Method not implemented.");
    }
    isArchived(): boolean {
        throw new Error("Method not implemented.");
    }
    isCredit(): boolean {
        throw new Error("Method not implemented.");
    }
    isInGroup(group: string | Bkper.Group): boolean {
        throw new Error("Method not implemented.");
    }
    isPermanent(): boolean {
        throw new Error("Method not implemented.");
    }
    remove(): Bkper.Account {
        throw new Error("Method not implemented.");
    }
    removeGroup(group: string | Bkper.Group): Bkper.Account {
        throw new Error("Method not implemented.");
    }
    setArchived(archived: boolean): Bkper.Account {
        throw new Error("Method not implemented.");
    }
    setGroups(groups: string[] | Bkper.Group[]): Bkper.Account {
        throw new Error("Method not implemented.");
    }
    setName(name: string): Bkper.Account {
        throw new Error("Method not implemented.");
    }
    setProperties(properties: { [key: string]: string; }): Bkper.Account {
        throw new Error("Method not implemented.");
    }
    setProperty(key: string, value: string): Bkper.Account {
        throw new Error("Method not implemented.");
    }
    setType(type: Bkper.AccountType): Bkper.Account {
        throw new Error("Method not implemented.");
    }
    update(): Bkper.Account {
        throw new Error("Method not implemented.");
    }

}