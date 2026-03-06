# System Architecture

## Purpose

How does the system behave internally?

This document explains the internal runtime behavior of the API: component boundaries, request lifecycle, persistence model, and operational tradeoffs.

## High-Level System Design

This codebase is a small but disciplined ledger service. At runtime, it behaves like a pipeline: HTTP request in, validation and orchestration in Node/Express, transactional writes in PostgreSQL.

The main design choice is that balances are never treated as writable state. They are derived from immutable ledger rows (`ledger_entries`). That keeps the accounting model auditable and avoids balance drift caused by partial updates.

```text
Client (HTTP)
  |
  v
Express API Layer (app.js + routes + controllers)
  |
  v
Service Layer (business rules + SQL transactions)
  |
  v
Database Layer (repositories + pg pool)
  |
  v
PostgreSQL (accounts, transactions, ledger_entries)
```

Notes about architecture boundaries:

- API layer does not execute raw SQL.
- Service layer owns business rules and transaction boundaries.
- Repository layer owns SQL queries and row-level locking statements.
- There is no cache, message broker, or external service integration in current implementation.

## Request Flow

Example flow for `POST /transfers` (the most constrained path in the system):

1. Client sends request with `sourceAccountId`, `destinationAccountId`, and `amount`.
2. Route (`src/routes/transaction.routes.js`) applies Joi validation middleware (`transferSchema`).
3. Controller (`src/controllers/transaction.controller.js`) rejects transfer-to-self before touching the database.
4. Service (`src/services/transfer.service.js`) acquires a DB client and starts `BEGIN`.
5. Service locks both accounts with `SELECT ... FOR UPDATE ORDER BY id`.
6. Service validates account existence/status, currency match, and source balance.
7. Service writes one `transactions` row (`type='TRANSFER'`, `status='COMPLETED'`).
8. Service writes two immutable `ledger_entries` rows:
   - source `DEBIT`
   - destination `CREDIT`
9. Service commits (`COMMIT`) and returns `201` with `transactionId`.
10. If anything fails, service rolls back (`ROLLBACK`), releases the client, and middleware formats the error response.

Deposits and withdrawals follow the same shape, but with simpler rule sets.

## Core Components

### Application Bootstrap

`src/server.js` is the process bootstrap used by `npm start` and `npm run dev`. Before opening the HTTP port, it runs a DB connectivity probe (`SELECT NOW()`). If this fails, the process exits instead of serving partially healthy traffic.

### API Layer

- `src/app.js` wires middleware ordering: JSON parser, health endpoint, domain routes, 404 handler, then error middleware.
- `src/routes/*.js` defines endpoint contracts and attaches Joi validation.
- `src/controllers/*.js` keeps handlers thin and delegates behavior to services.

### Validation

`src/utils/validators.js` is the request contract boundary. It validates UUIDs, allowed account/currency enums, positive decimal amounts, and source/destination inequality for transfers. Invalid payloads fail fast with `400` and detailed field messages.

### Service Layer

This is where domain rules live:

- `account.service.js`: account creation plus balance/ledger reads.
- `deposit.service.js`: active-account check and credit posting.
- `withdrawal.service.js`: active-account check, balance guard, debit posting.
- `transfer.service.js`: ordered account locking, currency check, funds check, and dual ledger posting.

All write-oriented services explicitly own transaction lifecycle.

### Database Layer

- `src/database/db.js` builds a shared `pg.Pool` and enforces required DB env vars at startup.
- `account.repository.js` encapsulates account reads/inserts and balance aggregation SQL.
- `transaction.repository.js` inserts transaction metadata plus immutable ledger entries.

### Error Handling

`src/middleware/errorHandler.js` normalizes failures so callers get stable HTTP semantics. Business errors use `AppError`, and selected PostgreSQL errors are mapped into API-friendly status codes (`23505`, `23503`, `23514`).

## Data Model

Primary tables are created by `docker/init.sql` and mirrored by scripts in `migrations/`.

### `accounts`

- `id UUID PRIMARY KEY`
- `user_id UUID NOT NULL`
- `account_type VARCHAR(20) NOT NULL`
- `currency CHAR(3) NOT NULL`
- `status VARCHAR(20) NOT NULL`
- `created_at TIMESTAMP DEFAULT now()`

### `transactions`

- `id UUID PRIMARY KEY`
- `type VARCHAR(20) NOT NULL`
- `source_account_id UUID NULL`
- `destination_account_id UUID NULL`
- `amount NUMERIC(18,4) NOT NULL`
- `currency CHAR(3) NOT NULL`
- `status VARCHAR(20) NOT NULL`
- `description TEXT NULL`
- `created_at TIMESTAMP DEFAULT now()`

### `ledger_entries`

- `id UUID PRIMARY KEY`
- `account_id UUID NOT NULL REFERENCES accounts(id)`
- `transaction_id UUID NOT NULL REFERENCES transactions(id)`
- `entry_type VARCHAR(6) NOT NULL` (`DEBIT` or `CREDIT`)
- `amount NUMERIC(18,4) NOT NULL`
- `created_at TIMESTAMP DEFAULT now()`

Domain relationships:

- One account has many ledger entries.
- One transaction has one or more ledger entries.
- Balance is computed from ledger entries (`CREDIT - DEBIT`) and is not stored on `accounts`.

In practice, that last point is the core invariant of the system.

## Scalability Considerations

Current behavior:

- API tier is stateless and can be horizontally scaled.
- Data consistency is protected by DB transactions and row-level locks.

Likely scaling constraints:

- Hot-account contention due to `FOR UPDATE` locking.
- Balance aggregation on large `ledger_entries` volumes.
- No explicit indexes for common read paths beyond primary keys.

Practical next steps for scale:

- Add targeted indexes such as `ledger_entries(account_id, created_at)`.
- Tune pg pool size per API instance.
- Consider read-optimized balance projections if throughput outgrows live aggregation.
- Put API instances behind a load balancer.

Today, correctness is prioritized over peak throughput, which is generally the right tradeoff for financial workflows.

## Failure Handling

Input and business rule failures:

- Joi validation errors return `400` with structured details.
- Missing/inactive account errors return `404`.
- Insufficient funds and currency mismatch return `422`.
- Same-account transfer returns `400`.

Database/transaction failures:

- Write operations always use try/catch with `ROLLBACK` on error.
- DB startup failure in `server.js` exits process (`process.exit(1)`).
- PostgreSQL constraint errors are mapped by middleware to API-friendly status codes.

Routing and unknown paths:

- Unmatched routes return `404 { error: "Route not found" }`.

Operationally, this means callers see predictable error categories even when failures originate at different layers.
