import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { NodeConfig } from '../config';

/**
 * Administrative endpoints for controlling failure simulation.
 */
export async function adminRoutes(
  app: FastifyInstance,
  opts: {
    config: NodeConfig;
    simulationState: { isSimulatingFailure: boolean };
    onSimulate?: () => void;
    onRecover?: () => void;
  },
): Promise<void> {
  const { config, simulationState, onSimulate, onRecover } = opts;

  /**
   * POST /admin/simulate-failure
   * Stop sending heartbeats and reject file operations with 503 Service Unavailable.
   */
  app.post('/admin/simulate-failure', async (_req: FastifyRequest, reply: FastifyReply) => {
    simulationState.isSimulatingFailure = true;
    if (onSimulate) onSimulate();
    return reply.code(200).send({
      nodeId: config.nodeId,
      simulating: true,
      message: 'Node is now simulating failure (heartbeats paused, file requests rejected).',
    });
  });

  /**
   * POST /admin/recover
   * Resume normal operations and heartbeats.
   */
  app.post('/admin/recover', async (_req: FastifyRequest, reply: FastifyReply) => {
    simulationState.isSimulatingFailure = false;
    if (onRecover) onRecover();
    return reply.code(200).send({
      nodeId: config.nodeId,
      simulating: false,
      message: 'Node has recovered normal operations.',
    });
  });
}
