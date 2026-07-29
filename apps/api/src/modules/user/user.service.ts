import { normalizeNigerianPhone } from '@caw/shared';
import { pool } from '../../db/pool.js';
import { AppError } from '../../http/errors.js';

/** Resolve a single phone number to a user id, or throw 404. */
export async function requireUserIdByPhone(phone: string): Promise<string> {
  const normalized = normalizeNigerianPhone(phone) ?? phone;
  const { rows } = await pool.query(`SELECT id FROM users WHERE phone = $1`, [normalized]);
  if (!rows[0]) throw AppError.notFound(`No user with phone ${normalized}`);
  return rows[0].id as string;
}

/**
 * Resolve many phone numbers to user ids. Unknown numbers are reported so the
 * caller can decide whether to fail or invite. Returns ids for the ones found.
 */
export async function resolveUserIdsByPhones(
  phones: string[],
): Promise<{ found: string[]; missing: string[] }> {
  if (phones.length === 0) return { found: [], missing: [] };
  const normalized = phones.map((p) => normalizeNigerianPhone(p) ?? p);
  const { rows } = await pool.query(`SELECT id, phone FROM users WHERE phone = ANY($1)`, [
    normalized,
  ]);
  const byPhone = new Map(rows.map((r) => [r.phone as string, r.id as string]));
  const found: string[] = [];
  const missing: string[] = [];
  for (const phone of normalized) {
    const id = byPhone.get(phone);
    if (id) found.push(id);
    else missing.push(phone);
  }
  return { found, missing };
}
