import { createHash } from 'crypto';

/**
 * Compute the SHA-256 checksum of a Buffer.
 *
 * @param data - The raw bytes to hash.
 * @returns A checksum string in the format `"sha256:<hex>"`.
 *
 * @example
 * const checksum = computeChecksum(Buffer.from('hello'));
 * // → "sha256:2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
 */
export function computeChecksum(data: Buffer): string {
  const hex = createHash('sha256').update(data).digest('hex');
  return `sha256:${hex}`;
}

/**
 * Verify that a Buffer's SHA-256 checksum matches an expected value.
 *
 * @param data     - The raw bytes to verify.
 * @param expected - Expected checksum string, e.g. `"sha256:<hex>"`.
 * @returns `true` if the computed checksum equals the expected value.
 */
export function verifyChecksum(data: Buffer, expected: string): boolean {
  return computeChecksum(data) === expected;
}

/**
 * Validate that a checksum string has the correct `"sha256:<64 hex chars>"` format.
 *
 * @param checksum - The string to validate.
 * @returns `true` if the format is valid.
 */
export function isValidChecksumFormat(checksum: string): boolean {
  return /^sha256:[0-9a-f]{64}$/.test(checksum);
}
