import { createServer } from 'node:http';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { logger } from './logger.js';
import { closePool } from './db/pool.js';
import { initRealtime } from './realtime/realtime.js';

const config = loadConfig();
const app = createApp();
const server = createServer(app);

// Attach the Socket.IO real-time layer to the same HTTP server.
initRealtime(server);

server.listen(config.PORT, () => {
  logger.info({ port: config.PORT, env: config.NODE_ENV }, 'Chat & Wallet API listening');
});

/** Graceful shutdown: stop accepting connections, then drain the DB pool. */
async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'shutting down');
  server.close(async () => {
    await closePool();
    process.exit(0);
  });
  // Force-exit if graceful shutdown stalls.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
