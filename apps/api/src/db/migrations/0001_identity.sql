-- M0 — Identity & auth.
-- Users authenticate with a Nigerian phone number + one-time code (OTP).

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone         TEXT NOT NULL UNIQUE,          -- E.164, e.g. +2348012345678
  display_name  TEXT,
  kyc_tier      SMALLINT NOT NULL DEFAULT 0 CHECK (kyc_tier BETWEEN 0 AND 3),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One-time codes. We store only an HMAC of the code, never the code itself.
CREATE TABLE otp_codes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone         TEXT NOT NULL,
  code_hash     TEXT NOT NULL,
  attempts      SMALLINT NOT NULL DEFAULT 0,
  consumed_at   TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_otp_codes_phone_active
  ON otp_codes (phone, created_at DESC)
  WHERE consumed_at IS NULL;

-- Refresh tokens are stored hashed so a DB leak can't be replayed. We keep a
-- row per issued refresh token so tokens can be revoked (e.g. on logout).
CREATE TABLE refresh_tokens (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash    TEXT NOT NULL UNIQUE,
  expires_at    TIMESTAMPTZ NOT NULL,
  revoked_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens (user_id);
