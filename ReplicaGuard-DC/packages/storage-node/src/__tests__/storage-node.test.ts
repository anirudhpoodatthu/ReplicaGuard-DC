import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { FastifyInstance } from 'fastify';
import { buildServer } from '../server';
import { NodeConfig } from '../config';
import { computeChecksum } from '@replicaguard/shared';

// ── Test helpers ─────────────────────────────────────────────────────────────

/** Unique temp directory per test run to avoid cross-test contamination. */
let tmpDir: string;
let app: FastifyInstance;

const TEST_CONFIG: NodeConfig = {
  nodeId: 'test-node',
  port: 9999,           // never actually bound — tests use inject()
  storageDir: '',       // filled in beforeEach
  coordinatorUrl: 'http://localhost:4100',
  maxFileSizeBytes: 52_428_800, // 50 MB
  logLevel: 'silent',
};

/** A valid UUID v4 for use in tests. */
const VALID_UUID = '123e4567-e89b-4d3c-a456-426614174000';
const VALID_UUID_2 = '223e4567-e89b-4d3c-a456-426614174001';

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'replicaguard-test-'));
  const config: NodeConfig = { ...TEST_CONFIG, storageDir: tmpDir };
  app = await buildServer(config);
  await app.ready();
});

afterEach(async () => {
  await app.close();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /health
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /health', () => {
  it('returns 200 with correct node identity', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });

    expect(res.statusCode).toBe(200);
    const body = res.json<{
      status: string;
      nodeId: string;
      port: number;
      storageDir: string;
      fileCount: number;
      diskUsedBytes: number;
      timestamp: string;
    }>();
    expect(body.status).toBe('ok');
    expect(body.nodeId).toBe('test-node');
    expect(body.port).toBe(9999);
    expect(body.storageDir).toBe(tmpDir);
    expect(typeof body.fileCount).toBe('number');
    expect(typeof body.diskUsedBytes).toBe('number');
    expect(typeof body.timestamp).toBe('string');
  });

  it('reports fileCount=0 and diskUsedBytes=0 when no files stored', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    const body = res.json<{ fileCount: number; diskUsedBytes: number }>();
    expect(body.fileCount).toBe(0);
    expect(body.diskUsedBytes).toBe(0);
  });

  it('reflects correct fileCount after a file is stored', async () => {
    const data = Buffer.from('hello replicaguard');

    await app.inject({
      method: 'PUT',
      url: `/files/${VALID_UUID}`,
      payload: data,
      headers: { 'content-type': 'application/octet-stream' },
    });

    const res = await app.inject({ method: 'GET', url: '/health' });
    const body = res.json<{ fileCount: number; diskUsedBytes: number }>();
    expect(body.fileCount).toBe(1);
    expect(body.diskUsedBytes).toBe(data.length);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /files/:fileId
// ─────────────────────────────────────────────────────────────────────────────

describe('PUT /files/:fileId', () => {
  it('stores a file and returns 201 with correct checksum', async () => {
    const data = Buffer.from('ReplicaGuard test payload');
    const expectedChecksum = computeChecksum(data);

    const res = await app.inject({
      method: 'PUT',
      url: `/files/${VALID_UUID}`,
      payload: data,
      headers: { 'content-type': 'application/octet-stream' },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json<{ fileId: string; checksum: string; storedAt: string }>();
    expect(body.fileId).toBe(VALID_UUID);
    expect(body.checksum).toBe(expectedChecksum);
    expect(typeof body.storedAt).toBe('string');
  });

  it('actually writes the file to disk', async () => {
    const data = Buffer.from('disk write verification');

    await app.inject({
      method: 'PUT',
      url: `/files/${VALID_UUID}`,
      payload: data,
      headers: { 'content-type': 'application/octet-stream' },
    });

    const onDisk = await fs.readFile(path.join(tmpDir, VALID_UUID));
    expect(onDisk).toEqual(data);
  });

  it('is idempotent — re-uploading the same fileId with same content returns 201', async () => {
    const data = Buffer.from('idempotent payload');

    const res1 = await app.inject({
      method: 'PUT',
      url: `/files/${VALID_UUID}`,
      payload: data,
      headers: { 'content-type': 'application/octet-stream' },
    });
    const res2 = await app.inject({
      method: 'PUT',
      url: `/files/${VALID_UUID}`,
      payload: data,
      headers: { 'content-type': 'application/octet-stream' },
    });

    expect(res1.statusCode).toBe(201);
    expect(res2.statusCode).toBe(201);
    expect(res1.json<{ checksum: string }>().checksum).toBe(
      res2.json<{ checksum: string }>().checksum,
    );
  });

  it('correctly stores binary (non-text) data', async () => {
    const data = Buffer.from([0x00, 0xff, 0xab, 0x12, 0xfe, 0x80]);
    const expectedChecksum = computeChecksum(data);

    const res = await app.inject({
      method: 'PUT',
      url: `/files/${VALID_UUID}`,
      payload: data,
      headers: { 'content-type': 'application/octet-stream' },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json<{ checksum: string }>().checksum).toBe(expectedChecksum);
  });

  it('returns 400 for an invalid (non-UUID) fileId', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/files/%2e%2e%2f%2e%2e%2fetc%2fpasswd',
      payload: Buffer.from('hack'),
      headers: { 'content-type': 'application/octet-stream' },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json<{ error: string }>();
    expect(body.error).toBe('INVALID_FILE_ID');
  });

  it('returns 400 for a plain string fileId that is not a UUID', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/files/not-a-uuid',
      payload: Buffer.from('data'),
      headers: { 'content-type': 'application/octet-stream' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: string }>().error).toBe('INVALID_FILE_ID');
  });

  it('returns 400 when the body is empty', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/files/${VALID_UUID}`,
      payload: Buffer.alloc(0),
      headers: { 'content-type': 'application/octet-stream' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: string }>().error).toBe('EMPTY_BODY');
  });

  it('returns 413 when file exceeds maxFileSizeBytes', async () => {
    // Build a config with a tiny 10-byte limit to trigger 413 cheaply.
    const smallConfig: NodeConfig = { ...TEST_CONFIG, storageDir: tmpDir, maxFileSizeBytes: 10 };
    const smallApp = await buildServer(smallConfig);
    await smallApp.ready();

    const res = await smallApp.inject({
      method: 'PUT',
      url: `/files/${VALID_UUID}`,
      payload: Buffer.alloc(11, 0x41), // 11 bytes > 10-byte limit
      headers: { 'content-type': 'application/octet-stream' },
    });

    await smallApp.close();

    expect(res.statusCode).toBe(413);
    expect(res.json<{ error: string }>().error).toBe('FILE_TOO_LARGE');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /files/:fileId
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /files/:fileId', () => {
  it('returns 200 with the exact bytes that were uploaded', async () => {
    const data = Buffer.from('round-trip verification payload');

    await app.inject({
      method: 'PUT',
      url: `/files/${VALID_UUID}`,
      payload: data,
      headers: { 'content-type': 'application/octet-stream' },
    });

    const res = await app.inject({ method: 'GET', url: `/files/${VALID_UUID}` });

    expect(res.statusCode).toBe(200);
    expect(res.rawPayload).toEqual(data);
  });

  it('sets the X-Checksum header matching the uploaded content', async () => {
    const data = Buffer.from('checksum header test');
    const expectedChecksum = computeChecksum(data);

    await app.inject({
      method: 'PUT',
      url: `/files/${VALID_UUID}`,
      payload: data,
      headers: { 'content-type': 'application/octet-stream' },
    });

    const res = await app.inject({ method: 'GET', url: `/files/${VALID_UUID}` });

    expect(res.headers['x-checksum']).toBe(expectedChecksum);
  });

  it('sets the X-Node-Id header to the configured nodeId', async () => {
    const data = Buffer.from('node id header test');

    await app.inject({
      method: 'PUT',
      url: `/files/${VALID_UUID}`,
      payload: data,
      headers: { 'content-type': 'application/octet-stream' },
    });

    const res = await app.inject({ method: 'GET', url: `/files/${VALID_UUID}` });

    expect(res.headers['x-node-id']).toBe('test-node');
  });

  it('sets Content-Type: application/octet-stream', async () => {
    const data = Buffer.from('content type check');

    await app.inject({
      method: 'PUT',
      url: `/files/${VALID_UUID}`,
      payload: data,
      headers: { 'content-type': 'application/octet-stream' },
    });

    const res = await app.inject({ method: 'GET', url: `/files/${VALID_UUID}` });

    expect(res.headers['content-type']).toMatch('application/octet-stream');
  });

  it('returns binary data faithfully (not corrupted by string encoding)', async () => {
    const data = Buffer.from([0x00, 0x01, 0xfe, 0xff, 0xab, 0xcd]);

    await app.inject({
      method: 'PUT',
      url: `/files/${VALID_UUID}`,
      payload: data,
      headers: { 'content-type': 'application/octet-stream' },
    });

    const res = await app.inject({ method: 'GET', url: `/files/${VALID_UUID}` });

    expect(res.rawPayload).toEqual(data);
    expect(computeChecksum(res.rawPayload)).toBe(computeChecksum(data));
  });

  it('returns 404 for a file that does not exist', async () => {
    const res = await app.inject({ method: 'GET', url: `/files/${VALID_UUID}` });

    expect(res.statusCode).toBe(404);
    const body = res.json<{ error: string; message: string }>();
    expect(body.error).toBe('FILE_NOT_FOUND');
    expect(body.message).toContain(VALID_UUID);
  });

  it('returns 400 for a non-UUID fileId', async () => {
    const res = await app.inject({ method: 'GET', url: '/files/not-a-uuid' });

    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: string }>().error).toBe('INVALID_FILE_ID');
  });

  it('returns 400 for a path-traversal attempt', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/files/%2e%2e%2fsecret',
    });

    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: string }>().error).toBe('INVALID_FILE_ID');
  });

  it('upload/download round-trip preserves checksum for a large payload', async () => {
    // 1 MB of pseudo-random-ish data
    const data = Buffer.alloc(1_048_576);
    for (let i = 0; i < data.length; i++) data[i] = i % 256;
    const expectedChecksum = computeChecksum(data);

    await app.inject({
      method: 'PUT',
      url: `/files/${VALID_UUID_2}`,
      payload: data,
      headers: { 'content-type': 'application/octet-stream' },
    });

    const res = await app.inject({ method: 'GET', url: `/files/${VALID_UUID_2}` });

    expect(res.statusCode).toBe(200);
    expect(res.headers['x-checksum']).toBe(expectedChecksum);
    expect(computeChecksum(res.rawPayload)).toBe(expectedChecksum);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /files/:fileId
// ─────────────────────────────────────────────────────────────────────────────

describe('DELETE /files/:fileId', () => {
  it('deletes an existing file and returns 200', async () => {
    const data = Buffer.from('to be deleted');
    await app.inject({
      method: 'PUT',
      url: `/files/${VALID_UUID}`,
      payload: data,
      headers: { 'content-type': 'application/octet-stream' },
    });

    const res = await app.inject({
      method: 'DELETE',
      url: `/files/${VALID_UUID}`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json<{ deleted: boolean }>().deleted).toBe(true);

    // Verify it is gone
    const getRes = await app.inject({
      method: 'GET',
      url: `/files/${VALID_UUID}`,
    });
    expect(getRes.statusCode).toBe(404);
  });

  it('returns 404 when deleting a non-existent file', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/files/${VALID_UUID}`,
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 400 when fileId is not a UUID', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/files/invalid-id',
    });
    expect(res.statusCode).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Failure Simulation & Admin
// ─────────────────────────────────────────────────────────────────────────────

describe('Admin & Failure Simulation', () => {
  it('toggles failure simulation and blocks file requests with 503', async () => {
    // 1. Simulate failure
    const simRes = await app.inject({
      method: 'POST',
      url: '/admin/simulate-failure',
    });
    expect(simRes.statusCode).toBe(200);
    expect(simRes.json<{ simulating: boolean }>().simulating).toBe(true);

    // 2. Health check reports simulating_failure
    const healthRes = await app.inject({ method: 'GET', url: '/health' });
    expect(healthRes.statusCode).toBe(200);
    expect(healthRes.json<{ status: string }>().status).toBe('simulating_failure');

    // 3. File upload is blocked with 503
    const putRes = await app.inject({
      method: 'PUT',
      url: `/files/${VALID_UUID}`,
      payload: Buffer.from('blocked'),
      headers: { 'content-type': 'application/octet-stream' },
    });
    expect(putRes.statusCode).toBe(503);

    // 4. File download is blocked with 503
    const getRes = await app.inject({
      method: 'GET',
      url: `/files/${VALID_UUID}`,
    });
    expect(getRes.statusCode).toBe(503);

    // 5. Recover normal operation
    const recRes = await app.inject({
      method: 'POST',
      url: '/admin/recover',
    });
    expect(recRes.statusCode).toBe(200);
    expect(recRes.json<{ simulating: boolean }>().simulating).toBe(false);

    // 6. Health check reports ok
    const healthAfter = await app.inject({ method: 'GET', url: '/health' });
    expect(healthAfter.json<{ status: string }>().status).toBe('ok');
  });
});
