import { FileRecord, ReplicaRecord } from '../types/file.types';
import { NodeRecord, NodeState } from '../types/node.types';
import { RecoveryEvent } from '../types/recovery.types';

/**
 * MetadataStore defines the contract for all persistence operations
 * needed by the Coordinator.
 *
 * Phase 1: implemented by InMemoryMetadataStore (Maps + arrays).
 * Phase 2: implemented by PostgresMetadataStore (node-postgres queries).
 *
 * The service layer only ever depends on this interface, so swapping the
 * backing store is a single-line change in the bootstrap code.
 */
export interface MetadataStore {
  // ── Nodes ──────────────────────────────────────────────────────────────────

  /** Persist a newly registered node record. */
  registerNode(node: NodeRecord): void;

  /** Retrieve a node by its ID, or undefined if not registered. */
  getNode(nodeId: string): NodeRecord | undefined;

  /** Return all registered nodes. */
  listNodes(): NodeRecord[];

  /** Transition a node to a new health state. */
  updateNodeState(nodeId: string, state: NodeState): void;

  /**
   * Update the lastSeen timestamp for a node (called on heartbeat receipt).
   * Optionally update optional stats reported in the heartbeat payload.
   */
  updateHeartbeat(
    nodeId: string,
    lastSeen: Date,
    diskUsedBytes?: number,
    fileCount?: number,
  ): void;

  // ── Files ──────────────────────────────────────────────────────────────────

  /** Persist a newly uploaded file's metadata. */
  saveFile(file: FileRecord): void;

  /** Retrieve a file record by ID, or undefined if not found. */
  getFile(fileId: string): FileRecord | undefined;

  /** Return all file records. */
  listFiles(): FileRecord[];

  /**
   * Add a replica entry to an existing file record.
   * No-op if the nodeId is already listed as a replica.
   */
  addReplica(fileId: string, replica: ReplicaRecord): void;

  /**
   * Remove a replica entry from a file record (e.g. after node confirmed dead).
   * No-op if the nodeId is not in the replica list.
   */
  removeReplica(fileId: string, nodeId: string): void;

  // ── Recovery Events ────────────────────────────────────────────────────────

  /** Append a new recovery event to the event log. */
  appendEvent(event: RecoveryEvent): void;

  /**
   * Update an existing recovery event in-place (e.g. to set status → SUCCESS).
   * Identified by eventId.
   */
  updateEvent(eventId: string, patch: Partial<RecoveryEvent>): void;

  /**
   * Return recovery events, newest first.
   * Optionally filtered by fileId and/or status.
   */
  listEvents(opts?: {
    limit?: number;
    fileId?: string;
    status?: string;
  }): RecoveryEvent[];
}
