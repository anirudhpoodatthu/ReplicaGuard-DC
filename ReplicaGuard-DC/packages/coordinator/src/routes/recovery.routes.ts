import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { MetadataStore } from '@replicaguard/shared';
import { requireAdmin } from '../auth';

interface EventQuery {
  limit?: string;
  fileId?: string;
  status?: string;
}

export async function recoveryRoutes(
  app: FastifyInstance,
  opts: { store: MetadataStore },
): Promise<void> {
  const { store } = opts;

  /**
   * GET /recovery/events
   * Query recovery log.
   */
  app.get<{ Querystring: EventQuery }>(
    '/recovery/events',
    async (req: FastifyRequest<{ Querystring: EventQuery }>, reply: FastifyReply) => {
      requireAdmin(req);
      const limit = req.query.limit ? parseInt(req.query.limit, 10) : undefined;
      const fileId = req.query.fileId;
      const status = req.query.status;

      const events = store.listEvents({ limit, fileId, status });
      return reply.code(200).send({
        events: events.map((e) => ({
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
        total: events.length,
      });
    },
  );
}
