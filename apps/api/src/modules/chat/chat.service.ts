import type {
  Conversation,
  ConversationRole,
  ConversationSummary,
  Message,
  MessageType,
} from '@caw/shared';
import { SOCKET_EVENTS } from '@caw/shared';
import type { PoolClient } from '../../db/pool.js';
import { pool, withTransaction } from '../../db/pool.js';
import { AppError } from '../../http/errors.js';
import { addUserToConversationRoom, emitToConversation } from '../../realtime/realtime.js';

/**
 * Chat service. Owns conversations, membership, and messages. Every read/write
 * is gated on the caller being a member of the conversation. `postSystemMessage`
 * is the seam other domains (ROSCA in M3) use to narrate money events into a
 * circle's group chat.
 */

// ── Conversations ────────────────────────────────────────────────────────────

/** Open (or reuse) a 1:1 conversation between two users. */
export async function createDirectConversation(
  userId: string,
  otherUserId: string,
): Promise<Conversation> {
  if (userId === otherUserId) {
    throw AppError.badRequest('Cannot open a conversation with yourself');
  }
  const dmKey = [userId, otherUserId].sort().join(':');

  return withTransaction(async (client) => {
    const existing = await client.query(
      `SELECT ${CONVERSATION_COLS} FROM conversations WHERE type = 'direct' AND dm_key = $1`,
      [dmKey],
    );
    if (existing.rows[0]) return mapConversation(existing.rows[0]);

    const created = await client.query(
      `INSERT INTO conversations (type, dm_key, created_by)
       VALUES ('direct', $1, $2)
       RETURNING ${CONVERSATION_COLS}`,
      [dmKey, userId],
    );
    const conversation = mapConversation(created.rows[0]);

    await addMembers(client, conversation.id, [
      { userId, role: 'member' },
      { userId: otherUserId, role: 'member' },
    ]);

    await joinRooms(conversation.id, [userId, otherUserId]);
    return conversation;
  });
}

/** Create a group conversation. The creator is the admin. */
export async function createGroupConversation(params: {
  userId: string;
  title: string;
  memberUserIds: string[];
}): Promise<Conversation> {
  const uniqueMembers = [...new Set(params.memberUserIds.filter((id) => id !== params.userId))];

  const conversation = await withTransaction((client) =>
    createGroupConversationTx(client, {
      title: params.title,
      createdBy: params.userId,
      members: [
        { userId: params.userId, role: 'admin' },
        ...uniqueMembers.map((userId) => ({ userId, role: 'member' as ConversationRole })),
      ],
    }),
  );

  await joinRooms(conversation.id, [params.userId, ...uniqueMembers]);
  return conversation;
}

/**
 * Insert a group conversation and its members within a caller-provided
 * transaction. Used by the ROSCA engine so a circle and its chat are created
 * atomically. Room joining is the caller's job after the transaction commits.
 */
export async function createGroupConversationTx(
  client: PoolClient,
  params: {
    title: string;
    createdBy: string;
    circleId?: string;
    members: { userId: string; role: ConversationRole }[];
  },
): Promise<Conversation> {
  const created = await client.query(
    `INSERT INTO conversations (type, title, circle_id, created_by)
     VALUES ('group', $1, $2, $3)
     RETURNING ${CONVERSATION_COLS}`,
    [params.title, params.circleId ?? null, params.createdBy],
  );
  const conversation = mapConversation(created.rows[0]);
  await addMembers(client, conversation.id, params.members);
  return conversation;
}

/** Add a member to a conversation within a transaction, and join their live sockets. */
export async function addConversationMember(
  client: PoolClient,
  conversationId: string,
  userId: string,
  role: ConversationRole = 'member',
): Promise<void> {
  await addMembers(client, conversationId, [{ userId, role }]);
}

/** List the caller's conversations with last message + unread count, newest first. */
export async function listConversations(userId: string): Promise<ConversationSummary[]> {
  const { rows } = await pool.query(
    `SELECT c.id, c.type, c.title, c.circle_id, c.created_by, c.created_at,
            cm.last_read_seq,
            lm.id AS lm_id, lm.seq AS lm_seq, lm.sender_id AS lm_sender_id,
            lm.type AS lm_type, lm.body AS lm_body, lm.metadata AS lm_metadata,
            lm.created_at AS lm_created_at,
            (SELECT COUNT(*) FROM messages m
              WHERE m.conversation_id = c.id AND m.seq > cm.last_read_seq) AS unread
       FROM conversation_members cm
       JOIN conversations c ON c.id = cm.conversation_id
       LEFT JOIN LATERAL (
         SELECT * FROM messages m WHERE m.conversation_id = c.id
         ORDER BY m.seq DESC LIMIT 1
       ) lm ON true
      WHERE cm.user_id = $1
      ORDER BY COALESCE(lm.created_at, c.created_at) DESC`,
    [userId],
  );

  return rows.map((row) => ({
    ...mapConversation(row),
    unreadCount: Number(row.unread),
    lastMessage: row.lm_id
      ? mapMessage({
          id: row.lm_id,
          conversation_id: row.id,
          seq: row.lm_seq,
          sender_id: row.lm_sender_id,
          type: row.lm_type,
          body: row.lm_body,
          metadata: row.lm_metadata,
          created_at: row.lm_created_at,
        })
      : null,
  }));
}

// ── Messages ─────────────────────────────────────────────────────────────────

