/**
 * File-Level Conflict Resolver
 *
 * Detects and resolves file-level conflicts for flow-based installs.
 * Provides a clean API for the FlowBasedInstallStrategy to use.
 */

import { dirname, join, parse as parsePath } from 'path';
import { promises as fs } from 'fs';

import { exists, ensureDir, readTextFile, walkFiles } from '../../../utils/fs.js';
import { normalizePathForProcessing } from '../../../utils/path-normalization.js';
import { formatPathForYaml } from '../../../utils/path-resolution.js';
import { calculateFileHash } from '../../../utils/hash-utils.js';
import { getTargetPath } from '../../../utils/workspace-index-helpers.js';
import { sortMapping, isDirKey, ensureTrailingSlash } from '../../../utils/package-index-yml.js';
import { readWorkspaceIndex, writeWorkspaceIndex } from '../../../utils/workspace-index-yml.js';
import { getRegistryDirectories } from '../../directory.js';
import { sep } from 'path';
import { safePrompts } from '../../../utils/prompts.js';
import { logger } from '../../../utils/logger.js';
import type { InstallOptions } from '../../../types/index.js';
import type { WorkspaceConflictOwner } from '../../../utils/workspace-index-ownership.js';
import type { WorkspaceIndexFileMapping } from '../../../types/workspace-index.js';
import {
  loadOtherPackageIndexes,
  buildExpandedIndexesContext,
  type ExpandedIndexesContext,
} from '../../../utils/index-based-installer.js';

// ============================================================================
// Internal Types
// ============================================================================

type ConflictResolution = 'keep-both' | 'skip' | 'overwrite';

interface PackageIndexRecord {
  path: string;
  packageName: string;
  workspace: {
    version: string;
    hash?: string;
  };
  files: Record<string, (string | WorkspaceIndexFileMapping)[]>;
}

// ============================================================================
// Public Types
// ============================================================================

export type FileConflictType = 'none' | 'owned-by-other' | 'exists-unowned';

export interface FileConflictInfo {
  type: FileConflictType;
  /** Set when type === 'owned-by-other' */
  owner?: WorkspaceConflictOwner;
}

export interface OwnershipContext {
  expandedIndexes: ExpandedIndexesContext;
  /** Paths the current package already owned (so re-installs skip the conflict check) */
  previousOwnedPaths: Set<string>;
  /** Raw index records keyed by package name (needed for keep-both index updates) */
  indexByPackage: Map<string, PackageIndexRecord>;
}

/** A resolved target path together with the content that will be written there */
export interface TargetEntry {
  /** Workspace-relative path (forward-slash, normalised) */
  relPath: string;
  /** Absolute path */
  absPath: string;
  /**
   * Content of the source file.  Used only for the 'exists-unowned' branch
   * where we compare content before deciding whether a conflict exists.
   * Leave undefined if you want to skip the content-diff check for that branch.
   */
  content?: string;
}

export interface ConflictResolutionResult {
  /** Targets that should proceed to flow execution */
  allowedTargets: TargetEntry[];
  /** Human-readable warnings/notes accumulated during resolution */
  warnings: string[];
}

// ============================================================================
// Private: expand a package's index to its owned file paths
// (moved from index-based-installer.ts)
// ============================================================================

async function collectFilesUnderDirectory(cwd: string, dirRelPath: string): Promise<string[]> {
  const directoryRel = ensureTrailingSlash(normalizePathForProcessing(dirRelPath));
  const absDir = join(cwd, directoryRel);
  if (!(await exists(absDir))) {
    return [];
  }

  const collected: string[] = [];
  try {
    for await (const absFile of walkFiles(absDir)) {
      // normalizeRelativePath inline
      const { relative: relFn } = await import('path');
      const rel = relFn(cwd, absFile);
      collected.push(normalizePathForProcessing(rel).replace(/\\/g, '/'));
    }
  } catch (error) {
    logger.warn(`Failed to enumerate directory ${absDir}: ${error}`);
  }
  return collected;
}

