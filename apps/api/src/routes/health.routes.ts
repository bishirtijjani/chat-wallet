import { Router } from 'express';
import { asyncHandler } from '../http/async-handler.js';
import { pool } from '../db/pool.js';

export const healthRouter: Router = Router();

/** GET /health — liveness. Always cheap; never touches the DB. */
healthRouter.get('/', (_req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

/** GET /health/ready — readiness. Confirms the database is reachable. */
healthRouter.get(
  '/ready',
  asyncHandler(async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.status(200).json({ status: 'ready', database: 'up' });
    } catch {
      res.status(503).json({ status: 'not_ready', database: 'down' });
    }
  }),
);
