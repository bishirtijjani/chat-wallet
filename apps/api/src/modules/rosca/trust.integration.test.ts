import { test } from 'node:test';
import assert from 'node:assert/strict';

/**
 * M4 integration tests against real PostgreSQL: the scheduler running a cycle
 * hands-free, late/missed handling with reminders, derived reputation, the
 * coordinator dashboard, and disputes. Skipped without DATABASE_URL.
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
  const phone = `+2349${String(Date.now()).slice(-6)}${String(counter).padStart(3, '0')}`;
  const { rows } = await pool.query(
    `INSERT INTO users (phone, display_name) VALUES ($1, $2) RETURNING id`,
    [phone, name],
  );
  return rows[0].id as string;
}

async function orderedMemberships(coordinator: string, circleId: string, users: string[]) {
  const circles = await import('./circle.service.js');
  const detail = await circles.getCircle(coordinator, circleId);
  const byUser = new Map(detail.members.map((m) => [m.userId, m.id]));
  return users.map((u) => byUser.get(u)!);
}

test('setup: migrations', { skip }, async () => {
  const { runMigrations } = await import('../../db/migrate.js');
  await runMigrations();
});

test('the scheduler runs a whole cycle hands-free', { skip }, async () => {
  const circles = await import('./circle.service.js');
  const wallet = await import('../wallet/wallet.service.js');
  const { processDueCircles } = await import('./scheduler.js');

  const C = 500_000;
  const a = await createUser('Amina');
  const b = await createUser('Bello');
  for (const u of [a, b]) await wallet.fundWallet({ userId: u, amount: 2_000_000 });

  const circle = await circles.createCircle({
    coordinatorId: a,
    name: 'Auto Circle',
    contributionAmount: C,
    frequency: 'daily',
    memberCap: 2,
  });
  await circles.addMember({ coordinatorId: a, circleId: circle.id, userId: b });
  await circles.setPayoutOrder({
    coordinatorId: a,
    circleId: circle.id,
    order: await orderedMemberships(a, circle.id, [a, b]),
  });
  await circles.startCircle({ coordinatorId: a, circleId: circle.id });

  // Tick until the circle completes — no manual collect/settle anywhere.
  let completed = false;
  for (let i = 0; i < 8 && !completed; i += 1) {
    await processDueCircles(circle.id);
    completed = (await circles.getCircle(a, circle.id)).status === 'completed';
  }

  assert.ok(completed, 'scheduler should complete the cycle on its own');
  assert.equal((await wallet.getWallet(b)).balance, 2_000_000); // paid 2×C, received 2×C
});

test('late payers are reminded, marked missed, then collected when funded', { skip }, async () => {
  const circles = await import('./circle.service.js');
  const wallet = await import('../wallet/wallet.service.js');
  const trust = await import('./trust.service.js');
  const { processDueCircles } = await import('./scheduler.js');
  const { pool } = await import('../../db/pool.js');

  const C = 500_000;
  const coord = await createUser('Fatima');
  const late = await createUser('Musa');
  await wallet.fundWallet({ userId: coord, amount: 2_000_000 });
  // `late` starts with no funds → cannot contribute yet.

  const circle = await circles.createCircle({
    coordinatorId: coord,
    name: 'Chase Circle',
    contributionAmount: C,
    frequency: 'daily',
    memberCap: 2,
  });
  await circles.addMember({ coordinatorId: coord, circleId: circle.id, userId: late });
  await circles.setPayoutOrder({
    coordinatorId: coord,
    circleId: circle.id,
    order: await orderedMemberships(coord, circle.id, [coord, late]),
  });
  await circles.startCircle({ coordinatorId: coord, circleId: circle.id });

  // Force the deadline into the past so this tick marks the miss.
  await pool.query(
    `UPDATE rounds SET due_at = now() - interval '1 hour'
      WHERE circle_id = $1 AND status = 'collecting'`,
    [circle.id],
  );

  await processDueCircles(circle.id);

  // A reminder and a missed notice were posted; the round did not settle.
  const kinds = (
    await pool.query(
      `SELECT metadata->>'kind' AS kind FROM messages
         WHERE conversation_id = $1 AND type = 'system'`,
      [circle.conversationId],
    )
  ).rows.map((r) => r.kind);
  assert.ok(kinds.includes('reminder'));
  assert.ok(kinds.includes('missed'));

  const rep = await trust.getReputation(late);
  assert.equal(rep.missed, 1);
  assert.ok(rep.reliabilityPct !== null && rep.reliabilityPct < 100);

  // Musa funds up; the next tick collects the missed contribution and settles.
  await wallet.fundWallet({ userId: late, amount: 1_000_000 });
  await processDueCircles(circle.id);

  const detail = await circles.getCircle(coord, circle.id);
  const round1 = detail.rounds.find((r) => r.roundNumber === 1);
  assert.equal(round1?.status, 'closed', 'round 1 settles once the late member pays');
});

test('the dashboard reports pot progress and per-member status', { skip }, async () => {
  const circles = await import('./circle.service.js');
  const wallet = await import('../wallet/wallet.service.js');
  const trust = await import('./trust.service.js');

  const C = 500_000;
  const coord = await createUser('Ngozi');
  const m2 = await createUser('Tunde');
  const m3 = await createUser('Zainab');
  const all = [coord, m2, m3];
  for (const u of all) await wallet.fundWallet({ userId: u, amount: 3_000_000 });

  const circle = await circles.createCircle({
    coordinatorId: coord,
    name: 'Dashboard Circle',
    contributionAmount: C,
    frequency: 'weekly',
    memberCap: 3,
  });
  await circles.addMember({ coordinatorId: coord, circleId: circle.id, userId: m2 });
  await circles.addMember({ coordinatorId: coord, circleId: circle.id, userId: m3 });
  await circles.setPayoutOrder({
    coordinatorId: coord,
    circleId: circle.id,
    order: await orderedMemberships(coord, circle.id, [coord, m2, m3]),
  });
  await circles.startCircle({ coordinatorId: coord, circleId: circle.id });

  const dash = await trust.getDashboard(coord, circle.id);
  assert.equal(dash.status, 'active');
  assert.equal(dash.members.length, 3);
  assert.equal(dash.currentRound?.roundNumber, 1);
  assert.equal(dash.currentRound?.potTarget, C * 3);
  assert.equal(dash.currentRound?.potCollected, 0); // nothing collected yet
  assert.equal(dash.roundsTotal, 3);
  assert.ok(dash.members.some((mem) => mem.isRecipientThisRound));
});

test('members raise disputes; only the coordinator resolves them', { skip }, async () => {
  const circles = await import('./circle.service.js');
  const disputes = await import('./dispute.service.js');
  const wallet = await import('../wallet/wallet.service.js');

  const coord = await createUser('Emeka');
  const member = await createUser('Bisi');
  await wallet.fundWallet({ userId: coord, amount: 1_000_000 });

  const circle = await circles.createCircle({
    coordinatorId: coord,
    name: 'Dispute Circle',
    contributionAmount: 500_000,
    frequency: 'monthly',
    memberCap: 2,
  });
  await circles.addMember({ coordinatorId: coord, circleId: circle.id, userId: member });

  const raised = await disputes.raiseDispute({
    userId: member,
    circleId: circle.id,
    reason: 'The payout order looks wrong to me.',
  });
  assert.equal(raised.status, 'open');

  // A non-coordinator cannot resolve.
  await assert.rejects(
    disputes.resolveDispute({
      userId: member,
      circleId: circle.id,
      disputeId: raised.id,
      status: 'resolved',
      resolution: 'nope',
    }),
    /coordinator/,
  );

  const resolved = await disputes.resolveDispute({
    userId: coord,
    circleId: circle.id,
    disputeId: raised.id,
    status: 'resolved',
    resolution: 'Order confirmed with the group; no change needed.',
  });
  assert.equal(resolved.status, 'resolved');
  assert.equal((await disputes.listDisputes(coord, circle.id)).length, 1);
});
