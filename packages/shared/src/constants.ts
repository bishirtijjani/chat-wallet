/** System-wide constants. Money values are in kobo. */

export const CURRENCY = 'NGN' as const;

/** Stable identifiers for the singleton system ledger accounts (seeded in migrations). */
export const SYSTEM_ACCOUNTS = {
  float: 'float',
  feesRevenue: 'fees_revenue',
  suspense: 'suspense',
} as const;

/** OTP configuration. */
export const OTP = {
  length: 6,
  ttlSeconds: 5 * 60, // 5 minutes
  maxAttempts: 5,
  resendCooldownSeconds: 60,
} as const;

/** Fee schedule for v1 (see PROJECT_BIBLE §6). */
export const FEES = {
  /** Cash-out fee: 1.5% of the amount, with a floor and cap in kobo. */
  cashOutBps: 150,
  cashOutMinKobo: 5000, // ₦50.00
  cashOutMaxKobo: 500000, // ₦5,000.00

  /**
   * Cycle fee (coordinator fee): ~1% of a single round's pot, charged once to
   * the coordinator when a circle starts. Clamped to a floor and cap. We never
   * touch members' contributions mid-circle.
   */
  cycleBps: 100,
  cycleMinKobo: 10000, // ₦100.00
  cycleMaxKobo: 1000000, // ₦10,000.00
} as const;

/** Guardrails for money amounts, in kobo. */
export const LIMITS = {
  minFundKobo: 10000, // ₦100.00
  minTransferKobo: 10000,
  minCashOutKobo: 50000, // ₦500.00
} as const;

/** Guardrails for savings circles. */
export const CIRCLE_LIMITS = {
  minMembers: 2,
  maxMembers: 100,
  minContributionKobo: 50000, // ₦500.00 per round
} as const;
