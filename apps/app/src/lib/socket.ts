import { io, type Socket } from 'socket.io-client';
import { API_URL } from './config';

/**
 * A single shared Socket.IO connection, authenticated with the access token.
 * The server auto-joins us to a room per conversation we belong to, then pushes
 * `message:new` events as they happen (M2/M3 system messages included).
 */
let socket: Socket | null = null;

export function connectSocket(token: string): Socket {
  if (socket) socket.disconnect();
  socket = io(API_URL, {
    auth: { token },
    transports: ['websocket'],
    autoConnect: true,
  });
  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}
