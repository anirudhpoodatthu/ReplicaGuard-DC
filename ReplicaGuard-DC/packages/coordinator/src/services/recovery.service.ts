import { v4 as uuidv4 } from 'uuid';
import { Logger } from 'pino';
import {
  MetadataStore,
  NodeRecord,
  NodeState,
  RecoveryEvent,
  RecoveryStatus,
} from '@replicaguard/shared';
import { CoordinatorConfig } from '../config';

/**
 * RecoveryEngine:
 * Periodically scans file records to identify under-replicated files.
 * Coordinates target-pull recovery:
 *  - Picks verified healthy source replica
 *  - Picks healthy destination node without replica (e.g. Node 4 or restored node)
 *  - Dispatches POST /recovery/pull/:fileId to destination
 *  - Destination pulls directly from source and verifies checksum
 *  - Coordinator updates metadata only after successful response
 */
export class RecoveryEngine {
  private timer: NodeJS.Timeout | null = null;
  private readonly inProgressLocks = new Set<string>(); // fileId lock
  private isScanning = false;

  constructor(
    private readonly store: MetadataStore,
    private readonly config: CoordinatorConfig,
    private readonly logger: Logger,
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.scanAndRecover().catch((err) => {
        this.logger.error({ err }, 'Unhandled error in recovery scan cycle');
      });
    }, this.config.recoveryScanIntervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async scanAndRecover(): Promise<void> {
    if (this.isScanning) return;
    this.isScanning = true;

    try {
      const files = this.store.listFiles();
      const allNodes = this.store.listNodes();
      const healthyNodes = allNodes.filter((n) => n.state === NodeState.HEALTHY);

      for (const file of files) {
        if (this.inProgressLocks.has(file.fileId)) {
          continue;
        }

        // Live replicas that are on currently HEALTHY nodes
        const validReplicas = file.replicas.filter((r) => {
          const node = this.store.getNode(r.nodeId);
          return node && node.state === NodeState.HEALTHY;
        });

        // If below desired replication factor
        if (validReplicas.length < this.config.replicationFactor) {
          // If no valid replicas exist, we cannot recover
          if (validReplicas.length === 0) {
            this.logger.warn({ fileId: file.fileId }, 'File is completely unrecoverable: 0 live replicas');
            continue;
          }

          // Eligible target nodes: HEALTHY and do NOT already have a replica
          const existingNodeIds = new Set(file.replicas.map((r) => r.nodeId));
          const eligibleTargets = healthyNodes.filter((n) => !existingNodeIds.has(n.nodeId));

          if (eligibleTargets.length === 0) {
            this.logger.debug(
              { fileId: file.fileId, validReplicas: validReplicas.length },
              'No eligible spare nodes available for replica recovery (degraded)',
            );
            continue;
          }

          // Choose source and target
          const sourceNode = this.store.getNode(validReplicas[0].nodeId)!;
          const targetNode = eligibleTargets[0];

          // Trigger recovery job
          await this.executeRecovery(file.fileId, file.checksum, sourceNode, targetNode);
        }
      }
    } finally {
      this.isScanning = false;
    }
  }

  async executeRecovery(
    fileId: string,
    expectedChecksum: string,
    sourceNode: NodeRecord,
    targetNode: NodeRecord,
  ): Promise<boolean> {
    if (this.inProgressLocks.has(fileId)) return false;
    this.inProgressLocks.add(fileId);

    const eventId = uuidv4();
    const event: RecoveryEvent = {
      eventId,
      fileId,
      sourceNodeId: sourceNode.nodeId,
      targetNodeId: targetNode.nodeId,
      status: RecoveryStatus.IN_PROGRESS,
      startedAt: new Date(),
      attemptNumber: 1,
    };
    this.store.appendEvent(event);

    this.logger.info(
      { fileId, source: sourceNode.nodeId, target: targetNode.nodeId },
      'Initiating target-pull recovery',
    );

    try {
      const pullUrl = `http://${targetNode.host}:${targetNode.port}/recovery/pull/${fileId}`;
      const res = await fetch(pullUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceNodeId: sourceNode.nodeId,
          sourceHost: sourceNode.host,
          sourcePort: sourceNode.port,
          expectedChecksum,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Target node returned HTTP ${res.status}: ${errText}`);
      }

      const body = (await res.json()) as { verified: boolean; checksum: string };
      if (!body.verified || body.checksum !== expectedChecksum) {
        throw new Error('Target node verification failed or returned mismatching checksum');
      }

      // Successful recovery!
      this.store.addReplica(fileId, {
        nodeId: targetNode.nodeId,
        storedAt: new Date(),
      });

      this.store.updateEvent(eventId, {
        status: RecoveryStatus.SUCCESS,
        completedAt: new Date(),
      });

      this.logger.info(
        { fileId, target: targetNode.nodeId },
        'Target-pull recovery successfully completed',
      );
      return true;
    } catch (err) {
      const msg = (err as Error).message;
      this.store.updateEvent(eventId, {
        status: RecoveryStatus.FAILED,
        completedAt: new Date(),
        errorMessage: msg,
      });

      this.logger.error(
        { fileId, err: msg },
        'Recovery attempt failed',
      );
      return false;
    } finally {
      this.inProgressLocks.delete(fileId);
    }
  }
}
