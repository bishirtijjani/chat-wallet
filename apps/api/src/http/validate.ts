import { type ZodTypeAny, type output } from 'zod';
import { AppError } from './errors.js';

/**
 * Validate an unknown payload against a zod schema, returning the parsed OUTPUT
 * type (defaults applied, coercions done). A failure becomes a 400 AppError with
 * structured field details.
 */
export function validate<S extends ZodTypeAny>(schema: S, payload: unknown): output<S> {
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
