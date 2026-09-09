/**
 * Minimal logging shim.
 *
 * Exists so that adding Sentry (or any crash reporter) later is a change to
 * this file only. In development it prints; in production it is a no-op until a
 * transport is registered.
 */
type Level = 'debug' | 'info' | 'warn' | 'error';

export interface LogTransport {
  log(level: Level, message: string, context?: Record<string, unknown>): void;
}

let transport: LogTransport | null = null;

export function setLogTransport(next: LogTransport | null): void {
  transport = next;
}

function emit(level: Level, message: string, context?: Record<string, unknown>): void {
  if (transport) {
    transport.log(level, message, context);
    return;
  }
  if (!__DEV__) return;

  const prefix = `[zwcc:${level}]`;
  if (level === 'error') console.error(prefix, message, context ?? '');
  else if (level === 'warn') console.warn(prefix, message, context ?? '');
  else console.log(prefix, message, context ?? '');
}

export const logger = {
  debug: (message: string, context?: Record<string, unknown>) => emit('debug', message, context),
  info: (message: string, context?: Record<string, unknown>) => emit('info', message, context),
  warn: (message: string, context?: Record<string, unknown>) => emit('warn', message, context),
  error: (message: string, error?: unknown, context?: Record<string, unknown>) =>
    emit('error', message, { ...context, error: serialiseError(error) }),
};

function serialiseError(error: unknown): unknown {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return error;
}