async function expandIndexToFilePaths(
  cwd: string,
  index: PackageIndexRecord | null
): Promise<Set<string>> {
  const owned = new Set<string>();
  if (!index) return owned;

  for (const [key, values] of Object.entries(index.files)) {
    if (isDirKey(key)) {
      for (const mapping of values) {
        const dirRel = getTargetPath(mapping);
        const files = await collectFilesUnderDirectory(cwd, dirRel);
        for (const rel of files) {
          owned.add(normalizePathForProcessing(rel));
        }
      }
    } else {
      for (const mapping of values) {
        const value = getTargetPath(mapping);
        owned.add(normalizePathForProcessing(value));
      }
    }
  }

  return owned;
}

// ============================================================================
// Private: prompt helpers
// ============================================================================

async function promptConflictResolution(message: string): Promise<ConflictResolution> {
  const response = await safePrompts({
    type: 'select',
    name: 'choice',
    message,
    choices: [
      { title: 'Keep both (renames existing)', value: 'keep-both' },
      { title: 'Skip (keeps existing)',         value: 'skip'      },
      { title: 'Overwrite (replaces existing)', value: 'overwrite' }
    ]
  });
  return ((response as any).choice as ConflictResolution | undefined) ?? 'skip';
}

async function promptContentDifferenceResolution(
  workspacePath: string,
  sourcePath?: string
): Promise<'overwrite' | 'skip'> {
  const formattedSource = sourcePath
    ? (sourcePath.startsWith('/') ? sourcePath : `/${sourcePath}`)
    : undefined;
  const message = formattedSource
    ? `Package file ${formattedSource} differs from workspace file ${workspacePath}`
    : `File ${workspacePath} differs from package version`;

  const response = await safePrompts({
    type: 'select',
    name: 'choice',
    message,
    choices: [
      { title: 'Overwrite (use package version)',  value: 'overwrite' },
      { title: 'Skip (keep workspace version)',    value: 'skip'      }
    ]
  });
  return ((response as any).choice as 'overwrite' | 'skip' | undefined) ?? 'skip';
}

// ============================================================================
// Private: content-difference check
// ============================================================================

async function hasContentDifference(absPath: string, newContent: string): Promise<boolean> {
  try {
    if (!(await exists(absPath))) return false;
    const existing = await readTextFile(absPath, 'utf8');
    if (existing === newContent) return false;
    const [existingHash, newHash] = await Promise.all([
      calculateFileHash(existing),
      calculateFileHash(newContent)
    ]);
    return existingHash !== newHash;
  } catch (error) {
    logger.warn(`Failed to check content difference for ${absPath}: ${error}`);
    return true; // assume differs on error — safer to prompt than to silently skip
  }
}

// ============================================================================
// Private: generate a non-colliding .local path
// ============================================================================

async function generateLocalPath(cwd: string, relPath: string): Promise<string> {
  const parsed = parsePath(relPath);
  const directory = parsed.dir ? parsed.dir.replace(/\\/g, '/') : '';

  let baseName = `${parsed.name}.local${parsed.ext}`;
  let candidate = directory ? `${directory}/${baseName}` : baseName;
  if (!(await exists(join(cwd, candidate)))) {
    return normalizePathForProcessing(candidate);
  }

  let increment = 1;
  while (true) {
    baseName = `${parsed.name}.local-${increment}${parsed.ext}`;
    candidate = directory ? `${directory}/${baseName}` : baseName;
    if (!(await exists(join(cwd, candidate)))) {
      return normalizePathForProcessing(candidate);
    }
    increment++;
  }
}

// ============================================================================
// Private: update owner's workspace index after a keep-both rename
// ============================================================================

