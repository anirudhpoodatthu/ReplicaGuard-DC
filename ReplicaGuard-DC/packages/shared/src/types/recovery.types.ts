/**
 * Lifecycle states of a single recovery operation.
 */
export enum RecoveryStatus {
  IN_PROGRESS = 'IN_PROGRESS',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
}

/**
 * An immutable log entry recorded each time the recovery engine
 * attempts to re-replicate a file from one node to another.
 */
export interface RecoveryEvent {
  /** UUID v4 identifier for this event. */
  eventId: string;
  /** ID of the under-replicated file being recovered. */
  fileId: string;
  /** Node that is acting as the source of the file data. */
  sourceNodeId: string;
  /** Node that is the target for the new replica. */
  targetNodeId: string;
  /** Current status of this recovery attempt. */
  status: RecoveryStatus;
  /** When the recovery attempt started. */
  startedAt: Date;
  /** When the recovery attempt finished (undefined while IN_PROGRESS). */
  completedAt?: Date;
  /** Human-readable error message if status is FAILED. */
  errorMessage?: string;
  /** Which attempt number this is (1-based; max determined by config). */
  attemptNumber: number;
}
