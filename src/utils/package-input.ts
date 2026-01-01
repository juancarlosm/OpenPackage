import { resolve, isAbsolute, join } from 'path';
import * as semver from 'semver';
import { exists } from './fs.js';
import { isValidPackageDirectory, loadPackageConfig } from '../core/package-context.js';
import { parsePackageInstallSpec, normalizePackageName, SCOPED_PACKAGE_REGEX } from './package-name.js';
import { ValidationError } from './errors.js';
import { parseGitSpec } from './git-spec.js';
import { getOpenPackageDirectories, listPackageVersions, getPackageVersionPath } from '../core/directory.js';
import { DIR_PATTERNS, OPENPACKAGE_DIRS, UNVERSIONED } from '../constants/index.js';
import { logger } from './logger.js';

export type PackageInputType = 'registry' | 'directory' | 'tarball' | 'git';

export interface PackageInputClassification {
  type: PackageInputType;
  
  // For 'registry' type
  name?: string;
  version?: string;
  registryPath?: string;

  // For 'git' type
  gitUrl?: string;
  gitRef?: string;
  
  // For 'directory' or 'tarball' types
  resolvedPath?: string;  // Absolute path
  
  // For version-aware resolution metadata
  sourceComparisonInfo?: SourceComparisonInfo;
}

export interface PackageSourceCandidate {
  path: string;
  version: string;
  type: 'workspace' | 'global' | 'registry';
  packageName: string;
}

export interface SourceComparisonInfo {
  candidates: PackageSourceCandidate[];
  selected: PackageSourceCandidate;
  reason: 'only-source' | 'newer-version' | 'same-version-prefer-mutable' | 'workspace-override';
}

/**
 * Classify whether input is a registry package name, local directory, or tarball.
 * 
 * Detection order:
 * 1. Ends with .tgz or .tar.gz AND file exists → 'tarball'
 * 2. Starts with /, ./, ../, or is . AND isValidPackageDirectory → 'directory'
 * 3. Otherwise → parse as registry name via parsePackageInstallSpec
 * 
 * @param raw - The raw input string from the user
 * @param cwd - Current working directory for resolving relative paths
 * @returns Classification of the input type and relevant information
 */
export async function classifyPackageInput(
  raw: string,
  cwd: string = process.cwd()
): Promise<PackageInputClassification> {
  // Check for git/github specs first
  const gitSpec = parseGitSpec(raw);
  if (gitSpec) {
    return {
      type: 'git',
      gitUrl: gitSpec.url,
      gitRef: gitSpec.ref
    };
  }

  // Check for tarball file extension
  const isTarballPath = raw.endsWith('.tgz') || raw.endsWith('.tar.gz');
  
  // Check if input looks like a path
  const looksLikePath = raw.startsWith('/') || 
                        raw.startsWith('./') || 
                        raw.startsWith('../') || 
                        raw === '.' ||
                        raw.startsWith('~/') ||
                        (isAbsolute(raw) && !raw.includes('@'));
  
  if (isTarballPath || looksLikePath) {
    const resolvedPath = isAbsolute(raw) ? raw : resolve(cwd, raw);
    
    if (isTarballPath) {
      if (await exists(resolvedPath)) {
        return { type: 'tarball', resolvedPath };
      }
      // File doesn't exist - fall through to treat as registry name
      // (will error later with "file not found" or "package not found")
    }
    
    if (await isValidPackageDirectory(resolvedPath)) {
      return { type: 'directory', resolvedPath };
    }
    
    // Path exists but isn't a valid package? Error
    if (await exists(resolvedPath)) {
      throw new ValidationError(
        `Path '${raw}' exists but is not a valid OpenPackage directory. ` +
        `Valid packages must contain openpackage.yml`
      );
    }
  }
  
  // Check if this looks like a simple package name (not an explicit path)
  // Search in workspace/global packages before falling back to registry
  if (!looksLikePath && !isTarballPath) {
    const packagePath = await findPackageInMutableDirectories(raw, cwd);
    if (packagePath.found) {
      return { 
        type: 'directory', 
        resolvedPath: packagePath.path!,
        sourceComparisonInfo: packagePath.comparisonInfo
      };
    }
  }
  
  // Treat as registry package name
  try {
    const { name, version, registryPath } = parsePackageInstallSpec(raw);
    return { type: 'registry', name, version, registryPath };
  } catch (error) {
    // If parsing fails, still return registry type - let downstream handle the error
    return { type: 'registry', name: raw };
  }
}

/**
 * Helper to construct scoped package paths (@scope/name)
 */
function getScopedPackagePath(baseDir: string, packageName: string): string {
  const scopedMatch = packageName.match(SCOPED_PACKAGE_REGEX);
  if (scopedMatch) {
    const [, scope, localName] = scopedMatch;
    return join(baseDir, '@' + scope, localName);
  }
  return join(baseDir, packageName);
}

/**
 * Search for a package in mutable directories (workspace-local and global)
 * Implements version-aware resolution:
 * 1. Workspace-local always wins (no version check)
 * 2. Compare global vs registry versions, use higher version
 * 3. Tie-breaker: same version prefers global (mutable)
 * 
 * @param packageName - Package name to search for
 * @param cwd - Current working directory
 * @returns Object with found flag, path, and comparison info
 */
