import path from 'path';

/**
 * All configuration for a storage node is read from environment variables.
 * Defaults are safe for local development.
 */
export interface NodeConfig {
  /** Unique identifier for this node, e.g. "node-1". */
  nodeId: string;
  /** TCP port this node's HTTP server listens on. */
  port: number;
  /** Absolute path to the directory where file replicas are stored. */
  storageDir: string;
  /** URL of the coordinator service (used in later milestones). */
  coordinatorUrl: string;
  /** Maximum accepted body size in bytes for file upload (default 50 MB). */
  maxFileSizeBytes: number;
  /** Pino log level. */
  logLevel: string;
}

/**
 * Load and validate config from environment variables.
 * Throws a descriptive error if any required variable is missing.
 */
export function loadConfig(): NodeConfig {
  const nodeId = process.env['NODE_ID'];
  if (!nodeId) throw new Error('NODE_ID environment variable is required.');

  const portStr = process.env['PORT'] ?? '4101';
  const port = parseInt(portStr, 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT value: "${portStr}".`);
  }

  // npm workspace scripts run with the package directory as process.cwd().
  // Resolve relative STORAGE_DIR values from the repository root instead, so
  // `storage/server1` is consistently written to <repo>/storage/server1.
  // __dirname is packages/storage-node/src during ts-node dev and
  // packages/storage-node/dist after compilation; three parent levels reach repo root.
  const repoRoot = path.resolve(__dirname, '../../..');
  const defaultServerFolder: Record<string, string> = {
    'node-1': 'server1',
    'node-2': 'server2',
    'node-3': 'server3',
    'node-4': 'server4',
  };
  const storageDirRaw =
    process.env['STORAGE_DIR'] ??
    `storage/${defaultServerFolder[nodeId] ?? nodeId}`;
  const storageDir = path.isAbsolute(storageDirRaw)
    ? path.resolve(storageDirRaw)
    : path.resolve(repoRoot, storageDirRaw);

  const coordinatorUrl =
    process.env['COORDINATOR_URL'] ?? 'http://localhost:4100';

  const maxFileSizeBytes = parseInt(
    process.env['MAX_FILE_SIZE_BYTES'] ?? '52428800',
    10,
  );

  const logLevel = (process.env['LOG_LEVEL'] ?? 'info').toLowerCase();

  return { nodeId, port, storageDir, coordinatorUrl, maxFileSizeBytes, logLevel };
}
