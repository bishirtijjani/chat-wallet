import type { Circle, CircleMember, Contribution, Frequency, Round } from '@caw/shared';
import { SYSTEM_ACCOUNTS, computeCycleFee, formatNaira, kobo } from '@caw/shared';
import type { PoolClient } from '../../db/pool.js';
import { pool, withTransaction } from '../../db/pool.js';
import { AppError } from '../../http/errors.js';
import {
  createCircleEscrowAccount,
  getAccountByCode,
  getBalance,
  getOrCreateUserWallet,
  lockAccount,
  postTransaction,
} from '../wallet/ledger.service.js';
import {
  addConversationMember,
  createGroupConversationTx,
  postSystemMessage,
} from '../chat/chat.service.js';
import { addUserToConversationRoom } from '../../realtime/realtime.js';
import { openNextRound } from './round.engine.js';

/**
 * Circle service — the ROSCA lifecycle (PROJECT_BIBLE §3.2): a coordinator
 * creates a circle (which owns a group chat and an escrow account), adds the
 * members they trust, sets the payout order via a draggable list, and starts it.
 */

const CIRCLE_COLS = `id, name, contribution_amount, frequency, payout_order_method, member_cap,
  status, start_date, coordinator_id, escrow_account_id, conversation_id, current_round, created_at`;

// ── Lifecycle ────────────────────────────────────────────────────────────────

export async function createCircle(params: {
  coordinatorId: string;
  name: string;
  contributionAmount: number;
  frequency: Frequency;
  memberCap: number;
}): Promise<Circle> {
  const circle = await withTransaction(async (client) => {
    const escrow = await createCircleEscrowAccount(client);
    const conversation = await createGroupConversationTx(client, {
      title: params.name,
      createdBy: params.coordinatorId,
      members: [{ userId: params.coordinatorId, role: 'admin' }],
    });

    const inserted = await client.query(
      `INSERT INTO circles
         (name, contribution_amount, frequency, member_cap,
          coordinator_id, escrow_account_id, conversation_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING ${CIRCLE_COLS}`,
      [
        params.name,
        params.contributionAmount,
        params.frequency,
        params.memberCap,
        params.coordinatorId,
        escrow.id,
        conversation.id,
      ],
    );
    const circle = mapCircle(inserted.rows[0]);

    await client.query(`UPDATE conversations SET circle_id = $2 WHERE id = $1`, [
      conversation.id,
      circle.id,
    ]);
    // The coordinator is the first circle member.
    await client.query(
      `INSERT INTO circle_members (circle_id, user_id, status) VALUES ($1, $2, 'active')`,
      [circle.id, params.coordinatorId],
    );

    const label = await userLabel(client, params.coordinatorId);
    await postSystemMessage(
      conversation.id,
      `${label} created the circle "${params.name}". ` +
        `Contribution: ${formatNaira(kobo(params.contributionAmount))} ${params.frequency}, ` +
        `${params.memberCap} members.`,
      { kind: 'circle_created' },
      client,
    );
    return circle;
  });

  await addUserToConversationRoom(params.coordinatorId, circle.conversationId);
  return circle;
}

/** Add a member to a forming circle (coordinator only). */
export async function addMember(params: {
  coordinatorId: string;
  circleId: string;
  userId: string;
}): Promise<CircleMember> {
  const membership = await withTransaction(async (client) => {
    const circle = await loadCircleForUpdate(client, params.circleId);
    assertCoordinator(circle, params.coordinatorId);
    if (circle.status !== 'forming') {
      throw AppError.conflict('Members can only be added while the circle is forming');
    }

    const count = await activeMemberCount(client, circle.id);
    if (count >= circle.memberCap) throw AppError.conflict('Circle is already full');

    const inserted = await client.query(
      `INSERT INTO circle_members (circle_id, user_id, status)
       VALUES ($1, $2, 'active')
       ON CONFLICT (circle_id, user_id) DO NOTHING
       RETURNING id, circle_id, user_id, position, status, joined_at`,
      [circle.id, params.userId],
    );
    if (!inserted.rows[0]) throw AppError.conflict('That user is already a member');

    await addConversationMember(client, circle.conversationId, params.userId, 'member');

    const label = await userLabel(client, params.userId);
    await postSystemMessage(
      circle.conversationId,
      `${label} joined the circle.`,
      { kind: 'member_added' },
      client,
    );
    return { membership: mapMember(inserted.rows[0]), conversationId: circle.conversationId };
  });

  await addUserToConversationRoom(params.userId, membership.conversationId);
  return membership.membership;
}

