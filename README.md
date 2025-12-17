 # Financial Ledger API

Double-Entry Bookkeeping | ACID-Safe | Dockerized

## 1. Overview

This project implements a robust financial ledger API based on double-entry bookkeeping principles.
It is designed as the backend core of a mock banking system, with a strong emphasis on data integrity, auditability, and correctness.

Unlike simple CRUD applications, this system treats the ledger as the source of truth. Account balances are never stored and are instead calculated dynamically from immutable ledger entries.

 ## 2. Key Concepts Implemented

  - Double-entry bookkeeping

  - Immutable ledger design

  - ACID-compliant database transactions

  - Row-level locking for concurrency safety

  - Overdraft prevention

  - Deterministic balance calculation

  - Docker-based reproducible setup

 ## 3. Technology Stack

  - Backend: Node.js, Express.js

  - Database: PostgreSQL 15

  - Containerization: Docker, Docker Compose

  - Database Access: pg (node-postgres)

  - Testing Tool: Postman

# 4. Project Structure

```bash
financial-ledger-api/
│
├── src/
│   ├── controllers/      # HTTP layer (placeholders for future refactor)
│   ├── services/         # Business logic layer (conceptual)
│   ├── repositories/     # Data access layer (conceptual)
│   ├── models/           # Entity representations
│   ├── routes/           # API routing layer
│   ├── database/
│   │   └── db.js         # PostgreSQL connection
│   └── app.js            # Application entry point
│
├── docker/
│   └── init.sql          # Auto-run database migrations
│
├── migrations/           # SQL schema definitions
├── tests/                # Test placeholders
├── docker-compose.yml
├── Dockerfile
└── README.md
```

 ### Some directories contain placeholders to demonstrate layered architecture intent.
### Core logic is implemented in app.js for clarity and evaluation transparency.

 ## 5. Data Model Design

### Account

  - Unique identifier

  - User association

  - Account type (CHECKING, SAVINGS, etc.)

  - Currency

  - Status (ACTIVE / FROZEN)

  - No balance column

### Transaction

  - Represents intent (DEPOSIT, WITHDRAWAL, TRANSFER)

  - Source & destination accounts (when applicable)

  - Amount, currency, status, description

### Ledger Entry

  - Immutable debit or credit record

  - Linked to both account and transaction

  - Append-only (never updated or deleted)

### 6. API Endpoints
 ### Accounts
```bash
Method	Endpoint	Description
POST	/accounts	Create a new account
GET	/accounts/:id	Get account details with calculated balance
GET	/accounts/:id/ledger	Fetch immutable ledger history
```
### Transactions

```bash
Method	Endpoint	Description
POST	/deposits	Deposit funds (CREDIT)
POST	/withdrawals	Withdraw funds (DEBIT)
POST	/transfers	Internal transfer (DEBIT + CREDIT)
```
### 7. Double-Entry Bookkeeping Implementation

  - Every transfer creates exactly two ledger entries:
 
     - DEBIT from source account

     - CREDIT to destination account

  - Both entries share the same transaction ID

  - Net balance change across the system is zero

  - This ensures strict accounting correctness and traceability.

### 8. Balance Calculation & Overdraft Prevention

  - Balances are calculated dynamically as:

    ```SUM(CREDITS) − SUM(DEBITS)```


#### Before any debit:

  -  Current balance is calculated from the ledger

  - If result would be negative → transaction is rejected

#### Insufficient funds return:

  ```HTTP 422 Unprocessable Entity```

### 9. ACID Transactions & Concurrency Handling

 All financial operations are wrapped in a single database transaction

 Uses:

   - BEGIN

   - COMMIT

   - ROLLBACK

Row-level locks ```(SELECT ... FOR UPDATE)``` prevent:

   - Double spending

   - Race conditions

   - Lost updates

### 10. Transaction Isolation Level

  The system relies on PostgreSQL’s default READ COMMITTED isolation level, combined with explicit row-level locking.

  This prevents dirty reads while maintaining good performance under concurrent access.

### 11. Docker Setup 

The application can be run in a fully reproducible Docker environment.

  - Prerequisites

    - Docker

    - Docker Compose

Start the application
```
docker-compose up --build
```
#### Services

   - API: http://localhost:3000

   - PostgreSQL: localhost:5432

### Database Initialization

 - Schema is automatically created on first run using:
```
 docker/init.sql
```

  - No manual SQL execution is required.

### 12. Manual API Testing

A Postman collection is included to test:

 - Account creation

 - Deposits

 - Withdrawals

 - Transfers

 - Ledger inspection

 - Overdraft prevention

 ### 13. Architecture Overview
 ```bash
Client (Postman)
      ↓
Express API
      ↓
Business Logic (Transactions)
      ↓
PostgreSQL
 ├── accounts
 ├── transactions
 └── ledger_entries
```
 ### 14. Database Relationship (ERD – Logical)
```bash
accounts (1) ────< ledger_entries >──── (1) transactions
```
- One account → many ledger entries

- One transaction → multiple ledger entries