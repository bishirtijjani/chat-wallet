-- M3 — ROSCA engine (see docs/PROJECT_BIBLE.md §3.2).
-- A circle is a savings group. Each circle owns one group conversation and one
-- circle_escrow ledger account. A full cycle runs member_cap rounds; each round
-- collects the contribution from every active member and pays the pot to one.

CREATE TABLE circles (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 TEXT NOT NULL,
  contribution_amount  BIGINT NOT NULL CHECK (contribution_amount > 0),  -- kobo per round
  frequency            TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly')),
  payout_order_method  TEXT NOT NULL DEFAULT 'fixed'
                         CHECK (payout_order_method IN ('fixed', 'lottery', 'auction', 'needs_based')),
  member_cap           INT NOT NULL CHECK (member_cap BETWEEN 2 AND 100),
  status               TEXT NOT NULL DEFAULT 'forming'
                         CHECK (status IN ('forming', 'active', 'completed', 'cancelled')),
  start_date           TIMESTAMPTZ,
  coordinator_id       UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  escrow_account_id    UUID NOT NULL REFERENCES accounts (id) ON DELETE RESTRICT,
  conversation_id      UUID NOT NULL REFERENCES conversations (id) ON DELETE RESTRICT,
  current_round        INT NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_circles_coordinator ON circles (coordinator_id);

-- Link the circle's group conversation back to the circle (was reserved in M2).
ALTER TABLE conversations
  ADD CONSTRAINT fk_conversations_circle
  FOREIGN KEY (circle_id) REFERENCES circles (id) ON DELETE SET NULL;

CREATE TABLE circle_members (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id   UUID NOT NULL REFERENCES circles (id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  position    INT,                                   -- payout turn 1..N; NULL until order set
  status      TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('invited', 'active', 'defaulted', 'left')),
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (circle_id, user_id)
);

-- Payout order is unique within a circle.
CREATE UNIQUE INDEX idx_circle_members_position
  ON circle_members (circle_id, position)
  WHERE position IS NOT NULL;

CREATE INDEX idx_circle_members_user ON circle_members (user_id);

CREATE TABLE rounds (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id                UUID NOT NULL REFERENCES circles (id) ON DELETE CASCADE,
  round_number             INT NOT NULL,
  recipient_membership_id  UUID REFERENCES circle_members (id) ON DELETE RESTRICT,
  pot_amount               BIGINT NOT NULL DEFAULT 0,   -- kobo, filled as collected
  status                   TEXT NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'collecting', 'paid', 'closed')),
  opened_at                TIMESTAMPTZ,
  paid_at                  TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (circle_id, round_number)
);

CREATE TABLE contributions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id        UUID NOT NULL REFERENCES rounds (id) ON DELETE CASCADE,
  membership_id   UUID NOT NULL REFERENCES circle_members (id) ON DELETE RESTRICT,
  amount          BIGINT NOT NULL CHECK (amount > 0),
  status          TEXT NOT NULL DEFAULT 'due' CHECK (status IN ('due', 'paid', 'missed')),
  transaction_id  UUID REFERENCES ledger_transactions (id) ON DELETE RESTRICT,
  paid_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (round_id, membership_id)
);

CREATE INDEX idx_contributions_round ON contributions (round_id);

CREATE TABLE payouts (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id                 UUID NOT NULL UNIQUE REFERENCES rounds (id) ON DELETE RESTRICT,
  recipient_membership_id  UUID NOT NULL REFERENCES circle_members (id) ON DELETE RESTRICT,
  amount                   BIGINT NOT NULL CHECK (amount > 0),
  transaction_id           UUID NOT NULL REFERENCES ledger_transactions (id) ON DELETE RESTRICT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
