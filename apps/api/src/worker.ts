import { loadConfig } from './config.js';
import { logger } from './logger.js';
import { closePool } from './db/pool.js';
import { processDueCircles } from './modules/rosca/scheduler.js';

/**
 * The scheduler worker: a separate process that ticks the ROSCA clock on an
 * interval. It shares the API's codebase and database; deploy it as its own
 * process (same image, `npm run worker`). A later milestone can move this to its
 * own app and drive the tick from BullMQ/Redis — the work itself already lives
 * in the idempotent `processDueCircles` engine.
 */

loadConfig();

const TICK_MS = Number(process.env.SCHEDULER_INTERVAL_MS ?? 60_000);

let running = false;

async function tick(): Promise<void> {
  if (running) return; // never overlap ticks in a single process
  running = true;
  try {
    const result = await processDueCircles();
    if (result.circlesProcessed > 0) {
      logger.info(result, 'scheduler tick');
    }
  } catch (err) {
    logger.error({ err }, 'scheduler tick failed');
  } finally {
    running = false;
  }
}

logger.info({ tickMs: TICK_MS }, 'scheduler worker started');
const timer = setInterval(() => void tick(), TICK_MS);
void tick(); // run once at startup

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'scheduler worker shutting down');
  clearInterval(timer);
  await closePool();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
