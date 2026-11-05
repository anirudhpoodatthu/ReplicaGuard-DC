import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { CoordinatorConfig } from './config';
import { InMemoryMetadataStore } from './store/in-memory.store';
import { HeartbeatMonitor } from './services/heartbeat.service';
import { FileCoordinatorService } from './services/file.service';
import { RecoveryEngine } from './services/recovery.service';
import { healthAndStatusRoutes } from './routes/status.routes';
import { nodeRoutes } from './routes/node.routes';
import { fileCoordinatorRoutes } from './routes/file.routes';
import { recoveryRoutes } from './routes/recovery.routes';
import { authRoutes } from './routes/auth.routes';
import { createLogger, HttpError } from '@replicaguard/shared';

export interface CoordinatorServer {
  app: FastifyInstance;
  store: InMemoryMetadataStore;
  heartbeatMonitor: HeartbeatMonitor;
  fileService: FileCoordinatorService;
  recoveryEngine: RecoveryEngine;
  startTime: Date;
}

export async function buildCoordinatorServer(
  config: CoordinatorConfig,
  customStore?: InMemoryMetadataStore,
): Promise<CoordinatorServer> {
  const loggerInstance = createLogger('coordinator');
  const store = customStore ?? new InMemoryMetadataStore();
  const startTime = new Date();
  const heartbeatMonitor = new HeartbeatMonitor(store, config, loggerInstance);
  const fileService = new FileCoordinatorService(store, config);
  const recoveryEngine = new RecoveryEngine(store, config, loggerInstance);

  const app = Fastify({
    logger: config.logLevel === 'silent' ? false : { level: config.logLevel },
  });

  app.setErrorHandler((err: unknown, _req, reply) => {
    if (err instanceof HttpError) {
      return reply.code(err.statusCode).send({
        error: err.code,
        message: err.message,
        statusCode: err.statusCode,
      });
    }

    if (typeof err === 'object' && err !== null && 'statusCode' in err) {
      const statusCode = (err as { statusCode: unknown }).statusCode;
      if (typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500) {
        const message = err instanceof Error ? err.message : 'Request could not be completed.';
        return reply.code(statusCode).send({
          error: statusCode === 401 ? 'UNAUTHORIZED' : statusCode === 403 ? 'FORBIDDEN' : statusCode === 413 ? 'FILE_TOO_LARGE' : 'BAD_REQUEST',
          message: statusCode === 413 ? 'File exceeds maximum allowed size.' : message,
          statusCode,
        });
      }
    }

    app.log.error({ err }, 'Unhandled coordinator error');
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

  await app.register(authRoutes);
  await app.register(healthAndStatusRoutes, { store, config, startTime });
  await app.register(nodeRoutes, { store });
  await app.register(fileCoordinatorRoutes, { store, config, fileService });
  await app.register(recoveryRoutes, { store });

  return { app, store, heartbeatMonitor, fileService, recoveryEngine, startTime };
}
