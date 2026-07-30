import type { PoolClient } from '../../db/pool.js';
import type {
  AccountType,
  LedgerEntry,
  LedgerTransaction,
  NormalBalance,
  TransactionKind,
} from '@caw/shared';
import { ACCOUNT_NORMAL_BALANCE } from '@caw/shared';
import { AppError } from '../../http/errors.js';

export interface AccountRow {
  id: string;
  type: AccountType;
  normalBalance: NormalBalance;
  code: string | null;
  ownerUserId: string | null;
  currency: string;
}

export interface Leg {
  accountId: string;
  direction: 'debit' | 'credit';
  amount: number; // positive kobo
}

export interface PostTransactionInput {
  kind: TransactionKind;
  reference: string;
  legs: Leg[];
  idempotencyKey?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * The ledger service is the ONLY code that writes to accounts/entries. Every
 * money movement in the product flows through `postTransaction`, which the
 * database guarantees is balanced (debits == credits) and append-only.
 */

export async function getAccountByCode(client: PoolClient, code: string): Promise<AccountRow> {
  const { rows } = await client.query(
    `SELECT id, type, normal_balance, code, owner_user_id, currency
       FROM accounts WHERE code = $1`,
    [code],
  );
  const row = rows[0];
  if (!row) throw AppError.notFound(`System account '${code}' not found — run migrations`);
  return mapAccount(row);
}

/** Return the user's wallet account, creating it on first use. */
export async function getOrCreateUserWallet(
  client: PoolClient,
  userId: string,
): Promise<AccountRow> {
  const existing = await client.query(
    `SELECT id, type, normal_balance, code, owner_user_id, currency
       FROM accounts WHERE type = 'user_wallet' AND owner_user_id = $1`,
    [userId],
  );
  if (existing.rows[0]) return mapAccount(existing.rows[0]);

  const inserted = await client.query(
    `INSERT INTO accounts (type, normal_balance, owner_user_id)
     VALUES ('user_wallet', $1, $2)
     ON CONFLICT (owner_user_id) WHERE type = 'user_wallet' DO NOTHING
     RETURNING id, type, normal_balance, code, owner_user_id, currency`,
    [ACCOUNT_NORMAL_BALANCE.user_wallet, userId],
  );
  if (inserted.rows[0]) return mapAccount(inserted.rows[0]);

  // Lost the race with a concurrent insert — read the winner.
  const reread = await client.query(
    `SELECT id, type, normal_balance, code, owner_user_id, currency
       FROM accounts WHERE type = 'user_wallet' AND owner_user_id = $1`,
    [userId],
  );
  return mapAccount(reread.rows[0]);
}

/** Create a fresh circle_escrow account (one per circle). Returns the new account. */
export async function createCircleEscrowAccount(client: PoolClient): Promise<AccountRow> {
  const { rows } = await client.query(
    `INSERT INTO accounts (type, normal_balance)
     VALUES ('circle_escrow', $1)
     RETURNING id, type, normal_balance, code, owner_user_id, currency`,
    [ACCOUNT_NORMAL_BALANCE.circle_escrow],
  );
  return mapAccount(rows[0]);
}

/** Lock an account row for the remainder of the transaction (serializes movements). */
export async function lockAccount(client: PoolClient, accountId: string): Promise<void> {
  await client.query('SELECT id FROM accounts WHERE id = $1 FOR UPDATE', [accountId]);
}

/**
 * Derived balance in kobo: entries on the account's normal side add, the
 * opposite side subtracts.
 */
export async function getBalance(client: PoolClient, accountId: string): Promise<number> {
  const { rows } = await client.query(
    `SELECT a.normal_balance,
            COALESCE(SUM(CASE WHEN e.direction = 'debit'  THEN e.amount ELSE 0 END), 0) AS debits,
            COALESCE(SUM(CASE WHEN e.direction = 'credit' THEN e.amount ELSE 0 END), 0) AS credits
       FROM accounts a
       LEFT JOIN ledger_entries e ON e.account_id = a.id
      WHERE a.id = $1
      GROUP BY a.normal_balance`,
    [accountId],
  );
  const row = rows[0];
  if (!row) throw AppError.notFound('Account not found');
  const debits = Number(row.debits);
  const credits = Number(row.credits);
  return row.normal_balance === 'debit' ? debits - credits : credits - debits;
}

/**
 * Post a balanced, append-only transaction. If `idempotencyKey` is supplied and
 * a transaction already exists for it, the existing transaction is returned
 * unchanged — so a retried request never double-posts.
 */
export async function postTransaction(
  client: PoolClient,
  input: PostTransactionInput,
): Promise<LedgerTransaction> {
  if (input.legs.length < 2) {
    throw AppError.badRequest('A transaction needs at least two legs');
  }
  for (const leg of input.legs) {
    if (!Number.isSafeInteger(leg.amount) || leg.amount <= 0) {
      throw AppError.badRequest('Every leg amount must be a positive integer of kobo');
    }
  }

  if (input.idempotencyKey) {
    const found = await findTransactionByIdempotencyKey(client, input.idempotencyKey);
    if (found) return found;
  }

  let txId: string;
  try {
    const txResult = await client.query(
      `INSERT INTO ledger_transactions (kind, reference, idempotency_key, metadata)
       VALUES ($1, $2, $3, $4::jsonb)
       RETURNING id`,
      [
        input.kind,
        input.reference,
        input.idempotencyKey ?? null,
        JSON.stringify(input.metadata ?? {}),
      ],
    );
    txId = txResult.rows[0].id;
  } catch (err) {
    if (isUniqueViolation(err) && input.idempotencyKey) {
      const found = await findTransactionByIdempotencyKey(client, input.idempotencyKey);
      if (found) return found;
    }
    throw err;
  }

  for (const leg of input.legs) {
    await client.query(
      `INSERT INTO ledger_entries (transaction_id, account_id, direction, amount)
       VALUES ($1, $2, $3, $4)`,
      [txId, leg.accountId, leg.direction, leg.amount],
    );
  }

  return getTransactionById(client, txId);
}

export async function getTransactionById(
  client: PoolClient,
  txId: string,
): Promise<LedgerTransaction> {
  const tx = await client.query(
    `SELECT id, kind, reference, idempotency_key, metadata, created_at
       FROM ledger_transactions WHERE id = $1`,
    [txId],
  );
  const row = tx.rows[0];
  if (!row) throw AppError.notFound('Transaction not found');

  const entries = await client.query(
    `SELECT id, transaction_id, account_id, direction, amount, created_at
       FROM ledger_entries WHERE transaction_id = $1 ORDER BY created_at`,
    [txId],
  );

  return mapTransaction(row, entries.rows);
}

async function findTransactionByIdempotencyKey(
  client: PoolClient,
  key: string,
): Promise<LedgerTransaction | null> {
  const { rows } = await client.query(
    `SELECT id FROM ledger_transactions WHERE idempotency_key = $1`,
    [key],
  );
  if (!rows[0]) return null;
  return getTransactionById(client, rows[0].id);
}

function mapAccount(row: Record<string, unknown>): AccountRow {
  return {
    id: row.id as string,
    type: row.type as AccountType,
    normalBalance: row.normal_balance as NormalBalance,
    code: (row.code as string | null) ?? null,
    ownerUserId: (row.owner_user_id as string | null) ?? null,
    currency: row.currency as string,
  };
}

function mapTransaction(
  row: Record<string, unknown>,
  entryRows: Record<string, unknown>[],
): LedgerTransaction {
  return {
    id: row.id as string,
    kind: row.kind as TransactionKind,
    reference: row.reference as string,
    idempotencyKey: (row.idempotency_key as string | null) ?? null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: toIso(row.created_at),
    entries: entryRows.map(mapEntry),
  };
}

function mapEntry(row: Record<string, unknown>): LedgerEntry {
  return {
    id: row.id as string,
    transactionId: row.transaction_id as string,
    accountId: row.account_id as string,
    direction: row.direction as 'debit' | 'credit',
    amount: Number(row.amount),
    createdAt: toIso(row.created_at),
  };
}

function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';
}
