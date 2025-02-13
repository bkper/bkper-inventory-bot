namespace helper {

    export function getAccountQuery(goodAccountName: string, beforeDate?: string, afterDate?: string): string {
        let query = `account:'${goodAccountName}'`;

        if (afterDate) {
            query += ` after:${afterDate}`
        }

        if (beforeDate) {
            query += ` before:${beforeDate}`
        }
        return query;
    }

}