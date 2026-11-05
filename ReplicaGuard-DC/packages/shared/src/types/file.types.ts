/**
 * A single replica entry within a FileRecord, recording which storage
 * node holds a copy of the file and when it was stored.
 */
export interface ReplicaRecord {
  /** ID of the storage node holding this replica. */
  nodeId: string;
  /** When this replica was successfully written to the node. */
  storedAt: Date;
}

/**
 * Full metadata record for an uploaded file, maintained by the Coordinator.
 * The file's binary content lives on the storage nodes; only metadata lives here.
 */
export interface FileRecord {
  /** UUID v4 identifier generated at upload time. */
  fileId: string;
  /** Account that owns this file. */
  ownerId?: string;
  /** Original filename provided by the uploading client. */
  originalName: string;
  /** Size of the file in bytes. */
  sizeBytes: number;
  /**
   * SHA-256 checksum of the file content, prefixed with "sha256:".
   * Example: "sha256:e3b0c44298fc1c149afb..."
   */
  checksum: string;
  /** When the file was first uploaded to the Coordinator. */
  uploadedAt: Date;
  /**
   * List of all nodes that currently hold a valid replica.
   * Updated whenever a replica is added or removed (e.g. after recovery).
   */
  replicas: ReplicaRecord[];
}
