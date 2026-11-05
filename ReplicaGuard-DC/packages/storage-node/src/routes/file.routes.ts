import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { NodeConfig } from '../config';
import { writeReplica, readReplica, deleteReplica } from '../services/file.service';
import { HttpError, StoreReplicaResponse } from '@replicaguard/shared';

interface FileParams {
  fileId: string;
}

/**
 * File replica routes — the core of the storage node.
 *
 * PUT /files/:fileId  — store a raw binary replica on disk
 * GET /files/:fileId  — retrieve a stored replica from disk
 */
export async function fileRoutes(
  app: FastifyInstance,
  opts: {
    config: NodeConfig;
    simulationState?: { isSimulatingFailure: boolean };
  },
): Promise<void> {
  const { config, simulationState } = opts;

  app.addHook('preHandler', async (_req, reply) => {
    if (simulationState?.isSimulatingFailure) {
      return reply.code(503).send({
        error: 'NODE_FAILED_SIMULATION',
        message: 'Node is currently simulating a failure outage.',
        statusCode: 503,
      });
    }
  });

  /**
   * PUT /files/:fileId
   *
   * Stores the raw binary request body as a replica file on disk.
   * Content-Type must be application/octet-stream.
   *
   * The body size limit (50 MB) is enforced by Fastify's built-in bodyLimit
   * option set at server creation time — requests that exceed it are rejected
   * with 413 before this handler runs.
   *
   * Returns 201 with the fileId, SHA-256 checksum, and timestamp.
   */
  app.put<{ Params: FileParams }>(
    '/files/:fileId',
    {
      config: { rawBody: true },
    },
    async (req: FastifyRequest<{ Params: FileParams }>, reply: FastifyReply) => {
      const { fileId } = req.params;

      const body = req.body;
      if (!Buffer.isBuffer(body) || body.length === 0) {
        throw new HttpError(
          400,
          'EMPTY_BODY',
          'Request body must be a non-empty binary payload.',
        );
      }

      const checksum = await writeReplica(config.storageDir, fileId, body);

      const response: StoreReplicaResponse = {
        fileId,
        checksum,
        storedAt: new Date().toISOString(),
      };

      return reply.code(201).send(response);
    },
  );

  /**
   * GET /files/:fileId
   *
   * Reads a stored replica from disk and returns it as a raw binary response.
   * Sets the X-Checksum header with the replica's SHA-256 checksum so callers
   * can verify integrity without re-reading the file.
   */
  app.get<{ Params: FileParams }>(
    '/files/:fileId',
    async (req: FastifyRequest<{ Params: FileParams }>, reply: FastifyReply) => {
      const { fileId } = req.params;

      // readReplica validates fileId and throws HttpError on invalid ID or
      // missing file — the global error handler converts those to JSON responses.
      const data = await readReplica(config.storageDir, fileId);

      // computeChecksum is called inside readReplica's sibling writeReplica;
      // we recompute here to guarantee the header always reflects the actual
      // bytes being sent (catches on-disk corruption).
      const { computeChecksum } = await import('@replicaguard/shared');
      const checksum = computeChecksum(data);

      return reply
        .code(200)
        .header('Content-Type', 'application/octet-stream')
        .header('Content-Length', String(data.length))
        .header('X-Checksum', checksum)
        .header('X-Node-Id', config.nodeId)
        .send(data);
    },
  );

  /**
   * DELETE /files/:fileId
   *
   * Deletes a replica file from disk.
   */
  app.delete<{ Params: FileParams }>(
    '/files/:fileId',
    async (req: FastifyRequest<{ Params: FileParams }>, reply: FastifyReply) => {
      const { fileId } = req.params;
      await deleteReplica(config.storageDir, fileId);
      return reply.code(200).send({ fileId, deleted: true });
    },
  );
}
