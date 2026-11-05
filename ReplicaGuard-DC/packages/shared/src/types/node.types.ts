/**
 * NodeState represents the health lifecycle of a storage node as seen
 * by the Coordinator's heartbeat monitor.
 *
 * Transitions:
 *   HEALTHY → SUSPECT  : node missed one heartbeat window
 *   SUSPECT → HEALTHY  : heartbeat received before failure timeout
 *   SUSPECT → DEAD     : failure timeout exceeded with no heartbeat
 *   DEAD    → HEALTHY  : node sent a heartbeat after being marked dead (recovered)
 */
export enum NodeState {
  HEALTHY = 'HEALTHY',
  SUSPECT = 'SUSPECT',
  DEAD = 'DEAD',
}

/**
 * Full metadata record for a registered storage node, maintained
 * in-memory (and later in PostgreSQL) by the Coordinator.
 */
export interface NodeRecord {
  /** Unique node identifier, e.g. "node-1". */
  nodeId: string;
  /** Hostname or IP the node is reachable at, e.g. "localhost". */
  host: string;
  /** TCP port the node's HTTP server listens on, e.g. 4101. */
  port: number;
  /** Local directory path used by the node to store file replicas. */
  storageDir: string;
  /** Current health state as determined by heartbeat monitoring. */
  state: NodeState;
  /** When the node first registered with the Coordinator. */
  registeredAt: Date;
  /**
   * Timestamp of the most recent heartbeat received.
   * Set to `registeredAt` on initial registration.
   */
  lastSeen: Date;
  /** Last reported disk usage in bytes (optional, from heartbeat payload). */
  diskUsedBytes?: number;
  /** Last reported number of files stored on the node (optional). */
  fileCount?: number;
}
