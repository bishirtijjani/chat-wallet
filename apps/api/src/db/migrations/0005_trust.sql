-- M4 — Trust & robustness.
-- Rounds gain a collection deadline so the scheduler can chase late payers and
-- mark misses. Contributions record when they were missed. Disputes give the
-- group a lightweight, on-the-record way to flag problems.

ALTER TABLE rounds
  ADD COLUMN due_at          TIMESTAMPTZ,   -- collection deadline (opened_at + frequency)
  ADD COLUMN reminder_sent_at TIMESTAMPTZ;  -- so a reminder is posted at most once per round

ALTER TABLE contributions
  ADD COLUMN missed_at       TIMESTAMPTZ;   -- first time this contribution was marked missed

-- A dispute is raised by a member and resolved by the coordinator. It never
-- moves money — it's a transparent record the group acts on offline.
CREATE TABLE disputes (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id             UUID NOT NULL REFERENCES circles (id) ON DELETE CASCADE,
  raised_by             UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  subject_membership_id UUID REFERENCES circle_members (id) ON DELETE SET NULL,
  reason                TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'withdrawn')),
  resolution            TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at           TIMESTAMPTZ
);

CREATE INDEX idx_disputes_circle ON disputes (circle_id, created_at DESC);