async function findPackageInMutableDirectories(
  packageName: string,
  cwd: string
): Promise<{ found: boolean; path?: string; comparisonInfo?: SourceComparisonInfo }> {
  const normalizedName = normalizePackageName(packageName);
  
  // 1. Check workspace-local (ALWAYS wins, no version check)
  const localPath = getScopedPackagePath(
    join(cwd, DIR_PATTERNS.OPENPACKAGE, OPENPACKAGE_DIRS.PACKAGES),
    normalizedName
  );
  
  if (await isValidPackageDirectory(localPath)) {
    logger.debug('Found package in workspace (override)', { packageName, path: localPath });
    
    // Load version for display purposes
    const manifest = await loadPackageConfig(localPath);
    const workspaceCandidate: PackageSourceCandidate = {
      path: localPath,
      version: manifest?.version || UNVERSIONED,
      type: 'workspace',
      packageName: normalizedName
    };
    
    return {
      found: true,
      path: localPath,
      comparisonInfo: {
        candidates: [workspaceCandidate],
        selected: workspaceCandidate,
        reason: 'workspace-override'
      }
    };
  }
  
  // 2. Check global packages vs registry - version comparison
  const dirs = getOpenPackageDirectories();
  const globalPath = getScopedPackagePath(
    join(dirs.data, OPENPACKAGE_DIRS.PACKAGES),
    normalizedName
  );
  
  const candidates: PackageSourceCandidate[] = [];
  
  // Global packages candidate
  if (await isValidPackageDirectory(globalPath)) {
    try {
      const globalManifest = await loadPackageConfig(globalPath);
      candidates.push({
        path: globalPath,
        version: globalManifest?.version || UNVERSIONED,
        type: 'global',
        packageName: normalizedName
      });
      logger.debug('Found package in global packages', { 
        packageName, 
        path: globalPath,
        version: globalManifest?.version 
      });
    } catch (error) {
      logger.warn('Failed to load global package manifest', { packageName, path: globalPath, error });
    }
  }
  
  // Registry candidate (latest version)
  try {
    const registryVersions = await listPackageVersions(normalizedName);
    if (registryVersions.length > 0) {
      const latestVersion = registryVersions[0]; // Already sorted desc
      const registryPath = getPackageVersionPath(normalizedName, latestVersion);
      candidates.push({
        path: registryPath,
        version: latestVersion,
        type: 'registry',
        packageName: normalizedName
      });
      logger.debug('Found package in registry', { 
        packageName, 
        path: registryPath,
        version: latestVersion 
      });
    }
  } catch (error) {
    logger.debug('No registry versions found', { packageName });
  }
  
  // No candidates found - will fall back to normal registry resolution
  if (candidates.length === 0) {
    logger.debug('No package found in workspace/global/registry', { packageName });
    return { found: false };
  }
  
  // Single candidate - use it (no comparison needed)
  if (candidates.length === 1) {
    const candidate = candidates[0];
    logger.info(`Using ${candidate.type} package`, {
      packageName,
      version: candidate.version,
      path: candidate.path
    });
    return {
      found: true,
      path: candidate.path,
      comparisonInfo: {
        candidates: [candidate],
        selected: candidate,
        reason: 'only-source'
      }
    };
  }
  
  // Multiple candidates - compare versions and pick best
  const selected = selectBestCandidate(candidates);
  const reason = determineSelectionReason(candidates, selected);
  
  logger.info(`Resolved package by comparing versions`, {
    packageName,
    candidates: candidates.map(c => ({
      type: c.type,
      version: c.version
    })),
    selected: {
      type: selected.type,
      version: selected.version,
      reason
    }
  });
  
  return {
    found: true,
    path: selected.path,
    comparisonInfo: {
      candidates,
      selected,
      reason
    }
  };
}

/**
 * Select the best candidate from multiple package sources
 * Priority: highest version, then prefer global (mutable) on tie
 */
function selectBestCandidate(candidates: PackageSourceCandidate[]): PackageSourceCandidate {
  // Handle unversioned packages
  const hasUnversioned = candidates.some(c => c.version === UNVERSIONED);
  if (hasUnversioned) {
    // If one is unversioned, prefer versioned over unversioned
    const versioned = candidates.filter(c => c.version !== UNVERSIONED);
    if (versioned.length > 0) {
      // Return highest versioned
      versioned.sort((a, b) => semver.compare(b.version, a.version));
      return versioned[0];
    }
    // All unversioned - prefer global
    const global = candidates.find(c => c.type === 'global');
    return global || candidates[0];
  }
  
  // Sort by version (highest first)
  const sorted = [...candidates].sort((a, b) => {
    const versionCompare = semver.compare(b.version, a.version);
    if (versionCompare !== 0) return versionCompare;
    
    // Tie-breaker: same version, prefer global (mutable)
    if (a.type === 'global' && b.type === 'registry') return -1;
    if (a.type === 'registry' && b.type === 'global') return 1;
    return 0;
  });
  
  return sorted[0];
}

/**
 * Determine the reason why a particular candidate was selected
 */
function determineSelectionReason(
  candidates: PackageSourceCandidate[],
  selected: PackageSourceCandidate
): 'only-source' | 'newer-version' | 'same-version-prefer-mutable' {
  if (candidates.length === 1) {
    return 'only-source';
  }
  
  const other = candidates.find(c => c !== selected);
  if (!other) return 'only-source';
  
  // Handle unversioned comparisons
  if (selected.version === UNVERSIONED || other.version === UNVERSIONED) {
    return 'newer-version'; // Treat as newer if comparing versioned vs unversioned
  }
  
  const versionCompare = semver.compare(selected.version, other.version);
  
  if (versionCompare > 0) {
    return 'newer-version';
  } else if (versionCompare === 0) {
    return 'same-version-prefer-mutable';
  }
  
  // Shouldn't reach here since we select highest
  return 'newer-version';
}