/**
 * Set the payout order from a draggable list of membership ids (coordinator
 * only, forming only). The array's index becomes each member's position (1..N).
 */
export async function setPayoutOrder(params: {
  coordinatorId: string;
  circleId: string;
  order: string[];
}): Promise<void> {
  await withTransaction(async (client) => {
    const circle = await loadCircleForUpdate(client, params.circleId);
    assertCoordinator(circle, params.coordinatorId);
    if (circle.status !== 'forming') {
      throw AppError.conflict('The payout order can only be set while forming');
    }

    const { rows } = await client.query(
      `SELECT id FROM circle_members WHERE circle_id = $1 AND status = 'active'`,
      [circle.id],
    );
    const memberIds = new Set(rows.map((r) => r.id as string));
    const provided = new Set(params.order);
    if (provided.size !== params.order.length) {
      throw AppError.badRequest('The payout order contains duplicates');
    }
    if (params.order.length !== memberIds.size || ![...provided].every((id) => memberIds.has(id))) {
      throw AppError.badRequest('The payout order must list every active member exactly once');
    }

    // Clear positions first to avoid tripping the unique (circle, position) index.
    await client.query(`UPDATE circle_members SET position = NULL WHERE circle_id = $1`, [
      circle.id,
    ]);
    for (let i = 0; i < params.order.length; i += 1) {
      await client.query(
        `UPDATE circle_members SET position = $2 WHERE id = $1 AND circle_id = $3`,
        [params.order[i], i + 1, circle.id],
      );
    }

    await postSystemMessage(
      circle.conversationId,
      `The payout order is set. Round 1 pays the member at position 1, and so on.`,
      { kind: 'order_set' },
      client,
    );
  });
}

/**
 * Start the circle: validate the roster and order, charge the coordinator the
 * one-time cycle fee, flip to 'active', and open round 1.
 */
export async function startCircle(params: {
  coordinatorId: string;
  circleId: string;
}): Promise<{ cycleFee: number }> {
  return withTransaction(async (client) => {
    const circle = await loadCircleForUpdate(client, params.circleId);
    assertCoordinator(circle, params.coordinatorId);
    if (circle.status !== 'forming') throw AppError.conflict('Circle is not in the forming state');

    const members = await client.query(
      `SELECT position FROM circle_members WHERE circle_id = $1 AND status = 'active'`,
      [circle.id],
    );
    if (members.rows.length !== circle.memberCap) {
      throw AppError.unprocessable(
        `Need exactly ${circle.memberCap} members to start (have ${members.rows.length})`,
      );
    }
    // Positions must be a permutation of 1..N.
    const positions = members.rows.map((r) => r.position as number | null);
    const expected = new Set(Array.from({ length: circle.memberCap }, (_, i) => i + 1));
    if (positions.some((p) => p === null) || new Set(positions).size !== expected.size) {
      throw AppError.unprocessable('Set a complete payout order before starting');
    }

    // Cycle fee: charged once to the coordinator (PROJECT_BIBLE §6).
    const oneRoundPot = kobo(circle.contributionAmount * circle.memberCap);
    const fee = computeCycleFee(oneRoundPot);
    const coordinatorWallet = await getOrCreateUserWallet(client, circle.coordinatorId);
    await lockAccount(client, coordinatorWallet.id);
    const balance = await getBalance(client, coordinatorWallet.id);
    if (balance < fee) {
      throw AppError.unprocessable('Coordinator has insufficient balance for the cycle fee', {
        fee,
        balance,
      });
    }
    const feesAccount = await getAccountByCode(client, SYSTEM_ACCOUNTS.feesRevenue);
    await postTransaction(client, {
      kind: 'cycle_fee',
      reference: `cycle_fee:${circle.id}`,
      idempotencyKey: `cycle_fee:${circle.id}`,
      metadata: { circleId: circle.id },
      legs: [
        { accountId: coordinatorWallet.id, direction: 'debit', amount: fee },
        { accountId: feesAccount.id, direction: 'credit', amount: fee },
      ],
    });

    await client.query(`UPDATE circles SET status = 'active', start_date = now() WHERE id = $1`, [
      circle.id,
    ]);
    await postSystemMessage(
      circle.conversationId,
      `The circle has started! ${circle.memberCap} rounds of ` +
        `${formatNaira(kobo(circle.contributionAmount))} ${circle.frequency}. ` +
        `Cycle fee of ${formatNaira(fee)} charged to the coordinator.`,
      { kind: 'circle_started' },
      client,
    );

    await openNextRound(client, {
      id: circle.id,
      conversationId: circle.conversationId,
      escrowAccountId: circle.escrowAccountId,
      memberCap: circle.memberCap,
      contributionAmount: circle.contributionAmount,
      currentRound: 0,
    });

    return { cycleFee: fee };
  });
}

