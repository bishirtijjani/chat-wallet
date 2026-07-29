import type { ZodType } from 'zod';
import { AppError } from './errors.js';

/**
 * Validate an unknown payload against a zod schema, converting a failure into a
 * 400 AppError with structured field details.
 */
export function validate<T>(schema: ZodType<T>, payload: unknown): T {
  const result = schema.safeParse(payload);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({
      path: i.path.join('.'),
      message: i.message,
    }));
    throw AppError.badRequest('Validation failed', details);
  }
  return result.data;
}
