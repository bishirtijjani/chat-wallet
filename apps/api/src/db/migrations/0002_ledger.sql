-- M1 — Double-entry, append-only ledger (see docs/PROJECT_BIBLE.md §3.3).
-- Money is BIGINT kobo. Balances are DERIVED from entries, never stored.
-- Corrections are new reversing transactions; rows here are never updated.

-- Ledger accounts. One user_wallet per user; the system accounts (float,
-- fees_revenue, suspense) are singletons addressed by `code`.
CREATE TABLE accounts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type           TEXT NOT NULL CHECK (type IN
                   ('user_wallet', 'circle_escrow', 'fees_revenue', 'float', 'suspense')),
  normal_balance TEXT NOT NULL CHECK (normal_balance IN ('debit', 'credit')),
  code           TEXT UNIQUE,                    -- set for singleton system accounts
  owner_user_id  UUID REFERENCES users (id) ON DELETE RESTRICT,
  currency       TEXT NOT NULL DEFAULT 'NGN',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Exactly one wallet per user.
CREATE UNIQUE INDEX idx_accounts_user_wallet
  ON accounts (owner_user_id)
  WHERE type = 'user_wallet';

-- A money movement. Balanced across its entries (enforced by trigger below).
CREATE TABLE ledger_transactions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind             TEXT NOT NULL,
  reference        TEXT NOT NULL,
  idempotency_key  TEXT UNIQUE,                  -- retried requests reuse the same tx
  metadata         JSONB NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One leg of a transaction. Immutable once written.
CREATE TABLE ledger_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id  UUID NOT NULL REFERENCES ledger_transactions (id) ON DELETE RESTRICT,
  account_id      UUID NOT NULL REFERENCES accounts (id) ON DELETE RESTRICT,
  direction       TEXT NOT NULL CHECK (direction IN ('debit', 'credit')),
  amount          BIGINT NOT NULL CHECK (amount > 0),   -- positive kobo
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ledger_entries_account ON ledger_entries (account_id, created_at DESC);
CREATE INDEX idx_ledger_entries_transaction ON ledger_entries (transaction_id);

-- Guard rails against mutating history: ledgers are append-only.
CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ledger is append-only: % on % is not allowed', TG_OP, TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_entries_no_update
  BEFORE UPDATE OR DELETE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

CREATE TRIGGER trg_transactions_no_update
  BEFORE UPDATE OR DELETE ON ledger_transactions
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- Every transaction's entries must sum to zero (total debits = total credits).
-- Deferred so all entries of a transaction are present when the check runs.
CREATE OR REPLACE FUNCTION assert_transaction_balanced() RETURNS trigger AS $$
DECLARE
  imbalance BIGINT;
  leg_count INT;
BEGIN
  SELECT
    COALESCE(SUM(CASE direction WHEN 'debit' THEN amount ELSE -amount END), 0),
    COUNT(*)
  INTO imbalance, leg_count
  FROM ledger_entries
  WHERE transaction_id = NEW.transaction_id;

  IF leg_count < 2 THEN
    RAISE EXCEPTION 'transaction % must have at least two entries', NEW.transaction_id;
  END IF;

  IF imbalance <> 0 THEN
    RAISE EXCEPTION 'transaction % is not balanced (imbalance = % kobo)',
      NEW.transaction_id, imbalance;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER trg_transaction_balanced
  AFTER INSERT ON ledger_entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_transaction_balanced();

-- Seed the singleton system accounts.
INSERT INTO accounts (type, normal_balance, code) VALUES
  ('float',        'debit',  'float'),
  ('fees_revenue', 'credit', 'fees_revenue'),
  ('suspense',     'credit', 'suspense');
