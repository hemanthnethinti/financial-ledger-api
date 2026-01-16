const pool = require("./db");
const crypto = require("crypto");

/**
 * Account Repository - Handles all account-related database operations
 */

const getAccountById = async (accountId) => {
  const result = await pool.query(
    `SELECT * FROM accounts WHERE id = $1`,
    [accountId]
  );
  return result.rows[0];
};

const getAccountByIdForUpdate = async (client, accountId) => {
  const result = await client.query(
    `SELECT * FROM accounts WHERE id = $1 AND status = 'ACTIVE' FOR UPDATE`,
    [accountId]
  );
  return result.rows[0];
};

const getAccountsForUpdate = async (client, accountIds) => {
  const result = await client.query(
    `SELECT * FROM accounts WHERE id = ANY($1) AND status = 'ACTIVE' ORDER BY id FOR UPDATE`,
    [accountIds]
  );
  return result.rows;
};

const createAccount = async (userId, accountType, currency) => {
  const result = await pool.query(
    `
    INSERT INTO accounts (id, user_id, account_type, currency, status)
    VALUES ($1, $2, $3, $4, 'ACTIVE')
    RETURNING id, user_id, account_type, currency, status, created_at
    `,
    [crypto.randomUUID(), userId, accountType, currency]
  );
  return result.rows[0];
};

const getAccountBalance = async (client, accountId) => {
  const result = await client.query(
    `
    SELECT COALESCE(
      SUM(
        CASE
          WHEN entry_type = 'CREDIT' THEN amount
          ELSE -amount
        END
      ), 0
    ) AS balance
    FROM ledger_entries
    WHERE account_id = $1
    `,
    [accountId]
  );
  return parseFloat(result.rows[0].balance);
};

module.exports = {
  getAccountById,
  getAccountByIdForUpdate,
  getAccountsForUpdate,
  createAccount,
  getAccountBalance,
};
