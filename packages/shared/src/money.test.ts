import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  kobo,
  nairaToKobo,
  koboToNaira,
  addKobo,
  subKobo,
  bpsOf,
  formatNaira,
  isKobo,
  MoneyError,
} from './money.js';

test('kobo accepts safe integers and rejects fractions', () => {
  assert.equal(kobo(5000), 5000);
  assert.throws(() => kobo(50.5), MoneyError);
  assert.throws(() => kobo(NaN), MoneyError);
});

test('nairaToKobo converts and rounds to nearest kobo', () => {
  assert.equal(nairaToKobo(5000), 500000);
  assert.equal(nairaToKobo(49.99), 4999);
  assert.equal(nairaToKobo(0.005), 1); // rounds up
});

test('koboToNaira is the inverse for whole naira', () => {
  assert.equal(koboToNaira(kobo(500000)), 5000);
});

test('addKobo and subKobo do integer math', () => {
  assert.equal(addKobo(kobo(500000), kobo(250000)), 750000);
  assert.equal(subKobo(kobo(500000), kobo(200000)), 300000);
});

test('bpsOf computes percentage fees rounded to kobo', () => {
  // 1.5% of ₦5,000 (500000 kobo) = 7500 kobo = ₦75.00
  assert.equal(bpsOf(kobo(500000), 150), 7500);
  // 1% of ₦10,000
  assert.equal(bpsOf(kobo(1000000), 100), 10000);
  assert.throws(() => bpsOf(kobo(100), -1), MoneyError);
});

test('formatNaira renders Nigerian currency', () => {
  const formatted = formatNaira(kobo(500000));
  assert.match(formatted, /5,000\.00/);
  assert.match(formatted, /₦|NGN/);
});

test('isKobo guards non-integers', () => {
  assert.equal(isKobo(100), true);
  assert.equal(isKobo(1.5), false);
});
