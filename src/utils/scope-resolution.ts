import { join } from 'path';
import { getOpenPackageDirectories } from '../core/directory.js';
import { DIR_PATTERNS, OPENPACKAGE_DIRS } from '../constants/index.js';
import { normalizePackageName, SCOPED_PACKAGE_REGEX } from './package-name.js';

/**
 * Package scope types
 * - root: Current directory (cwd) as a package
 * - local: Workspace-scoped package in .openpackage/packages/
 * - global: User-scoped package in ~/.openpackage/packages/
 */
export type PackageScope = 'root' | 'local' | 'global';

/**
 * Get the package directory for a given scope
 * 
 * @param cwd - Current working directory
 * @param scope - Package scope
 * @param packageName - Package name (required for local/global, ignored for root)
 * @param customPath - Optional custom path (overrides scope-based resolution)
 * @returns Absolute path to package directory
 */
export function getScopePackageDir(
  cwd: string,
  scope: PackageScope,
  packageName?: string,
  customPath?: string
): string {
  // Custom path takes precedence over scope
  if (customPath) {
    // Note: This is a simple delegation - full validation happens elsewhere
    // This function just returns the path for consistency with the API
    return customPath;
  }

  if (scope === 'root') {
    // Root scope: current directory is the package
    return cwd;
  }

  if (!packageName) {
    throw new Error(`Package name is required for ${scope} scope`);
  }

  const normalizedName = normalizePackageName(packageName);

  if (scope === 'local') {
    // Local scope: .openpackage/packages/<name>/
    return getScopedPackagePath(
      join(cwd, DIR_PATTERNS.OPENPACKAGE, OPENPACKAGE_DIRS.PACKAGES),
      normalizedName
    );
  }

  if (scope === 'global') {
    // Global scope: ~/.openpackage/packages/<name>/
    const dirs = getOpenPackageDirectories();
    return getScopedPackagePath(
      join(dirs.data, OPENPACKAGE_DIRS.PACKAGES),
      normalizedName
    );
  }

  throw new Error(`Invalid scope: ${scope}`);
}

/**
 * Get the openpackage.yml path for a given scope
 * 
 * @param cwd - Current working directory
 * @param scope - Package scope
 * @param packageName - Package name (required for local/global, ignored for root)
 * @param customPath - Optional custom path (overrides scope-based resolution)
 * @returns Absolute path to openpackage.yml
 */
export function getScopePackageYmlPath(
  cwd: string,
  scope: PackageScope,
  packageName?: string,
  customPath?: string
): string {
  const packageDir = getScopePackageDir(cwd, scope, packageName, customPath);
  return join(packageDir, 'openpackage.yml');
}

/**
 * Validate that package name is provided when required by scope
 * Returns true if package name is required but missing (needs prompt in interactive mode)
 * Throws error only in non-interactive mode when name is required but missing
 * 
 * @param scope - Package scope
 * @param packageName - Package name (optional)
 * @param interactive - Whether running in interactive mode
 * @returns true if name is required but missing (prompt needed)
 */
export function validateScopeWithPackageName(
  scope: PackageScope,
  packageName: string | undefined,
  interactive: boolean = true
): boolean {
  // Package name is optional - will prompt in interactive mode or use defaults
  if (packageName) {
    return false; // Has name, no prompt needed
  }

  // In interactive mode, always allow prompting for name
  if (interactive) {
    return true; // Will prompt for name
  }

  // In non-interactive mode without name, only root scope can use cwd basename
  if (scope === 'root') {
    return false; // Will use cwd basename
  }

  // Non-interactive mode requires name for local/global scopes
  throw new Error(
    `Package name is required for ${scope} scope in non-interactive mode.\n` +
    `Usage: opkg new <package-name> --scope ${scope} --non-interactive`
  );
}

/**
 * Get a human-readable description of the scope
 * 
 * @param scope - Package scope
 * @returns Description string
 */
export function getScopeDescription(scope: PackageScope): string {
  switch (scope) {
    case 'root':
      return 'Current directory (root package)';
    case 'local':
      return 'Workspace-local (.openpackage/packages/)';
    case 'global':
      return 'Global shared (~/.openpackage/packages/)';
    default:
      return 'Unknown scope';
  }
}

/**
 * Get the relative display path for a scope
 * Used in CLI output to show where package will be created
 * 
 * @param scope - Package scope
 * @param packageName - Package name (optional)
 * @param customPath - Optional custom path for display
 * @returns Display path string
 */
export function getScopeDisplayPath(
  scope: PackageScope,
  packageName?: string,
  customPath?: string
): string {
  if (customPath) {
    return customPath;
  }

  if (scope === 'root') {
    return './openpackage.yml';
  }

  if (!packageName) {
    return scope === 'local'
      ? './.openpackage/packages/<package-name>/'
      : '~/.openpackage/packages/<package-name>/';
  }

  const normalizedName = normalizePackageName(packageName);
  return scope === 'local'
    ? `./.openpackage/packages/${normalizedName}/`
    : `~/.openpackage/packages/${normalizedName}/`;
}

/**
 * Parse and validate scope option from CLI
 * 
 * @param scopeValue - Raw scope value from CLI option
 * @returns Validated PackageScope
 */
export function parseScope(scopeValue: string): PackageScope {
  const normalized = scopeValue.toLowerCase().trim();

  if (normalized === 'root' || normalized === 'r') {
    return 'root';
  }

  if (normalized === 'local' || normalized === 'l') {
    return 'local';
  }

  if (normalized === 'global' || normalized === 'g') {
    return 'global';
  }

  throw new Error(
    `Invalid scope: '${scopeValue}'\n` +
    `Valid scopes: root, local, global`
  );
}

/**
 * Helper to get the package path handling scoped packages (@scope/name)
 * Scoped packages get nested directory structure: @scope/name/
 */
function getScopedPackagePath(baseDir: string, packageName: string): string {
  const scopedMatch = packageName.match(SCOPED_PACKAGE_REGEX);
  if (scopedMatch) {
    const [, scope, localName] = scopedMatch;
    return join(baseDir, '@' + scope, localName);
  }
  return join(baseDir, packageName);
}
