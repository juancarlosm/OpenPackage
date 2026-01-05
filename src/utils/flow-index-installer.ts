/**
 * Flow-Based Index Installer
 * 
 * Replaces legacy subdirs-based installation with flow-based installation.
 * Integrates the flow executor with workspace index management.
 */

import { dirname, join, sep } from 'path';
import { 
  installPackageWithFlows, 
  type FlowInstallResult,
  type FlowInstallContext,
  getFlowStatistics 
} from '../core/install/flow-based-installer.js';
import { resolvePackageContentRoot } from '../core/install/local-source-resolution.js';
import { getRegistryDirectories } from '../core/directory.js';
import { logger } from './logger.js';
import { formatPathForWorkspaceIndex } from './path-resolution.js';
import { sortMapping } from './package-index-yml.js';
import {
  getWorkspaceIndexPath,
  readWorkspaceIndex,
  writeWorkspaceIndex
} from './workspace-index-yml.js';
import type { Platform } from '../core/platforms.js';
import type { InstallOptions } from '../types/index.js';

// ============================================================================
// Types
// ============================================================================

export interface IndexInstallResult {
  installed: number;
  updated: number;
  deleted: number;
  skipped: number;
  files: string[];
  installedFiles: string[];
  updatedFiles: string[];
  deletedFiles: string[];
}

interface PackageIndexRecord {
  path: string;
  packageName: string;
  workspace: {
    version: string;
    hash?: string;
  };
  files: Record<string, (string | WorkspaceIndexFileMapping)[]>;
}

interface WorkspaceIndexFileMapping {
  target: string;
  merge?: string;
  keys?: string[];
}

// ============================================================================
// Main Installation Function
// ============================================================================

/**
 * Install a package using flow-based installation
 * This is the new entry point that replaces installPackageByIndex
 */
export async function installPackageByIndexWithFlows(
  cwd: string,
  packageName: string,
  version: string,
  platforms: Platform[],
  options: InstallOptions,
  includePaths?: string[],
  contentRoot?: string
): Promise<IndexInstallResult> {
  logger.debug(`Installing ${packageName}@${version} with flows for platforms: ${platforms.join(', ')}`);

  // Resolve package root
  const resolvedContentRoot = contentRoot ?? await resolvePackageContentRoot({ 
    cwd, 
    packageName, 
    version 
  });

  // Aggregate results across all platforms
  const aggregatedResult: IndexInstallResult = {
    installed: 0,
    updated: 0,
    deleted: 0,
    skipped: 0,
    files: [],
    installedFiles: [],
    updatedFiles: [],
    deletedFiles: []
  };

  const allTargetPaths = new Set<string>();
  const allConflicts: string[] = [];
  const allErrors: string[] = [];
  const fileMapping: Record<string, Set<string>> = {};

  // Execute flows for each platform
  for (const platform of platforms) {
    const installContext: FlowInstallContext = {
      packageName,
      packageRoot: resolvedContentRoot,
      workspaceRoot: cwd,
      platform,
      packageVersion: version,
      priority: 0, // Priority is calculated from dependency graph during multi-package installs
      dryRun: options.dryRun ?? false
    };

    try {
      const result = await installPackageWithFlows(installContext, options);

      // Aggregate target paths + per-source mapping for workspace index
      for (const absTarget of result.targetPaths ?? []) {
        allTargetPaths.add(absTarget);
      }
      for (const [source, targets] of Object.entries(result.fileMapping ?? {})) {
        if (!fileMapping[source]) {
          fileMapping[source] = new Set<string>();
        }
        for (const target of targets) {
          fileMapping[source].add(target);
        }
      }

      // Aggregate statistics
      aggregatedResult.installed += result.filesProcessed;
      aggregatedResult.updated += 0; // Flow executor doesn't distinguish new vs updated yet
      aggregatedResult.skipped += result.filesProcessed - result.filesWritten;

      // Collect conflicts
      for (const conflict of result.conflicts) {
        const conflictMsg = `${conflict.targetPath}: ${conflict.message}`;
        if (!allConflicts.includes(conflictMsg)) {
          allConflicts.push(conflictMsg);
        }
      }

      // Collect errors
      for (const error of result.errors) {
        const errorMsg = `${error.sourcePath}: ${error.message}`;
        if (!allErrors.includes(errorMsg)) {
          allErrors.push(errorMsg);
        }
      }

      // Log results per platform
      if (result.filesProcessed > 0) {
        logger.info(
          `${platform}: processed ${result.filesProcessed} files` +
          (options.dryRun ? ' (dry run)' : `, wrote ${result.filesWritten} files`)
        );
      }

    } catch (error) {
      logger.error(`Failed to install ${packageName} for platform ${platform}: ${error}`);
      allErrors.push(`${platform}: ${error}`);
    }
  }

  // Log conflicts
  if (allConflicts.length > 0) {
    logger.warn(`Detected ${allConflicts.length} conflicts during installation:`);
    for (const conflict of allConflicts) {
      logger.warn(`  ${conflict}`);
    }
  }

  // Log errors
  if (allErrors.length > 0) {
    logger.error(`Encountered ${allErrors.length} errors during installation:`);
    for (const error of allErrors) {
      logger.error(`  ${error}`);
    }
  }

  // Update workspace index if not dry-run
  if (!options.dryRun) {
    await updateWorkspaceIndexForFlows(
      cwd,
      packageName,
      version,
      resolvedContentRoot,
      fileMapping
    );
  }

  // Set result files
  aggregatedResult.files = Array.from(allTargetPaths);
  aggregatedResult.installedFiles = Array.from(allTargetPaths);

  return aggregatedResult;
}

