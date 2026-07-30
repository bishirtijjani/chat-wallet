import express, { type Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { pinoHttp } from 'pino-http';
import { logger } from './logger.js';
import { healthRouter } from './routes/health.routes.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { walletRouter } from './modules/wallet/wallet.routes.js';
import { chatRouter } from './modules/chat/chat.routes.js';
import { circleRouter } from './modules/rosca/circle.routes.js';
import { userRouter } from './modules/user/user.routes.js';
import { notFoundHandler, errorHandler } from './middleware/error.js';

/**
 * Build the Express application. Kept separate from the server bootstrap so
 * tests can import the app without opening a listening socket.
 */
export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '100kb' }));
  app.use(pinoHttp({ logger }));

  app.use('/health', healthRouter);
  app.use('/auth', authRouter);
  app.use('/wallet', walletRouter);
  app.use('/conversations', chatRouter);
  app.use('/circles', circleRouter);
  app.use('/users', userRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
