# Developer Notes

## Purpose

Why was it built this way?

This document captures the implementation thinking behind the current code: why key decisions were made, where complexity lives, what to avoid when changing behavior, and what should improve next.

## What System Does

This service handles basic account operations and money movement (`deposit`, `withdrawal`, `transfer`) with a ledger-first accounting model. The important part is that balances are computed from ledger entries, not updated as mutable counters.

If you are new to the codebase, think of it as a transactional ledger engine behind a REST API.

## Design Reasoning

- Ledger-first accounting was chosen so balance can always be reconstructed from immutable history.
- Transaction ownership lives in services so domain rules and commit/rollback behavior stay together.
- Row locking with deterministic ordering in transfers was chosen to reduce race conditions and deadlock risk.
- Strict validation at route boundaries keeps service code focused on business rules instead of input sanitation.

## Internal Model

The code follows a clear layered split:

- Routes define endpoint surface and attach validation middleware.
- Controllers handle request/response mapping.
- Services contain transaction-scoped business logic.
- Repositories contain SQL statements and DB access helpers.

Financial consistency model:

- Every write operation (`deposit`, `withdrawal`, `transfer`) runs inside one SQL transaction.
- Transfer writes two ledger entries (`DEBIT` + `CREDIT`) linked by one transaction record.
- Overdraft protection is enforced by runtime balance calculation before any debit.

This separation keeps controllers simple and concentrates correctness rules in the service layer.

## Important Implementation Details

### Connection lifecycle

- `src/database/db.js` initializes a singleton `pg.Pool`.
- Required env vars (`DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`) are validated at load time.
- Services call `pool.connect()`, then always `client.release()` in `finally`.

When debugging connection issues, start here first.

### Transaction handling

- Services explicitly issue `BEGIN`, `COMMIT`, and `ROLLBACK`.
- On any thrown error, rollback is attempted before propagating.
- Transfer locks both target accounts in deterministic order via `ORDER BY id FOR UPDATE` to reduce deadlock risk.

That lock ordering detail is intentional and should be preserved in future refactors.

### Balance model

- Balance query in `account.repository.getAccountBalance` computes:
  - `+amount` for `CREDIT`
  - `-amount` for `DEBIT`
- API account response formats balance as a fixed 2-decimal string.

Because balance is derived, historical ledger integrity directly impacts current account state.

### Request validation

- Joi schemas in `src/utils/validators.js` enforce UUIDs, allowed account/currency values, positive amounts, and transfer source/destination inequality.
- Validation middleware strips unknown fields and returns consistent `400` payloads.

Validation is intentionally strict so service code can assume sane input.

### Error normalization

- `AppError` is used for domain/business failures.
- Central middleware maps PostgreSQL error codes:
  - `23505` -> `409`
  - `23503` -> `404`
  - `23514` -> `422`
- Development mode includes stack traces in responses.

This keeps API behavior consistent even when failures come from different layers.

## Common Pitfalls

- `Dockerfile` currently executes `node src/app.js`, but listener bootstrap is in `src/server.js`; this can cause container runtime mismatch.
- Schema exists in two places (`migrations/*.sql` and `docker/init.sql`). Updating one without the other causes drift between local/manual and Docker-based setups.
- `migrations/` scripts omit some checks that are present in `docker/init.sql` (for example, `amount > 0` and allowed `entry_type`), so relying on one source only can change behavior.
- Tests assume a real PostgreSQL instance and truncate real tables; avoid running against shared/non-ephemeral databases.
- Transfer flow depends on account status being `ACTIVE` because lock/read queries filter on that status.

If you change transaction or ledger logic, rerun the integration test suite and manually inspect ledger rows for at least one transfer path.

## How to Extend the System

### Add a new endpoint

1. Define request schema in `src/utils/validators.js`.
2. Add route in `src/routes/*.routes.js` with `validate(...)` middleware.
3. Implement controller handler in `src/controllers/*`.
4. Implement business logic in `src/services/*`.
5. Add/adjust repository SQL methods in `src/database/*`.
6. Add integration tests in `tests/api.test.js`.

Keep controllers thin. If a controller starts accumulating business branching, move it down to a service.

### Add a new financial operation

- Keep all related writes inside one DB transaction.
- Lock necessary rows before checking balances when debits are involved.
- Preserve immutable-ledger pattern: append entries, do not mutate historical ledger rows.
- Return domain errors via `AppError` with explicit status codes.

For any operation that both debits and credits, design for atomicity first and convenience second.

### Add or change tables

- Update both `migrations/` and `docker/init.sql`.
- Keep constraints consistent across both schema paths.
- Add repository functions first, then service orchestration, then endpoint wiring.

If constraints change, confirm error mapping still produces the intended HTTP status code.

## Potential Improvements

- Align `Dockerfile` startup command with the actual server bootstrap (`src/server.js`).
- Consolidate schema management so `migrations/` and `docker/init.sql` cannot drift.
- Add targeted DB indexes for ledger-heavy reads (`account_id`, `created_at`).
- Add explicit concurrency tests for transfer behavior under parallel load.
- Add a migration runner to reduce manual schema setup steps.

## If the Code Was Lost

High-level rebuild plan, in practical order:

1. Recreate project scaffolding with Express, pg, Joi, Jest, and Supertest.
2. Rebuild schema with three tables:
   - `accounts`
   - `transactions`
   - `ledger_entries`
     plus UUID support and foreign keys.
3. Recreate runtime composition:
   - `app.js` for middleware/routes/errors
   - `server.js` for DB check + `listen()`
4. Reimplement service transactions:
   - deposit -> transaction + credit entry
   - withdrawal -> balance check + transaction + debit entry
   - transfer -> dual account lock + checks + dual ledger entries
5. Recreate validation middleware and central error handler.
6. Rebuild integration tests that validate account creation, transfers, overdraft rejection, ledger retrieval, and 404 behavior.
7. Recreate Docker assets (`Dockerfile`, `docker-compose.yml`, DB init SQL) and verify startup/runtime behavior.

The fastest way to validate the rebuild is to run the existing integration scenarios end-to-end and compare resulting ledger rows with expected accounting outcomes.
