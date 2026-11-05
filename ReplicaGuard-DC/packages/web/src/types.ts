export interface CoordinatorStatus {
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
    recentEvents: RecoveryEventItem[];
  };
}

export interface NodeItem {
  nodeId: string;
  host: string;
  port: number;
  state: 'HEALTHY' | 'SUSPECT' | 'DEAD';
  lastSeen: string;
  registeredAt: string;
  storageDir?: string;
  diskUsedBytes?: number;
  fileCount?: number;
}

export interface ReplicaLocation {
  nodeId: string;
  storedAt: string;
}

export interface FileItem {
  fileId: string;
  originalName: string;
  sizeBytes: number;
  checksum: string;
  uploadedAt: string;
  replicaCount: number;
  replicas: ReplicaLocation[];
}

export interface RecoveryEventItem {
  eventId: string;
  fileId: string;
  sourceNodeId: string;
  targetNodeId: string;
  status: 'IN_PROGRESS' | 'SUCCESS' | 'FAILED';
  startedAt: string;
  completedAt?: string;
  errorMessage?: string;
  attemptNumber: number;
}
