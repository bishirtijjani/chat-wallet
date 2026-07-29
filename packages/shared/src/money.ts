/**
 * Money in Chat & Wallet is ALWAYS integer kobo (1 naira = 100 kobo).
 * Never floats. A `Kobo` is a non-negative-or-signed whole number of kobo.
 *
 * These helpers are the only sanctioned way to construct, format, and reason
 * about money amounts on the client and the server. Keeping them here means the
 * app and the API agree on every rounding and formatting decision.
 */

export const KOBO_PER_NAIRA = 100;

/** Branded integer type so a raw `number` can't be mistaken for a money value. */
export type Kobo = number & { readonly __brand: 'Kobo' };

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoneyError';
  }
}

/** True when `value` is a safe, whole number of kobo. */
export function isKobo(value: number): value is Kobo {
  return Number.isSafeInteger(value);
}

/** Assert-and-brand a raw number as Kobo. Throws on non-integer / unsafe input. */
export function kobo(value: number): Kobo {
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError(`Amount must be a safe integer number of kobo, got: ${value}`);
  }
  return value as Kobo;
}

/** Convert a naira amount (e.g. 5000 or 49.99) to kobo. Rounds to nearest kobo. */
export function nairaToKobo(naira: number): Kobo {
  if (!Number.isFinite(naira)) {
    throw new MoneyError(`Naira amount must be finite, got: ${naira}`);
  }
  return kobo(Math.round(naira * KOBO_PER_NAIRA));
}

/** Convert kobo to a naira number. For display/formatting only, never for math. */
export function koboToNaira(value: Kobo): number {
  return value / KOBO_PER_NAIRA;
}

/** Add money amounts. All inputs and the result are kobo. */
export function addKobo(...amounts: Kobo[]): Kobo {
  return kobo(amounts.reduce<number>((sum, a) => sum + a, 0));
}

/** Subtract `b` from `a`, both kobo. */
export function subKobo(a: Kobo, b: Kobo): Kobo {
  return kobo(a - b);
}

/**
 * Take `bps` basis points (1 bp = 0.01%) of `amount`, rounded to nearest kobo.
 * Used for percentage-based fees (e.g. a 150 bp = 1.5% cash-out fee).
 */
export function bpsOf(amount: Kobo, bps: number): Kobo {
  if (!Number.isInteger(bps) || bps < 0) {
    throw new MoneyError(`Basis points must be a non-negative integer, got: ${bps}`);
  }
  return kobo(Math.round((amount * bps) / 10_000));
}

const nairaFormatter = new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Format kobo as a display string, e.g. 500000 → "₦5,000.00". */
export function formatNaira(value: Kobo): string {
  return nairaFormatter.format(koboToNaira(value));
}
