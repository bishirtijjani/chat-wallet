import { randomUUID } from 'node:crypto';
import { loadConfig } from '../../config.js';
import { logger } from '../../logger.js';

/**
 * Payment Service Provider boundary. Real money enters and leaves through a
 * licensed PSP (Paystack / Monnify) — we are NOT the fund holder (PROJECT_BIBLE
 * §3.3). M1 ships a `sandbox` provider that simulates funding and bank payouts
 * so the ledger can be exercised end to end without a live integration. A real
 * provider implements this same interface later.
 */
export interface PspChargeResult {
  providerReference: string;
  status: 'succeeded';
}

export interface PspPayoutResult {
  providerReference: string;
  status: 'succeeded';
}

export interface PspProvider {
  readonly name: string;
  /** Pull money into the platform float (user funds their wallet). */
  charge(params: { amountKobo: number; userId: string; reference: string }): Promise<PspChargeResult>;
  /** Push money out to a bank account (user cashes out). */
  payout(params: {
    amountKobo: number;
    bankAccountNumber: string;
    bankCode: string;
    reference: string;
  }): Promise<PspPayoutResult>;
}

/** Simulated provider: everything succeeds immediately. Dev/test only. */
class SandboxPsp implements PspProvider {
  readonly name = 'sandbox';

  async charge(params: { amountKobo: number; userId: string; reference: string }) {
    logger.info({ psp: this.name, ...params }, 'sandbox charge (simulated funding)');
    return { providerReference: `sbx_chg_${randomUUID()}`, status: 'succeeded' as const };
  }

  async payout(params: { amountKobo: number; bankAccountNumber: string; reference: string }) {
    logger.info(
      { psp: this.name, amountKobo: params.amountKobo, reference: params.reference },
      'sandbox payout (simulated bank transfer)',
    );
    return { providerReference: `sbx_out_${randomUUID()}`, status: 'succeeded' as const };
  }
}

let provider: PspProvider | null = null;

export function getPsp(): PspProvider {
  if (provider) return provider;
  const config = loadConfig();
  switch (config.PSP_PROVIDER) {
    case 'sandbox':
      provider = new SandboxPsp();
      return provider;
    default:
      throw new Error(`Unsupported PSP provider: ${config.PSP_PROVIDER}`);
  }
}

/** Test seam. */
export function setPspForTest(p: PspProvider | null): void {
  provider = p;
}
