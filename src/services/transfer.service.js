const pool = require("../database/db");
const accountRepo = require("../database/account.repository");
const transactionRepo = require("../database/transaction.repository");
const { AppError } = require("../middleware/errorHandler");

/**
 * Transfer Service - Business logic for transfer operations
 */

const processTransfer = async (sourceAccountId, destinationAccountId, amount, description) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1. Lock both accounts (order matters to avoid deadlocks)
    const accounts = await accountRepo.getAccountsForUpdate(
      client,
      [sourceAccountId, destinationAccountId]
    );

    if (accounts.length !== 2) {
      await client.query("ROLLBACK");
      throw new AppError('One or both accounts not found or inactive', 404);
    }

    const sourceAccount = accounts.find(a => a.id === sourceAccountId);
    const destinationAccount = accounts.find(a => a.id === destinationAccountId);

    // 2. Currency check
    if (sourceAccount.currency !== destinationAccount.currency) {
      await client.query("ROLLBACK");
      throw new AppError('Currency mismatch', 422);
    }

    // 3. Calculate source balance
    const sourceBalance = await accountRepo.getAccountBalance(client, sourceAccountId);

    if (sourceBalance < amount) {
      await client.query("ROLLBACK");
      throw new AppError('Insufficient funds', 422);
    }

    // 4. Create transaction record
    const transactionId = await transactionRepo.createTransaction(client, "TRANSFER", {
      sourceAccountId,
      destinationAccountId,
      amount,
      currency: sourceAccount.currency,
      description
    });

    // 5. Create DEBIT entry (source)
    await transactionRepo.createLedgerEntry(
      client,
      sourceAccountId,
      transactionId,
      "DEBIT",
      amount
    );

    // 6. Create CREDIT entry (destination)
    await transactionRepo.createLedgerEntry(
      client,
      destinationAccountId,
      transactionId,
      "CREDIT",
      amount
    );

    await client.query("COMMIT");

    return {
      message: "Transfer successful",
      transactionId
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
};

module.exports = {
  processTransfer,
};
