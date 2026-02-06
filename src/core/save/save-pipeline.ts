/**
 * Minimal Save Pipeline
 * 
 * Syncs workspace files back to mutable package source by:
 * 1. Reading workspace index to find installed file mappings
 * 2. Hash-checking for changes
 * 3. Copying changed files from workspace to source
 */

import { join, dirname } from 'path';
import type { CommandResult } from '../../types/index.js';
import { readWorkspaceIndex } from '../../utils/workspace-index-yml.js';
import { resolvePackageSource } from '../source-resolution/resolve-package-source.js';
import { assertMutableSourceOrThrow } from '../../utils/source-mutability.js';
import { exists, readTextFile, writeTextFile, ensureDir } from '../../utils/fs.js';
import { calculateFileHash } from '../../utils/hash-utils.js';
import { logger } from '../../utils/logger.js';

export interface SavePipelineOptions {
  // Reserved for future use
}

export interface SavePipelineResult {
  packageName: string;
  packagePath: string;
  filesSaved: number;
  savedFiles: string[];
}

interface ChangedFile {
  workspacePath: string;
  registryPath: string;
  absWorkspacePath: string;
  absSourcePath: string;
}

/**
 * Run the minimal save pipeline
 * 
 * Syncs workspace files back to package source for files tracked in the workspace index.
 */
export async function runSavePipeline(
  packageName: string,
  options: SavePipelineOptions = {}
): Promise<CommandResult<SavePipelineResult>> {
  const cwd = process.cwd();

  // Phase 1: Validate preconditions
  logger.debug(`Validating save preconditions for ${packageName}`);
  const validation = await validateSavePreconditions(cwd, packageName);
  if (!validation.success) {
    return { success: false, error: validation.error };
  }

  const { pkgIndex, sourceAbsolutePath } = validation;

  // Phase 2: Collect changed files
  logger.debug(`Collecting changed files for ${packageName}`);
  const changedFiles = await collectChangedFiles(cwd, sourceAbsolutePath, pkgIndex.files);

  if (changedFiles.length === 0) {
    logger.info(`No changes detected for ${packageName}`);
    return {
      success: true,
      data: {
        packageName,
        packagePath: sourceAbsolutePath,
        filesSaved: 0,
        savedFiles: []
      }
    };
  }

  logger.info(`Found ${changedFiles.length} changed file(s) to save`);

  // Phase 3: Copy files back to source
  logger.debug(`Copying ${changedFiles.length} file(s) to source`);
  const savedFiles: string[] = [];

  for (const file of changedFiles) {
    try {
      // Ensure target directory exists
      await ensureDir(dirname(file.absSourcePath));

      // Read workspace content
      const content = await readTextFile(file.absWorkspacePath);

      // Write to source (overwrite)
      await writeTextFile(file.absSourcePath, content);

      savedFiles.push(file.workspacePath);
      logger.debug(`Saved ${file.workspacePath} → ${file.registryPath}`);
    } catch (error) {
      logger.error(`Failed to save ${file.workspacePath}: ${error}`);
      return {
        success: false,
        error: `Failed to save ${file.workspacePath}: ${error}`
      };
    }
  }

  logger.info(`Successfully saved ${savedFiles.length} file(s) to ${packageName}`);

  return {
    success: true,
    data: {
      packageName,
      packagePath: sourceAbsolutePath,
      filesSaved: savedFiles.length,
      savedFiles
    }
  };
}

/**
 * Validate save preconditions
 * 
 * Checks:
 * - Package name is provided
 * - Workspace index exists
 * - Package is installed
 * - Package has file mappings
 * - Package source is mutable
 */
async function validateSavePreconditions(
  cwd: string,
  packageName: string
): Promise<
  | { success: true; pkgIndex: any; sourceAbsolutePath: string }
  | { success: false; error: string }
> {
  // Check package name provided
  if (!packageName) {
    return {
      success: false,
      error: 'Package name is required for save.'
    };
  }

  // Read workspace index
  let index;
  try {
    const result = await readWorkspaceIndex(cwd);
    index = result.index;
  } catch (error) {
    return {
      success: false,
      error: `Failed to read workspace index: ${error}`
    };
  }

  // Check package exists in index
  const pkgIndex = index.packages?.[packageName];
  if (!pkgIndex) {
    return {
      success: false,
      error:
        `Package '${packageName}' is not installed in this workspace.\n` +
        `Run 'opkg install ${packageName}' to install it first.`
    };
  }

  // Check package has file mappings
  if (!pkgIndex.files || Object.keys(pkgIndex.files).length === 0) {
    return {
      success: false,
      error:
        `Package '${packageName}' has no files installed.\n` +
        `Nothing to save.`
    };
  }

  // Resolve package source
  let source;
  try {
    source = await resolvePackageSource(cwd, packageName);
  } catch (error) {
    return {
      success: false,
      error: `Failed to resolve package source: ${error}`
    };
  }

  // Check source is mutable
  try {
    assertMutableSourceOrThrow(source.absolutePath, {
      packageName: source.packageName,
      command: 'save'
    });
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }

  return {
    success: true,
    pkgIndex,
    sourceAbsolutePath: source.absolutePath
  };
}

/**
 * Collect changed files from workspace
 * 
 * Iterates workspace index file mappings and detects changes via hash comparison.
 * Only includes files that:
 * - Exist in workspace
 * - Have different content hash than source (or don't exist in source yet)
 */
async function collectChangedFiles(
  cwd: string,
  sourceAbsolutePath: string,
  filesMapping: Record<string, (string | any)[]>
): Promise<ChangedFile[]> {
  const changedFiles: ChangedFile[] = [];

  for (const [registryPath, targets] of Object.entries(filesMapping)) {
    if (!Array.isArray(targets)) continue;

    for (const target of targets) {
      // Extract target path (handle both string and object format)
      const workspacePath = typeof target === 'string' ? target : target.target;
      if (!workspacePath) continue;

      const absWorkspacePath = join(cwd, workspacePath);
      const absSourcePath = join(sourceAbsolutePath, registryPath);

      // Skip if file doesn't exist in workspace
      if (!(await exists(absWorkspacePath))) {
        logger.debug(`Skipping ${workspacePath}: not found in workspace`);
        continue;
      }

      // Calculate workspace hash
      const workspaceContent = await readTextFile(absWorkspacePath);
      const workspaceHash = await calculateFileHash(workspaceContent);

      // Check if source exists and compare hashes
      let hasChanged = true;
      if (await exists(absSourcePath)) {
        const sourceContent = await readTextFile(absSourcePath);
        const sourceHash = await calculateFileHash(sourceContent);
        hasChanged = workspaceHash !== sourceHash;
      }

      if (hasChanged) {
        changedFiles.push({
          workspacePath,
          registryPath,
          absWorkspacePath,
          absSourcePath
        });
        logger.debug(`Detected change: ${workspacePath} → ${registryPath}`);
      } else {
        logger.debug(`Skipping ${workspacePath}: no changes`);
      }
    }
  }

  return changedFiles;
}
