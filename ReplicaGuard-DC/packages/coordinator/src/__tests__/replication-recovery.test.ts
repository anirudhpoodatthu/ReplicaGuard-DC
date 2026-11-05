import { FastifyInstance } from 'fastify';
import { buildCoordinatorServer, CoordinatorServer } from '../server';
import { CoordinatorConfig } from '../config';
import { NodeState, computeChecksum } from '@replicaguard/shared';

describe('Coordinator Replication, Download & Recovery', () => {
  let server: CoordinatorServer;
  let app: FastifyInstance;

  const testConfig: CoordinatorConfig = {
    port: 0,
    heartbeatIntervalMs: 50,
    heartbeatCheckIntervalMs: 50,
    failureTimeoutMs: 150,
    recoveryScanIntervalMs: 100,
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
    server.recoveryEngine.stop();
    await app.close();
  });

  describe('File Upload & Replication Placement', () => {
    it('rejects upload when zero healthy nodes exist', async () => {
      const buffer = Buffer.from('test file data');
      await expect(server.fileService.uploadFile('test.txt', buffer)).rejects.toMatchObject({
        statusCode: 507,
        code: 'INSUFFICIENT_NODES',
      });
    });

    it('returns DEGRADED when healthy nodes < replication factor', async () => {
      // Mock 1 node
      server.store.registerNode({
        nodeId: 'node-1',
        host: 'localhost',
        port: 4101,
        storageDir: 'dir-1',
        state: NodeState.HEALTHY,
        registeredAt: new Date(),
        lastSeen: new Date(),
      });

      // Mock fetch for PUT /files/:fileId on node-1
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockImplementation(async (url: string) => {
        if (url.includes('/files/')) {
          return {
            ok: true,
            status: 201,
            json: async () => ({ checksum: computeChecksum(Buffer.from('hello world')) }),
          };
        }
        return { ok: false, status: 500 };
      }) as any;

      try {
        const result = await server.fileService.uploadFile('hello.txt', Buffer.from('hello world'));
        expect(result.status).toBe('DEGRADED');
        expect(result.fileRecord.replicas).toHaveLength(1);
        expect(result.fileRecord.replicas[0].nodeId).toBe('node-1');
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('returns FULLY_REPLICATED when healthy nodes >= replication factor', async () => {
      for (const id of ['node-1', 'node-2', 'node-3']) {
        server.store.registerNode({
          nodeId: id,
          host: 'localhost',
          port: 4101,
          storageDir: `dir-${id}`,
          state: NodeState.HEALTHY,
          registeredAt: new Date(),
          lastSeen: new Date(),
        });
      }

      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockImplementation(async () => {
        return {
          ok: true,
          status: 201,
          json: async () => ({ checksum: computeChecksum(Buffer.from('full data')) }),
        };
      }) as any;

      try {
        const result = await server.fileService.uploadFile('full.txt', Buffer.from('full data'));
        expect(result.status).toBe('FULLY_REPLICATED');
        expect(result.fileRecord.replicas).toHaveLength(3);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  describe('Download & Verification', () => {
    it('downloads from healthy replica successfully', async () => {
      const data = Buffer.from('download content');
      const checksum = computeChecksum(data);

      server.store.registerNode({
        nodeId: 'node-1',
        host: 'localhost',
        port: 4101,
        storageDir: 'dir-1',
        state: NodeState.HEALTHY,
        registeredAt: new Date(),
        lastSeen: new Date(),
      });

      server.store.saveFile({
        fileId: 'f1',
        originalName: 'file1.txt',
        sizeBytes: data.length,
        checksum,
        uploadedAt: new Date(),
        replicas: [{ nodeId: 'node-1', storedAt: new Date() }],
      });

      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockImplementation(async () => {
        return {
          ok: true,
          arrayBuffer: async () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
        };
      }) as any;

      try {
        const dl = await server.fileService.downloadFile('f1');
        expect(dl.checksum).toBe(checksum);
        expect(dl.data.toString()).toBe('download content');
        expect(dl.nodeId).toBe('node-1');
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('returns 503 if all replica nodes are DEAD', async () => {
      server.store.registerNode({
        nodeId: 'node-1',
        host: 'localhost',
        port: 4101,
        storageDir: 'dir-1',
        state: NodeState.DEAD,
        registeredAt: new Date(),
        lastSeen: new Date(0),
      });

      server.store.saveFile({
        fileId: 'f1',
        originalName: 'file1.txt',
        sizeBytes: 10,
        checksum: 'sha256:123',
        uploadedAt: new Date(),
        replicas: [{ nodeId: 'node-1', storedAt: new Date() }],
      });

      await expect(server.fileService.downloadFile('f1')).rejects.toMatchObject({
        statusCode: 503,
        code: 'NO_HEALTHY_REPLICA',
      });
    });
  });

  describe('Target-Pull Recovery Engine', () => {
    it('executes target-pull recovery to Node 4 when one node dies', async () => {
      // 3 nodes originally holding replica
      server.store.registerNode({
        nodeId: 'node-1',
        host: 'localhost',
        port: 4101,
        storageDir: 'dir-1',
        state: NodeState.HEALTHY,
        registeredAt: new Date(),
        lastSeen: new Date(),
      });
      server.store.registerNode({
        nodeId: 'node-2',
        host: 'localhost',
        port: 4102,
        storageDir: 'dir-2',
        state: NodeState.DEAD, // Node 2 died!
        registeredAt: new Date(),
        lastSeen: new Date(0),
      });
      // Node 4 is spare healthy node
      server.store.registerNode({
        nodeId: 'node-4',
        host: 'localhost',
        port: 4104,
        storageDir: 'dir-4',
        state: NodeState.HEALTHY,
        registeredAt: new Date(),
        lastSeen: new Date(),
      });

      const fileData = Buffer.from('recovery target data');
      const checksum = computeChecksum(fileData);

      server.store.saveFile({
        fileId: 'f-rec-1',
        originalName: 'rec.txt',
        sizeBytes: fileData.length,
        checksum,
        uploadedAt: new Date(),
        replicas: [
          { nodeId: 'node-1', storedAt: new Date() },
          { nodeId: 'node-2', storedAt: new Date() },
        ],
      });

      // Mock pull request to target node (node-4)
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockImplementation(async (url: string) => {
        if (url.includes('/recovery/pull/')) {
          return {
            ok: true,
            status: 201,
            json: async () => ({ verified: true, checksum }),
          };
        }
        return { ok: false };
      }) as any;

      try {
        await server.recoveryEngine.scanAndRecover();

        // Node-4 should now be added as replica
        const fileAfter = server.store.getFile('f-rec-1');
        const replicaNodeIds = fileAfter?.replicas.map((r) => r.nodeId);
        expect(replicaNodeIds).toContain('node-4');

        // Check recovery events
        const events = server.store.listEvents();
        expect(events).toHaveLength(1);
        expect(events[0].status).toBe('SUCCESS');
        expect(events[0].sourceNodeId).toBe('node-1');
        expect(events[0].targetNodeId).toBe('node-4');
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('reports pending/degraded recovery when no spare node is available', async () => {
      server.store.registerNode({
        nodeId: 'node-1',
        host: 'localhost',
        port: 4101,
        storageDir: 'dir-1',
        state: NodeState.HEALTHY,
        registeredAt: new Date(),
        lastSeen: new Date(),
      });
      server.store.registerNode({
        nodeId: 'node-2',
        host: 'localhost',
        port: 4102,
        storageDir: 'dir-2',
        state: NodeState.DEAD,
        registeredAt: new Date(),
        lastSeen: new Date(0),
      });

      server.store.saveFile({
        fileId: 'f-degraded',
        originalName: 'deg.txt',
        sizeBytes: 10,
        checksum: 'sha256:abc',
        uploadedAt: new Date(),
        replicas: [
          { nodeId: 'node-1', storedAt: new Date() },
          { nodeId: 'node-2', storedAt: new Date() },
        ],
      });

      await server.recoveryEngine.scanAndRecover();

      // No events logged, remains degraded
      const file = server.store.getFile('f-degraded');
      expect(file?.replicas).toHaveLength(2);

      const statusRes = await app.inject({ method: 'GET', url: '/status' });
      const status = statusRes.json<{ files: { underReplicated: number } }>();
      expect(status.files.underReplicated).toBe(1);
    });
  });
});