// ── Reads ────────────────────────────────────────────────────────────────────

export interface CircleDetail extends Circle {
  members: (CircleMember & { displayName: string | null; phone: string })[];
  rounds: Round[];
  currentRoundContributions: (Contribution & { userId: string })[];
}

export async function getCircle(userId: string, circleId: string): Promise<CircleDetail> {
  await assertMember(pool, circleId, userId);
  const circleRes = await pool.query(`SELECT ${CIRCLE_COLS} FROM circles WHERE id = $1`, [circleId]);
  if (!circleRes.rows[0]) throw AppError.notFound('Circle not found');
  const circle = mapCircle(circleRes.rows[0]);

  const membersRes = await pool.query(
    `SELECT cm.id, cm.circle_id, cm.user_id, cm.position, cm.status, cm.joined_at,
            u.display_name, u.phone
       FROM circle_members cm JOIN users u ON u.id = cm.user_id
      WHERE cm.circle_id = $1
      ORDER BY cm.position NULLS LAST, cm.joined_at`,
    [circleId],
  );
  const roundsRes = await pool.query(
    `SELECT id, circle_id, round_number, recipient_membership_id, pot_amount, status,
            opened_at, paid_at, created_at
       FROM rounds WHERE circle_id = $1 ORDER BY round_number`,
    [circleId],
  );

  let contributions: (Contribution & { userId: string })[] = [];
  if (circle.currentRound > 0) {
    const contribRes = await pool.query(
      `SELECT c.id, c.round_id, c.membership_id, c.amount, c.status, c.transaction_id, c.paid_at,
              m.user_id
         FROM contributions c
         JOIN circle_members m ON m.id = c.membership_id
         JOIN rounds r ON r.id = c.round_id
        WHERE r.circle_id = $1 AND r.round_number = $2`,
      [circleId, circle.currentRound],
    );
    contributions = contribRes.rows.map(mapContribution);
  }

  return {
    ...circle,
    members: membersRes.rows.map((r) => ({
      ...mapMember(r),
      displayName: (r.display_name as string | null) ?? null,
      phone: r.phone as string,
    })),
    rounds: roundsRes.rows.map(mapRound),
    currentRoundContributions: contributions,
  };
}

export async function listCircles(userId: string): Promise<Circle[]> {
  const { rows } = await pool.query(
    `SELECT ${prefixed('c', CIRCLE_COLS)}
       FROM circles c
       JOIN circle_members m ON m.circle_id = c.id
      WHERE m.user_id = $1
      ORDER BY c.created_at DESC`,
    [userId],
  );
  return rows.map(mapCircle);
}

/** Assert the user is a member of the circle (used to gate reads). */
export async function assertMember(
  db: Pick<PoolClient, 'query'>,
  circleId: string,
  userId: string,
): Promise<void> {
  const { rows } = await db.query(
    `SELECT 1 FROM circle_members WHERE circle_id = $1 AND user_id = $2`,
    [circleId, userId],
  );
  if (!rows[0]) throw AppError.forbidden('Not a member of this circle');
}

/** Assert the user is the circle's coordinator (used to gate lifecycle actions). */
export async function assertIsCoordinator(circleId: string, userId: string): Promise<void> {
  const { rows } = await pool.query(`SELECT coordinator_id FROM circles WHERE id = $1`, [circleId]);
  if (!rows[0]) throw AppError.notFound('Circle not found');
  if (rows[0].coordinator_id !== userId) throw AppError.forbidden('Only the coordinator can do that');
}

