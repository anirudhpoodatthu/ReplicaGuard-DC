import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { NodeConfig } from './config';
import { healthRoutes } from './routes/health.routes';
import { fileRoutes } from './routes/file.routes';
import { adminRoutes } from './routes/admin.routes';
import { recoveryPullRoutes } from './routes/recovery.routes';
import { HttpError } from '@replicaguard/shared';
import { createLogger } from '@replicaguard/shared';

/**
 * Build and configure the Fastify server instance.
 *
 * Separated from `main.ts` so integration tests can call `buildServer()`
 * without binding to a real port — they use Fastify's `inject()` instead.
 */
export async function buildServer(
  config: NodeConfig,
  externalSimulationState?: { isSimulatingFailure: boolean },
  options?: {
    onSimulate?: () => void;
    onRecover?: () => void;
  },
) {
  const simulationState = externalSimulationState ?? { isSimulatingFailure: false };

  const app = Fastify({
    logger: config.logLevel === 'silent' ? false : {
      level: config.logLevel,
    },
    bodyLimit: config.maxFileSizeBytes,
  });

  // ── Content-type parser for raw binary uploads ────────────────────────────
  // Fastify does not parse application/octet-stream by default.
  // We register a parser that reads the request body as a Buffer.
  app.addContentTypeParser(
    'application/octet-stream',
    { parseAs: 'buffer' },
    (_req, body, done) => {
      done(null, body);
    },
  );

  // Also accept uploads sent without an explicit Content-Type header.
  app.addContentTypeParser(
    '*',
    { parseAs: 'buffer' },
    (_req, body, done) => {
      done(null, body);
    },
  );

  // ── Global error handler ──────────────────────────────────────────────────
  // Converts HttpError instances and Fastify's built-in errors (e.g. 413) into
  // a consistent JSON envelope: { error, message, statusCode }.
  app.setErrorHandler((err: unknown, _req, reply) => {
    if (err instanceof HttpError) {
      return reply.code(err.statusCode).send({
        error: err.code,
        message: err.message,
        statusCode: err.statusCode,
      });
    }

    // Fastify emits a 413 with err.statusCode when bodyLimit is exceeded.
    if (typeof err === 'object' && err !== null && 'statusCode' in err && (err as { statusCode: unknown }).statusCode === 413) {
      return reply.code(413).send({
        error: 'FILE_TOO_LARGE',
        message: `File exceeds the maximum allowed size.`,
        statusCode: 413,
      });
    }

    // Unexpected error — log it and return 500.
    app.log.error({ err }, 'Unhandled server error');
    return reply.code(500).send({
      error: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred.',
      statusCode: 500,
    });
  });

  await app.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });

  // ── Routes ────────────────────────────────────────────────────────────────
  await app.register(healthRoutes, { config, simulationState });
  await app.register(fileRoutes, { config, simulationState });
  await app.register(recoveryPullRoutes, { config });
  await app.register(adminRoutes, {
    config,
    simulationState,
    onSimulate: options?.onSimulate,
    onRecover: options?.onRecover,
  });

  return app;
}
