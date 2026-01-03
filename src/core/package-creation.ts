import { basename } from 'path';
import type { PackageYml } from '../types/index.js';
import type { PackageScope } from '../utils/scope-resolution.js';
import {
  getScopePackageDir,
  getScopePackageYmlPath,
  getScopeDisplayPath,
  getScopeDescription
} from '../utils/scope-resolution.js';
import {
  resolveCustomPath,
  validateCustomPath,
  formatCustomPathForDisplay
} from '../utils/custom-path-resolution.js';
import { parsePackageYml, writePackageYml } from '../utils/package-yml.js';
import { promptPackageDetails, promptPackageDetailsForNamed } from '../utils/prompts.js';
import { logger } from '../utils/logger.js';
import { displayPackageConfig } from '../utils/formatters.js';
import { UserCancellationError } from '../utils/errors.js';
import { exists, ensureDir } from '../utils/fs.js';
import { normalizePackageName, validatePackageName } from '../utils/package-name.js';
import type { PackageContext } from './package-context.js';

/**
 * Options for creating a new package
 */
export interface CreatePackageOptions {
  /** Current working directory */
  cwd: string;

  /** Package scope (root, local, or global) - optional when customPath is provided */
  scope?: PackageScope;

  /** Custom directory path for package - overrides scope-based resolution */
  customPath?: string;

  /** Package name (optional for root scope, required for local/global) */
  packageName?: string;

  /** Force overwrite existing package */
  force?: boolean;

  /** Enable interactive prompts for package details */
  interactive?: boolean;
}

/**
 * Result of package creation
 */
export interface CreatePackageResult {
  /** Whether the operation was successful */
  success: boolean;

  /** Package context if successful */
  context?: PackageContext;

  /** Error message if unsuccessful */
  error?: string;

  /** Whether the package already existed (and was kept/overwritten) */
  wasExisting?: boolean;
}

/**
 * Create a new package with the specified scope and options
 * 
 * This is the core package creation logic that handles:
 * - Validation of package name and scope
 * - Conflict detection with existing packages
 * - Interactive prompts for package metadata
 * - Directory structure creation
 * - openpackage.yml writing
 * 
 * @param options - Package creation options
 * @returns Result containing success status and package context
 */
