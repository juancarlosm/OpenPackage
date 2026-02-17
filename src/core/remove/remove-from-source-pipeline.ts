import { resolve as resolvePath, join, basename } from 'path';

import type { CommandResult } from '../../types/index.js';
import type { ExecutionContext } from '../../types/execution-context.js';
import { FILE_PATTERNS } from '../../constants/index.js';
import { resolveMutableSource } from '../source-resolution/resolve-mutable-source.js';
import { assertMutableSourceOrThrow } from '../../utils/source-mutability.js';
import { collectRemovalEntries, type RemovalEntry } from './removal-collector.js';
import { confirmRemoval } from './removal-confirmation.js';
import { exists, remove } from '../../utils/fs.js';
import { logger } from '../../utils/logger.js';
import { UserCancellationError } from '../../utils/errors.js';
import { ensureLocalOpenPackageStructure, createWorkspacePackageYml } from '../../utils/package-management.js';
import { getLocalOpenPackageDir } from '../../utils/paths.js';
import { parsePackageYml } from '../../utils/package-yml.js';
import { cleanupEmptyParents } from '../../utils/cleanup-empty-parents.js';

export interface RemoveFromSourceOptions {
  force?: boolean;
  dryRun?: boolean;
  execContext?: ExecutionContext;
}

export interface RemoveFromSourceResult {
  packageName: string;
  filesRemoved: number;
  sourcePath: string;
  sourceType: 'workspace' | 'global';
  removedPaths: string[];
}

export async function runRemoveFromSourcePipeline(
  packageName: string | undefined,
  pathArg: string | undefined,
  options: RemoveFromSourceOptions = {}
): Promise<CommandResult<RemoveFromSourceResult>> {
  const cwd = process.cwd();

  // Resolve arguments: packageName from --from option, pathArg is required
  let resolvedPackageName: string | null;
  let resolvedPath: string;
  try {
    const resolved = await resolveRemoveArguments(cwd, packageName, pathArg);
    resolvedPackageName = resolved.resolvedPackageName;
    resolvedPath = resolved.resolvedPath;
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }

  // Build removal context (workspace root or mutable package source)
  let packageRootDir: string;
  let resolvedName: string;
  let sourceType: 'workspace' | 'global';
  
  if (resolvedPackageName === null) {
    // No package name: remove from workspace root (.openpackage/)
    const context = await buildWorkspaceRootRemovalContext(cwd);
    packageRootDir = context.packageRootDir;
    resolvedName = context.packageName;
    sourceType = 'workspace';
    
    logger.info('Removing files from workspace package', {
      sourcePath: packageRootDir,
      inputPath: resolvedPath
    });
  } else {
    // Package name provided: resolve mutable source
    let source;
    try {
      source = await resolveMutableSource({ cwd, packageName: resolvedPackageName });
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
    
    // Additional safety check
    assertMutableSourceOrThrow(source.absolutePath, { packageName: source.packageName, command: 'remove' });

    packageRootDir = source.absolutePath;
    resolvedName = source.packageName;
    sourceType = source.absolutePath.includes(`${cwd}/.openpackage/packages/`) 
      ? 'workspace' as const
      : 'global' as const;
    
    logger.info('Removing files from package source', {
      packageName: source.packageName,
      sourcePath: source.absolutePath,
      sourceType: source.sourceType,
      inputPath: resolvedPath
    });
  }

  // [DISABLED] Resource name resolution - only file/directory paths accepted
  // To re-enable: restore the buildSourceResources block that resolved names like "my-agent"
  // to actual file paths within the package when the direct path didn't exist

  // Collect files to remove
  let entries: RemovalEntry[];
  try {
    entries = await collectRemovalEntries(packageRootDir, resolvedPath);
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : String(error) 
    };
  }

  if (entries.length === 0) {
    return {
      success: false,
      error: `No files found to remove at path: ${resolvedPath}`
    };
  }

  // Confirm removal with user (unless --force or --dry-run)
  try {
    await confirmRemoval(resolvedName, entries, options);
  } catch (error) {
    if (error instanceof UserCancellationError) {
      throw error;
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Removal cancelled by user.'
    };
  }

  // Handle dry-run
  if (options.dryRun) {
    logger.info('Dry-run mode: no files will be removed', {
      packageName: resolvedName,
      filesCount: entries.length
    });

    return {
      success: true,
      data: {
        packageName: resolvedName,
        filesRemoved: entries.length,
        sourcePath: packageRootDir,
        sourceType,
        removedPaths: entries.map(e => e.registryPath)
      }
    };
  }

  // Remove files
  const removedPaths: string[] = [];
  const removedAbsolutePaths: string[] = [];

  for (const entry of entries) {
    if (await exists(entry.packagePath)) {
      await remove(entry.packagePath);
      removedPaths.push(entry.registryPath);
      removedAbsolutePaths.push(entry.packagePath);
      logger.debug('Removed file', { path: entry.packagePath });
    }
  }

  // Clean up empty directories
  await cleanupEmptyParents(packageRootDir, removedAbsolutePaths);

  logger.info('Files removed from package source', {
    packageName: resolvedName,
    filesRemoved: removedPaths.length
  });

  return {
    success: true,
    data: {
      packageName: resolvedName,
      filesRemoved: removedPaths.length,
      sourcePath: packageRootDir,
      sourceType,
      removedPaths
    }
  };
}

