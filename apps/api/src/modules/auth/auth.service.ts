import type { AuthTokens, User } from '@caw/shared';
import { OTP, PIN } from '@caw/shared';
import { loadConfig } from '../../config.js';
import { pool, withTransaction } from '../../db/pool.js';
import { AppError } from '../../http/errors.js';
import { getOrCreateUserWallet } from '../wallet/ledger.service.js';
import { generateOtp, hashOtp, hashPin, safeEqualHex } from './crypto.js';
import { getSms } from './sms.js';
import {
  getUserIdForRefreshToken,
  issueRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  signAccessToken,
} from './tokens.js';

/**
 * Request an OTP for a phone number. Enforces a resend cooldown, stores only the
 * hashed code, and dispatches it via the SMS provider.
 */
export async function requestOtp(
  phone: string,
): Promise<{ resendInSeconds: number; isNewUser: boolean }> {
  // Cooldown: reject if a code was issued very recently.
  const recent = await pool.query(
    `SELECT created_at FROM otp_codes
      WHERE phone = $1 AND created_at > now() - ($2 || ' seconds')::interval
      ORDER BY created_at DESC LIMIT 1`,
    [phone, OTP.resendCooldownSeconds],
  );
  if (recent.rows[0]) {
    throw AppError.tooManyRequests('An OTP was just sent. Please wait before requesting another.');
  }

  const existing = await pool.query(`SELECT 1 FROM users WHERE phone = $1`, [phone]);
  const isNewUser = existing.rowCount === 0;

  const config = loadConfig();
  const code =
    config.OTP_TEST_BYPASS_PHONE &&
    config.OTP_TEST_BYPASS_CODE &&
    phone === config.OTP_TEST_BYPASS_PHONE
      ? config.OTP_TEST_BYPASS_CODE
      : generateOtp(OTP.length);
  const expiresAt = new Date(Date.now() + OTP.ttlSeconds * 1000);
  await pool.query(
    `INSERT INTO otp_codes (phone, code_hash, expires_at) VALUES ($1, $2, $3)`,
    [phone, hashOtp(code), expiresAt],
  );

  await getSms().sendOtp({ phone, code });
  return { resendInSeconds: OTP.resendCooldownSeconds, isNewUser };
}

/**
 * Verify an OTP. On success, find-or-create the user (and their wallet) and
 * issue an access + refresh token pair.
 */
