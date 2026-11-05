import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { MetadataStore } from '@replicaguard/shared';
import { CoordinatorConfig } from '../config';
import { requireAdmin } from '../auth';

export async function healthAndStatusRoutes(
  app: FastifyInstance,
  opts: { store: MetadataStore; config: CoordinatorConfig; startTime: Date },
): Promise<void> {
  const { store, startTime } = opts;

  app.get('/health', async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.code(200).send({
      status: 'ok',
      service: 'coordinator',
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/status', async (req: FastifyRequest, reply: FastifyReply) => {
    requireAdmin(req);
    const uptimeSeconds = Math.floor((Date.now() - startTime.getTime()) / 1000);
    const nodes = store.listNodes();
    const files = store.listFiles();
    const recentEvents = store.listEvents({ limit: 10 });

    const healthyNodes = nodes.filter((n) => n.state === 'HEALTHY').length;
    const suspectNodes = nodes.filter((n) => n.state === 'SUSPECT').length;
    const deadNodes = nodes.filter((n) => n.state === 'DEAD').length;

    let fullyReplicated = 0;
    let underReplicated = 0;

    for (const file of files) {
      // Replicas count only on HEALTHY nodes
      const liveReplicas = file.replicas.filter((r) => {
        const node = store.getNode(r.nodeId);
        return node && node.state === 'HEALTHY';
      }).length;

      if (liveReplicas >= opts.config.replicationFactor) {
        fullyReplicated++;
      } else {
        underReplicated++;
      }
    }

    const inProgressRecovery = store
      .listEvents({ status: 'IN_PROGRESS' })
      .length;

    return reply.code(200).send({
      coordinator: {
        uptimeSeconds,
        timestamp: new Date().toISOString(),
      },
      nodes: {
        total: nodes.length,
        healthy: healthyNodes,
        suspect: suspectNodes,
        dead: deadNodes,
      },
      files: {
        total: files.length,
        fullyReplicated,
        underReplicated,
      },
      recovery: {
        inProgress: inProgressRecovery,
        recentEvents: recentEvents.map((e) => ({
          eventId: e.eventId,
          fileId: e.fileId,
          sourceNodeId: e.sourceNodeId,
          targetNodeId: e.targetNodeId,
          status: e.status,
          startedAt: e.startedAt.toISOString(),
          completedAt: e.completedAt?.toISOString(),
          errorMessage: e.errorMessage,
          attemptNumber: e.attemptNumber,
        })),
      },
    });
  });
}
