import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { requireAdmin } from '../auth';
import {
  HeartbeatRequest,
  HeartbeatResponse,
  HttpError,
  ListNodesResponse,
  MetadataStore,
  NodeRecord,
  NodeState,
  RegisterNodeRequest,
  RegisterNodeResponse,
} from '@replicaguard/shared';

interface NodeParams {
  nodeId: string;
}

export async function nodeRoutes(
  app: FastifyInstance,
  opts: { store: MetadataStore },
): Promise<void> {
  const { store } = opts;

  /**
   * POST /nodes
   * Storage node registers itself upon startup.
   */
  app.post<{ Body: RegisterNodeRequest }>(
    '/nodes',
    async (req: FastifyRequest<{ Body: RegisterNodeRequest }>, reply: FastifyReply) => {
      const { nodeId, host, port, storageDir } = req.body || {};

      if (!nodeId || typeof nodeId !== 'string' || nodeId.trim() === '') {
        throw new HttpError(400, 'INVALID_NODE_ID', 'nodeId is required and must be a non-empty string.');
      }
      if (!host || typeof host !== 'string') {
        throw new HttpError(400, 'INVALID_HOST', 'host is required.');
      }
      if (!port || typeof port !== 'number' || port < 1 || port > 65535) {
        throw new HttpError(400, 'INVALID_PORT', 'port must be a valid TCP port (1-65535).');
      }
      if (!storageDir || typeof storageDir !== 'string') {
        throw new HttpError(400, 'INVALID_STORAGE_DIR', 'storageDir is required.');
      }

      const existing = store.getNode(nodeId);
      const now = new Date();

      if (existing) {
        // Re-registration / node reboot: update details and mark HEALTHY
        existing.host = host;
        existing.port = port;
        existing.storageDir = storageDir;
        existing.lastSeen = now;
        existing.state = NodeState.HEALTHY;
        store.registerNode(existing);
      } else {
        const newRecord: NodeRecord = {
          nodeId,
          host,
          port,
          storageDir,
          state: NodeState.HEALTHY,
          registeredAt: now,
          lastSeen: now,
        };
        store.registerNode(newRecord);
      }

      const response: RegisterNodeResponse = {
        nodeId,
        state: NodeState.HEALTHY,
        registeredAt: now.toISOString(),
      };
      return reply.code(201).send(response);
    },
  );

  /**
   * GET /nodes
   * Lists all registered nodes and their current status.
   */
  app.get('/nodes', async (req: FastifyRequest, reply: FastifyReply) => {
    requireAdmin(req);
    const nodes = store.listNodes();
    const response: ListNodesResponse = {
      nodes: nodes.map((n) => ({
        nodeId: n.nodeId,
        host: n.host,
        port: n.port,
        state: n.state,
        lastSeen: n.lastSeen.toISOString(),
        registeredAt: n.registeredAt.toISOString(),
        diskUsedBytes: n.diskUsedBytes,
        fileCount: n.fileCount,
      })),
    };
    return reply.code(200).send(response);
  });

  /**
   * POST /nodes/:nodeId/heartbeat
   * Storage node reports liveness.
   */
  app.post<{ Params: NodeParams; Body: HeartbeatRequest }>(
    '/nodes/:nodeId/heartbeat',
    async (
      req: FastifyRequest<{ Params: NodeParams; Body: HeartbeatRequest }>,
      reply: FastifyReply,
    ) => {
      const { nodeId } = req.params;
      const node = store.getNode(nodeId);

      if (!node) {
        throw new HttpError(404, 'NODE_NOT_FOUND', `Node "${nodeId}" is not registered.`);
      }

      const { diskUsedBytes, fileCount } = req.body || {};
      store.updateHeartbeat(nodeId, new Date(), diskUsedBytes, fileCount);

      const response: HeartbeatResponse = {
        acknowledged: true,
        serverTime: new Date().toISOString(),
      };
      return reply.code(200).send(response);
    },
  );
}
