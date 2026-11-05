import { Logger } from 'pino';
import { NodeConfig } from '../config';

/**
 * Handles registering the storage node with the Coordinator at startup.
 */
export async function registerWithCoordinator(
  config: NodeConfig,
  logger: Logger,
  maxRetries = 5,
  retryDelayMs = 1000,
): Promise<boolean> {
  const url = `${config.coordinatorUrl}/nodes`;
  const payload = {
    nodeId: config.nodeId,
    host: 'localhost',
    port: config.port,
    storageDir: config.storageDir,
  };

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok || res.status === 201) {
        logger.info({ nodeId: config.nodeId, attempt }, 'Successfully registered with coordinator');
        return true;
      }
      logger.warn({ status: res.status, attempt }, 'Coordinator rejected registration');
    } catch (err) {
      logger.warn({ err: (err as Error).message, attempt }, 'Could not connect to coordinator for registration');
    }

    if (attempt < maxRetries) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }

  logger.error('Exhausted retries registering with coordinator');
  return false;
}
