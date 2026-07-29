/**
 * Normalize common Nigerian phone number formats to E.164 (+234XXXXXXXXXX).
 * Accepts: 08012345678, 8012345678, 2348012345678, +2348012345678,
 * and the same with spaces/dashes.
 */
export function normalizeNigerianPhone(input: string): string | null {
  const digits = input.replace(/[\s()+-]/g, '');

  let national: string | null = null;
  if (/^0\d{10}$/.test(digits)) {
    national = digits.slice(1); // 08012345678 -> 8012345678
  } else if (/^234\d{10}$/.test(digits)) {
    national = digits.slice(3); // 2348012345678 -> 8012345678
  } else if (/^[789]\d{9}$/.test(digits)) {
    national = digits; // 8012345678
  }

  if (!national) return null;
  return `+234${national}`;
}
