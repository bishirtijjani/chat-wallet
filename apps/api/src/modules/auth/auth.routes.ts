import { Router } from 'express';
import {
  requestOtpSchema,
  verifyOtpSchema,
  refreshTokenSchema,
  setPinSchema,
  verifyPinSchema,
} from '@caw/shared';
import { asyncHandler } from '../../http/async-handler.js';
import { validate } from '../../http/validate.js';
import { authenticate, requireUserId, type AuthedRequest } from '../../middleware/authenticate.js';
import * as authService from './auth.service.js';

export const authRouter: Router = Router();

/** POST /auth/otp/request — send a one-time code to a phone number. */
authRouter.post(
  '/otp/request',
  asyncHandler(async (req, res) => {
    const body = validate(requestOtpSchema, req.body);
    const result = await authService.requestOtp(body.phone);
    res.status(202).json(result);
  }),
);

/** POST /auth/otp/verify — verify a code, get tokens (creating the user if new). */
authRouter.post(
  '/otp/verify',
  asyncHandler(async (req, res) => {
    const body = validate(verifyOtpSchema, req.body);
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

/** POST /auth/pin/set — set (or replace) this device's unlock PIN. */
authRouter.post(
  '/pin/set',
  authenticate,
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = validate(setPinSchema, req.body);
    await authService.setPin(requireUserId(req), body.pin);
    res.status(204).end();
  }),
);

/** POST /auth/pin/verify — unlock a persisted session with a PIN instead of an OTP. */
authRouter.post(
  '/pin/verify',
  asyncHandler(async (req, res) => {
    const body = validate(verifyPinSchema, req.body);
    const result = await authService.verifyPin(body.refreshToken, body.pin);
    res.status(200).json(result);
  }),
);
