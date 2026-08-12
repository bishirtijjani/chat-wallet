import { createHmac, randomInt, randomBytes, timingSafeEqual } from 'node:crypto';
import { loadConfig } from '../../config.js';

/** Generate a numeric OTP of `length` digits (zero-padded, cryptographically random). */
export function generateOtp(length: number): string {
  const max = 10 ** length;
  return randomInt(0, max).toString().padStart(length, '0');
}

/** HMAC-SHA256 an OTP with the server pepper so codes aren't stored in the clear. */
export function hashOtp(code: string): string {
  const { OTP_PEPPER } = loadConfig();
  return createHmac('sha256', OTP_PEPPER).update(code).digest('hex');
}

/** HMAC-SHA256 a device PIN, domain-separated from OTP hashing (same pepper). */
export function hashPin(pin: string): string {
  const { OTP_PEPPER } = loadConfig();
  return createHmac('sha256', OTP_PEPPER).update(`pin:${pin}`).digest('hex');
}

/** Constant-time comparison of two hex digests. */
export function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** A high-entropy opaque token (for refresh tokens). */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

/** SHA-256-via-HMAC hash of an opaque token for at-rest storage. */
export function hashToken(token: string): string {
  const { OTP_PEPPER } = loadConfig();
  return createHmac('sha256', OTP_PEPPER).update(token).digest('hex');
}
