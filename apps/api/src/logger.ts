import { pino } from 'pino';
import { loadConfig } from './config.js';

const config = loadConfig();

export const logger = pino({
  level: config.LOG_LEVEL,
  // Pretty transport is a dev nicety; in production we emit JSON for log pipelines.
  ...(config.NODE_ENV === 'development'
    ? { transport: { target: 'pino/file', options: { destination: 1 } } }
    : {}),
  redact: {
    paths: ['req.headers.authorization', 'req.body.code', 'req.body.password'],
    remove: true,
  },
});