/**
 * Resolve remove command arguments to determine package name and removal path.
 * packageName comes from --from option (undefined if not provided → workspace root).
 * pathArg is the required <path> argument.
 */
async function resolveRemoveArguments(
  cwd: string,
  packageName: string | undefined,
  pathArg: string | undefined
): Promise<{ resolvedPackageName: string | null; resolvedPath: string }> {
  // Two arguments provided: explicit package name + path
  if (packageName && pathArg) {
    return { resolvedPackageName: packageName, resolvedPath: pathArg };
  }

  // One argument provided
  const singleArg = packageName || pathArg;
  if (!singleArg) {
    throw new Error('Path argument is required for remove.');
  }

  // Check if single arg could be a path (relative or absolute)
  // We check both filesystem path AND workspace root path
  const absPath = resolvePath(cwd, singleArg);
  const openpackageDir = getLocalOpenPackageDir(cwd);
  const workspaceRootPath = join(openpackageDir, singleArg);
  
  if (await exists(absPath) || await exists(workspaceRootPath)) {
    // It's a valid path → remove from workspace root
    return { resolvedPackageName: null, resolvedPath: singleArg };
  }

  // Not a valid path → treat as package name (error will be thrown later)
  throw new Error(
    `Path '${singleArg}' not found.\n\n` +
    `If you meant to specify a package name, use: opkg remove <path> --from ${singleArg}`
  );
}

/**
 * Build context for workspace root package at .openpackage/
 * Ensures the workspace manifest exists.
 */
async function buildWorkspaceRootRemovalContext(
  cwd: string
): Promise<{ packageName: string; packageRootDir: string }> {
  // Ensure .openpackage/ structure exists
  await ensureLocalOpenPackageStructure(cwd);

  // Create workspace manifest if it doesn't exist
  await createWorkspacePackageYml(cwd);

  const openpackageDir = getLocalOpenPackageDir(cwd);
  const packageYmlPath = join(openpackageDir, FILE_PATTERNS.OPENPACKAGE_YML);

  // Load workspace manifest
  let config;
  try {
    config = await parsePackageYml(packageYmlPath);
  } catch (error) {
    throw new Error(`Failed to read workspace manifest at ${packageYmlPath}: ${error}`);
  }

  // Use workspace directory name as package name if not specified in manifest
  const packageName = config.name || basename(cwd);

  return {
    packageName,
    packageRootDir: openpackageDir
  };
}
