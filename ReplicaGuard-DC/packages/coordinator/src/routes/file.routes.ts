import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import multipart from '@fastify/multipart';
import { MetadataStore } from '@replicaguard/shared';
import { CoordinatorConfig } from '../config';
import { FileCoordinatorService } from '../services/file.service';
import { requireUser, requireAdmin } from '../auth';

interface FileParams {
  fileId: string;
}

export async function fileCoordinatorRoutes(
  app: FastifyInstance,
  opts: {
    store: MetadataStore;
    config: CoordinatorConfig;
    fileService: FileCoordinatorService;
  },
): Promise<void> {
  const { store, fileService, config } = opts;

  await app.register(multipart, {
    limits: {
      fileSize: config.maxFileSizeBytes,
      files: 1,
    },
  });

  /**
   * POST /files
   * Upload file via multipart form-data.
   */
  app.post('/files', async (req: FastifyRequest, reply: FastifyReply) => {
    const user = requireUser(req);
    const data = await req.file();
    if (!data) {
      return reply.code(400).send({
        error: 'NO_FILE_UPLOADED',
        message: 'No file found in multipart upload request.',
        statusCode: 400,
      });
    }

    const buffer = await data.toBuffer();
    const originalName = data.filename || 'unknown';

    const { fileRecord, status } = await fileService.uploadFile(originalName, buffer, user.id);

    return reply.code(201).send({
      fileId: fileRecord.fileId,
      originalName: fileRecord.originalName,
      sizeBytes: fileRecord.sizeBytes,
      checksum: fileRecord.checksum,
      status,
      replicas: fileRecord.replicas.map((r) => ({
        nodeId: r.nodeId,
        storedAt: r.storedAt.toISOString(),
      })),
    });
  });

  /**
   * GET /files
   * Lists all tracked files.
   */
  app.get('/files', async (req: FastifyRequest, reply: FastifyReply) => {
    const user = requireUser(req);
    // My Drive is always scoped to the signed-in account, including when the account is an admin.
    // Admin privileges apply to monitoring/recovery routes, not to browsing other users' private files.
    const files = store.listFiles().filter(f => f.ownerId === user.id);
    return reply.code(200).send({
      files: files.map((f) => ({
        fileId: f.fileId,
        originalName: f.originalName,
        sizeBytes: f.sizeBytes,
        checksum: f.checksum,
        uploadedAt: f.uploadedAt.toISOString(),
        replicaCount: f.replicas.length,
        replicas: f.replicas.map((r) => ({
          nodeId: r.nodeId,
          storedAt: r.storedAt.toISOString(),
        })),
      })),
      total: files.length,
    });
  });

  /**
   * GET /files/:fileId/metadata
   * Returns metadata for a specific file.
   */
  app.get<{ Params: FileParams }>(
    '/files/:fileId/metadata',
    async (req: FastifyRequest<{ Params: FileParams }>, reply: FastifyReply) => {
      const user = requireUser(req);
      const { fileId } = req.params;
      const file = store.getFile(fileId);
      if (file && file.ownerId !== user.id) return reply.code(404).send({ error: 'FILE_NOT_FOUND', message: 'File not found.', statusCode: 404 });
      if (!file) {
        return reply.code(404).send({
          error: 'FILE_NOT_FOUND',
          message: `File "${fileId}" not found.`,
          statusCode: 404,
        });
      }

      return reply.code(200).send({
        fileId: file.fileId,
        originalName: file.originalName,
        sizeBytes: file.sizeBytes,
        checksum: file.checksum,
        uploadedAt: file.uploadedAt.toISOString(),
        replicas: file.replicas.map((r) => ({
          nodeId: r.nodeId,
          storedAt: r.storedAt.toISOString(),
        })),
      });
    },
  );

  /**
   * GET /files/:fileId
   * Downloads verified file binary data.
   */
  app.get<{ Params: FileParams }>(
    '/files/:fileId',
    async (req: FastifyRequest<{ Params: FileParams }>, reply: FastifyReply) => {
      const user = requireUser(req);
      const { fileId } = req.params;
      const record = store.getFile(fileId);
      if (!record || record.ownerId !== user.id) return reply.code(404).send({ error: 'FILE_NOT_FOUND', message: 'File not found.', statusCode: 404 });
      const result = await fileService.downloadFile(fileId);

      return reply
        .code(200)
        .header('Content-Type', 'application/octet-stream')
        .header('Content-Length', String(result.data.length))
        .header('Content-Disposition', `attachment; filename="${result.originalName}"`)
        .header('X-Checksum', result.checksum)
        .header('X-Replica-Source', result.nodeId)
        .send(result.data);
    },
  );
}
