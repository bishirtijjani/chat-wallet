import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

/**
 * End-to-end ledger tests against a real PostgreSQL. They exercise the double-
 * entry invariants that unit tests can't: the balance trigger, append-only
 * enforcement, idempotency, and correct balance derivation.
 *
 * Skipped unless DATABASE_URL is set (e.g. locally without a DB). CI provides
 * Postgres and runs them for real.
 */
const dbConfigured = Boolean(process.env.DATABASE_URL);
const skip = dbConfigured ? false : 'DATABASE_URL not set';

// Ensure config validation passes when the DB is present but secrets are unset.
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret';
process.env.OTP_PEPPER ??= 'test-otp-pepper';
process.env.NODE_ENV ??= 'test';

async function createUser(): Promise<string> {
  const { pool } = await import('../../db/pool.js');
  const phone = `+234${Math.floor(7_000_000_000 + Math.random() * 2_999_999_999)}`;
  const { rows } = await pool.query(
    `INSERT INTO users (phone, display_name) VALUES ($1, $2) RETURNING id`,
    [phone, 'Test User'],
  );
  return rows[0].id as string;
}

test('migrations bring the schema up', { skip }, async () => {
  const { runMigrations } = await import('../../db/migrate.js');
  await runMigrations();
  const { pool } = await import('../../db/pool.js');
  const { rows } = await pool.query(`SELECT code FROM accounts WHERE code IS NOT NULL ORDER BY code`);
  assert.deepEqual(
    rows.map((r) => r.code),
    ['fees_revenue', 'float', 'suspense'],
  );
});

test('funding credits the wallet and is idempotent', { skip }, async () => {
  const wallet = await import('./wallet.service.js');
  const userId = await createUser();
  const key = randomUUID();

  const first = await wallet.fundWallet({ userId, amount: 500_000, idempotencyKey: key });
  assert.equal(first.balance, 500_000);

  // Same idempotency key → no double credit.
  const second = await wallet.fundWallet({ userId, amount: 500_000, idempotencyKey: key });
  assert.equal(second.transaction.id, first.transaction.id);

  const current = await wallet.getWallet(userId);
  assert.equal(current.balance, 500_000);
});

test('transfer moves money and rejects overdraft', { skip }, async () => {
  const wallet = await import('./wallet.service.js');
  const sender = await createUser();
  const recipient = await createUser();

  await wallet.fundWallet({ userId: sender, amount: 300_000 });
  await wallet.transfer({ fromUserId: sender, toUserId: recipient, amount: 100_000 });

  assert.equal((await wallet.getWallet(sender)).balance, 200_000);
  assert.equal((await wallet.getWallet(recipient)).balance, 100_000);

  await assert.rejects(
    wallet.transfer({ fromUserId: sender, toUserId: recipient, amount: 999_000_000 }),
    /Insufficient balance/,
  );
});

test('cash-out debits amount plus fee and credits fees_revenue', { skip }, async () => {
  const wallet = await import('./wallet.service.js');
  const { computeCashOutFee, kobo } = await import('@caw/shared');
  const userId = await createUser();

  await wallet.fundWallet({ userId, amount: 10_000_000 }); // ₦100,000
  const fee = computeCashOutFee(kobo(5_000_000)); // fee on ₦50,000

  const result = await wallet.cashOut({
    userId,
    amount: 5_000_000,
    bankAccountNumber: '0123456789',
    bankCode: '058',
  });

  assert.equal(result.fee, fee);
  assert.equal(result.balance, 10_000_000 - 5_000_000 - fee);
});

test('the ledger rejects an unbalanced transaction', { skip }, async () => {
  const { withTransaction } = await import('../../db/pool.js');
  const { getOrCreateUserWallet, getAccountByCode, postTransaction } = await import(
    './ledger.service.js'
  );
  const userId = await createUser();

  await assert.rejects(
    withTransaction(async (client) => {
      const wallet = await getOrCreateUserWallet(client, userId);
      const float = await getAccountByCode(client, 'float');
      // Debit 100 but credit only 40 — the deferred trigger must reject at commit.
      await postTransaction(client, {
        kind: 'wallet_funding',
        reference: 'unbalanced-test',
        legs: [
          { accountId: float.id, direction: 'debit', amount: 100 },
          { accountId: wallet.id, direction: 'credit', amount: 40 },
        ],
      });
    }),
    /not balanced/,
  );
});
