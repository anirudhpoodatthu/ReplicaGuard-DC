import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { NodeConfig } from '../config';
import { getStorageStats } from '../services/file.service';
import { NodeHealthResponse } from '@replicaguard/shared';

/**
 * GET /health
 *
 * Returns the node's identity, current health status, and storage statistics.
 * This is the liveness probe for both the Coordinator (future milestones) and
 * operators checking the service manually.
 */
export async function healthRoutes(
  app: FastifyInstance,
  opts: {
    config: NodeConfig;
    simulationState?: { isSimulatingFailure: boolean };
  },
): Promise<void> {
  const { config, simulationState } = opts;

  app.get('/health', async (_req: FastifyRequest, reply: FastifyReply) => {
    const stats = await getStorageStats(config.storageDir);

    const body: NodeHealthResponse = {
      status: simulationState?.isSimulatingFailure ? 'simulating_failure' : 'ok',
      nodeId: config.nodeId,
      port: config.port,
      storageDir: config.storageDir,
      diskUsedBytes: stats.diskUsedBytes,
      fileCount: stats.fileCount,
      timestamp: new Date().toISOString(),
    };

    return reply.code(200).send(body);
  });
}
