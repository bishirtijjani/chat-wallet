import type { PoolClient } from '../../db/pool.js';
import { pool } from '../../db/pool.js';
import { logger } from '../../logger.js';
import { postSystemMessage } from '../chat/chat.service.js';
import { collectDueContributions, loadEngineCircle, settleRound } from './round.engine.js';

/**
 * The scheduler is the clock (PROJECT_BIBLE §4.4). On each tick it walks every
 * active circle's open round and:
 *   1. auto-collects contributions from members whose wallets are funded,
 *   2. posts a one-time reminder as the deadline approaches,
 *   3. marks still-unpaid contributions 'missed' once the deadline passes,
 *   4. settles + opens the next round when the pot is fully collected.
 *
 * Every money move it makes is idempotent (contribution:/payout: keys), so
 * overlapping or repeated ticks can never double-charge — that idempotency is
 * what makes the scheduler safe to run without distributed locking for now.
 */

const REMINDER_WINDOW_MS = 24 * 60 * 60 * 1000; // remind within 24h of the deadline

export interface TickResult {
  circlesProcessed: number;
  collected: number;
  missed: number;
  settled: number;
  reminders: number;
}

/**
 * Process active circles with an open round. Pass `onlyCircleId` to restrict the
 * tick to a single circle (used by tests to stay isolated on a shared database).
 */
export async function processDueCircles(onlyCircleId?: string): Promise<TickResult> {
  const { rows } = await pool.query(
    `SELECT DISTINCT c.id
       FROM circles c
       JOIN rounds r ON r.circle_id = c.id AND r.status = 'collecting'
      WHERE c.status = 'active' AND ($1::uuid IS NULL OR c.id = $1)`,
    [onlyCircleId ?? null],
  );

  const total: TickResult = {
    circlesProcessed: 0,
    collected: 0,
    missed: 0,
    settled: 0,
    reminders: 0,
  };

  for (const row of rows) {
    try {
      const r = await processCircle(row.id as string);
      total.circlesProcessed += 1;
      total.collected += r.collected;
      total.missed += r.missed;
      total.settled += r.settled;
      total.reminders += r.reminders;
    } catch (err) {
      logger.error({ err, circleId: row.id }, 'scheduler failed to process circle');
    }
  }

  return total;
}

async function processCircle(
  circleId: string,
): Promise<{ collected: number; missed: number; settled: number; reminders: number }> {
  const out = { collected: 0, missed: 0, settled: 0, reminders: 0 };
  const circle = await loadEngineCircle(pool, circleId);

  // 1. Pull in whatever can be collected right now.
  out.collected = (await collectDueContributions(circleId)).collected;

  const roundRes = await pool.query(
    `SELECT id, due_at, reminder_sent_at FROM rounds
      WHERE circle_id = $1 AND status = 'collecting'
      ORDER BY round_number DESC LIMIT 1`,
    [circleId],
  );
  const round = roundRes.rows[0];
  if (!round) return out; // nothing open (e.g. just completed)

  const unpaid = await pool.query(
    `SELECT c.status, m.user_id
       FROM contributions c JOIN circle_members m ON m.id = c.membership_id
      WHERE c.round_id = $1 AND c.status <> 'paid'`,
    [round.id],
  );

  // 4. Fully funded → settle and open the next round.
  if (unpaid.rows.length === 0) {
    await settleRound(circleId);
    out.settled = 1;
    return out;
  }

  const now = Date.now();
  const dueAt = new Date(round.due_at as string).getTime();

  // 2. One-time reminder as the deadline approaches.
  if (!round.reminder_sent_at && now >= dueAt - REMINDER_WINDOW_MS) {
    const names = await labels(
      pool,
      unpaid.rows.map((r) => r.user_id as string),
    );
    await postSystemMessage(
      circle.conversationId,
      `⏰ Reminder: ${names.join(', ')} still need to contribute before the deadline.`,
      { kind: 'reminder' },
    );
    await pool.query(`UPDATE rounds SET reminder_sent_at = now() WHERE id = $1`, [round.id]);
    out.reminders = 1;
  }

  // 3. Deadline passed → mark the still-'due' contributions missed.
  if (now >= dueAt) {
    const marked = await pool.query(
      `UPDATE contributions SET status = 'missed', missed_at = now()
        WHERE round_id = $1 AND status = 'due'
        RETURNING membership_id`,
      [round.id],
    );
    if (marked.rows.length > 0) {
      out.missed = marked.rows.length;
      const missedUsers = await pool.query(
        `SELECT m.user_id FROM contributions c JOIN circle_members m ON m.id = c.membership_id
          WHERE c.round_id = $1 AND c.status = 'missed'`,
        [round.id],
      );
      const names = await labels(
        pool,
        missedUsers.rows.map((r) => r.user_id as string),
      );
      await postSystemMessage(
        circle.conversationId,
        `⚠️ Missed this round: ${names.join(', ')}. The coordinator will follow up — ` +
          `they can still contribute and the round will collect automatically.`,
        { kind: 'missed' },
      );
    }
  }

  return out;
}

async function labels(db: Pick<PoolClient, 'query'>, userIds: string[]): Promise<string[]> {
  if (userIds.length === 0) return [];
  const { rows } = await db.query(
    `SELECT id, display_name, phone FROM users WHERE id = ANY($1)`,
    [userIds],
  );
  const byId = new Map(
    rows.map((r) => [r.id as string, (r.display_name as string) || (r.phone as string)]),
  );
  return userIds.map((id) => byId.get(id) ?? 'A member');
}
