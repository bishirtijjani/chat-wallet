/**
 * A typed application error carrying an HTTP status and a stable machine-readable
 * `code`. Throw these from services/controllers; the error middleware turns them
 * into a consistent JSON envelope.
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message: string, details?: unknown): AppError {
    return new AppError(400, 'bad_request', message, details);
  }

  static unauthorized(message = 'Authentication required'): AppError {
    return new AppError(401, 'unauthorized', message);
  }

  static forbidden(message = 'Not allowed'): AppError {
    return new AppError(403, 'forbidden', message);
  }

  static notFound(message = 'Not found'): AppError {
    return new AppError(404, 'not_found', message);
  }

  static conflict(message: string, details?: unknown): AppError {
    return new AppError(409, 'conflict', message, details);
  }

  static tooManyRequests(message = 'Too many requests'): AppError {
    return new AppError(429, 'too_many_requests', message);
  }

  static unprocessable(message: string, details?: unknown): AppError {
    return new AppError(422, 'unprocessable', message, details);
  }
}
