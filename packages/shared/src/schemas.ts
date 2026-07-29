import { z } from 'zod';
import { LIMITS } from './constants.js';

/**
 * Request/response validation schemas shared by the API and the client SDK.
 * The API validates incoming requests with these; the client can reuse them for
 * optimistic form validation so both sides agree on what's valid.
 */

/**
 * Nigerian phone number in E.164. We accept common local formats on input and
 * normalize elsewhere; this schema validates the normalized result.
 */
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+234\d{10}$/, 'Phone must be a Nigerian number in E.164 form, e.g. +2348012345678');

/** A positive whole number of kobo. */
export const koboAmountSchema = z
  .number()
  .int('Amount must be a whole number of kobo')
  .positive('Amount must be greater than zero');

export const requestOtpSchema = z.object({
  phone: phoneSchema,
});

export const verifyOtpSchema = z.object({
  phone: phoneSchema,
  code: z.string().trim().regex(/^\d{6}$/, 'Code must be 6 digits'),
  displayName: z.string().trim().min(1).max(80).optional(),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(10),
});

export const fundWalletSchema = z.object({
  amount: koboAmountSchema.refine((v) => v >= LIMITS.minFundKobo, {
    message: `Minimum funding is ${LIMITS.minFundKobo} kobo`,
  }),
  idempotencyKey: z.string().uuid().optional(),
});

export const transferSchema = z.object({
  toPhone: phoneSchema,
  amount: koboAmountSchema.refine((v) => v >= LIMITS.minTransferKobo, {
    message: `Minimum transfer is ${LIMITS.minTransferKobo} kobo`,
  }),
  note: z.string().trim().max(140).optional(),
  idempotencyKey: z.string().uuid().optional(),
});

export const cashOutSchema = z.object({
  amount: koboAmountSchema.refine((v) => v >= LIMITS.minCashOutKobo, {
    message: `Minimum cash-out is ${LIMITS.minCashOutKobo} kobo`,
  }),
  bankAccountNumber: z.string().trim().regex(/^\d{10}$/, 'Bank account number must be 10 digits'),
  bankCode: z.string().trim().regex(/^\d{3,6}$/, 'Invalid bank code'),
  idempotencyKey: z.string().uuid().optional(),
});

export type RequestOtpInput = z.infer<typeof requestOtpSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
export type FundWalletInput = z.infer<typeof fundWalletSchema>;
export type TransferInput = z.infer<typeof transferSchema>;
export type CashOutInput = z.infer<typeof cashOutSchema>;
