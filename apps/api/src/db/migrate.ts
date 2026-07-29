import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, closePool } from './pool.js';
import { logger } from '../logger.js';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

/**
 * A tiny forward-only migration runner. Each *.sql file in ./migrations is
 * applied once, in filename order, inside its own transaction, and recorded in
 * schema_migrations. Re-running is safe: already-applied files are skipped.
 */
export async function runMigrations(): Promise<{ applied: string[] }> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name        TEXT PRIMARY KEY,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  const files = (await readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b));

  const { rows } = await pool.query<{ name: string }>('SELECT name FROM schema_migrations');
  const done = new Set(rows.map((r) => r.name));

  const applied: string[] = [];
  for (const file of files) {
    if (done.has(file)) continue;

    const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      applied.push(file);
      logger.info({ migration: file }, 'applied migration');
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error({ migration: file, err }, 'migration failed');
      throw err;
    } finally {
      client.release();
    }
  }

  return { applied };
}

// Allow running directly: `npm run migrate`.
const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  runMigrations()
    .then(({ applied }) => {
      if (applied.length === 0) logger.info('database already up to date');
      else logger.info({ applied }, 'migrations complete');
    })
    .catch((err) => {
      logger.error({ err }, 'migration run failed');
      process.exitCode = 1;
    })
    .finally(() => closePool());
}
