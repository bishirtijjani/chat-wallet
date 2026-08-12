import jwt from 'jsonwebtoken';
import type { PoolClient } from '../../db/pool.js';
import { loadConfig } from '../../config.js';
import { AppError } from '../../http/errors.js';
import { generateOpaqueToken, hashToken } from './crypto.js';

export interface AccessTokenPayload {
  sub: string; // user id
}

/** Sign a short-lived JWT access token. */
export function signAccessToken(userId: string): { token: string; expiresIn: number } {
  const config = loadConfig();
  const token = jwt.sign({ sub: userId }, config.JWT_ACCESS_SECRET, {
    expiresIn: config.JWT_ACCESS_TTL,
  });
  return { token, expiresIn: config.JWT_ACCESS_TTL };
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const config = loadConfig();
  try {
    const decoded = jwt.verify(token, config.JWT_ACCESS_SECRET);
    if (typeof decoded === 'string' || typeof decoded.sub !== 'string') {
      throw AppError.unauthorized('Malformed token');
    }
    return { sub: decoded.sub };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw AppError.unauthorized('Invalid or expired token');
  }
}

/**
 * Issue an opaque refresh token, persisting only its hash so a DB leak can't be
 * replayed. Returns the raw token to hand to the client.
 */
export async function issueRefreshToken(client: PoolClient, userId: string): Promise<string> {
  const config = loadConfig();
  const raw = generateOpaqueToken();
  const expiresAt = new Date(Date.now() + config.JWT_REFRESH_TTL * 1000);
  await client.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
    [userId, hashToken(raw), expiresAt],
  );
  return raw;
}

interface RefreshTokenRow {
  id: string;
  user_id: string;
  expires_at: string;
  revoked_at: string | null;
}

/** Look up a refresh token, throwing if it's missing, revoked, or expired. */
async function loadValidRefreshToken(
  client: PoolClient,
  rawToken: string,
): Promise<RefreshTokenRow> {
  const { rows } = await client.query<RefreshTokenRow>(
    `SELECT id, user_id, expires_at, revoked_at
       FROM refresh_tokens WHERE token_hash = $1 FOR UPDATE`,
    [hashToken(rawToken)],
  );
  const row = rows[0];
  if (!row) throw AppError.unauthorized('Invalid refresh token');
  if (row.revoked_at) throw AppError.unauthorized('Refresh token revoked');
  if (new Date(row.expires_at).getTime() < Date.now()) {
    throw AppError.unauthorized('Refresh token expired');
  }
  return row;
}

/**
 * Validate a refresh token and rotate it: the presented token is revoked and a
 * fresh one issued (refresh-token rotation). Returns the new raw token and the
 * user id.
 */
export async function rotateRefreshToken(
  client: PoolClient,
  rawToken: string,
): Promise<{ userId: string; refreshToken: string }> {
  const row = await loadValidRefreshToken(client, rawToken);
  await client.query(`UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1`, [row.id]);
  const refreshToken = await issueRefreshToken(client, row.user_id);
  return { userId: row.user_id, refreshToken };
}

/** Resolve the user id behind a refresh token without rotating it. */
export async function getUserIdForRefreshToken(
  client: PoolClient,
  rawToken: string,
): Promise<string> {
  const row = await loadValidRefreshToken(client, rawToken);
  return row.user_id;
}

export async function revokeRefreshToken(client: PoolClient, rawToken: string): Promise<void> {
  await client.query(
    `UPDATE refresh_tokens SET revoked_at = now()
      WHERE token_hash = $1 AND revoked_at IS NULL`,
    [hashToken(rawToken)],
  );
}
