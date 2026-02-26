/**
 * Temp Directory Helpers Module
 * 
 * Utilities for managing temporary directories during package conversion.
 */

import { join, dirname } from 'path';
import { mkdtemp, rm, readdir } from 'fs/promises';
import { tmpdir } from 'os';
import { createHash } from 'crypto';
import { ensureDir, writeTextFile } from '../../../../utils/fs.js';
import { logger } from '../../../../utils/logger.js';
import type { PackageConversionContext } from '../../../../types/conversion-context.js';
import { contextToJSON } from '../../../conversion-context/index.js';

/**
 * Scope descriptor for conversion cache directory isolation.
 * 
 * - 'full': All files in the package are being converted. Cache goes into `_full/`.
 * - { type: 'subset', pattern: string }: A filtered subset of files. Cache goes into
 *   `_subset.<hash>/` where hash is derived from the matched pattern.
 * 
 * This ensures that full installs and subset installs never share the same cache
 * directory, preventing stale-file contamination across different install scopes.
 */
export type ConversionCacheScope =
  | { type: 'full' }
  | { type: 'subset'; pattern: string };

/**
 * Compute a short hash of a pattern string for use as a directory name.
 * Uses first 8 hex characters of SHA-256.
 */
function shortPatternHash(pattern: string): string {
  return createHash('sha256').update(pattern).digest('hex').slice(0, 8);
}

/**
 * Create a temporary directory for package conversion
 * 
 * @param prefix - Prefix for temp directory name
 * @returns Absolute path to created temp directory
 */
export async function createTempPackageDirectory(prefix: string = 'opkg-converted-'): Promise<string> {
  const tempDir = await mkdtemp(join(tmpdir(), prefix));
  return tempDir;
}

/**
 * Create a scope-isolated conversion cache directory within a git cache location.
 * 
 * The directory layout under `.opkg-converted/` is partitioned by install scope:
 * 
 * ```
 * .opkg-converted/
 *   _full/                        # Conversion cache for full installs
 *   _subset.<hash>/               # Conversion cache for a specific subset pattern
 * ```
 * 
 * This ensures that:
 * - A full install never reads stale files from a prior subset install
 * - A subset install never reads files from a prior full install
 * - Different subset patterns get their own isolated caches
 * 
 * @param gitCachePath - Path to git cache directory (e.g., ~/.openpackage/cache/git/<hash>/<sha>)
 * @param scope - The scope descriptor that determines the cache subdirectory
 * @returns Absolute path to the scope-specific conversion cache directory
 */
export async function createConversionCacheDirectory(
  gitCachePath: string,
  scope: ConversionCacheScope = { type: 'full' }
): Promise<string> {
  const scopeDir = scope.type === 'full'
    ? '_full'
    : `_subset.${shortPatternHash(scope.pattern)}`;
  const conversionDir = join(gitCachePath, '.opkg-converted', scopeDir);
  await ensureDir(conversionDir);
  return conversionDir;
}

/**
 * Clean up stale scope directories under `.opkg-converted/`.
 * 
 * When performing a full install, prior subset caches are stale and should be removed
 * to reclaim disk space. The full cache supersedes all subset caches since it contains
 * the converted output for every file.
 * 
 * @param gitCachePath - Path to git cache directory
 * @param keepScope - The scope being installed; directories matching this scope are preserved
 */
export async function cleanupStaleScopeDirs(
  gitCachePath: string,
  keepScope: ConversionCacheScope
): Promise<void> {
  const convertedRoot = join(gitCachePath, '.opkg-converted');
  let entries: string[];
  try {
    entries = await readdir(convertedRoot);
  } catch {
    // Directory doesn't exist yet -- nothing to clean
    return;
  }

  const keepDir = keepScope.type === 'full'
    ? '_full'
    : `_subset.${shortPatternHash(keepScope.pattern)}`;

  for (const entry of entries) {
    if (entry === keepDir) continue;
    // Only clean scope directories (prefixed with _ to avoid cleaning unknown files)
    if (entry.startsWith('_full') || entry.startsWith('_subset.')) {
      const dirPath = join(convertedRoot, entry);
      try {
        await rm(dirPath, { recursive: true, force: true });
        logger.debug(`Cleaned stale conversion cache scope: ${entry}`);
      } catch (error) {
        logger.warn('Failed to clean stale conversion cache scope', { entry, error });
      }
    }
  }
}

/**
 * Write package files to temporary directory
 * 
 * @param files - Array of files to write
 * @param tempDir - Temporary directory path
 */
export async function writeTempPackageFiles(
  files: Array<{ path: string; content: string }>,
  tempDir: string
): Promise<void> {
  for (const file of files) {
    const filePath = join(tempDir, file.path);
    await ensureDir(dirname(filePath));
    await writeTextFile(filePath, file.content);
  }
}

/**
 * Write conversion context to temporary directory
 * 
 * @param context - Conversion context to write
 * @param tempDir - Temporary directory path
 */
export async function writeConversionContext(
  context: PackageConversionContext,
  tempDir: string
): Promise<void> {
  const contextPath = join(tempDir, '.opkg-conversion-context.json');
  const contextJson = contextToJSON(context);
  await writeTextFile(contextPath, contextJson);
}

/**
 * Cleanup temporary directory with error handling
 * 
 * @param tempDir - Directory to cleanup
 */
export async function cleanupTempDirectory(tempDir: string | null): Promise<void> {
  if (!tempDir) {
    return;
  }
  
  try {
    await rm(tempDir, { recursive: true, force: true });
  } catch (error) {
    logger.warn('Failed to cleanup temp directory', {
      tempDir,
      error
    });
  }
}
