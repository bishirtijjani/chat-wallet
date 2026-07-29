import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeCashOutFee } from './fees.js';
import { kobo } from './money.js';
import { FEES } from './constants.js';

test('cash-out fee is 1.5% in the normal range', () => {
  // 1.5% of ₦100,000 (10,000,000 kobo) = 150,000 kobo = ₦1,500
  assert.equal(computeCashOutFee(kobo(10_000_000)), 150_000);
});

test('cash-out fee respects the floor', () => {
  // 1.5% of ₦500 = 750 kobo, below the ₦50 floor → clamps to floor
  assert.equal(computeCashOutFee(kobo(50_000)), FEES.cashOutMinKobo);
});

test('cash-out fee respects the cap', () => {
  // 1.5% of ₦1,000,000 = 15,000,000 kobo, above the ₦5,000 cap → clamps to cap
  assert.equal(computeCashOutFee(kobo(100_000_000)), FEES.cashOutMaxKobo);
});
