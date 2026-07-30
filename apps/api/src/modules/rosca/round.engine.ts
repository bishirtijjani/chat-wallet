import { formatNaira, kobo } from '@caw/shared';
import type { PoolClient } from '../../db/pool.js';
import { pool, withTransaction } from '../../db/pool.js';
import { AppError } from '../../http/errors.js';
import {
  getAccountByCode,
  getBalance,
  getOrCreateUserWallet,
  lockAccount,
  postTransaction,
} from '../wallet/ledger.service.js';
import { postSystemMessage } from '../chat/chat.service.js';

/**
 * The round engine runs the rotation (PROJECT_BIBLE §3.2): open a round, collect
 * every active member's contribution into escrow, and pay the pot to the round's
 * recipient — narrating each step into the circle's chat as a system message.
 *
 * In M3 these are called on demand (coordinator or tests). The scheduled worker
 * (roadmap M-later) will call the same functions on a cron.
 */

export interface EngineCircle {
  id: string;
  conversationId: string;
  escrowAccountId: string;
  memberCap: number;
  contributionAmount: number;
  currentRound: number;
}

async function userLabel(db: Pick<PoolClient, 'query'>, userId: string): Promise<string> {
  const { rows } = await db.query(`SELECT display_name, phone FROM users WHERE id = $1`, [userId]);
  return (rows[0]?.display_name as string) || (rows[0]?.phone as string) || 'A member';
}

/**
 * Open the next round, or complete the circle if the cycle is done. Runs inside
 * the caller's transaction. Returns true if a round was opened, false if the
 * circle completed.
 */
export async function openNextRound(client: PoolClient, circle: EngineCircle): Promise<boolean> {
  const next = circle.currentRound + 1;

  if (next > circle.memberCap) {
    await client.query(`UPDATE circles SET status = 'completed' WHERE id = $1`, [circle.id]);
    await postSystemMessage(
      circle.conversationId,
      `🎉 All ${circle.memberCap} rounds are complete. The cycle is finished — well done, everyone!`,
      { kind: 'circle_completed' },
      client,
    );
    return false;
  }

  const recipient = await client.query(
    `SELECT id, user_id FROM circle_members
      WHERE circle_id = $1 AND position = $2 AND status = 'active'`,
    [circle.id, next],
  );
  const recipientRow = recipient.rows[0];
  if (!recipientRow) {
    throw AppError.unprocessable(`No active member holds payout position ${next}`);
  }

  const round = await client.query(
    `INSERT INTO rounds (circle_id, round_number, recipient_membership_id, status, opened_at)
     VALUES ($1, $2, $3, 'collecting', now())
     RETURNING id`,
    [circle.id, next, recipientRow.id],
  );
  const roundId = round.rows[0].id as string;

  // One 'due' contribution per active member (the recipient contributes too).
  await client.query(
    `INSERT INTO contributions (round_id, membership_id, amount, status)
     SELECT $1, id, $2, 'due' FROM circle_members
      WHERE circle_id = $3 AND status = 'active'`,
    [roundId, circle.contributionAmount, circle.id],
  );

  await client.query(`UPDATE circles SET current_round = $2 WHERE id = $1`, [circle.id, next]);

  const recipientName = await userLabel(client, recipientRow.user_id as string);
  await postSystemMessage(
    circle.conversationId,
    `Round ${next} is open. Everyone contribute ${formatNaira(kobo(circle.contributionAmount))}. ` +
      `This round pays out to ${recipientName}.`,
    { kind: 'round_opened', roundNumber: next },
    client,
  );
  return true;
}

/**
 * Auto-debit every still-due contribution in the circle's open round from the
 * member's wallet into escrow. Members without enough balance are left 'due'
 * (transparency, not enforcement — PROJECT_BIBLE §3.2). Each collection is its
 * own ledger transaction and is idempotent per contribution.
 */
