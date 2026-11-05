import { FastifyInstance } from 'fastify';
import { buildCoordinatorServer, CoordinatorServer } from '../server';
import { CoordinatorConfig } from '../config';
import { NodeState } from '@replicaguard/shared';

describe('Coordinator Node Registration & Heartbeats', () => {
  let server: CoordinatorServer;
  let app: FastifyInstance;

  const testConfig: CoordinatorConfig = {
    port: 0,
    heartbeatIntervalMs: 50,
    heartbeatCheckIntervalMs: 50,
    failureTimeoutMs: 150,
    recoveryScanIntervalMs: 200,
    replicationFactor: 3,
    maxFileSizeBytes: 52_428_800,
    logLevel: 'silent',
  };

  beforeEach(async () => {
    server = await buildCoordinatorServer(testConfig);
    app = server.app;
    await app.ready();
  });

  afterEach(async () => {
    server.heartbeatMonitor.stop();
    await app.close();
  });

  describe('GET /health', () => {
    it('returns 200 with status ok', async () => {
      const res = await app.inject({ method: 'GET', url: '/health' });
      expect(res.statusCode).toBe(200);
      expect(res.json<{ status: string; service: string }>().service).toBe('coordinator');
    });
  });

  describe('POST /nodes', () => {
    it('registers a new node successfully and sets state to HEALTHY', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/nodes',
        payload: {
          nodeId: 'node-1',
          host: 'localhost',
          port: 4101,
          storageDir: 'storage/node-1',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json<{ nodeId: string; state: string }>();
      expect(body.nodeId).toBe('node-1');
      expect(body.state).toBe(NodeState.HEALTHY);

      const listRes = await app.inject({ method: 'GET', url: '/nodes' });
      const list = listRes.json<{ nodes: Array<{ nodeId: string; state: string }> }>();
      expect(list.nodes).toHaveLength(1);
      expect(list.nodes[0].nodeId).toBe('node-1');
    });

    it('rejects invalid node registration payloads', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/nodes',
        payload: { nodeId: '', host: 'localhost', port: 4101 },
      });
      expect(res.statusCode).toBe(400);
    });

    it('updates node info on re-registration', async () => {
      await app.inject({
        method: 'POST',
        url: '/nodes',
        payload: { nodeId: 'node-1', host: 'localhost', port: 4101, storageDir: 'dir-1' },
      });

      const res = await app.inject({
        method: 'POST',
        url: '/nodes',
        payload: { nodeId: 'node-1', host: 'localhost', port: 4109, storageDir: 'dir-1-new' },
      });

      expect(res.statusCode).toBe(201);
      const node = server.store.getNode('node-1');
      expect(node?.port).toBe(4109);
      expect(node?.storageDir).toBe('dir-1-new');
    });
  });

  describe('POST /nodes/:nodeId/heartbeat', () => {
    it('acknowledges heartbeat and updates lastSeen', async () => {
      await app.inject({
        method: 'POST',
        url: '/nodes',
        payload: { nodeId: 'node-1', host: 'localhost', port: 4101, storageDir: 'dir-1' },
      });

      const res = await app.inject({
        method: 'POST',
        url: '/nodes/node-1/heartbeat',
        payload: { diskUsedBytes: 1024, fileCount: 2 },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json<{ acknowledged: boolean }>().acknowledged).toBe(true);

      const node = server.store.getNode('node-1');
      expect(node?.diskUsedBytes).toBe(1024);
      expect(node?.fileCount).toBe(2);
    });

    it('returns 404 for unknown node heartbeat', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/nodes/unknown-node/heartbeat',
        payload: {},
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('HeartbeatMonitor state transitions', () => {
    it('transitions node from HEALTHY to SUSPECT to DEAD when heartbeats cease', () => {
      server.store.registerNode({
        nodeId: 'node-1',
        host: 'localhost',
        port: 4101,
        storageDir: 'dir-1',
        state: NodeState.HEALTHY,
        registeredAt: new Date(0),
        lastSeen: new Date(1000),
      });

      // At t=1020, elapsed = 20ms < 50ms => HEALTHY
      server.heartbeatMonitor.checkHeartbeats(new Date(1020));
      expect(server.store.getNode('node-1')?.state).toBe(NodeState.HEALTHY);

      // At t=1070, elapsed = 70ms > 50ms but < 150ms => SUSPECT
      server.heartbeatMonitor.checkHeartbeats(new Date(1070));
      expect(server.store.getNode('node-1')?.state).toBe(NodeState.SUSPECT);

      // At t=1200, elapsed = 200ms > 150ms => DEAD
      server.heartbeatMonitor.checkHeartbeats(new Date(1200));
      expect(server.store.getNode('node-1')?.state).toBe(NodeState.DEAD);

      // Heartbeat arrives => HEALTHY again
      server.store.updateHeartbeat('node-1', new Date(1250));
      expect(server.store.getNode('node-1')?.state).toBe(NodeState.HEALTHY);
    });
  });

  describe('GET /status', () => {
    it('returns system status dashboard summary', async () => {
      await app.inject({
        method: 'POST',
        url: '/nodes',
        payload: { nodeId: 'node-1', host: 'localhost', port: 4101, storageDir: 'dir-1' },
      });

      const res = await app.inject({ method: 'GET', url: '/status' });
      expect(res.statusCode).toBe(200);
      const body = res.json<{
        coordinator: { uptimeSeconds: number };
        nodes: { total: number; healthy: number; suspect: number; dead: number };
      }>();
      expect(body.nodes.total).toBe(1);
      expect(body.nodes.healthy).toBe(1);
      expect(body.nodes.dead).toBe(0);
    });
  });
});
