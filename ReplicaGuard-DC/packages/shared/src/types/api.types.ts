/**
 * Request / Response DTOs used by both the Coordinator and Storage Node APIs.
 * These are plain TypeScript interfaces — no framework decorators needed.
 */

// ─── Node Registration ───────────────────────────────────────────────────────

export interface RegisterNodeRequest {
  nodeId: string;
  host: string;
  port: number;
  storageDir: string;
}

export interface RegisterNodeResponse {
  nodeId: string;
  state: string;
  registeredAt: string;
}

// ─── Heartbeat ───────────────────────────────────────────────────────────────

export interface HeartbeatRequest {
  /** Optional disk usage stat reported by the node. */
  diskUsedBytes?: number;
  /** Optional file count reported by the node. */
  fileCount?: number;
}

export interface HeartbeatResponse {
  acknowledged: boolean;
  serverTime: string;
}

// ─── Node Listing ────────────────────────────────────────────────────────────

export interface NodeSummary {
  nodeId: string;
  host: string;
  port: number;
  state: string;
  lastSeen: string;
  registeredAt: string;
  diskUsedBytes?: number;
  fileCount?: number;
}

export interface ListNodesResponse {
  nodes: NodeSummary[];
}

// ─── File Upload ─────────────────────────────────────────────────────────────

export interface ReplicaSummary {
  nodeId: string;
  storedAt: string;
}

export interface UploadFileResponse {
  fileId: string;
  originalName: string;
  sizeBytes: number;
  checksum: string;
  replicas: ReplicaSummary[];
}

// ─── Storage Node — Store Replica ────────────────────────────────────────────

export interface StoreReplicaResponse {
  fileId: string;
  checksum: string;
  storedAt: string;
}

// ─── Storage Node — Health ───────────────────────────────────────────────────

export interface NodeHealthResponse {
  status: 'ok' | 'simulating_failure';
  nodeId: string;
  port: number;
  storageDir: string;
  diskUsedBytes: number;
  fileCount: number;
  timestamp: string;
}

// ─── Recovery Events ─────────────────────────────────────────────────────────

export interface RecoveryEventSummary {
  eventId: string;
  fileId: string;
  sourceNodeId: string;
  targetNodeId: string;
  status: string;
  startedAt: string;
  completedAt?: string;
  errorMessage?: string;
  attemptNumber: number;
}

export interface ListRecoveryEventsResponse {
  events: RecoveryEventSummary[];
  total: number;
}

// ─── System Status ───────────────────────────────────────────────────────────

export interface SystemStatusResponse {
  coordinator: {
    uptimeSeconds: number;
    timestamp: string;
  };
  nodes: {
    total: number;
    healthy: number;
    suspect: number;
    dead: number;
  };
  files: {
    total: number;
    fullyReplicated: number;
    underReplicated: number;
  };
  recovery: {
    inProgress: number;
    recentEvents: RecoveryEventSummary[];
  };
}

// ─── Generic Error Response ──────────────────────────────────────────────────

export interface ErrorResponse {
  error: string;
  message: string;
  statusCode: number;
}
