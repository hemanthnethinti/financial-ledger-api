const pool = require("../database/db");
const accountRepo = require("../database/account.repository");
const transactionRepo = require("../database/transaction.repository");
const { AppError } = require("../middleware/errorHandler");

/**
 * Account Service
 * ---------------
 * Encapsulates account creation and retrieval with balance calculation.
 */

const createAccount = async (userId, accountType, currency) => {
  const account = await accountRepo.createAccount(userId, accountType, currency);
  return account;
};

const getAccountWithBalance = async (accountId) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const accountResult = await client.query(
      `SELECT * FROM accounts WHERE id = $1`,
      [accountId]
    );
    const account = accountResult.rows[0];

    if (!account) {
      await client.query("ROLLBACK");
      throw new AppError('Account not found', 404);
    }

    const balance = await accountRepo.getAccountBalance(client, accountId);

    await client.query("COMMIT");

    return { ...account, balance: parseFloat(balance).toFixed(2) };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
};

const getAccountLedger = async (accountId) => {
  // Check if account exists
  const account = await accountRepo.getAccountById(accountId);
  if (!account) {
    throw new AppError('Account not found', 404);
  }

  const ledgerEntries = await transactionRepo.getLedgerEntries(accountId);
  return ledgerEntries;
};

module.exports = {
  createAccount,
  getAccountWithBalance,
  getAccountLedger,
};
