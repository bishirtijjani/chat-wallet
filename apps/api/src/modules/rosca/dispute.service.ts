import type { Dispute, DisputeStatus } from '@caw/shared';
import { pool, withTransaction } from '../../db/pool.js';
import { AppError } from '../../http/errors.js';
import { postSystemMessage } from '../chat/chat.service.js';
import { assertMember } from './circle.service.js';

/**
 * Disputes (PROJECT_BIBLE §3.2 / M4): a lightweight, on-the-record way for a
 * member to flag a problem (a missed payment, a wrong order, a disagreement).
 * A dispute NEVER moves money — the platform surfaces the truth and the
 * coordinator/group resolves it, exactly as the offline adashe works.
 */

const DISPUTE_COLS = `id, circle_id, raised_by, subject_membership_id, reason, status,
  resolution, created_at, resolved_at`;

/** Any member can raise a dispute. Posts a system message into the circle chat. */
export async function raiseDispute(params: {
  userId: string;
  circleId: string;
  reason: string;
  subjectMembershipId?: string;
}): Promise<Dispute> {
  return withTransaction(async (client) => {
    await assertMember(client, params.circleId, params.userId);

    const circle = await client.query(`SELECT conversation_id FROM circles WHERE id = $1`, [
      params.circleId,
    ]);
    if (!circle.rows[0]) throw AppError.notFound('Circle not found');

    if (params.subjectMembershipId) {
      const subject = await client.query(
        `SELECT 1 FROM circle_members WHERE id = $1 AND circle_id = $2`,
        [params.subjectMembershipId, params.circleId],
      );
      if (!subject.rows[0]) throw AppError.badRequest('Subject is not a member of this circle');
    }

    const inserted = await client.query(
      `INSERT INTO disputes (circle_id, raised_by, subject_membership_id, reason)
       VALUES ($1, $2, $3, $4)
       RETURNING ${DISPUTE_COLS}`,
      [params.circleId, params.userId, params.subjectMembershipId ?? null, params.reason],
    );

    await postSystemMessage(
      circle.rows[0].conversation_id as string,
      `🚩 A dispute was raised. The coordinator will review it.`,
      { kind: 'dispute_raised' },
      client,
    );
    return mapDispute(inserted.rows[0]);
  });
}

/** List a circle's disputes (members only). */
export async function listDisputes(userId: string, circleId: string): Promise<Dispute[]> {
  await assertMember(pool, circleId, userId);
  const { rows } = await pool.query(
    `SELECT ${DISPUTE_COLS} FROM disputes WHERE circle_id = $1 ORDER BY created_at DESC`,
    [circleId],
  );
  return rows.map(mapDispute);
}

/** Resolve (or mark withdrawn) a dispute — coordinator only. */
export async function resolveDispute(params: {
  userId: string;
  circleId: string;
  disputeId: string;
  status: DisputeStatus;
  resolution: string;
}): Promise<Dispute> {
  return withTransaction(async (client) => {
    const circle = await client.query(
      `SELECT coordinator_id, conversation_id FROM circles WHERE id = $1`,
      [params.circleId],
    );
    if (!circle.rows[0]) throw AppError.notFound('Circle not found');
    if (circle.rows[0].coordinator_id !== params.userId) {
      throw AppError.forbidden('Only the coordinator can resolve a dispute');
    }

    const updated = await client.query(
      `UPDATE disputes
          SET status = $3, resolution = $4, resolved_at = now()
        WHERE id = $1 AND circle_id = $2 AND status = 'open'
        RETURNING ${DISPUTE_COLS}`,
      [params.disputeId, params.circleId, params.status, params.resolution],
    );
    if (!updated.rows[0]) throw AppError.conflict('Dispute not found or already resolved');

    await postSystemMessage(
      circle.rows[0].conversation_id as string,
      `✅ A dispute was ${params.status === 'withdrawn' ? 'withdrawn' : 'resolved'}.`,
      { kind: 'dispute_resolved' },
      client,
    );
    return mapDispute(updated.rows[0]);
  });
}

function mapDispute(row: Record<string, unknown>): Dispute {
  return {
    id: row.id as string,
    circleId: row.circle_id as string,
    raisedBy: row.raised_by as string,
    subjectMembershipId: (row.subject_membership_id as string | null) ?? null,
    reason: row.reason as string,
    status: row.status as DisputeStatus,
    resolution: (row.resolution as string | null) ?? null,
    createdAt: toIso(row.created_at),
    resolvedAt: row.resolved_at ? toIso(row.resolved_at) : null,
  };
}

function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}
