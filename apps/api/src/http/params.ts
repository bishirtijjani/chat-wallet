import type { Request } from 'express';
import { AppError } from './errors.js';

/** Read a required route param, throwing 400 if absent (satisfies strict typing). */
export function requireParam(req: Request, name: string): string {
  const value = req.params[name];
  if (typeof value !== 'string' || value.length === 0) {
    throw AppError.badRequest(`Missing route parameter: ${name}`);
  }
  return value;
}
