import { Logger } from 'pino';
import { NodeConfig } from '../config';
import { getStorageStats } from './file.service';

/**
 * Manages periodic heartbeats sent from the storage node to the Coordinator.
 */
export class NodeHeartbeatClient {
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(
    private readonly config: NodeConfig,
    private readonly logger: Logger,
    private readonly simulationState: { isSimulatingFailure: boolean },
  ) {}

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.timer = setInterval(() => {
      this.sendHeartbeat().catch((err) => {
        this.logger.debug({ err: (err as Error).message }, 'Failed to deliver heartbeat to coordinator');
      });
    }, 5000); // Default heartbeat interval
  }

  stop(): void {
    this.isRunning = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async sendHeartbeat(): Promise<boolean> {
    if (this.simulationState.isSimulatingFailure) {
      this.logger.debug('Skipping heartbeat because node is simulating failure');
      return false;
    }

    try {
      const stats = await getStorageStats(this.config.storageDir);
      const url = `${this.config.coordinatorUrl}/nodes/${this.config.nodeId}/heartbeat`;

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          diskUsedBytes: stats.diskUsedBytes,
          fileCount: stats.fileCount,
        }),
      });

      if (!res.ok) {
        this.logger.warn({ status: res.status }, 'Coordinator returned non-200 for heartbeat');
        return false;
      }
      return true;
    } catch (err) {
      this.logger.debug({ err: (err as Error).message }, 'Error sending heartbeat to coordinator');
      return false;
    }
  }
}
