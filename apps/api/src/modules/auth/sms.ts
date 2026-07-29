import { loadConfig } from '../../config.js';
import { logger } from '../../logger.js';

/**
 * SMS boundary for OTP delivery. M0 ships a `console` provider that logs the
 * code instead of sending a text — enough to develop the auth flow without an
 * SMS vendor. A real provider (e.g. Termii, Africa's Talking) implements this
 * same interface later.
 */
export interface SmsProvider {
  readonly name: string;
  sendOtp(params: { phone: string; code: string }): Promise<void>;
}

class ConsoleSms implements SmsProvider {
  readonly name = 'console';
  async sendOtp({ phone, code }: { phone: string; code: string }): Promise<void> {
    logger.info({ phone, code }, '[console SMS] OTP code (dev only — not a real text)');
  }
}

let provider: SmsProvider | null = null;

export function getSms(): SmsProvider {
  if (provider) return provider;
  const config = loadConfig();
  switch (config.SMS_PROVIDER) {
    case 'console':
      provider = new ConsoleSms();
      return provider;
    default:
      throw new Error(`Unsupported SMS provider: ${config.SMS_PROVIDER}`);
  }
}

export function setSmsForTest(p: SmsProvider | null): void {
  provider = p;
}