// ============================================================================
// Workspace Index Management
// ============================================================================

/**
 * Update workspace index with flow-based installation results
 */
async function updateWorkspaceIndexForFlows(
  cwd: string,
  packageName: string,
  version: string,
  packagePath: string,
  fileMapping: Record<string, Set<string>>
): Promise<void> {
  try {
    const wsRecord = await readWorkspaceIndex(cwd);
    
    // Initialize packages map if needed
    wsRecord.index.packages = wsRecord.index.packages ?? {};
    
    // Convert file mapping to workspace index format
    const files: Record<string, string[]> = {};
    for (const [source, targets] of Object.entries(fileMapping)) {
      files[source] = Array.from(targets).sort();
    }
    
    // Convert to workspace-relative path if under workspace, then apply tilde notation for global paths
    const formattedPath = formatPathForWorkspaceIndex(packagePath, cwd);
    
    // Update package entry
    wsRecord.index.packages[packageName] = {
      ...wsRecord.index.packages[packageName],
      path: formattedPath,
      version,
      files: sortMapping(files)
    };
    
    await writeWorkspaceIndex(wsRecord);
    logger.debug(`Updated workspace index for ${packageName}@${version}`);
  } catch (error) {
    logger.warn(`Failed to update workspace index for ${packageName}: ${error}`);
  }
}


// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Read package index from workspace
 */
async function readPackageIndex(
  cwd: string,
  packageName: string
): Promise<PackageIndexRecord | null> {
  const record = await readWorkspaceIndex(cwd);
  const entry = record.index.packages?.[packageName];
  if (!entry) return null;
  
  return {
    path: entry.path ?? '',
    packageName,
    workspace: {
      version: entry.version ?? '',
      hash: undefined
    },
    files: entry.files ?? {}
  };
}

/**
 * Write package index to workspace
 */
async function writePackageIndex(
  record: PackageIndexRecord,
  cwd: string
): Promise<void> {
  const wsRecord = await readWorkspaceIndex(cwd);
  wsRecord.index.packages = wsRecord.index.packages ?? {};
  
  const entry = wsRecord.index.packages[record.packageName];
  const rawPath = entry?.path ?? record.path ?? '';
  
  if (!rawPath) {
    logger.warn(
      `Skipping workspace index write for ${record.packageName}: source path is unknown`
    );
    return;
  }
  
  // Convert to workspace-relative path if under workspace, then apply tilde notation for global paths
  const pathToUse = formatPathForWorkspaceIndex(rawPath, cwd);
  
  wsRecord.index.packages[record.packageName] = {
    ...entry,
    path: pathToUse,
    version: entry?.version ?? record.workspace?.version,
    files: sortMapping(record.files ?? {})
  };
  
  await writeWorkspaceIndex(wsRecord);
}
