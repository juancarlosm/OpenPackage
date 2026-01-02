/**
 * @fileoverview Scope discovery for show command
 * 
 * Discovers packages with the same name across different scopes
 * (workspace, global, and registry) and provides hints to users.
 */

import { join } from 'path';
import { logger } from '../../utils/logger.js';
import { normalizePackageName } from '../../utils/package-name.js';
import { isValidPackageDirectory, loadPackageConfig } from '../package-context.js';
import { getOpenPackageDirectories, listPackageVersions, getPackageVersionPath } from '../directory.js';
import { DIR_PATTERNS, OPENPACKAGE_DIRS } from '../../constants/index.js';
import type { PackageSourceType } from '../../utils/package-name-resolution.js';

/**
 * Information about a package found in a specific scope
 */
export interface ScopePackageInfo {
  /** The scope where the package was found */
  scope: PackageSourceType;
  /** Package name */
  name: string;
  /** Package version (if available) */
  version?: string;
  /** Absolute path to the package */
  path: string;
  /** Formatted show command to view this specific package */
  showCommand: string;
}

/**
 * Result of discovering packages across scopes
 */
export interface ScopeDiscoveryResult {
  /** The package name being searched */
  packageName: string;
  /** All packages found with this name across different scopes */
  packagesInScopes: ScopePackageInfo[];
}

/**
 * Helper to construct scoped package paths (@scope/name)
 */
function getScopedPackagePath(baseDir: string, packageName: string): string {
  // Handle scoped packages like @scope/name
  if (packageName.startsWith('@')) {
    const parts = packageName.split('/');
    if (parts.length === 2) {
      return join(baseDir, parts[0], parts[1]);
    }
  }
  return join(baseDir, packageName);
}

/**
 * Check workspace for the package
 */
async function checkWorkspaceScope(
  cwd: string,
  packageName: string
): Promise<ScopePackageInfo | null> {
  const normalizedName = normalizePackageName(packageName);
  const workspacePath = getScopedPackagePath(
    join(cwd, DIR_PATTERNS.OPENPACKAGE, OPENPACKAGE_DIRS.PACKAGES),
    normalizedName
  );

  if (!await isValidPackageDirectory(workspacePath)) {
    return null;
  }

  const manifest = await loadPackageConfig(workspacePath);
  if (!manifest) {
    return null;
  }

  logger.debug('Found package in workspace scope', { 
    packageName, 
    path: workspacePath, 
    version: manifest.version 
  });

  return {
    scope: 'workspace',
    name: normalizedName,
    version: manifest.version,
    path: workspacePath,
    showCommand: `opkg show ${workspacePath}`
  };
}

/**
 * Check global packages for the package
 */
async function checkGlobalScope(
  packageName: string
): Promise<ScopePackageInfo | null> {
  const normalizedName = normalizePackageName(packageName);
  const dirs = getOpenPackageDirectories();
  const globalPath = getScopedPackagePath(
    join(dirs.data, OPENPACKAGE_DIRS.PACKAGES),
    normalizedName
  );

  if (!await isValidPackageDirectory(globalPath)) {
    return null;
  }

  try {
    const manifest = await loadPackageConfig(globalPath);
    if (!manifest) {
      return null;
    }

    logger.debug('Found package in global scope', { 
      packageName, 
      path: globalPath,
      version: manifest.version 
    });

    return {
      scope: 'global',
      name: normalizedName,
      version: manifest.version,
      path: globalPath,
      showCommand: `opkg show ${globalPath}`
    };
  } catch (error) {
    logger.warn('Failed to load global package manifest', { packageName, path: globalPath, error });
    return null;
  }
}

/**
 * Check local registry for the package
 */
async function checkRegistryScope(
  packageName: string
): Promise<ScopePackageInfo | null> {
  const normalizedName = normalizePackageName(packageName);
  
  try {
    const registryVersions = await listPackageVersions(normalizedName);
    if (registryVersions.length === 0) {
      return null;
    }

    const latestVersion = registryVersions[0]; // Already sorted desc
    const registryPath = getPackageVersionPath(normalizedName, latestVersion);
    
    logger.debug('Found package in registry scope', { 
      packageName, 
      path: registryPath,
      version: latestVersion 
    });

    return {
      scope: 'registry',
      name: normalizedName,
      version: latestVersion,
      path: registryPath,
      showCommand: `opkg show ${registryPath}`
    };
  } catch (error) {
    logger.debug('No registry versions found', { packageName });
    return null;
  }
}

/**
 * Discover packages with the same name across different scopes
 * 
 * Searches for the package in:
 * - Workspace packages (.openpackage/packages/)
 * - Global packages (~/.openpackage/packages/)
 * - Local registry (~/.openpackage/registry/)
 * 
 * @param packageName - The package name to search for
 * @param cwd - Current working directory
 * @returns Discovery result with all found packages
 */
export async function discoverPackagesAcrossScopes(
  packageName: string,
  cwd: string
): Promise<ScopeDiscoveryResult> {
  logger.debug('Discovering packages across scopes', { packageName, cwd });

  const packagesInScopes: ScopePackageInfo[] = [];

  // Check workspace
  const workspacePackage = await checkWorkspaceScope(cwd, packageName);
  if (workspacePackage) {
    packagesInScopes.push(workspacePackage);
  }

  // Check global
  const globalPackage = await checkGlobalScope(packageName);
  if (globalPackage) {
    packagesInScopes.push(globalPackage);
  }

  // Check registry
  const registryPackage = await checkRegistryScope(packageName);
  if (registryPackage) {
    packagesInScopes.push(registryPackage);
  }

  logger.debug('Scope discovery completed', { 
    packageName, 
    scopesFound: packagesInScopes.length 
  });

  return {
    packageName,
    packagesInScopes
  };
}

/**
 * Check if multiple scopes have the same package
 * 
 * @param packageName - The package name to check
 * @param cwd - Current working directory
 * @returns True if the package exists in multiple scopes
 */
export async function hasMultipleScopes(
  packageName: string,
  cwd: string
): Promise<boolean> {
  const result = await discoverPackagesAcrossScopes(packageName, cwd);
  return result.packagesInScopes.length > 1;
}
