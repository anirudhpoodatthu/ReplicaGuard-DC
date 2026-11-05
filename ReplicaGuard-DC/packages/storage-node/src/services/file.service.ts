import fs from 'fs/promises';
import path from 'path';
import { computeChecksum, HttpError } from '@replicaguard/shared';

/** UUID v4 regex — the only valid format for a fileId. */
const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validate that `fileId` is a UUID v4 and build the absolute path for the
 * replica file inside `storageDir`.
 *
 * Throws HttpError 400 if the ID format is invalid.
 * The UUID constraint makes path-traversal impossible: UUIDs contain only
 * hex digits and hyphens — no slashes, dots, or backslashes.
 */
export function resolveFilePath(storageDir: string, fileId: string): string {
  if (!UUID_V4_RE.test(fileId)) {
    throw new HttpError(
      400,
      'INVALID_FILE_ID',
      `fileId must be a valid UUID v4, received: "${fileId}".`,
    );
  }
  return path.join(storageDir, fileId);
}

/**
 * Write `data` to disk safely at `<storageDir>/<fileId>`.
 *
 * Uses an atomic write strategy: writes to a unique temporary file first,
 * flushes, and renames to the final destination to prevent partial writes.
 * Cleans up temporary file on failure.
 *
 * Returns the SHA-256 checksum of the written bytes.
 */
export async function writeReplica(
  storageDir: string,
  fileId: string,
  data: Buffer,
): Promise<string> {
  await fs.mkdir(storageDir, { recursive: true });
  const filePath = resolveFilePath(storageDir, fileId);
  const tempPath = path.join(storageDir, `.${fileId}.${Date.now()}.${Math.random().toString(36).substring(2, 8)}.tmp`);

  try {
    await fs.writeFile(tempPath, data);
    await fs.rename(tempPath, filePath);
    return computeChecksum(data);
  } catch (err) {
    try {
      await fs.unlink(tempPath);
    } catch {
      // Ignore cleanup error if temp file was never created
    }
    throw err;
  }
}

/**
 * Delete a replica from disk if it exists.
 * Throws HttpError 404 if the file does not exist.
 */
export async function deleteReplica(
  storageDir: string,
  fileId: string,
): Promise<void> {
  const filePath = resolveFilePath(storageDir, fileId);
  try {
    await fs.unlink(filePath);
  } catch (err: unknown) {
    const nodeErr = err as NodeJS.ErrnoException;
    if (nodeErr.code === 'ENOENT') {
      throw new HttpError(
        404,
        'FILE_NOT_FOUND',
        `File "${fileId}" not found on this node.`,
      );
    }
    throw err;
  }
}

/**
 * Read a replica from disk and return its raw bytes.
 *
 * Throws HttpError 404 if the file does not exist.
 */
export async function readReplica(
  storageDir: string,
  fileId: string,
): Promise<Buffer> {
  const filePath = resolveFilePath(storageDir, fileId);
  try {
    return await fs.readFile(filePath);
  } catch (err: unknown) {
    const nodeErr = err as NodeJS.ErrnoException;
    if (nodeErr.code === 'ENOENT') {
      throw new HttpError(
        404,
        'FILE_NOT_FOUND',
        `File "${fileId}" not found on this node.`,
      );
    }
    throw err;
  }
}

/**
 * Return disk-usage statistics for the given storage directory.
 * Counts only direct children (one replica = one file, no subdirectories).
 */
export async function getStorageStats(
  storageDir: string,
): Promise<{ fileCount: number; diskUsedBytes: number }> {
  try {
    const entries = await fs.readdir(storageDir, { withFileTypes: true });
    let diskUsedBytes = 0;
    let fileCount = 0;
    for (const entry of entries) {
      if (entry.isFile()) {
        const stat = await fs.stat(path.join(storageDir, entry.name));
        diskUsedBytes += stat.size;
        fileCount++;
      }
    }
    return { fileCount, diskUsedBytes };
  } catch {
    // Directory does not exist yet — no files stored.
    return { fileCount: 0, diskUsedBytes: 0 };
  }
}
