import { z } from 'zod';
import { LIMITS } from './constants.js';
import { normalizeNigerianPhone } from './phone.js';

/**
 * Request/response validation schemas shared by the API and the client SDK.
 * The API validates incoming requests with these; the client can reuse them for
 * optimistic form validation so both sides agree on what's valid.
 */

/**
 * Nigerian phone number. Accepts the common formats users actually type
 * (08012345678, 8012345678, 2348012345678, +2348012345678) and normalizes the
 * parsed value to E.164 (+234XXXXXXXXXX), so every downstream consumer sees one
 * canonical form.
 */
export const phoneSchema = z
  .string()
  .trim()
  .transform((value, ctx) => {
    const normalized = normalizeNigerianPhone(value);
    if (!normalized) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Enter a valid Nigerian phone number',
      });
      return z.NEVER;
    }
    return normalized;
  });

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

// ── Chat ─────────────────────────────────────────────────────────────────────

export const createDirectConversationSchema = z.object({
  type: z.literal('direct'),
  participantPhone: phoneSchema,
});

export const createGroupConversationSchema = z.object({
  type: z.literal('group'),
  title: z.string().trim().min(1).max(80),
  memberPhones: z.array(phoneSchema).max(256).optional(),
});

export const createConversationSchema = z.discriminatedUnion('type', [
  createDirectConversationSchema,
  createGroupConversationSchema,
]);

export const sendMessageSchema = z.object({
  body: z.string().trim().min(1).max(4000),
  type: z.enum(['text', 'image']).default('text'),
  metadata: z.record(z.unknown()).optional(),
  idempotencyKey: z.string().uuid().optional(),
});

export const listMessagesQuerySchema = z.object({
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const markReadSchema = z.object({
  seq: z.number().int().nonnegative(),
});

export type CreateConversationInput = z.infer<typeof createConversationSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>;
export type MarkReadInput = z.infer<typeof markReadSchema>;

export type RequestOtpInput = z.infer<typeof requestOtpSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
export type FundWalletInput = z.infer<typeof fundWalletSchema>;
export type TransferInput = z.infer<typeof transferSchema>;
export type CashOutInput = z.infer<typeof cashOutSchema>;
