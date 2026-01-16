const { Pool } = require("pg");

const required = ["DB_HOST", "DB_USER", "DB_PASSWORD", "DB_NAME"];

required.forEach((key) => {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
});

const pool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: 5432,
});

module.exports = pool;
