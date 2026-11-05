export interface CoordinatorConfig {
  port: number;
  heartbeatIntervalMs: number;
  heartbeatCheckIntervalMs: number;
  failureTimeoutMs: number;
  recoveryScanIntervalMs: number;
  replicationFactor: number;
  maxFileSizeBytes: number;
  logLevel: string;
}

export function loadCoordinatorConfig(): CoordinatorConfig {
  const port = parseInt(process.env['COORDINATOR_PORT'] ?? '4100', 10);
  const heartbeatIntervalMs = parseInt(process.env['HEARTBEAT_INTERVAL_MS'] ?? '5000', 10);
  const heartbeatCheckIntervalMs = parseInt(process.env['HEARTBEAT_CHECK_INTERVAL_MS'] ?? '5000', 10);
  const failureTimeoutMs = parseInt(process.env['FAILURE_TIMEOUT_MS'] ?? '15000', 10);
  const recoveryScanIntervalMs = parseInt(process.env['RECOVERY_SCAN_INTERVAL_MS'] ?? '10000', 10);
  const replicationFactor = parseInt(process.env['REPLICATION_FACTOR'] ?? '3', 10);
  const maxFileSizeBytes = parseInt(process.env['MAX_FILE_SIZE_BYTES'] ?? '52428800', 10);
  const logLevel = (process.env['LOG_LEVEL'] ?? 'info').toLowerCase();

  return {
    port,
    heartbeatIntervalMs,
    heartbeatCheckIntervalMs,
    failureTimeoutMs,
    recoveryScanIntervalMs,
    replicationFactor,
    maxFileSizeBytes,
    logLevel,
  };
}