async function updateOwnerIndexAfterRename(
  cwd: string,
  owner: WorkspaceConflictOwner,
  oldRelPath: string,
  newRelPath: string,
  indexByPackage: Map<string, PackageIndexRecord>
): Promise<void> {
  const normalizedOld = normalizePathForProcessing(oldRelPath);
  const normalizedNew = normalizePathForProcessing(newRelPath);
  const record = indexByPackage.get(owner.packageName);
  if (!record) return;

  if (owner.type === 'file') {
    const values = record.files[owner.key];
    if (!values) return;
    const idx = values.findIndex(mapping => {
      const target = getTargetPath(mapping);
      return normalizePathForProcessing(target) === normalizedOld;
    });
    if (idx === -1) return;
    const oldMapping = values[idx];
    values[idx] = typeof oldMapping === 'string'
      ? normalizedNew
      : { ...oldMapping, target: normalizedNew };
  }
  // dir-key owners: directory key is still valid after rename, nothing to change.

  // Persist to workspace index
  const wsRecord = await readWorkspaceIndex(cwd);
  wsRecord.index.packages = wsRecord.index.packages ?? {};
  const entry = wsRecord.index.packages[record.packageName];

  const rawPath =
    entry?.path ??
    record.path ??
    (record.workspace?.version
      ? join(getRegistryDirectories().packages, record.packageName, record.workspace.version, sep)
      : '');
  if (!rawPath) {
    logger.warn(`Skipping workspace index write for ${record.packageName}: source path unknown`);
    return;
  }

  const pathToUse = formatPathForYaml(rawPath, cwd);
  wsRecord.index.packages[record.packageName] = {
    ...entry,
    path: pathToUse,
    version: entry?.version ?? record.workspace?.version,
    files: sortMapping(record.files ?? {})
  };

  await writeWorkspaceIndex(wsRecord);
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Build the ownership context needed for conflict checks on a single install run.
 *
 * @param cwd             - Workspace root
 * @param packageName     - Package being installed (excluded from "other owners")
 * @param previousRecord  - Workspace-index record for this package from the previous install,
 *                          or null if this is a fresh install.
 */
export async function buildOwnershipContext(
  cwd: string,
  packageName: string,
  previousRecord: { files: Record<string, (string | WorkspaceIndexFileMapping)[]> } | null
): Promise<OwnershipContext> {
  const otherIndexes = await loadOtherPackageIndexes(cwd, packageName);
  const expandedIndexes = await buildExpandedIndexesContext(cwd, otherIndexes);

  // Build previousOwnedPaths from the caller-supplied record (avoids reading the index again)
  const previousIndex: PackageIndexRecord | null = previousRecord
    ? {
        path: '',
        packageName,
        workspace: { version: '' },
        files: previousRecord.files
      }
    : null;
  const previousOwnedPaths = await expandIndexToFilePaths(cwd, previousIndex);

  const indexByPackage = new Map<string, PackageIndexRecord>();
  for (const rec of otherIndexes) {
    indexByPackage.set(rec.packageName, rec);
  }

  return { expandedIndexes, previousOwnedPaths, indexByPackage };
}

/**
 * Classify a single target path as conflict-free, owned-by-another-package, or
 * existing-on-disk-but-unowned.
 */
export function classifyFileConflict(
  targetRelPath: string,
  ownershipContext: OwnershipContext
): FileConflictInfo {
  const normalized = normalizePathForProcessing(targetRelPath);
  const owner = ownershipContext.expandedIndexes.installedPathOwners.get(normalized);

  if (owner) {
    return { type: 'owned-by-other', owner };
  }

  // For the 'exists-unowned' classification we only report the type here;
  // the caller must also check disk existence (and optionally content).
  if (!ownershipContext.previousOwnedPaths.has(normalized)) {
    return { type: 'exists-unowned' };
  }

  return { type: 'none' };
}

/**
 * Decide what to do for a single classified conflict.
 *
 * The decision cascade is:
 *   1. Per-path override (`options.conflictDecisions`)
 *   2. `--force` flag
 *   3. Configured strategy (`options.conflictStrategy`, when not 'ask')
 *   4. TTY prompt (interactive mode)
 *   5. Skip fallback (non-interactive)
 *
 * @param conflictType    - 'owned-by-other' or 'exists-unowned'
 * @param relPath         - Workspace-relative path (for display / per-path key lookup)
 * @param ownerName       - Package name of the owner (only relevant for 'owned-by-other')
 * @param sourcePath      - Package-relative source path (shown in prompts)
 * @param options         - Install options carrying force / conflictStrategy / conflictDecisions
 * @param interactive     - Whether the session is running in TTY interactive mode
 * @param forceOverwrite  - True when the package-level phase confirmed an overwrite for this pkg
 */
export async function resolveFileConflict(
  conflictType: 'owned-by-other' | 'exists-unowned',
  relPath: string,
  ownerName: string | undefined,
  sourcePath: string | undefined,
  options: InstallOptions,
  interactive: boolean,
  forceOverwrite: boolean
): Promise<{ decision: ConflictResolution; warning?: string }> {
  const perPathDecisions = options.conflictDecisions ?? {};
  const normalized = normalizePathForProcessing(relPath);

  // 1. Per-path override
  const perPath = perPathDecisions[normalized] ?? perPathDecisions[relPath];
  if (perPath) {
    return { decision: perPath as ConflictResolution };
  }

  // 2. Force flag or package-level force-overwrite confirmation
  if (options.force || forceOverwrite) {
    const resolution: ConflictResolution =
      conflictType === 'owned-by-other' ? 'keep-both' : 'overwrite';
    const warning = conflictType === 'owned-by-other'
      ? `Keeping both: renaming ${normalized} (owned by ${ownerName}) due to --force.`
      : `Overwriting ${normalized} (content differs, --force active).`;
    return { decision: resolution, warning };
  }

  const strategy = options.conflictStrategy;

  // 3. Explicit non-'ask' strategy
  if (strategy && strategy !== 'ask') {
    const decision = strategy as ConflictResolution;
    let warning: string | undefined;
    if (decision === 'skip') {
      warning = conflictType === 'owned-by-other'
        ? `Skipping ${normalized} (owned by ${ownerName}) due to conflict strategy '${strategy}'.`
        : `Skipping ${normalized} (content differs) due to conflict strategy '${strategy}'.`;
    } else if (decision === 'overwrite' && conflictType === 'exists-unowned') {
      warning = `Overwriting ${normalized} (content differs) due to conflict strategy '${strategy}'.`;
    }
    return { decision, warning };
  }

  // 4. TTY prompt
  if (interactive) {
    if (conflictType === 'owned-by-other') {
      const decision = await promptConflictResolution(
        `File ${normalized} is managed by package ${ownerName}. How would you like to proceed?`
      );
      return { decision };
    } else {
      const decision = await promptContentDifferenceResolution(normalized, sourcePath);
      return { decision };
    }
  }

  // 5. Non-interactive fallback: skip
  const warning = conflictType === 'owned-by-other'
    ? `Skipping ${normalized} (owned by ${ownerName}) — non-interactive mode.`
    : `Skipping ${normalized} (content differs) — non-interactive mode.`;
  return { decision: 'skip', warning };
}

/**
 * Execute the keep-both strategy for a single target:
 * renames the existing file to a .local path and updates the owner's index entry.
 */
export async function executeKeepBoth(
  cwd: string,
  targetRelPath: string,
  owner: WorkspaceConflictOwner | undefined,
  ownershipContext: OwnershipContext,
  dryRun: boolean
): Promise<{ localRelPath: string; warning: string }> {
  const normalized = normalizePathForProcessing(targetRelPath);
  const absTarget = join(cwd, normalized);
  const localRelPath = await generateLocalPath(cwd, normalized);

  if (dryRun) {
    const ownerNote = owner ? ` from ${owner.packageName}` : '';
    return {
      localRelPath,
      warning: `Would rename existing ${normalized}${ownerNote} to ${localRelPath} and install new file at ${normalized}.`
    };
  }

  const absLocalPath = join(cwd, localRelPath);
  await ensureDir(dirname(absLocalPath));
  await fs.rename(absTarget, absLocalPath);

  if (owner) {
    await updateOwnerIndexAfterRename(
      cwd,
      owner,
      normalized,
      localRelPath,
      ownershipContext.indexByPackage
    );
    // Update in-memory ownership map so subsequent targets in this run see the rename
    ownershipContext.expandedIndexes.installedPathOwners.delete(normalized);
    ownershipContext.expandedIndexes.installedPathOwners.set(
      normalizePathForProcessing(localRelPath),
      owner
    );
  }

  const ownerNote = owner ? ` from ${owner.packageName}` : '';
  return {
    localRelPath,
    warning: `Renamed existing ${normalized}${ownerNote} to ${localRelPath}.`
  };
}

/**
 * Resolve conflicts for a batch of target paths.
 *
 * For each target:
 *  - 'owned-by-other': apply the decision cascade; on keep-both execute the rename.
 *  - 'exists-unowned' with content diff: apply the decision cascade.
 *  - No conflict / same content: allow through.
 *
 * @returns allowedTargets (filtered list to pass to flow execution) + accumulated warnings.
 */
export async function resolveConflictsForTargets(
  cwd: string,
  targets: TargetEntry[],
  ownershipContext: OwnershipContext,
  options: InstallOptions,
  forceOverwrite: boolean = false
): Promise<ConflictResolutionResult> {
  const allowedTargets: TargetEntry[] = [];
  const warnings: string[] = [];
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  const isDryRun = Boolean(options.dryRun);

  for (const target of targets) {
    const classification = classifyFileConflict(target.relPath, ownershipContext);

    if (classification.type === 'none') {
      allowedTargets.push(target);
      continue;
    }

    if (classification.type === 'owned-by-other') {
      const owner = classification.owner!;
      const { decision, warning } = await resolveFileConflict(
        'owned-by-other',
        target.relPath,
        owner.packageName,
        undefined,
        options,
        interactive,
        forceOverwrite
      );
      if (warning) warnings.push(warning);

      if (decision === 'skip') continue;

      if (decision === 'keep-both') {
        try {
          const { warning: keepBothWarning } = await executeKeepBoth(
            cwd,
            target.relPath,
            owner,
            ownershipContext,
            isDryRun
          );
          warnings.push(keepBothWarning);
          allowedTargets.push(target);
        } catch (error) {
          warnings.push(`Failed to rename ${target.relPath}: ${error}`);
          // Do not add to allowedTargets — skip on rename failure
        }
        continue;
      }

      // overwrite: allow flow to write the file; clear in-memory owner to avoid re-prompting
      if (!isDryRun) {
        ownershipContext.expandedIndexes.installedPathOwners.delete(
          normalizePathForProcessing(target.relPath)
        );
      }
      if (isDryRun) {
        warnings.push(`Would overwrite ${target.relPath} (currently owned by ${owner.packageName}).`);
      }
      allowedTargets.push(target);
      continue;
    }

    // exists-unowned: check content diff first
    if (classification.type === 'exists-unowned') {
      const absTarget = join(cwd, normalizePathForProcessing(target.relPath));
      if (!(await exists(absTarget))) {
        // File no longer exists on disk — no conflict
        allowedTargets.push(target);
        continue;
      }

      // If we have content to compare, check for differences
      if (target.content !== undefined) {
        const contentDiffers = await hasContentDifference(absTarget, target.content);
        if (!contentDiffers) {
          // Same content — allow write without prompting
          allowedTargets.push(target);
          continue;
        }
      }

      const { decision, warning } = await resolveFileConflict(
        'exists-unowned',
        target.relPath,
        undefined,
        undefined,
        options,
        interactive,
        forceOverwrite
      );
      if (warning) warnings.push(warning);

      if (decision === 'skip') continue;

      if (decision === 'keep-both') {
        try {
          const { warning: keepBothWarning } = await executeKeepBoth(
            cwd,
            target.relPath,
            undefined,
            ownershipContext,
            isDryRun
          );
          warnings.push(keepBothWarning);
          allowedTargets.push(target);
        } catch (error) {
          warnings.push(`Failed to rename ${target.relPath}: ${error}`);
        }
        continue;
      }

      // overwrite or dry-run
      if (isDryRun) {
        warnings.push(`Would overwrite existing local file ${target.relPath} (content differs).`);
      }
      allowedTargets.push(target);
      continue;
    }
  }

  return { allowedTargets, warnings };
}
