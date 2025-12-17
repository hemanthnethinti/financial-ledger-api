const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "1",
  database: process.env.DB_NAME || "ledger_db",
  port: 5432,
});

module.exports = pool;
