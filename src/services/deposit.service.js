const pool = require("../database/db");
const accountRepo = require("../database/account.repository");
const transactionRepo = require("../database/transaction.repository");
const { AppError } = require("../middleware/errorHandler");

/**
 * Deposit Service - Business logic for deposit operations
 */

const processDeposit = async (accountId, amount, description) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1. Check account exists and is active
    const account = await accountRepo.getAccountByIdForUpdate(client, accountId);

    if (!account) {
      await client.query("ROLLBACK");
      throw new AppError('Account not found or inactive', 404);
    }

    // 2. Create transaction record
    const transactionId = await transactionRepo.createTransaction(client, "DEPOSIT", {
      destinationAccountId: accountId,
      amount,
      currency: account.currency,
      description
    });

    // 3. Create ledger CREDIT entry
    await transactionRepo.createLedgerEntry(
      client,
      accountId,
      transactionId,
      "CREDIT",
      amount
    );

    await client.query("COMMIT");

    return {
      message: "Deposit successful",
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
  processDeposit,
};
