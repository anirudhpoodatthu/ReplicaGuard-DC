import { loadCoordinatorConfig } from './config';
import { buildCoordinatorServer } from './server';

async function main(): Promise<void> {
  const config = loadCoordinatorConfig();
  const { app, heartbeatMonitor, recoveryEngine } = await buildCoordinatorServer(config);

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'Shutting down coordinator...');
    heartbeatMonitor.stop();
    recoveryEngine.stop();
    await app.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  try {
    heartbeatMonitor.start();
    recoveryEngine.start();
    await app.listen({ port: config.port, host: '0.0.0.0' });
    app.log.info({ port: config.port }, 'Coordinator service is ready');
  } catch (err) {
    app.log.error(err, 'Failed to start coordinator');
    process.exit(1);
  }
}

main();
