import { test } from 'node:test';
import assert from 'node:assert/strict';

/**
 * A full adashe cycle, end to end, against real PostgreSQL: create a circle, add
 * members, set the payout order, start it, then run every round (collect →
 * settle) and verify the ledger nets out correctly. Skipped without DATABASE_URL.
 */
const dbConfigured = Boolean(process.env.DATABASE_URL);
const skip = dbConfigured ? false : 'DATABASE_URL not set';

process.env.JWT_ACCESS_SECRET ??= 'test-access-secret';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret';
process.env.OTP_PEPPER ??= 'test-otp-pepper';
process.env.NODE_ENV ??= 'test';

let counter = 0;
async function createUser(name: string): Promise<string> {
  const { pool } = await import('../../db/pool.js');
  counter += 1;
  const phone = `+2348${String(Date.now()).slice(-6)}${String(counter).padStart(3, '0')}`;
  const { rows } = await pool.query(
    `INSERT INTO users (phone, display_name) VALUES ($1, $2) RETURNING id`,
    [phone, name],
  );
  return rows[0].id as string;
}

async function balance(userId: string): Promise<number> {
  const wallet = await import('../wallet/wallet.service.js');
  return (await wallet.getWallet(userId)).balance;
}

test('setup: migrations', { skip }, async () => {
  const { runMigrations } = await import('../../db/migrate.js');
  await runMigrations();
});

test('a full 3-member cycle collects and pays out correctly', { skip }, async () => {
  const circles = await import('./circle.service.js');
  const engine = await import('./round.engine.js');
  const wallet = await import('../wallet/wallet.service.js');
  const { computeCycleFee, kobo } = await import('@caw/shared');

  const C = 500_000; // ₦5,000 contribution per round
  const coordinator = await createUser('Amina');
  const bello = await createUser('Bello');
  const chidi = await createUser('Chidi');
  const members = [coordinator, bello, chidi];

  // Fund everyone generously (each pays 3 rounds; coordinator also pays the fee).
  for (const m of members) await wallet.fundWallet({ userId: m, amount: 2_000_000 });

  // Create the circle and add the other two members.
  const circle = await circles.createCircle({
    coordinatorId: coordinator,
    name: 'Kano Traders Adashe',
    contributionAmount: C,
    frequency: 'weekly',
    memberCap: 3,
  });
  await circles.addMember({ coordinatorId: coordinator, circleId: circle.id, userId: bello });
  await circles.addMember({ coordinatorId: coordinator, circleId: circle.id, userId: chidi });

  // Set the payout order: Amina → Bello → Chidi.
  const detail = await circles.getCircle(coordinator, circle.id);
  const membershipOf = new Map(detail.members.map((m) => [m.userId, m.id]));
  await circles.setPayoutOrder({
    coordinatorId: coordinator,
    circleId: circle.id,
    order: [membershipOf.get(coordinator)!, membershipOf.get(bello)!, membershipOf.get(chidi)!],
  });

  // Start: charges the cycle fee and opens round 1.
  const fee = computeCycleFee(kobo(C * 3));
  const started = await circles.startCircle({ coordinatorId: coordinator, circleId: circle.id });
  assert.equal(started.cycleFee, fee);

  // Run all three rounds.
  const recipientsInOrder = [coordinator, bello, chidi];
  for (let round = 1; round <= 3; round += 1) {
    const collected = await engine.collectDueContributions(circle.id);
    assert.equal(collected.collected, 3, `round ${round} should collect all 3 contributions`);
    assert.equal(collected.pending, 0);

    const settled = await engine.settleRound(circle.id);
    assert.equal(settled.amount, C * 3, `round ${round} pot should be the full pot`);
    assert.equal(settled.completed, round === 3);
  }

  // Ledger truth: each member paid 3×C and received the pot once.
  // Coordinator additionally paid the cycle fee.
  assert.equal(await balance(coordinator), 2_000_000 - fee - 3 * C + 3 * C);
  assert.equal(await balance(bello), 2_000_000 - 3 * C + 3 * C);
  assert.equal(await balance(chidi), 2_000_000 - 3 * C + 3 * C);

  // Escrow fully drained; fees_revenue holds exactly the cycle fee.
  const { withTransaction } = await import('../../db/pool.js');
  const { getBalance, getAccountByCode } = await import('../wallet/ledger.service.js');
  const { SYSTEM_ACCOUNTS } = await import('@caw/shared');
  await withTransaction(async (client) => {
    assert.equal(await getBalance(client, circle.escrowAccountId), 0);
  });

  // Circle is completed with three closed rounds and three payouts.
  const finalDetail = await circles.getCircle(coordinator, circle.id);
  assert.equal(finalDetail.status, 'completed');
  assert.equal(finalDetail.rounds.length, 3);
  assert.ok(finalDetail.rounds.every((r) => r.status === 'closed'));

  const { pool } = await import('../../db/pool.js');
  const payouts = await pool.query(
    `SELECT p.amount, m.user_id FROM payouts p
       JOIN rounds r ON r.id = p.round_id
       JOIN circle_members m ON m.id = p.recipient_membership_id
      WHERE r.circle_id = $1 ORDER BY r.round_number`,
    [circle.id],
  );
  assert.deepEqual(
    payouts.rows.map((r) => r.user_id),
    recipientsInOrder,
  );

  // System messages narrated the money events into the circle chat.
  const messages = await pool.query(
    `SELECT metadata->>'kind' AS kind FROM messages WHERE conversation_id = $1 AND type = 'system'`,
    [circle.conversationId],
  );
  const kinds = messages.rows.map((r) => r.kind);
  assert.ok(kinds.includes('payout'));
  assert.ok(kinds.includes('contribution'));
  assert.ok(kinds.includes('circle_completed'));
});

