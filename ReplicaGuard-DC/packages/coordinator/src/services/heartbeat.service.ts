import { Logger } from 'pino';
import { MetadataStore, NodeRecord, NodeState } from '@replicaguard/shared';
import { CoordinatorConfig } from '../config';

/**
 * Periodically inspects registered nodes and updates health states:
 * - If lastSeen elapsed > failureTimeoutMs => DEAD
 * - Else if lastSeen elapsed > heartbeatIntervalMs => SUSPECT
 * - Else => HEALTHY
 */
export class HeartbeatMonitor {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly store: MetadataStore,
    private readonly config: CoordinatorConfig,
    private readonly logger: Logger,
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.checkHeartbeats();
    }, this.config.heartbeatCheckIntervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  checkHeartbeats(now: Date = new Date()): void {
    const nodes = this.store.listNodes();
    for (const node of nodes) {
      const elapsedMs = now.getTime() - node.lastSeen.getTime();
      let newState = node.state;

      if (elapsedMs > this.config.failureTimeoutMs) {
        newState = NodeState.DEAD;
      } else if (elapsedMs > this.config.heartbeatIntervalMs) {
        newState = NodeState.SUSPECT;
      } else {
        newState = NodeState.HEALTHY;
      }

      if (newState !== node.state) {
        this.logger.warn(
          { nodeId: node.nodeId, oldState: node.state, newState, elapsedMs },
          `Node state transition: ${node.state} -> ${newState}`,
        );
        this.store.updateNodeState(node.nodeId, newState);
      }
    }
  }
}
