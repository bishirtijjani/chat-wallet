import { Router } from 'express';
import {
  cashOutSchema,
  fundWalletSchema,
  normalizeNigerianPhone,
  transferSchema,
} from '@caw/shared';
import { asyncHandler } from '../../http/async-handler.js';
import { validate } from '../../http/validate.js';
import { AppError } from '../../http/errors.js';
import { authenticate, requireUserId, type AuthedRequest } from '../../middleware/authenticate.js';
import { pool } from '../../db/pool.js';
import * as wallet from './wallet.service.js';

export const walletRouter: Router = Router();

// Every wallet route requires authentication.
walletRouter.use(authenticate);

/** GET /wallet — current balance. */
walletRouter.get(
  '/',
  asyncHandler(async (req: AuthedRequest, res) => {
    const result = await wallet.getWallet(requireUserId(req));
    res.status(200).json({ wallet: result });
  }),
);

/** GET /wallet/history — recent ledger movements touching this wallet. */
walletRouter.get(
  '/history',
  asyncHandler(async (req: AuthedRequest, res) => {
    const history = await wallet.getHistory(requireUserId(req));
    res.status(200).json({ history });
  }),
);

/** POST /wallet/fund — fund the wallet via the PSP (sandbox in M1). */
walletRouter.post(
  '/fund',
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = validate(fundWalletSchema, req.body);
    const result = await wallet.fundWallet({
      userId: requireUserId(req),
      amount: body.amount,
      idempotencyKey: body.idempotencyKey,
    });
    res.status(201).json(result);
  }),
);

/** POST /wallet/transfer — send money to another user's wallet in-app. */
walletRouter.post(
  '/transfer',
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = validate(transferSchema, req.body);
    const toUserId = await resolveUserIdByPhone(body.toPhone);
    const result = await wallet.transfer({
      fromUserId: requireUserId(req),
      toUserId,
      amount: body.amount,
      note: body.note,
      idempotencyKey: body.idempotencyKey,
    });
    res.status(201).json(result);
  }),
);

/** POST /wallet/cashout — withdraw to a bank account (amount + fee). */
walletRouter.post(
  '/cashout',
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = validate(cashOutSchema, req.body);
    const result = await wallet.cashOut({
      userId: requireUserId(req),
      amount: body.amount,
      bankAccountNumber: body.bankAccountNumber,
      bankCode: body.bankCode,
      idempotencyKey: body.idempotencyKey,
    });
    res.status(201).json(result);
  }),
);

async function resolveUserIdByPhone(phone: string): Promise<string> {
  const normalized = normalizeNigerianPhone(phone) ?? phone;
  const { rows } = await pool.query(`SELECT id FROM users WHERE phone = $1`, [normalized]);
  if (!rows[0]) throw AppError.notFound('No user with that phone number');
  return rows[0].id as string;
}
