/**
 * @replicaguard/shared — Public API
 *
 * All types, interfaces, utilities, and errors used by both the Coordinator
 * and Storage Node packages are re-exported from this barrel file.
 */

// ── Types ──────────────────────────────────────────────────────────────────
export * from './types/node.types';
export * from './types/file.types';
export * from './types/recovery.types';
export * from './types/api.types';

// ── Interfaces ─────────────────────────────────────────────────────────────
export * from './interfaces/metadata-store.interface';

// ── Utilities ──────────────────────────────────────────────────────────────
export * from './utils/checksum';
export * from './utils/logger';

// ── Errors ─────────────────────────────────────────────────────────────────
export * from './errors/http-error';
