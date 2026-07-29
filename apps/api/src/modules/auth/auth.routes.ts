import { Router } from 'express';
import { normalizeNigerianPhone, requestOtpSchema, verifyOtpSchema, refreshTokenSchema } from '@caw/shared';
import { asyncHandler } from '../../http/async-handler.js';
import { validate } from '../../http/validate.js';
import { AppError } from '../../http/errors.js';
import { authenticate, requireUserId, type AuthedRequest } from '../../middleware/authenticate.js';
import * as authService from './auth.service.js';

export const authRouter: Router = Router();

/** POST /auth/otp/request — send a one-time code to a phone number. */
authRouter.post(
  '/otp/request',
  asyncHandler(async (req, res) => {
    const body = validate(requestOtpSchema, normalizePhoneInBody(req.body));
    const result = await authService.requestOtp(body.phone);
    res.status(202).json(result);
  }),
);

/** POST /auth/otp/verify — verify a code, get tokens (creating the user if new). */
authRouter.post(
  '/otp/verify',
  asyncHandler(async (req, res) => {
    const body = validate(verifyOtpSchema, normalizePhoneInBody(req.body));
    const result = await authService.verifyOtp(body);
    res.status(200).json(result);
  }),
);

/** POST /auth/refresh — rotate a refresh token for a fresh token pair. */
authRouter.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const body = validate(refreshTokenSchema, req.body);
    const tokens = await authService.refresh(body.refreshToken);
    res.status(200).json({ tokens });
  }),
);

/** POST /auth/logout — revoke a refresh token. */
authRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const body = validate(refreshTokenSchema, req.body);
    await authService.logout(body.refreshToken);
    res.status(204).end();
  }),
);

/** GET /auth/me — the current authenticated user. */
authRouter.get(
  '/me',
  authenticate,
  asyncHandler(async (req: AuthedRequest, res) => {
    const user = await authService.getUserById(requireUserId(req));
    res.status(200).json({ user });
  }),
);

/**
 * Normalize a loosely-formatted phone (e.g. 08012345678) to E.164 before schema
 * validation, so the API accepts what Nigerian users actually type.
 */
function normalizePhoneInBody(body: unknown): unknown {
  if (typeof body !== 'object' || body === null) return body;
  const record = body as Record<string, unknown>;
  if (typeof record.phone !== 'string') return body;
  const normalized = normalizeNigerianPhone(record.phone);
  if (!normalized) {
    throw AppError.badRequest('Enter a valid Nigerian phone number');
  }
  return { ...record, phone: normalized };
}
