import type { Reputation } from '@caw/shared';
import { pool } from '../../db/pool.js';
import { AppError } from '../../http/errors.js';
import { assertMember } from './circle.service.js';

/**
 * Trust surfaces (PROJECT_BIBLE §3.2 / M4). Reputation is DERIVED from the
 * append-only contribution history — never a mutable counter — so it can't drift
 * from the ledger. The dashboard gives a coordinator an at-a-glance view of who
 * has paid, who is late, and how the pot is filling.
 */

export async function getReputation(userId: string): Promise<Reputation> {
  const contrib = await pool.query(
    `SELECT
        COUNT(*)::int                                                          AS total,
        COUNT(*) FILTER (WHERE c.status = 'paid')::int                         AS paid,
        COUNT(*) FILTER (WHERE c.missed_at IS NOT NULL)::int                   AS missed,
        COUNT(*) FILTER (WHERE c.status = 'paid' AND c.missed_at IS NULL)::int AS on_time
       FROM contributions c
       JOIN circle_members m ON m.id = c.membership_id
      WHERE m.user_id = $1`,
    [userId],
  );
  const c = contrib.rows[0];

  const circles = await pool.query(
    `SELECT
        COUNT(*) FILTER (WHERE ci.status = 'completed')::int AS completed,
        COUNT(*) FILTER (WHERE ci.status = 'active')::int    AS active,
        COUNT(*)::int                                        AS total
       FROM circle_members m JOIN circles ci ON ci.id = m.circle_id
      WHERE m.user_id = $1`,
    [userId],
  );
  const cir = circles.rows[0];

  const total = c.total as number;
  return {
    totalContributions: total,
    paid: c.paid as number,
    missed: c.missed as number,
    onTime: c.on_time as number,
    reliabilityPct: total > 0 ? Math.round((100 * (c.on_time as number)) / total) : null,
    circlesCompleted: cir.completed as number,
    circlesActive: cir.active as number,
    circlesTotal: cir.total as number,
  };
}

export interface Dashboard {
  circleId: string;
  status: string;
  currentRound: {
    roundNumber: number;
    status: string;
    recipientName: string | null;
    dueAt: string | null;
    potCollected: number;
    potTarget: number;
  } | null;
  members: {
    membershipId: string;
    name: string;
    position: number | null;
    isRecipientThisRound: boolean;
    currentStatus: 'paid' | 'due' | 'missed' | null;
    missedTotal: number;
  }[];
  roundsCompleted: number;
  roundsTotal: number;
}

export async function getDashboard(userId: string, circleId: string): Promise<Dashboard> {
  await assertMember(pool, circleId, userId);

  const circleRes = await pool.query(
    `SELECT status, member_cap, contribution_amount, current_round FROM circles WHERE id = $1`,
    [circleId],
  );
  const circle = circleRes.rows[0];
  if (!circle) throw AppError.notFound('Circle not found');

  const memberCap = Number(circle.member_cap);
  const contribution = Number(circle.contribution_amount);
  const currentRound = Number(circle.current_round);

  const roundsCompleted = (
    await pool.query(
      `SELECT COUNT(*)::int AS n FROM rounds WHERE circle_id = $1 AND status = 'closed'`,
      [circleId],
    )
  ).rows[0].n as number;

  // The open round (if any) and its recipient membership.
  const roundRes = await pool.query(
    `SELECT id, round_number, status, recipient_membership_id, due_at, pot_amount
       FROM rounds WHERE circle_id = $1 AND status = 'collecting'
      ORDER BY round_number DESC LIMIT 1`,
    [circleId],
  );
  const round = roundRes.rows[0] ?? null;

  // Members with their per-circle missed totals and current-round status.
  const membersRes = await pool.query(
    `SELECT cm.id, cm.position, cm.user_id, u.display_name, u.phone,
            (SELECT COUNT(*)::int FROM contributions c2
               JOIN rounds r2 ON r2.id = c2.round_id
              WHERE c2.membership_id = cm.id AND r2.circle_id = $1 AND c2.missed_at IS NOT NULL)
              AS missed_total,
            cc.status AS current_status
       FROM circle_members cm
       JOIN users u ON u.id = cm.user_id
       LEFT JOIN contributions cc ON cc.membership_id = cm.id AND cc.round_id = $2
      WHERE cm.circle_id = $1
      ORDER BY cm.position NULLS LAST, cm.joined_at`,
    [circleId, round?.id ?? null],
  );

  const recipientName = round
    ? ((
        await pool.query(
          `SELECT u.display_name, u.phone FROM circle_members cm
             JOIN users u ON u.id = cm.user_id WHERE cm.id = $1`,
          [round.recipient_membership_id],
        )
      ).rows[0] ?? null)
    : null;

  return {
    circleId,
    status: circle.status as string,
    currentRound: round
      ? {
          roundNumber: Number(round.round_number),
          status: round.status as string,
          recipientName: recipientName
            ? (recipientName.display_name as string) || (recipientName.phone as string)
            : null,
          dueAt: round.due_at ? new Date(round.due_at as string).toISOString() : null,
          potCollected: Number(round.pot_amount),
          potTarget: memberCap * contribution,
        }
      : null,
    members: membersRes.rows.map((r) => ({
      membershipId: r.id as string,
      name: (r.display_name as string) || (r.phone as string),
      position: r.position === null ? null : Number(r.position),
      isRecipientThisRound: round ? r.id === round.recipient_membership_id : false,
      currentStatus: (r.current_status as 'paid' | 'due' | 'missed' | null) ?? null,
      missedTotal: r.missed_total as number,
    })),
    roundsCompleted,
    roundsTotal: memberCap,
  };
}