// ── Helpers ──────────────────────────────────────────────────────────────────

interface CircleRow {
  id: string;
  status: Circle['status'];
  coordinatorId: string;
  conversationId: string;
  escrowAccountId: string;
  memberCap: number;
  contributionAmount: number;
  frequency: Frequency;
}

async function loadCircleForUpdate(client: PoolClient, circleId: string): Promise<CircleRow> {
  const { rows } = await client.query(
    `SELECT id, status, coordinator_id, conversation_id, escrow_account_id,
            member_cap, contribution_amount, frequency
       FROM circles WHERE id = $1 FOR UPDATE`,
    [circleId],
  );
  const row = rows[0];
  if (!row) throw AppError.notFound('Circle not found');
  return {
    id: row.id,
    status: row.status,
    coordinatorId: row.coordinator_id,
    conversationId: row.conversation_id,
    escrowAccountId: row.escrow_account_id,
    memberCap: Number(row.member_cap),
    contributionAmount: Number(row.contribution_amount),
    frequency: row.frequency,
  };
}

function assertCoordinator(circle: CircleRow, userId: string): void {
  if (circle.coordinatorId !== userId) {
    throw AppError.forbidden('Only the coordinator can do that');
  }
}

async function activeMemberCount(client: PoolClient, circleId: string): Promise<number> {
  const { rows } = await client.query(
    `SELECT COUNT(*)::int AS n FROM circle_members WHERE circle_id = $1 AND status = 'active'`,
    [circleId],
  );
  return rows[0].n as number;
}

async function userLabel(db: Pick<PoolClient, 'query'>, userId: string): Promise<string> {
  const { rows } = await db.query(`SELECT display_name, phone FROM users WHERE id = $1`, [userId]);
  return (rows[0]?.display_name as string) || (rows[0]?.phone as string) || 'A member';
}

function prefixed(alias: string, cols: string): string {
  return cols
    .split(',')
    .map((c) => `${alias}.${c.trim()}`)
    .join(', ');
}

function mapCircle(row: Record<string, unknown>): Circle {
  return {
    id: row.id as string,
    name: row.name as string,
    contributionAmount: Number(row.contribution_amount),
    frequency: row.frequency as Frequency,
    payoutOrderMethod: row.payout_order_method as Circle['payoutOrderMethod'],
    memberCap: Number(row.member_cap),
    status: row.status as Circle['status'],
    startDate: row.start_date ? toIso(row.start_date) : null,
    coordinatorId: row.coordinator_id as string,
    escrowAccountId: row.escrow_account_id as string,
    conversationId: row.conversation_id as string,
    currentRound: Number(row.current_round),
    createdAt: toIso(row.created_at),
  };
}

function mapMember(row: Record<string, unknown>): CircleMember {
  return {
    id: row.id as string,
    circleId: row.circle_id as string,
    userId: row.user_id as string,
    position: row.position === null ? null : Number(row.position),
    status: row.status as CircleMember['status'],
    joinedAt: toIso(row.joined_at),
  };
}

function mapRound(row: Record<string, unknown>): Round {
  return {
    id: row.id as string,
    circleId: row.circle_id as string,
    roundNumber: Number(row.round_number),
    recipientMembershipId: (row.recipient_membership_id as string | null) ?? null,
    potAmount: Number(row.pot_amount),
    status: row.status as Round['status'],
    openedAt: row.opened_at ? toIso(row.opened_at) : null,
    paidAt: row.paid_at ? toIso(row.paid_at) : null,
    createdAt: toIso(row.created_at),
  };
}

function mapContribution(row: Record<string, unknown>): Contribution & { userId: string } {
  return {
    id: row.id as string,
    roundId: row.round_id as string,
    membershipId: row.membership_id as string,
    amount: Number(row.amount),
    status: row.status as Contribution['status'],
    transactionId: (row.transaction_id as string | null) ?? null,
    paidAt: row.paid_at ? toIso(row.paid_at) : null,
    userId: row.user_id as string,
  };
}

function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}
