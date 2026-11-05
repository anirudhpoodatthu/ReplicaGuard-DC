import pino, { Logger } from 'pino';

/**
 * Create a pre-configured pino logger for a ReplicaGuard service.
 *
 * @param service - Human-readable service name used as the `service` field
 *                  in every log line (e.g. "coordinator", "node-1").
 * @returns A pino Logger instance.
 *
 * Log level is read from the `LOG_LEVEL` environment variable, defaulting
 * to `"info"`. In development you can set `LOG_LEVEL=debug` for verbose output.
 */
export function createLogger(service: string): Logger {
  const level = (process.env['LOG_LEVEL'] ?? 'info').toLowerCase();

  return pino({
    level,
    base: { service },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}
