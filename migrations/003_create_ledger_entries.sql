-- Migration: Create ledger_entries table
-- Immutable ledger storing debit and credit records.

CREATE TABLE IF NOT EXISTS ledger_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID NOT NULL,
    transaction_id UUID NOT NULL,
    entry_type VARCHAR(6) NOT NULL,
    amount NUMERIC(18,4) NOT NULL,
    created_at TIMESTAMP DEFAULT now(),
    FOREIGN KEY (account_id) REFERENCES accounts(id),
    FOREIGN KEY (transaction_id) REFERENCES transactions(id)
);