export async function verifyOtp(params: {
  phone: string;
  code: string;
  displayName?: string;
}): Promise<{ user: User; tokens: AuthTokens }> {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT id, code_hash, attempts, expires_at
         FROM otp_codes
        WHERE phone = $1 AND consumed_at IS NULL AND expires_at > now()
        ORDER BY created_at DESC LIMIT 1
        FOR UPDATE`,
      [params.phone],
    );
    const otp = rows[0];
    if (!otp) throw AppError.badRequest('No active code. Request a new one.');

    if (otp.attempts >= OTP.maxAttempts) {
      throw AppError.tooManyRequests('Too many attempts. Request a new code.');
    }

    if (!safeEqualHex(otp.code_hash, hashOtp(params.code))) {
      await client.query(`UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1`, [otp.id]);
      throw AppError.badRequest('Incorrect code');
    }

    await client.query(`UPDATE otp_codes SET consumed_at = now() WHERE id = $1`, [otp.id]);

    // Find or create the user.
    const existing = await client.query(
      `SELECT id, phone, display_name, kyc_tier, created_at FROM users WHERE phone = $1`,
      [params.phone],
    );
    let userRow = existing.rows[0];
    if (!userRow) {
      const created = await client.query(
        `INSERT INTO users (phone, display_name) VALUES ($1, $2)
         RETURNING id, phone, display_name, kyc_tier, created_at`,
        [params.phone, params.displayName ?? null],
      );
      userRow = created.rows[0];
    } else if (params.displayName && !userRow.display_name) {
      const updated = await client.query(
        `UPDATE users SET display_name = $2, updated_at = now() WHERE id = $1
         RETURNING id, phone, display_name, kyc_tier, created_at`,
        [userRow.id, params.displayName],
      );
      userRow = updated.rows[0];
    }

    // Ensure the user has a wallet from day one.
    await getOrCreateUserWallet(client, userRow.id);

    const access = signAccessToken(userRow.id);
    const refreshToken = await issueRefreshToken(client, userRow.id);

    return {
      user: mapUser(userRow),
      tokens: {
        accessToken: access.token,
        refreshToken,
        expiresIn: access.expiresIn,
      },
    };
  });
}

export async function refresh(rawRefreshToken: string): Promise<AuthTokens> {
  return withTransaction(async (client) => {
    const { userId, refreshToken } = await rotateRefreshToken(client, rawRefreshToken);
    const access = signAccessToken(userId);
    return { accessToken: access.token, refreshToken, expiresIn: access.expiresIn };
  });
}

export async function logout(rawRefreshToken: string): Promise<void> {
  await withTransaction((client) => revokeRefreshToken(client, rawRefreshToken));
}

/** Set (or replace) the PIN a device uses to unlock an existing session. */
export async function setPin(userId: string, pin: string): Promise<void> {
  await pool.query(
    `UPDATE users
        SET pin_hash = $2, pin_failed_attempts = 0, pin_locked_until = NULL, updated_at = now()
      WHERE id = $1`,
    [userId, hashPin(pin)],
  );
}

/**
 * Unlock a session with a device PIN instead of a fresh OTP. Identifies the
 * user from the still-valid refresh token, checks the PIN, and — on success —
 * rotates the refresh token like a normal `/auth/refresh`. Wrong PINs count
 * against a lockout; hitting it revokes the refresh token so the device falls
 * back to a full phone+OTP sign-in.
 *
 * The failed-attempt bookkeeping runs as its own committed statement, not
 * inside the transaction we're about to throw out of — `withTransaction`
 * rolls back on any error, so a mutation made right before a throw and left
 * in the same transaction would vanish along with it.
 */
export async function verifyPin(
  rawRefreshToken: string,
  pin: string,
): Promise<{ user: User; tokens: AuthTokens }> {
  const userId = await withTransaction((client) =>
    getUserIdForRefreshToken(client, rawRefreshToken),
  );

  const { rows } = await pool.query(
    `SELECT phone, display_name, kyc_tier, created_at, pin_hash, pin_locked_until
       FROM users WHERE id = $1`,
    [userId],
  );
  const row = rows[0];
  if (!row) throw AppError.unauthorized();

  if (!row.pin_hash) {
    throw AppError.badRequest('No PIN set for this account. Sign in with your phone number.');
  }
  if (row.pin_locked_until && new Date(row.pin_locked_until).getTime() > Date.now()) {
    throw AppError.tooManyRequests(
      'Too many incorrect PIN attempts. Sign in with your phone number.',
    );
  }

  if (!safeEqualHex(row.pin_hash, hashPin(pin))) {
    const { rows: attemptRows } = await pool.query(
      `UPDATE users
          SET pin_failed_attempts = pin_failed_attempts + 1,
              pin_locked_until = CASE
                WHEN pin_failed_attempts + 1 >= $2
                  THEN now() + ($3 || ' minutes')::interval
                ELSE pin_locked_until
              END
        WHERE id = $1
        RETURNING pin_failed_attempts, pin_locked_until`,
      [userId, PIN.maxAttempts, PIN.lockoutMinutes],
    );
    const lockedOut = Number(attemptRows[0].pin_failed_attempts) >= PIN.maxAttempts;
    if (lockedOut) {
      await withTransaction((client) => revokeRefreshToken(client, rawRefreshToken));
      throw AppError.tooManyRequests(
        'Too many incorrect PIN attempts. Sign in with your phone number.',
      );
    }
    throw AppError.unauthorized('Incorrect PIN');
  }

  return withTransaction(async (client) => {
    await client.query(
      `UPDATE users SET pin_failed_attempts = 0, pin_locked_until = NULL WHERE id = $1`,
      [userId],
    );
    const { refreshToken } = await rotateRefreshToken(client, rawRefreshToken);
    const access = signAccessToken(userId);
    return {
      user: mapUser(row),
      tokens: { accessToken: access.token, refreshToken, expiresIn: access.expiresIn },
    };
  });
}

export async function getUserById(userId: string): Promise<User> {
  const { rows } = await pool.query(
    `SELECT id, phone, display_name, kyc_tier, created_at FROM users WHERE id = $1`,
    [userId],
  );
  if (!rows[0]) throw AppError.notFound('User not found');
  return mapUser(rows[0]);
}

function mapUser(row: Record<string, unknown>): User {
  return {
    id: row.id as string,
    phone: row.phone as string,
    displayName: (row.display_name as string | null) ?? null,
    kycTier: Number(row.kyc_tier) as User['kycTier'],
    createdAt: (row.created_at as Date).toISOString(),
  };
}
