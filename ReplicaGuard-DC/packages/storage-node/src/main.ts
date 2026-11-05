import { loadConfig } from './config';
import { buildServer } from './server';
import { NodeHeartbeatClient } from './services/heartbeat.service';
import { registerWithCoordinator } from './services/registration.service';
import { createLogger } from '@replicaguard/shared';

/**
 * Entry point for the storage node process.
 */
async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.nodeId);
  const simulationState = { isSimulatingFailure: false };

  const heartbeatClient = new NodeHeartbeatClient(config, logger, simulationState);

  const app = await buildServer(config, simulationState, {
    onSimulate: () => {
      logger.warn('Failure simulation triggered via /admin/simulate-failure');
    },
    onRecover: () => {
      logger.info('Failure simulation ended via /admin/recover; sending immediate heartbeat');
      heartbeatClient.sendHeartbeat().catch(() => {});
    },
  });

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'Received shutdown signal, closing server...');
    heartbeatClient.stop();
    await app.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
    app.log.info(
      { nodeId: config.nodeId, port: config.port, storageDir: config.storageDir },
      'Storage node is ready',
    );

    // Register with Coordinator asynchronously in background with retry
    registerWithCoordinator(config, logger).then((registered) => {
      if (registered) {
        heartbeatClient.start();
        // Immediately trigger an initial heartbeat
        heartbeatClient.sendHeartbeat().catch(() => {});
      }
    });
  } catch (err) {
    app.log.error(err, 'Failed to start storage node');
    process.exit(1);
  }
}

main();
