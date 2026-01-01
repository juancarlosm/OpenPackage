import { ValidationError } from './errors.js';
import { PackageDependency } from '../types/index.js';

/**
 * Regex pattern for scoped package names (@scope/name)
 */
export const SCOPED_PACKAGE_REGEX = /^@([^\/]+)\/(.+)$/;

/**
 * Validate package name according to naming rules
 * @param name - The package name to validate
 * @throws ValidationError if the name is invalid
 */
export function validatePackageName(name: string): void {
  // Check length
  if (name.length === 0) {
    throw new ValidationError('Package name cannot be empty');
  }
  
  if (name.length > 214) {
    throw new ValidationError(`Package name '${name}' is too long (max 214 characters)`);
  }

  // Check for leading/trailing spaces
  if (name.trim() !== name) {
    throw new ValidationError(`Package name '${name}' cannot have leading or trailing spaces`);
  }

  // Check if it's a scoped name (@scope/name format)
  const scopedMatch = name.match(SCOPED_PACKAGE_REGEX);
  if (scopedMatch) {
    const [, scope, localName] = scopedMatch;

    // Validate scope part
    validatePackageNamePart(scope, name, 'scope');

    // Validate local name part
    validatePackageNamePart(localName, name, 'name');

    return;
  }

  // Validate as regular name
  validatePackageNamePart(name, name, 'package');
}

/**
 * Validate a package name part (scope or local name)
 * @param part - The part to validate
 * @param fullName - The full original name for error messages
 * @param partType - The type of part being validated (for better error messages)
 * @throws ValidationError if the part is invalid
 */
function validatePackageNamePart(part: string, fullName: string, partType: string): void {
  // Check for uppercase letters first (most common issue)
  if (/[A-Z]/.test(part)) {
    throw new ValidationError(`Package name '${fullName}' must be lowercase`);
  }

  // Check first character
  if (/^[0-9.\-]/.test(part)) {
    throw new ValidationError(`Package ${partType} '${fullName}' cannot start with a number, dot, or hyphen`);
  }

  // Check for consecutive special characters
  if (/(\.\.|__|--)/.test(part)) {
    throw new ValidationError(`Package name '${fullName}' cannot have consecutive dots, underscores, or hyphens`);
  }

  // Check allowed characters only
  if (!/^[a-z0-9._-]+$/.test(part)) {
    throw new ValidationError(`Package name '${fullName}' contains invalid characters (use only: a-z, 0-9, ., _, -)`);
  }
}

/**
 * Parse package input supporting both scoped names (@scope/name) and version specifications (name@version)
 * Returns normalized name and optional version
 */
export function parsePackageInput(packageInput: string): { name: string; version?: string } {
  // Package name with optional version
  const atIndex = packageInput.lastIndexOf('@');

  if (atIndex === -1 || atIndex === 0) {
    validatePackageName(packageInput);
    return {
      name: normalizePackageName(packageInput)
    };
  }

  const name = packageInput.substring(0, atIndex);
  const version = packageInput.substring(atIndex + 1);

  if (!name || !version) {
    throw new ValidationError(`Invalid package syntax: ${packageInput}. Use 'package' or 'package@version'`);
  }

  validatePackageName(name);

  return {
    name: normalizePackageName(name),
    version
  };
}

/**
 * Parse an install spec that may include a registry-relative path:
 *   - name/path
 *   - name@version/path
 * Returns { name, version?, registryPath? }
 */
export function parsePackageInstallSpec(
  raw: string
): { name: string; version?: string; registryPath?: string } {
  const firstSlash = raw.indexOf('/', raw.startsWith('@') ? raw.indexOf('/', 1) + 1 : 0);
  if (firstSlash === -1) {
    // No path portion; fall back to standard parsing
    return parsePackageInput(raw);
  }

  const packagePortion = raw.slice(0, firstSlash);
  const registryPath = raw.slice(firstSlash + 1);
  if (!registryPath) {
    throw new ValidationError(
      `Invalid install spec '${raw}'. Provide a registry path after the package name, e.g. package/path/to/file.md.`
    );
  }

  const { name, version } = parsePackageInput(packagePortion);
  return { name, version, registryPath };
}

/**
 * Parse a push spec that may include a registry-relative path (same format as install):
 *   - name/path
 *   - name@version/path
 * Returns { name, version?, registryPath? }
 */
export function parsePackagePushSpec(
  raw: string
): { name: string; version?: string; registryPath?: string } {
  return parsePackageInstallSpec(raw);
}

/**
 * Normalize a package name to lowercase, handling scoped names properly.
 * Scoped names like @Scope/Name become @scope/name.
 * Regular names like MyPackage become mypackage.
 */
export function normalizePackageName(name: string): string {
  return name.toLowerCase();
}


/**
 * Check if two package names are equivalent (case-insensitive).
 */
export function arePackageNamesEquivalent(name1: string, name2: string): boolean {
  return normalizePackageName(name1) === normalizePackageName(name2);
}