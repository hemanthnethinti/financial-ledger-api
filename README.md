# Financial Ledger API
## Overview

The API supports account creation, deposits, withdrawals, and transfers. Instead of storing mutable balances on account rows, it derives balance from ledger entries (`CREDIT - DEBIT`) so financial state can be reconstructed from history.

## Key Features

- Account creation with strict Joi validation.
- Deposit, withdrawal, and transfer operations.
- Double-entry transfer posting (`DEBIT` + `CREDIT`).
- Balance computed from immutable ledger entries.
- Overdraft prevention on debit paths.
- Transactional write safety (`BEGIN`/`COMMIT`/`ROLLBACK`).
- Row-level locking for transfer consistency (`FOR UPDATE`, ordered locking).
- Centralized error handling and validation responses.

## Tech Stack

- Language: JavaScript (Node.js)
- Framework: Express 5
- Validation: Joi
- Database: PostgreSQL 15
- Database driver: `pg`
- Testing: Jest, Supertest
- Infrastructure: Docker, Docker Compose
- Messaging systems: none

## Project Structure

```text
.
├── src/
│   ├── app.js                     # Express composition (middleware, routes)
│   ├── server.js                  # Process bootstrap + DB connectivity check
│   ├── routes/                    # HTTP route definitions
│   ├── controllers/               # Request/response handlers
│   ├── services/                  # Business logic + transaction orchestration
│   ├── database/                  # pg pool + repository SQL
│   ├── middleware/                # Error and async middleware
│   └── utils/                     # Validation schemas and shared constants
├── migrations/                    # SQL migration scripts
├── docker/
│   └── init.sql                   # Container DB initialization script
├── tests/
│   └── api.test.js                # Integration tests
├── Dockerfile
├── docker-compose.yml
├── .env.example
└── README.md
```

## Setup Instructions

### Prerequisites

- Node.js 18+
- npm
- PostgreSQL 15+
- Docker + Docker Compose (optional)

### Installation

```bash
npm install
```

### Environment Variables

Create `.env` from `.env.example`.

```bash
copy .env.example .env
```

Required variables:

- `DB_HOST`: PostgreSQL host
- `DB_USER`: PostgreSQL user
- `DB_PASSWORD`: PostgreSQL password
- `DB_NAME`: database name

Optional variables:

- `PORT` (default `3000`)
- `NODE_ENV` (controls development stack traces)

### Running Locally

1. Create/start PostgreSQL database (`ledger_db`).
2. Apply schema:

```bash
psql -U postgres -d ledger_db -f docker/init.sql
```

3. Start API:

```bash
npm start
```

Server URL: `http://localhost:3000`

### Running with Docker

```bash
docker compose up --build
```

Services:

- API: `http://localhost:3000`
- PostgreSQL: `localhost:5432`

Note: `Dockerfile` currently starts `src/app.js`. Production bootstrap is in `src/server.js`.

## API Overview

### Health

- `GET /health` -> returns `{ status, timestamp }`

### Accounts

- `POST /accounts` -> create account
- `GET /accounts/:id` -> account details with computed balance
- `GET /accounts/:id/ledger` -> ledger entries for account

### Transactions

- `POST /deposits` -> credit account
- `POST /withdrawals` -> debit account (insufficient funds returns `422`)
- `POST /transfers` -> move funds between two accounts

## Verification Steps

Run automated tests:

```bash
npm test
```

Manual checks:

1. Health

```bash
curl -s http://localhost:3000/health
```

2. Create account

```bash
curl -s -X POST http://localhost:3000/accounts \
  -H "Content-Type: application/json" \
  -d "{\"userId\":\"123e4567-e89b-12d3-a456-426614174000\",\"accountType\":\"CHECKING\",\"currency\":\"USD\"}"
```

3. Deposit

```bash
curl -s -X POST http://localhost:3000/deposits \
  -H "Content-Type: application/json" \
  -d "{\"accountId\":\"<ACCOUNT_ID>\",\"amount\":100.00,\"description\":\"initial\"}"
```

4. Overdraft rejection

```bash
curl -s -X POST http://localhost:3000/withdrawals \
  -H "Content-Type: application/json" \
  -d "{\"accountId\":\"<ACCOUNT_ID>\",\"amount\":999999}"
```

Expected result: `422` with `Insufficient funds`.

## Deployment Notes

- Containerization is available via `Dockerfile` and `docker-compose.yml`.
- Database schema is initialized in containers from `docker/init.sql`.
- For non-container execution, use `npm start` (`src/server.js`).
- Before production deployment, align container startup command with `src/server.js` and add health/readiness checks in your orchestrator.