const pool = require("../database/db");
const accountRepo = require("../database/account.repository");
const transactionRepo = require("../database/transaction.repository");
const { AppError } = require("../middleware/errorHandler");

/**
 * Withdrawal Service - Business logic for withdrawal operations
 */

const processWithdrawal = async (accountId, amount, description) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1. Lock account row and check exists
    const account = await accountRepo.getAccountByIdForUpdate(client, accountId);

    if (!account) {
      await client.query("ROLLBACK");
      throw new AppError('Account not found or inactive', 404);
    }

    // 2. Calculate current balance from ledger
    const currentBalance = await accountRepo.getAccountBalance(client, accountId);

    // 3. Prevent negative balance
    if (currentBalance < amount) {
      await client.query("ROLLBACK");
      throw new AppError('Insufficient funds', 422);
    }

    // 4. Create transaction record
    const transactionId = await transactionRepo.createTransaction(client, "WITHDRAWAL", {
      sourceAccountId: accountId,
      amount,
      currency: account.currency,
      description
    });

    // 5. Create DEBIT ledger entry
    await transactionRepo.createLedgerEntry(
      client,
      accountId,
      transactionId,
      "DEBIT",
      amount
    );

    await client.query("COMMIT");

    return {
      message: "Withdrawal successful",
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
  processWithdrawal,
};
