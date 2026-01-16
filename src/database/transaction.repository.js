const pool = require("./db");
const crypto = require("crypto");

/**
 * Transaction Repository - Handles all transaction-related database operations
 */

const createTransaction = async (client, type, payload) => {
  const {
    sourceAccountId,
    destinationAccountId,
    amount,
    currency,
    description
  } = payload;

  const result = await client.query(
    `
    INSERT INTO transactions (
      id, type, source_account_id, destination_account_id,
      amount, currency, status, description
    )
    VALUES ($1, $2, $3, $4, $5, $6, 'COMPLETED', $7)
    RETURNING id
    `,
    [
      crypto.randomUUID(),
      type,
      sourceAccountId || null,
      destinationAccountId || null,
      amount,
      currency,
      description || null
    ]
  );

  return result.rows[0].id;
};

const createLedgerEntry = async (client, accountId, transactionId, entryType, amount) => {
  const result = await client.query(
    `
    INSERT INTO ledger_entries (id, account_id, transaction_id, entry_type, amount)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id
    `,
    [crypto.randomUUID(), accountId, transactionId, entryType, amount]
  );
  return result.rows[0].id;
};

const getLedgerEntries = async (accountId) => {
  const result = await pool.query(
    `
    SELECT
      le.id,
      le.transaction_id,
      le.entry_type,
      le.amount,
      le.created_at
    FROM ledger_entries le
    WHERE le.account_id = $1
    ORDER BY le.created_at ASC
    `,
    [accountId]
  );
  return result.rows;
};

module.exports = {
  createTransaction,
  createLedgerEntry,
  getLedgerEntries,
};
