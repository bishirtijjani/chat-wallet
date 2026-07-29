import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../http/errors.js';
import { verifyAccessToken } from '../modules/auth/tokens.js';

/** Express request augmented with the authenticated user id. */
export interface AuthedRequest extends Request {
  userId?: string;
}

/**
 * Require a valid Bearer access token. On success attaches `req.userId`.
 * Throws 401 otherwise.
 */
export function authenticate(req: AuthedRequest, _res: Response, next: NextFunction): void {
  const header = req.header('authorization');
  if (!header?.startsWith('Bearer ')) {
    throw AppError.unauthorized('Missing Bearer token');
  }
  const token = header.slice('Bearer '.length).trim();
  const payload = verifyAccessToken(token);
  req.userId = payload.sub;
  next();
}

/** Read the authenticated user id set by `authenticate`, or throw. */
export function requireUserId(req: AuthedRequest): string {
  if (!req.userId) throw AppError.unauthorized();
  return req.userId;
}
