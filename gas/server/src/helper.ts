namespace helper {

    export function getAccountQuery(goodAccountName: string, beforeDate?: string): string {
        let query = `account:'${goodAccountName}'`;

        if (beforeDate) {
            query += ` before:${beforeDate}`
        }
        return query;
    }

}