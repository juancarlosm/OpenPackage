import { basename, relative } from 'path';
import type { PackageYml } from '../types/index.js';
import type { PackageScope } from '../utils/scope-resolution.js';
import {
  getScopePackageDir,
  getScopePackageYmlPath,
  getScopeDisplayPath,
  getScopeDescription
} from '../utils/scope-resolution.js';
import { parsePackageYml, writePackageYml } from '../utils/package-yml.js';
import { promptPackageDetails, promptPackageDetailsForNamed } from '../utils/prompts.js';
import { logger } from '../utils/logger.js';
import { displayPackageConfig } from '../utils/formatters.js';
import { UserCancellationError } from '../utils/errors.js';
import { exists, ensureDir } from '../utils/fs.js';
import { normalizePackageName, validatePackageName } from '../utils/package-name.js';
import { createWorkspacePackageYml, addPackageToYml } from '../utils/package-management.js';
import type { PackageContext } from './package-context.js';

/**
 * Options for creating a new package
 */
export interface CreatePackageOptions {
  /** Current working directory */
  cwd: string;

  /** Package scope (root, local, or global) */
  scope: PackageScope;

  /** Package name (optional for root scope, required for local/global) */
  packageName?: string;

  /** Force overwrite existing package */
  force?: boolean;

  /** Enable interactive prompts for package details */
  interactive?: boolean;

  /** Add to workspace manifest (only applies to local scope) */
  addToWorkspace?: boolean;
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
 * - Workspace manifest integration (for local scope)
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
    packageName,
    force = false,
    interactive = true,
    addToWorkspace = true
  } = options;

  try {
    // Step 1: Determine initial package name
    let normalizedName: string;
    let displayName: string;
    let nameFromPrompt = false;

    if (!packageName) {
      // No name provided - will prompt or use default
      if (!interactive && scope !== 'root') {
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
    let packageDir = getScopePackageDir(cwd, scope, scope === 'root' ? undefined : normalizedName);
    let packageYmlPath = getScopePackageYmlPath(cwd, scope, scope === 'root' ? undefined : normalizedName);
    const displayPath = getScopeDisplayPath(scope, scope === 'root' ? undefined : normalizedName);

    logger.info(`Creating ${scope} package '${normalizedName}' at: ${packageDir}`);

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
        const testPackageDir = getScopePackageDir(cwd, scope, scope === 'root' ? undefined : name);
        const testPackageYmlPath = getScopePackageYmlPath(cwd, scope, scope === 'root' ? undefined : name);
        return await exists(testPackageYmlPath);
      };

      // Prompt for full details including name (with existence validation)
      packageConfig = await promptPackageDetails(displayName, force ? undefined : existsChecker);
      normalizedName = normalizePackageName(packageConfig.name);
      
      // Update paths with the actual name from prompt (might be different from default)
      packageDir = getScopePackageDir(cwd, scope, scope === 'root' ? undefined : normalizedName);
      packageYmlPath = getScopePackageYmlPath(cwd, scope, scope === 'root' ? undefined : normalizedName);
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

    // Step 8: Add to workspace manifest (for local scope only)
    if (scope === 'local' && addToWorkspace) {
      try {
        // Ensure workspace manifest exists
        await createWorkspacePackageYml(cwd, false);

        // Add package to workspace dependencies with path reference
        const relativePath = `./.openpackage/packages/${normalizedName}/`;
        await addPackageToYml(
          cwd,
          normalizedName,
          packageConfig.version,
          false, // isDev
          undefined, // originalVersion
          true, // silent
          undefined, // include
          relativePath // path
        );

        console.log(`✓ Added to workspace manifest with path: ${relativePath}`);
        logger.info(`Added package to workspace manifest: ${normalizedName}`);
      } catch (error) {
        logger.warn(`Failed to add package to workspace manifest: ${error}`);
        console.log(`⚠️  Package created but not added to workspace manifest`);
      }
    }

    // Step 9: Show scope info
    console.log(`\n📍 Scope: ${getScopeDescription(scope)}`);
    if (scope === 'global') {
      console.log(`💡 This package can be used across all workspaces`);
    } else if (scope === 'local') {
      console.log(`💡 This package is local to the current workspace`);
    }

    // Step 10: Return success with context
    return {
      success: true,
      context: {
        name: normalizedName,
        version: packageConfig.version,
        config: packageConfig,
        packageYmlPath,
        packageRootDir: packageDir,
        packageFilesDir: packageDir,
        location: scope === 'root' ? 'root' : 'nested',
        isCwdPackage: scope === 'root',
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
