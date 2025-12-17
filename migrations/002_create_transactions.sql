-- Migration: Create transactions table
-- Stores transaction intent (deposit, withdrawal, transfer).

CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type VARCHAR(20) NOT NULL,
    source_account_id UUID,
    destination_account_id UUID,
    amount NUMERIC(18,4) NOT NULL,
    currency CHAR(3) NOT NULL,
    status VARCHAR(20) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT now()
);
