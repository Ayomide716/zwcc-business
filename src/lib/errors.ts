/**
 * Error handling.
 *
 * Rule for the whole app: a user never sees a raw technical error. Every
 * failure that reaches a screen has been through `toUserError`, which maps
 * known Supabase/network failures onto plain language and keeps the technical
 * detail for the log.
 */

export type ErrorKind =
  | 'network'
  | 'auth'
  | 'permission'
  | 'validation'
  | 'not_found'
  | 'conflict'
  | 'upload'
  | 'server'
  | 'unknown';

export interface UserError {
  kind: ErrorKind;
  /** Short heading, e.g. "No connection". */
  title: string;
  /** One or two sentences telling the user what to do. */
  message: string;
  /** True when trying again is likely to help. */
  retryable: boolean;
  /** Original error, kept for logging. Never rendered. */
  cause?: unknown;
}

export class AppError extends Error {
  readonly kind: ErrorKind;
  readonly title: string;
  readonly retryable: boolean;

  constructor(kind: ErrorKind, title: string, message: string, retryable = false, cause?: unknown) {
    super(message);
    this.name = 'AppError';
    this.kind = kind;
    this.title = title;
    this.retryable = retryable;
    this.cause = cause;
  }

  toUserError(): UserError {
    return {
      kind: this.kind,
      title: this.title,
      message: this.message,
      retryable: this.retryable,
      cause: this.cause,
    };
  }
}

/** Thrown by the workflow layer when a transition is not permitted. */
export function workflowError(message: string): AppError {
  return new AppError('permission', 'Action unavailable', message, false);
}

export function validationError(message: string): AppError {
  return new AppError('validation', 'Check your answers', message, false);
}

export function notFoundError(what: string): AppError {
  return new AppError('not_found', 'Not found', `We could not find ${what}.`, false);
}

/* -------------------------------------------------------------------------- */
/* Supabase / network mapping                                                  */
/* -------------------------------------------------------------------------- */

interface PostgrestLike {
  message?: string;
  code?: string;
  details?: string | null;
  status?: number;
}

function isPostgrestLike(value: unknown): value is PostgrestLike {
  return typeof value === 'object' && value !== null && ('message' in value || 'code' in value);
}

const NETWORK_HINTS = [
  'network request failed',
  'failed to fetch',
  'network error',
  'timeout',
  'aborted',
  'unable to resolve host',
];

/**
 * Turn anything thrown anywhere into something safe to render.
 *
 * Postgres error codes are mapped explicitly, because they are the failures a
 * correctly-written app still hits in production: RLS denials (42501), unique
 * violations (23505), and missing rows (PGRST116).
 */
export function toUserError(error: unknown): UserError {
  if (error instanceof AppError) return error.toUserError();

  const raw = error instanceof Error ? error.message : String(error ?? '');
  const lower = raw.toLowerCase();

  if (NETWORK_HINTS.some((hint) => lower.includes(hint))) {
    return {
      kind: 'network',
      title: 'No connection',
      message:
        'We could not reach our servers. Check your internet connection and try again — your work has been saved on this device.',
      retryable: true,
      cause: error,
    };
  }

  if (isPostgrestLike(error)) {
    const code = error.code ?? '';
    const message = error.message ?? '';
    const lowerMessage = message.toLowerCase();

    // Row Level Security denial.
    if (code === '42501' || lowerMessage.includes('row-level security')) {
      return {
        kind: 'permission',
        title: 'Not permitted',
        message: 'You do not have permission to do that.',
        retryable: false,
        cause: error,
      };
    }

    // Unique violation — most often a duplicate application or a code clash.
    if (code === '23505') {
      return {
        kind: 'conflict',
        title: 'Already exists',
        message: 'That record already exists. Refresh and try again.',
        retryable: true,
        cause: error,
      };
    }

    // Foreign key / check constraint.
    if (code === '23503' || code === '23514') {
      return {
        kind: 'validation',
        title: 'Could not save',
        message: 'Some of the information provided is not valid. Please review and try again.',
        retryable: false,
        cause: error,
      };
    }

    // PostgREST: "no rows returned" from `.single()`.
    if (code === 'PGRST116') {
      return {
        kind: 'not_found',
        title: 'Not found',
        message: 'We could not find what you were looking for.',
        retryable: false,
        cause: error,
      };
    }

    /* Auth errors surface as plain messages from GoTrue. */
    if (lowerMessage.includes('invalid login credentials')) {
      return {
        kind: 'auth',
        title: 'Sign in failed',
        message: 'That email address and password do not match. Please try again.',
        retryable: false,
        cause: error,
      };
    }
    if (lowerMessage.includes('email not confirmed')) {
      return {
        kind: 'auth',
        title: 'Confirm your email',
        message: 'Please open the confirmation link we emailed you, then sign in again.',
        retryable: false,
        cause: error,
      };
    }
    if (lowerMessage.includes('user already registered')) {
      return {
        kind: 'conflict',
        title: 'Account exists',
        message: 'An account with that email already exists. Try signing in instead.',
        retryable: false,
        cause: error,
      };
    }
    if (lowerMessage.includes('jwt') || lowerMessage.includes('token is expired')) {
      return {
        kind: 'auth',
        title: 'Session expired',
        message: 'For your security we signed you out. Please sign in again.',
        retryable: false,
        cause: error,
      };
    }
    if (lowerMessage.includes('rate limit') || error.status === 429) {
      return {
        kind: 'server',
        title: 'Too many attempts',
        message: 'Please wait a moment and try again.',
        retryable: true,
        cause: error,
      };
    }
    if (lowerMessage.includes('payload too large') || error.status === 413) {
      return {
        kind: 'upload',
        title: 'File too large',
        message: 'That file is too large to upload. Try a smaller file.',
        retryable: false,
        cause: error,
      };
    }

    if (typeof error.status === 'number' && error.status >= 500) {
      return {
        kind: 'server',
        title: 'Something went wrong',
        message: 'We are having trouble on our side. Please try again shortly.',
        retryable: true,
        cause: error,
      };
    }
  }

  return {
    kind: 'unknown',
    title: 'Something went wrong',
    message: 'We could not complete that action. Please try again.',
    retryable: true,
    cause: error,
  };
}

/** Convenience for `catch` blocks that only want the sentence. */
export function errorMessage(error: unknown): string {
  return toUserError(error).message;
}
