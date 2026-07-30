import { bpsOf, kobo, type Kobo } from './money.js';
import { FEES } from './constants.js';

/**
 * The v1 cash-out fee (PROJECT_BIBLE §6): a percentage of the amount, clamped to
 * a floor and a cap. Pure and deterministic so the client can preview the exact
 * fee the server will charge.
 */
export function computeCashOutFee(amount: Kobo): Kobo {
  const raw = bpsOf(amount, FEES.cashOutBps);
  return kobo(Math.min(Math.max(raw, FEES.cashOutMinKobo), FEES.cashOutMaxKobo));
}

/**
 * The v1 cycle fee (PROJECT_BIBLE §6): ~1% of a single round's pot, clamped to a
 * floor and cap. Charged once to the coordinator when a circle starts.
 * `oneRoundPot` is memberCap × contributionAmount, in kobo.
 */
export function computeCycleFee(oneRoundPot: Kobo): Kobo {
  const raw = bpsOf(oneRoundPot, FEES.cycleBps);
  return kobo(Math.min(Math.max(raw, FEES.cycleMinKobo), FEES.cycleMaxKobo));
}
