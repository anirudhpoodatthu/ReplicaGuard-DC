import { v4 as uuidv4 } from 'uuid';
import {
  computeChecksum,
  FileRecord,
  HttpError,
  MetadataStore,
  NodeRecord,
  NodeState,
  ReplicaRecord,
} from '@replicaguard/shared';
import { CoordinatorConfig } from '../config';

export interface UploadResult {
  fileRecord: FileRecord;
  status: 'FULLY_REPLICATED' | 'DEGRADED';
}

export class FileCoordinatorService {
  constructor(
    private readonly store: MetadataStore,
    private readonly config: CoordinatorConfig,
  ) {}

  /**
   * Uploads and replicates a file across eligible healthy nodes.
   */
  async uploadFile(
    originalName: string,
    fileBuffer: Buffer,
    ownerId?: string,
  ): Promise<UploadResult> {
    if (!fileBuffer || fileBuffer.length === 0) {
      throw new HttpError(400, 'EMPTY_FILE', 'File cannot be empty.');
    }
    if (fileBuffer.length > this.config.maxFileSizeBytes) {
      throw new HttpError(413, 'FILE_TOO_LARGE', 'File exceeds maximum allowed size.');
    }

    const checksum = computeChecksum(fileBuffer);
    const fileId = uuidv4();

    // Select eligible healthy nodes
    const healthyNodes = this.store
      .listNodes()
      .filter((n) => n.state === NodeState.HEALTHY);

    if (healthyNodes.length === 0) {
      throw new HttpError(
        507,
        'INSUFFICIENT_NODES',
        'No healthy storage nodes available for file replication.',
      );
    }

    // Limit to configured replicationFactor or all available healthy nodes
    const targetNodes = healthyNodes.slice(0, this.config.replicationFactor);
    const successfulReplicas: ReplicaRecord[] = [];

    // Parallel fan-out storage across target nodes
    const uploadPromises = targetNodes.map(async (node) => {
      try {
        const url = `http://${node.host}:${node.port}/files/${fileId}`;
        const res = await fetch(url, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: fileBuffer,
        });

        if (res.ok) {
          const body = (await res.json()) as { checksum: string };
          if (body.checksum === checksum) {
            return { nodeId: node.nodeId, storedAt: new Date() };
          }
        }
      } catch (error) {
        // Keep per-node diagnostics so a failed write is visible in coordinator logs.
        // The HTTP response still degrades gracefully if another node succeeds.
        console.error(`[replication] ${node.nodeId} (${node.host}:${node.port}) failed:`,
          error instanceof Error ? error.message : error);
      }
      return null;
    });

    const results = await Promise.all(uploadPromises);
    for (const r of results) {
      if (r) {
        successfulReplicas.push(r);
      }
    }

    if (successfulReplicas.length === 0) {
      throw new HttpError(
        500,
        'REPLICATION_FAILED',
        'Failed to store file replica on any storage node.',
      );
    }

    const fileRecord: FileRecord = {
      fileId,
      ownerId,
      originalName,
      sizeBytes: fileBuffer.length,
      checksum,
      uploadedAt: new Date(),
      replicas: successfulReplicas,
    };

    this.store.saveFile(fileRecord);

    const status =
      successfulReplicas.length >= this.config.replicationFactor
        ? 'FULLY_REPLICATED'
        : 'DEGRADED';

    return { fileRecord, status };
  }

  /**
   * Retrieves file binary data by querying healthy replicas until a valid one is found.
   */
  async downloadFile(fileId: string): Promise<{
    data: Buffer;
    checksum: string;
    nodeId: string;
    originalName: string;
  }> {
    const file = this.store.getFile(fileId);
    if (!file) {
      throw new HttpError(404, 'FILE_NOT_FOUND', `File "${fileId}" not found.`);
    }

    // Get live healthy nodes with this replica
    const replicaNodes = file.replicas
      .map((r) => {
        const node = this.store.getNode(r.nodeId);
        return node && node.state === NodeState.HEALTHY ? node : null;
      })
      .filter((n): n is NodeRecord => n !== null);

    if (replicaNodes.length === 0) {
      throw new HttpError(
        503,
        'NO_HEALTHY_REPLICA',
        `No healthy replica is currently available for file "${fileId}".`,
      );
    }

    // Try fetching from replicas sequentially in case one is corrupt or unreachable
    for (const node of replicaNodes) {
      try {
        const url = `http://${node.host}:${node.port}/files/${fileId}`;
        const res = await fetch(url);
        if (res.ok) {
          const arrayBuf = await res.arrayBuffer();
          const buf = Buffer.from(arrayBuf);
          const computed = computeChecksum(buf);
          if (computed === file.checksum) {
            return {
              data: buf,
              checksum: file.checksum,
              nodeId: node.nodeId,
              originalName: file.originalName,
            };
          }
        }
      } catch {
        // Try next replica
      }
    }

    throw new HttpError(
      503,
      'ALL_REPLICAS_UNAVAILABLE',
      `All replicas for file "${fileId}" failed verification or were unreachable.`,
    );
  }
}
