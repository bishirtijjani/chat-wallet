import pg from 'pg';
import { loadConfig } from '../config.js';

/**
 * A single shared connection pool. Money in this system is BIGINT kobo; node-pg
 * returns BIGINT (OID 20) as a string by default to avoid precision loss. We
 * parse it to a JS number because all our amounts stay well within
 * Number.MAX_SAFE_INTEGER (kobo), and the shared money helpers assert safety.
 */
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => Number.parseInt(value, 10));

const config = loadConfig();

export const pool = new pg.Pool({
  connectionString: config.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
});

export type PoolClient = pg.PoolClient;
export type QueryResultRow = pg.QueryResultRow;

/**
 * Run `fn` inside a database transaction. Commits on success, rolls back on any
 * thrown error, and always releases the client. This is the boundary every
 * money movement passes through.
 */
export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  await pool.end();
}
