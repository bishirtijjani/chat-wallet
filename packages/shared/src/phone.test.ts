import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeNigerianPhone } from './phone.js';

test('normalizes local 0-prefixed numbers', () => {
  assert.equal(normalizeNigerianPhone('08012345678'), '+2348012345678');
});

test('normalizes bare national numbers', () => {
  assert.equal(normalizeNigerianPhone('8012345678'), '+2348012345678');
});

test('normalizes 234-prefixed and +234 numbers', () => {
  assert.equal(normalizeNigerianPhone('2348012345678'), '+2348012345678');
  assert.equal(normalizeNigerianPhone('+234 801 234 5678'), '+2348012345678');
});

test('rejects invalid numbers', () => {
  assert.equal(normalizeNigerianPhone('12345'), null);
  assert.equal(normalizeNigerianPhone('+15551234567'), null);
  assert.equal(normalizeNigerianPhone('0801234567'), null); // too short
});
