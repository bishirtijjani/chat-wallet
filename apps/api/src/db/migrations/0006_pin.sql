-- Device PIN unlock. After the first phone+OTP sign-in, a device can set a PIN
-- so reopening the app unlocks the persisted session instead of repeating the
-- OTP round-trip every time (PROJECT_BIBLE §5).

ALTER TABLE users
  ADD COLUMN pin_hash            TEXT,
  ADD COLUMN pin_failed_attempts SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN pin_locked_until    TIMESTAMPTZ;