export async function createPackage(
  options: CreatePackageOptions
): Promise<CreatePackageResult> {
  const {
    cwd,
    scope,
    customPath,
    packageName,
    force = false,
    interactive = true
  } = options;

  try {
    // Validate that either scope or customPath is provided
    if (!scope && !customPath) {
      return {
        success: false,
        error: 'Either scope or customPath must be provided'
      };
    }

    // Step 1: Determine initial package name
    let normalizedName: string;
    let displayName: string;
    let nameFromPrompt = false;

    if (!packageName) {
      // No name provided - will prompt or use default
      if (!interactive && scope && scope !== 'root' && !customPath) {
        return {
          success: false,
          error: `Package name is required for ${scope} scope in non-interactive mode.\nUsage: opkg new <package-name> --scope ${scope} --non-interactive`
        };
      }
      // Use cwd basename as default (will be prompted for in interactive mode)
      displayName = basename(cwd);
      normalizedName = normalizePackageName(displayName);
      nameFromPrompt = interactive; // Will prompt for name if interactive
    } else {
      // Package name provided
      validatePackageName(packageName);
      normalizedName = normalizePackageName(packageName);
      displayName = packageName;
    }

    // Step 2: Resolve target paths
    let packageDir: string;
    let packageYmlPath: string;
    let displayPath: string;
    let isCustomPath = false;

    if (customPath) {
      // Custom path provided - resolve and validate
      const resolved = resolveCustomPath(customPath, cwd);
      
      // Validate custom path
      const validation = await validateCustomPath(resolved, force);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error
        };
      }
      
      // Log warning if present
      if (validation.warning) {
        logger.warn(validation.warning);
      }
      
      packageDir = resolved.absolute;
      packageYmlPath = resolved.packageYmlPath;
      displayPath = formatCustomPathForDisplay(resolved, cwd);
      isCustomPath = true;
      
      logger.info(`Creating package '${normalizedName}' at custom path: ${packageDir}`);
    } else if (scope) {
      // Scope-based path resolution (existing logic)
      packageDir = getScopePackageDir(cwd, scope, scope === 'root' ? undefined : normalizedName);
      packageYmlPath = getScopePackageYmlPath(cwd, scope, scope === 'root' ? undefined : normalizedName);
      displayPath = getScopeDisplayPath(scope, scope === 'root' ? undefined : normalizedName);
      
      logger.info(`Creating ${scope} package '${normalizedName}' at: ${packageDir}`);
    } else {
      return {
        success: false,
        error: 'Either scope or customPath must be provided'
      };
    }

    // Step 3: Check for existing package
    const existingYml = await exists(packageYmlPath);
    let existingConfig: PackageYml | null = null;

    if (existingYml) {
      try {
        existingConfig = await parsePackageYml(packageYmlPath);
      } catch (error) {
        logger.warn(`Failed to parse existing openpackage.yml: ${error}`);
      }

      if (!force) {
        const errorMsg = existingConfig 
          ? `Package '${normalizedName}' already exists at ${displayPath}. Use --force to overwrite.`
          : `Package already exists at ${displayPath}. Use --force to overwrite.`;
        
        return {
          success: false,
          error: errorMsg,
          wasExisting: true
        };
      }

      logger.info(`Overwriting existing package at ${displayPath} (--force enabled)`);
    }

    // Step 4: Prompt for package details or use defaults (before creating any directories)
    let packageConfig: PackageYml;

    if (interactive && nameFromPrompt) {
      // Create a checker function that validates package doesn't already exist
      const existsChecker = async (name: string): Promise<boolean> => {
        if (isCustomPath) {
          // For custom paths, we can't pre-validate by name since path is fixed
          // Validation already happened in Step 2
          return false;
        }
        
        const testPackageDir = getScopePackageDir(cwd, scope!, scope === 'root' ? undefined : name);
        const testPackageYmlPath = getScopePackageYmlPath(cwd, scope!, scope === 'root' ? undefined : name);
        return await exists(testPackageYmlPath);
      };

      // Prompt for full details including name (with existence validation)
      packageConfig = await promptPackageDetails(displayName, force ? undefined : existsChecker);
      normalizedName = normalizePackageName(packageConfig.name);
      
      // Update paths with the actual name from prompt (might be different from default)
      // But only for scope-based paths, not custom paths
      if (!isCustomPath && scope) {
        packageDir = getScopePackageDir(cwd, scope, scope === 'root' ? undefined : normalizedName);
        packageYmlPath = getScopePackageYmlPath(cwd, scope, scope === 'root' ? undefined : normalizedName);
      }
    } else if (interactive) {
      // Prompt for details with pre-set name
      packageConfig = await promptPackageDetailsForNamed(normalizedName);
    } else {
      // Non-interactive: use minimal config
      packageConfig = {
        name: normalizedName
      };
    }

    // Step 5: Ensure directory structure (only after all prompts are confirmed)
    await ensureDir(packageDir);
    logger.debug(`Created package directory: ${packageDir}`);

    // Step 6: Write openpackage.yml
    await writePackageYml(packageYmlPath, packageConfig);
    logger.info(`Created openpackage.yml at ${packageYmlPath}`);

    // Step 7: Display success message
    displayPackageConfig(packageConfig, packageYmlPath, false);

    // Step 8: Show scope info
    if (isCustomPath) {
      console.log(`\n📍 Location: Custom path (${displayPath})`);
      console.log(`💡 This package is at a custom location you specified`);
    } else if (scope) {
      console.log(`\n📍 Scope: ${getScopeDescription(scope)}`);
      if (scope === 'global') {
        console.log(`💡 This package can be used across all workspaces`);
      } else if (scope === 'local') {
        console.log(`💡 This package is local to the current workspace`);
      }
    }

    // Step 9: Return success with context
    return {
      success: true,
      context: {
        name: normalizedName,
        version: packageConfig.version,
        config: packageConfig,
        packageYmlPath,
        packageRootDir: packageDir,
        packageFilesDir: packageDir,
        location: (isCustomPath || (scope && scope === 'root')) ? 'root' : 'nested',
        isCwdPackage: !isCustomPath && scope === 'root',
        isNew: !existingYml
      },
      wasExisting: existingYml
    };

  } catch (error) {
    if (error instanceof UserCancellationError) {
      throw error;
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to create package`, { error: errorMessage, scope, packageName });

    return {
      success: false,
      error: `Failed to create package: ${errorMessage}`
    };
  }
}