test('settling before a round is fully funded is rejected', { skip }, async () => {
  const circles = await import('./circle.service.js');
  const engine = await import('./round.engine.js');
  const wallet = await import('../wallet/wallet.service.js');

  const C = 500_000;
  const coordinator = await createUser('Fatima');
  const poor = await createUser('Musa'); // will not have enough to contribute

  await wallet.fundWallet({ userId: coordinator, amount: 2_000_000 });
  // `poor` funds only enough for the cycle fee is irrelevant — they simply can't pay C.

  const circle = await circles.createCircle({
    coordinatorId: coordinator,
    name: 'Underfunded Circle',
    contributionAmount: C,
    frequency: 'weekly',
    memberCap: 2,
  });
  await circles.addMember({ coordinatorId: coordinator, circleId: circle.id, userId: poor });

  const detail = await circles.getCircle(coordinator, circle.id);
  const membershipOf = new Map(detail.members.map((m) => [m.userId, m.id]));
  await circles.setPayoutOrder({
    coordinatorId: coordinator,
    circleId: circle.id,
    order: [membershipOf.get(coordinator)!, membershipOf.get(poor)!],
  });
  await circles.startCircle({ coordinatorId: coordinator, circleId: circle.id });

  // Coordinator can pay; `poor` cannot → one contribution stays pending.
  const collected = await engine.collectDueContributions(circle.id);
  assert.equal(collected.collected, 1);
  assert.equal(collected.pending, 1);

  await assert.rejects(engine.settleRound(circle.id), /not fully funded/);
});

test('only the coordinator can run lifecycle actions', { skip }, async () => {
  const circles = await import('./circle.service.js');
  const wallet = await import('../wallet/wallet.service.js');

  const coordinator = await createUser('Ngozi');
  const outsider = await createUser('Tunde');
  await wallet.fundWallet({ userId: coordinator, amount: 1_000_000 });

  const circle = await circles.createCircle({
    coordinatorId: coordinator,
    name: 'Guarded Circle',
    contributionAmount: 500_000,
    frequency: 'monthly',
    memberCap: 2,
  });

  await assert.rejects(
    circles.addMember({ coordinatorId: outsider, circleId: circle.id, userId: outsider }),
    /coordinator/,
  );
  await assert.rejects(
    circles.startCircle({ coordinatorId: outsider, circleId: circle.id }),
    /coordinator/,
  );
});