export async function collectDueContributions(
  circleId: string,
): Promise<{ collected: number; pending: number }> {
  const circle = await loadEngineCircle(pool, circleId);
  const round = await pool.query(
    `SELECT id FROM rounds WHERE circle_id = $1 AND status = 'collecting'
      ORDER BY round_number DESC LIMIT 1`,
    [circleId],
  );
  const roundRow = round.rows[0];
  if (!roundRow) return { collected: 0, pending: 0 };
  const roundId = roundRow.id as string;

  const dues = await pool.query(
    `SELECT c.id, c.amount, c.membership_id, m.user_id
       FROM contributions c
       JOIN circle_members m ON m.id = c.membership_id
      WHERE c.round_id = $1 AND c.status = 'due'`,
    [roundId],
  );

  let collected = 0;
  let pending = 0;

  for (const due of dues.rows) {
    const amount = Number(due.amount);
    const paid = await withTransaction(async (client) => {
      const wallet = await getOrCreateUserWallet(client, due.user_id as string);
      await lockAccount(client, wallet.id);
      const balance = await getBalance(client, wallet.id);
      if (balance < amount) return false;

      const tx = await postTransaction(client, {
        kind: 'contribution',
        reference: `contribution:${due.id}`,
        idempotencyKey: `contribution:${due.id}`,
        metadata: { circleId, roundId },
        legs: [
          { accountId: wallet.id, direction: 'debit', amount },
          { accountId: circle.escrowAccountId, direction: 'credit', amount },
        ],
      });

      await client.query(
        `UPDATE contributions SET status = 'paid', transaction_id = $2, paid_at = now()
          WHERE id = $1`,
        [due.id, tx.id],
      );
      await client.query(`UPDATE rounds SET pot_amount = pot_amount + $2 WHERE id = $1`, [
        roundId,
        amount,
      ]);

      const name = await userLabel(client, due.user_id as string);
      await postSystemMessage(
        circle.conversationId,
        `${name} contributed ${formatNaira(kobo(amount))}.`,
        { kind: 'contribution' },
        client,
      );
      return true;
    });

    if (paid) collected += 1;
    else pending += 1;
  }

  return { collected, pending };
}

/**
 * Settle the open round: once fully funded, pay the pot from escrow to the
 * recipient's wallet, record the payout, close the round, and open the next one
 * (or complete the circle). Throws if the round isn't fully collected yet.
 */
export async function settleRound(
  circleId: string,
): Promise<{ paidTo: string; amount: number; completed: boolean }> {
  return withTransaction(async (client) => {
    const round = await client.query(
      `SELECT id, round_number, recipient_membership_id, pot_amount
         FROM rounds WHERE circle_id = $1 AND status = 'collecting'
        ORDER BY round_number DESC LIMIT 1
        FOR UPDATE`,
      [circleId],
    );
    const roundRow = round.rows[0];
    if (!roundRow) throw AppError.notFound('No open round to settle');

    const outstanding = await client.query(
      `SELECT COUNT(*)::int AS n FROM contributions
        WHERE round_id = $1 AND status <> 'paid'`,
      [roundRow.id],
    );
    if (outstanding.rows[0].n > 0) {
      throw AppError.unprocessable('Round is not fully funded yet', {
        outstanding: outstanding.rows[0].n,
      });
    }

    const circle = await loadEngineCircle(client, circleId);
    const pot = Number(roundRow.pot_amount);

    const recipient = await client.query(
      `SELECT user_id FROM circle_members WHERE id = $1`,
      [roundRow.recipient_membership_id],
    );
    const recipientUserId = recipient.rows[0].user_id as string;

    await lockAccount(client, circle.escrowAccountId);
    const recipientWallet = await getOrCreateUserWallet(client, recipientUserId);

    const tx = await postTransaction(client, {
      kind: 'payout',
      reference: `payout:${roundRow.id}`,
      idempotencyKey: `payout:${roundRow.id}`,
      metadata: { circleId, roundId: roundRow.id },
      legs: [
        { accountId: circle.escrowAccountId, direction: 'debit', amount: pot },
        { accountId: recipientWallet.id, direction: 'credit', amount: pot },
      ],
    });

    await client.query(
      `INSERT INTO payouts (round_id, recipient_membership_id, amount, transaction_id)
       VALUES ($1, $2, $3, $4)`,
      [roundRow.id, roundRow.recipient_membership_id, pot, tx.id],
    );
    await client.query(`UPDATE rounds SET status = 'closed', paid_at = now() WHERE id = $1`, [
      roundRow.id,
    ]);

    const name = await userLabel(client, recipientUserId);
    await postSystemMessage(
      circle.conversationId,
      `💸 Payout of ${formatNaira(kobo(pot))} sent to ${name}. Congratulations!`,
      { kind: 'payout' },
      client,
    );

    const opened = await openNextRound(client, {
      ...circle,
      currentRound: Number(roundRow.round_number),
    });

    return { paidTo: name, amount: pot, completed: !opened };
  });
}

/** Load just the fields the engine needs, from a client or the pool. */
export async function loadEngineCircle(
  db: Pick<PoolClient, 'query'>,
  circleId: string,
): Promise<EngineCircle> {
  const { rows } = await db.query(
    `SELECT id, conversation_id, escrow_account_id, member_cap, contribution_amount, current_round
       FROM circles WHERE id = $1`,
    [circleId],
  );
  const row = rows[0];
  if (!row) throw AppError.notFound('Circle not found');
  return {
    id: row.id as string,
    conversationId: row.conversation_id as string,
    escrowAccountId: row.escrow_account_id as string,
    memberCap: Number(row.member_cap),
    contributionAmount: Number(row.contribution_amount),
    currentRound: Number(row.current_round),
  };
}
