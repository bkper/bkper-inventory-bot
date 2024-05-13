import { Book } from "bkper";
import { InterceptorOrderProcessorDelete } from "./InterceptorOrderProcessorDelete";
import { Result } from ".";
import { ADDITIONAL_COST_PROP, ADDITIONAL_COST_TX_IDS, GOOD_PROP, PURCHASE_CODE_PROP } from "./constants";
import { getGoodPurchaseRootTx } from "./BotService";

export class InterceptorOrderProcessorDeleteFinancial extends InterceptorOrderProcessorDelete {

    async intercept(financialBook: Book, event: bkper.Event): Promise<Result> {

        let operation = event.data.object as bkper.TransactionOperation;
        let transactionPayload = operation.transaction;

        if (!transactionPayload.posted) {
            return { result: false };
        }

        let responses: string[] = [];

        // SE: transação deletada for ADDITIONAL COST FILHA: TEM REMOTEID COMEÇANDO COM additional_cost
        // 2) Atualiza custo na transacao no livro Inventory -> pelo purchase_code
        // 1) Deleta transacao raiz -> pelo remoteId removendo "additional_cost"

        // Deleted transaction is the additional cost transaction posted by the user (from supplier to buyer)
        // Delete second transaction posted by the bot (from buyer to good account)
        const response1 = await this.deleteTransaction(financialBook, `${ADDITIONAL_COST_PROP}_${transactionPayload.id}`);
        if (response1) {
            // Update add_cost_transactions property value
            await this.removeAdditionalCostFromGoodTx(financialBook, transactionPayload.properties[PURCHASE_CODE_PROP], transactionPayload.id);
            responses.push(await this.buildDeleteResponse(response1));
        }

        // SE: Transação deletada for transacao de COMPRA PRODUTO FILHA: TEM REMOTEID COMEÇANDO COM good_
        // 1) Deleta transacao raiz
        // 2) Deleta transações de ADDITIONAL COST vinculadas
        // 3) Deleta transação compra do livro inventory
        // 4) Sinaliza recalculo do FIFO

        // SE: Transação deletada for transacao de COMPRA PRODUTO RAIZ: TEM purchase_code == purchase_invoice
        // 1) Deleta transacao filha (FAZER UNCHECK ANTES)
        // 2) Deleta transações de ADDITIONAL COST vinculadas
        // 3) Deleta transação compra do livro inventory
        // 4) Sinaliza recalculo do FIFO


        // let response2 = await this.deleteTransaction(financialBook, `${INTEREST_PROP}_${transactionPayload.id}`);
        // if (response2) {
        //     responses.push(await this.buildDeleteResponse(response2));
        // }
        // let response3 = await this.deleteTransaction(financialBook, `${GOOD_PROP}_${transactionPayload.id}`);
        // if (response3) {
        //     await this.deleteOnInventoryBook(financialBook, response3.getId());
        // } else {
        //     await this.deleteOnInventoryBook(financialBook, transactionPayload.id);
        // }

        return { result: responses.length > 0 ? responses : false };
    }

    private async removeAdditionalCostFromGoodTx(baseBook: Book, purchaseCodeProp: string, additionalCostTxId: string): Promise<void> {
        const rootPurchaseTx = await getGoodPurchaseRootTx(baseBook, purchaseCodeProp);
        if (rootPurchaseTx) {
            let additionalCostTxIds = rootPurchaseTx.getProperty(ADDITIONAL_COST_TX_IDS);
            if (additionalCostTxIds) {
                let remoteIds: string[] = JSON.parse(additionalCostTxIds);
                const index = remoteIds.indexOf(additionalCostTxId);
                if (index != -1) {
                    remoteIds.splice(index, 1);
                }
                additionalCostTxIds = remoteIds.length > 0 ? JSON.stringify(remoteIds) : '';
                await rootPurchaseTx.setProperty(ADDITIONAL_COST_TX_IDS, additionalCostTxIds).update();
            }
        }
    }
}
