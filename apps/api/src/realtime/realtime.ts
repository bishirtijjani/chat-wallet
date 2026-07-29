import type { Server as HttpServer } from 'node:http';
import { Server as IOServer, type Socket } from 'socket.io';
import { verifyAccessToken } from '../modules/auth/tokens.js';
import { pool } from '../db/pool.js';
import { logger } from '../logger.js';

/**
 * Real-time layer. A single Socket.IO server is attached to the HTTP server.
 * Clients authenticate in the handshake with their access token and are joined
 * to a room per conversation they belong to. Services emit into those rooms via
 * `emitToConversation` — decoupled so REST handlers and the ROSCA engine (M3)
 * can push live updates without importing socket internals.
 */

let io: IOServer | null = null;

/** The room name for a conversation. */
function room(conversationId: string): string {
  return `conversation:${conversationId}`;
}

export function initRealtime(server: HttpServer): IOServer {
  io = new IOServer(server, {
    cors: { origin: '*' },
    // Keep payloads small; chat messages are tiny JSON.
    maxHttpBufferSize: 1e6,
  });

  // Authenticate every socket from its handshake token.
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error('unauthorized'));
    try {
      const { sub } = verifyAccessToken(token);
      socket.data.userId = sub;
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const userId = socket.data.userId as string;
    void joinUserRooms(socket, userId);

    socket.on('disconnect', () => {
      logger.debug({ userId }, 'socket disconnected');
    });
  });

  return io;
}

/** Join a socket to the rooms for all conversations the user is a member of. */
async function joinUserRooms(socket: Socket, userId: string): Promise<void> {
  try {
    const { rows } = await pool.query(
      `SELECT conversation_id FROM conversation_members WHERE user_id = $1`,
      [userId],
    );
    for (const r of rows) socket.join(room(r.conversation_id as string));
    logger.debug({ userId, rooms: rows.length }, 'socket joined conversation rooms');
  } catch (err) {
    logger.error({ err, userId }, 'failed to join conversation rooms');
  }
}

/** Add a user's currently-connected sockets to a conversation room (on new membership). */
export async function addUserToConversationRoom(
  userId: string,
  conversationId: string,
): Promise<void> {
  if (!io) return;
  const sockets = await io.fetchSockets();
  for (const s of sockets) {
    if (s.data.userId === userId) s.join(room(conversationId));
  }
}

/** Emit an event to everyone currently in a conversation's room. No-op if realtime is off. */
export function emitToConversation(
  conversationId: string,
  event: string,
  payload: unknown,
): void {
  io?.to(room(conversationId)).emit(event, payload);
}

/** Test/shutdown seam. */
export function getIo(): IOServer | null {
  return io;
}
