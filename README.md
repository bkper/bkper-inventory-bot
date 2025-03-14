# Bkper Inventory Agent

## Overview

The Inventory Agent monitors transactions in Financial Books and automatically tracks inventory items in a separate Inventory Book. Key features include:

- Automatic synchronization between Financial Books and the Inventory Book
- Cost of Goods Sold (COGS) tracking using the FIFO (First-In, First-Out) method
- Support for additional costs and credit notes
- Clean inventory management with purchase and sale tracking
- Detailed transaction history with purchase and liquidation logs

## Configuration

To configure the Bkper Inventory Agent, ensure the following setup:

### Collection:
   - Both Financial and Inventory Books must reside within the same [Collection](https://help.bkper.com/en/articles/4208937-collections).
   - Define a single Inventory Book per Collection. This book is identified by either:
     - Setting the **decimal places to 0 (zero)** in the book settings, or
     - Setting the `inventory_book` property to `true`.

### Properties Interactions:

   The Inventory Agent interacts with various properties to manage and synchronize data effectively. Ensure these properties are correctly set in your books for optimal performance.

   **Book Properties**:
   - **Financial Books**:
     - `exc_code`: **Required** - The exchange code representing the book currency.
   - **Inventory Book**:
     - `inventory_book`: **Optional** - true/false - Identifies the Inventory book of the collection. If not present, decimal places must be set to 0 (zero) in the book settings.

   **Group Properties**:
   - `exc_code`: **Required** - Defines the exchange code representing the currency of the group.

   **Transaction Properties**:
   - `good`: **Required** - The name or identifier of the inventory item.
   - `quantity`: **Required** - The quantity of the inventory item in the transaction.
   - `purchase_code`: **Optional** - A unique code for purchase transactions, helpful for tracking across books.
   - `purchase_invoice`: **Optional** - Reference to the purchase invoice number.
   - `sale_invoice`: **Optional** - Reference to the sale invoice number.
   - `credit_note`: **Optional** - Indicates this transaction is a credit note.
   - `order`: **Optional** - The order of the operation if multiple operations happened on the same day.

## Cost of Sales Service

The Inventory Agent uses the FIFO ([First-In, First-Out](https://medium.com/magnimetrics/first-in-first-out-fifo-inventory-costing-f0bc00096a59)) method to calculate Cost of Goods Sold, ensuring accurate tracking of inventory costs.

### Key Features:

- **Automatic COGS Calculation**: When a sale transaction is detected, the agent automatically determines the cost of the goods sold based on the oldest purchases still in inventory.

- **Purchase and Liquidation Logs**: The agent maintains detailed logs of all purchase and sale transactions, providing an audit trail of inventory movements.

- **Additional Costs Support**: The system can account for additional costs associated with inventory items, ensuring accurate cost calculations.

- **Credit Notes Handling**: Support for credit notes allows for proper adjustment of inventory when goods are returned.

**Important:**
The Inventory Agent automatically adds properties to transactions in the Inventory Book when calculating cost of sales. These properties are used for state and log control. It also manages transaction states by checking/unchecking transactions (see [Transaction States](https://help.bkper.com/en/articles/2569149-transaction-status)). These properties and states **must not** be manually altered.

## Using the Inventory Agent

To use the Inventory Agent:

1. **Set up your books**: Ensure your Financial Books and Inventory Book are properly configured with the required properties.

2. **Record transactions**: When recording purchase and sale transactions in your Financial Books, include the required properties (`good`, `quantity`, etc.).

3. **Calculate COGS**: Use the agent's interface to calculate Cost of Goods Sold for inventory accounts. This can be done for:
   - A specific account
   - All accounts in a group
   - All inventory accounts

4. **Review results**: The agent provides detailed results of its calculations, showing the cost of goods sold for each account.

5. **Reset if needed**: If you need to recalculate COGS for any reason, you can use the reset function to clear previous calculations and start fresh.