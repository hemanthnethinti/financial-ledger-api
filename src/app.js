const express = require("express");
const pool = require("./database/db");
const crypto = require("crypto");


const app = express();
app.use(express.json());

/**
 * CREATE ACCOUNT
 * POST /accounts
 */
app.post("/accounts", async (req, res) => {
  const { userId, accountType, currency } = req.body;

  if (!userId || !accountType || !currency) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const result = await pool.query(
      `
      INSERT INTO accounts (id, user_id, account_type, currency, status)
      VALUES ($1, $2, $3, $4, 'ACTIVE')
      RETURNING id, user_id, account_type, currency, status, created_at
      `,
     [crypto.randomUUID(), userId, accountType, currency]

    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create account" });
  }
});

/**
 * GET ACCOUNT + BALANCE
 * GET /accounts/:id
 */
app.get("/accounts/:id", async (req, res) => {
  const accountId = req.params.id;

  try {
    // Fetch account
    const accountResult = await pool.query(
      `SELECT * FROM accounts WHERE id = $1`,
      [accountId]
    );

    if (accountResult.rows.length === 0) {
      return res.status(404).json({ error: "Account not found" });
    }

    // Calculate balance from ledger
    const balanceResult = await pool.query(
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

    res.json({
      ...accountResult.rows[0],
      balance: balanceResult.rows[0].balance,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch account" });
  }
});
/**
 * DEPOSIT
 * POST /deposits
 */
app.post("/deposits", async (req, res) => {
  const { accountId, amount, description } = req.body;

  if (!accountId || !amount || amount <= 0) {
    return res.status(400).json({ error: "Invalid input" });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1. Check account exists and is active
    const accountResult = await client.query(
      "SELECT * FROM accounts WHERE id = $1 AND status = 'ACTIVE'",
      [accountId]
    );

    if (accountResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Account not found or inactive" });
    }

    const currency = accountResult.rows[0].currency;

    // 2. Create transaction record
    const transactionResult = await client.query(
      `
      INSERT INTO transactions (id, type, destination_account_id, amount, currency, status, description)
      VALUES ($1, 'DEPOSIT', $2, $3, $4, 'COMPLETED', $5)
      RETURNING id
      `,
      [crypto.randomUUID(), accountId, amount, currency, description || null]
    );

    const transactionId = transactionResult.rows[0].id;

    // 3. Create ledger CREDIT entry
    await client.query(
      `
      INSERT INTO ledger_entries (id, account_id, transaction_id, entry_type, amount)
      VALUES ($1, $2, $3, 'CREDIT', $4)
      `,
      [crypto.randomUUID(), accountId, transactionId, amount]
    );

    await client.query("COMMIT");

    res.status(201).json({
      message: "Deposit successful",
      transactionId,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Deposit failed" });
  } finally {
    client.release();
  }
});

/**
 * WITHDRAWAL
 * POST /withdrawals
 */
app.post("/withdrawals", async (req, res) => {
  const { accountId, amount, description } = req.body;

  if (!accountId || !amount || amount <= 0) {
    return res.status(400).json({ error: "Invalid input" });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1. Lock account row to prevent race conditions
    const accountResult = await client.query(
      "SELECT * FROM accounts WHERE id = $1 AND status = 'ACTIVE' FOR UPDATE",
      [accountId]
    );

    if (accountResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Account not found or inactive" });
    }

    const currency = accountResult.rows[0].currency;

    // 2. Calculate current balance from ledger
    const balanceResult = await client.query(
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

    const currentBalance = parseFloat(balanceResult.rows[0].balance);

    // 3. Prevent negative balance
    if (currentBalance < amount) {
      await client.query("ROLLBACK");
      return res.status(422).json({ error: "Insufficient funds" });
    }

    // 4. Create transaction record
    const transactionResult = await client.query(
      `
      INSERT INTO transactions (id, type, source_account_id, amount, currency, status, description)
      VALUES ($1, 'WITHDRAWAL', $2, $3, $4, 'COMPLETED', $5)
      RETURNING id
      `,
      [crypto.randomUUID(), accountId, amount, currency, description || null]
    );

    const transactionId = transactionResult.rows[0].id;

    // 5. Create DEBIT ledger entry
    await client.query(
      `
      INSERT INTO ledger_entries (id, account_id, transaction_id, entry_type, amount)
      VALUES ($1, $2, $3, 'DEBIT', $4)
      `,
      [crypto.randomUUID(), accountId, transactionId, amount]
    );

    await client.query("COMMIT");

    res.status(201).json({
      message: "Withdrawal successful",
      transactionId,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Withdrawal failed" });
  } finally {
    client.release();
  }
});

/**
 * TRANSFER
 * POST /transfers
 */
app.post("/transfers", async (req, res) => {
  const { sourceAccountId, destinationAccountId, amount, description } = req.body;

  if (!sourceAccountId || !destinationAccountId || !amount || amount <= 0) {
    return res.status(400).json({ error: "Invalid input" });
  }

  if (sourceAccountId === destinationAccountId) {
    return res.status(400).json({ error: "Source and destination cannot be same" });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1. Lock both accounts (order matters to avoid deadlocks)
    const accountsResult = await client.query(
      `
      SELECT * FROM accounts
      WHERE id IN ($1, $2) AND status = 'ACTIVE'
      ORDER BY id
      FOR UPDATE
      `,
      [sourceAccountId, destinationAccountId]
    );

    if (accountsResult.rows.length !== 2) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "One or both accounts not found or inactive" });
    }

    const sourceAccount = accountsResult.rows.find(a => a.id === sourceAccountId);
    const destinationAccount = accountsResult.rows.find(a => a.id === destinationAccountId);

    // 2. Currency check
    if (sourceAccount.currency !== destinationAccount.currency) {
      await client.query("ROLLBACK");
      return res.status(422).json({ error: "Currency mismatch" });
    }

    // 3. Calculate source balance
    const balanceResult = await client.query(
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
      [sourceAccountId]
    );

    const sourceBalance = parseFloat(balanceResult.rows[0].balance);

    if (sourceBalance < amount) {
      await client.query("ROLLBACK");
      return res.status(422).json({ error: "Insufficient funds" });
    }

    // 4. Create transaction record
    const transactionResult = await client.query(
      `
      INSERT INTO transactions (
        id, type, source_account_id, destination_account_id,
        amount, currency, status, description
      )
      VALUES ($1, 'TRANSFER', $2, $3, $4, $5, 'COMPLETED', $6)
      RETURNING id
      `,
      [
        crypto.randomUUID(),
        sourceAccountId,
        destinationAccountId,
        amount,
        sourceAccount.currency,
        description || null
      ]
    );

    const transactionId = transactionResult.rows[0].id;

    // 5. Create DEBIT entry (source)
    await client.query(
      `
      INSERT INTO ledger_entries (id, account_id, transaction_id, entry_type, amount)
      VALUES ($1, $2, $3, 'DEBIT', $4)
      `,
      [crypto.randomUUID(), sourceAccountId, transactionId, amount]
    );

    // 6. Create CREDIT entry (destination)
    await client.query(
      `
      INSERT INTO ledger_entries (id, account_id, transaction_id, entry_type, amount)
      VALUES ($1, $2, $3, 'CREDIT', $4)
      `,
      [crypto.randomUUID(), destinationAccountId, transactionId, amount]
    );

    await client.query("COMMIT");

    res.status(201).json({
      message: "Transfer successful",
      transactionId,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Transfer failed" });
  } finally {
    client.release();
  }
});

/**
 * GET ACCOUNT LEDGER
 * GET /accounts/:id/ledger
 */
app.get("/accounts/:id/ledger", async (req, res) => {
  const accountId = req.params.id;

  try {
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

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch ledger" });
  }
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});