/** Fetch a page of messages (newest first), gated on membership. */
export async function getMessages(
  userId: string,
  conversationId: string,
  opts: { before?: number; limit: number },
): Promise<Message[]> {
  await assertMember(pool, conversationId, userId);

  const params: unknown[] = [conversationId];
  let cursor = '';
  if (opts.before !== undefined) {
    params.push(opts.before);
    cursor = `AND seq < $${params.length}`;
  }
  params.push(opts.limit);

  const { rows } = await pool.query(
    `SELECT ${MESSAGE_COLS} FROM messages
      WHERE conversation_id = $1 ${cursor}
      ORDER BY seq DESC
      LIMIT $${params.length}`,
    params,
  );
  return rows.map(mapMessage);
}

/** Send a message as the caller. Persists then emits to the conversation room. */
export async function sendMessage(params: {
  userId: string;
  conversationId: string;
  body: string;
  type: Exclude<MessageType, 'system'>;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string;
}): Promise<Message> {
  const message = await withTransaction(async (client) => {
    await assertMember(client, params.conversationId, params.userId);

    if (params.idempotencyKey) {
      const dup = await client.query(
        `SELECT ${MESSAGE_COLS} FROM messages
          WHERE conversation_id = $1 AND sender_id = $2 AND idempotency_key = $3`,
        [params.conversationId, params.userId, params.idempotencyKey],
      );
      if (dup.rows[0]) return mapMessage(dup.rows[0]);
    }

    const inserted = await client.query(
      `INSERT INTO messages (conversation_id, sender_id, type, body, metadata, idempotency_key)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)
       RETURNING ${MESSAGE_COLS}`,
      [
        params.conversationId,
        params.userId,
        params.type,
        params.body,
        JSON.stringify(params.metadata ?? {}),
        params.idempotencyKey ?? null,
      ],
    );
    return mapMessage(inserted.rows[0]);
  });

  emitToConversation(params.conversationId, SOCKET_EVENTS.messageNew, message);
  emitToConversation(params.conversationId, SOCKET_EVENTS.conversationUpdated, {
    conversationId: params.conversationId,
  });
  return message;
}

/**
 * Post a system message into a conversation (e.g. "Amina contributed ₦5,000").
 * Called by the ROSCA/wallet domains — no membership check, no sender.
 */
export async function postSystemMessage(
  conversationId: string,
  body: string,
  metadata: Record<string, unknown> = {},
  client?: PoolClient,
): Promise<Message> {
  const exec = async (c: PoolClient): Promise<Message> => {
    const inserted = await c.query(
      `INSERT INTO messages (conversation_id, sender_id, type, body, metadata)
       VALUES ($1, NULL, 'system', $2, $3::jsonb)
       RETURNING ${MESSAGE_COLS}`,
      [conversationId, body, JSON.stringify(metadata)],
    );
    return mapMessage(inserted.rows[0]);
  };

  const message = client ? await exec(client) : await withTransaction(exec);

  emitToConversation(conversationId, SOCKET_EVENTS.messageNew, message);
  return message;
}

/** Mark the conversation read up to (and including) `seq` for the caller. */
export async function markRead(userId: string, conversationId: string, seq: number): Promise<void> {
  const { rowCount } = await pool.query(
    `UPDATE conversation_members
        SET last_read_seq = GREATEST(last_read_seq, $3)
      WHERE conversation_id = $1 AND user_id = $2`,
    [conversationId, userId, seq],
  );
  if (rowCount === 0) throw AppError.forbidden('Not a member of this conversation');
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const CONVERSATION_COLS = 'id, type, title, circle_id, created_by, created_at';
const MESSAGE_COLS = 'id, conversation_id, seq, sender_id, type, body, metadata, created_at';

async function addMembers(
  client: PoolClient,
  conversationId: string,
  members: { userId: string; role: ConversationRole }[],
): Promise<void> {
  for (const m of members) {
    await client.query(
      `INSERT INTO conversation_members (conversation_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (conversation_id, user_id) DO NOTHING`,
      [conversationId, m.userId, m.role],
    );
  }
}

async function joinRooms(conversationId: string, userIds: string[]): Promise<void> {
  await Promise.all(userIds.map((id) => addUserToConversationRoom(id, conversationId)));
}

/** Assert the user is a member of the conversation; returns their role. */
export async function assertMember(
  db: Pick<PoolClient, 'query'>,
  conversationId: string,
  userId: string,
): Promise<ConversationRole> {
  const { rows } = await db.query(
    `SELECT role FROM conversation_members WHERE conversation_id = $1 AND user_id = $2`,
    [conversationId, userId],
  );
  if (!rows[0]) throw AppError.forbidden('Not a member of this conversation');
  return rows[0].role as ConversationRole;
}

function mapConversation(row: Record<string, unknown>): Conversation {
  return {
    id: row.id as string,
    type: row.type as Conversation['type'],
    title: (row.title as string | null) ?? null,
    circleId: (row.circle_id as string | null) ?? null,
    createdBy: (row.created_by as string | null) ?? null,
    createdAt: toIso(row.created_at),
  };
}

function mapMessage(row: Record<string, unknown>): Message {
  return {
    id: row.id as string,
    conversationId: row.conversation_id as string,
    seq: Number(row.seq),
    senderId: (row.sender_id as string | null) ?? null,
    type: row.type as MessageType,
    body: row.body as string,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: toIso(row.created_at),
  };
}

function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}
