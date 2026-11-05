import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { computeChecksum, HttpError, MetadataStore, NodeRecord } from '@replicaguard/shared';
import { NodeConfig } from '../config';
import { writeReplica } from '../services/file.service';

interface PullParams {
  fileId: string;
}

interface PullBody {
  sourceNodeId: string;
  sourceHost: string;
  sourcePort: number;
  expectedChecksum: string;
}

/**
 * Handles target-pull replica recovery directly on the storage node.
 * Validates that source node is trusted, pulls file via HTTP, verifies checksum,
 * and writes to disk using safe temporary file strategy.
 */
export async function recoveryPullRoutes(
  app: FastifyInstance,
  opts: { config: NodeConfig },
): Promise<void> {
  const { config } = opts;

  app.post<{ Params: PullParams; Body: PullBody }>(
    '/recovery/pull/:fileId',
    async (req: FastifyRequest<{ Params: PullParams; Body: PullBody }>, reply: FastifyReply) => {
      const { fileId } = req.params;
      const { sourceNodeId, sourceHost, sourcePort, expectedChecksum } = req.body || {};

      if (!sourceNodeId || !sourceHost || !sourcePort || !expectedChecksum) {
        throw new HttpError(400, 'INVALID_RECOVERY_REQUEST', 'Missing recovery parameters.');
      }

      // Security check: only allow localhost / private IPs to prevent arbitrary SSRF
      const allowedHosts = ['localhost', '127.0.0.1', '::1'];
      if (!allowedHosts.includes(sourceHost)) {
        throw new HttpError(403, 'FORBIDDEN_SOURCE', 'Recovery pulls are restricted to trusted local storage nodes.');
      }

      const sourceUrl = `http://${sourceHost}:${sourcePort}/files/${fileId}`;

      let fetchedData: Buffer;
      try {
        const fetchRes = await fetch(sourceUrl);
        if (!fetchRes.ok) {
          throw new HttpError(
            502,
            'SOURCE_FETCH_FAILED',
            `Source node returned status ${fetchRes.status} for file ${fileId}.`,
          );
        }
        const arrayBuf = await fetchRes.arrayBuffer();
        fetchedData = Buffer.from(arrayBuf);
      } catch (err: unknown) {
        if (err instanceof HttpError) throw err;
        throw new HttpError(
          502,
          'SOURCE_UNREACHABLE',
          `Could not connect to source node at ${sourceUrl}: ${(err as Error).message}`,
        );
      }

      // Checksum verification before storing
      const computed = computeChecksum(fetchedData);
      if (computed !== expectedChecksum) {
        throw new HttpError(
          409,
          'CHECKSUM_MISMATCH',
          `Pulled data checksum ${computed} did not match expected checksum ${expectedChecksum}.`,
        );
      }

      // Store replica safely
      const storedChecksum = await writeReplica(config.storageDir, fileId, fetchedData);

      return reply.code(201).send({
        fileId,
        checksum: storedChecksum,
        storedAt: new Date().toISOString(),
        verified: true,
      });
    },
  );
}
