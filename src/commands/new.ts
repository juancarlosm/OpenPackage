import { Command } from 'commander';
import { withErrorHandling } from '../utils/errors.js';
import { createPackage } from '../core/package-creation.js';
import { parseScope, validateScopeWithPackageName, type PackageScope } from '../utils/scope-resolution.js';
import { promptPackageName } from '../utils/prompts.js';
import { logger } from '../utils/logger.js';

/**
 * Command options for 'opkg new'
 */
interface NewCommandOptions {
  scope?: string;
  path?: string;
  force?: boolean;
}

/**
 * Setup the 'opkg new' command
 * 
 * This command creates a new package with scope support:
 * - root: Create openpackage.yml in current directory
 * - local: Create in .openpackage/packages/<name>/
 * - global: Create in ~/.openpackage/packages/<name>/ (default)
 * - custom: Create at a user-specified path
 * 
 * Creates a minimal package with only the name field set.
 * Use 'opkg set' to configure additional metadata (description, keywords, etc.)
 */
export function setupNewCommand(program: Command): void {
  program
    .command('new')
    .argument('[package-name]', 'package name (will prompt if not provided)')
    .description('Create a new package with minimal manifest (use "opkg set" to configure metadata)')
    .option('--scope <scope>', 'package scope: root, local, or global (default: global)')
    .option('--path <path>', 'custom path for package directory (overrides scope)')
    .option('-f, --force', 'overwrite existing package without confirmation')
    .action(withErrorHandling(async (packageName?: string, options?: NewCommandOptions) => {
      const cwd = process.cwd();

      // Parse and validate scope or custom path
      let scope: PackageScope | undefined;
      let customPath: string | undefined;
      
      if (options?.path) {
        // Custom path explicitly provided via flag
        customPath = options.path;
        
        // Warn if --scope is also provided
        if (options?.scope) {
          logger.warn('--scope is ignored when --path is specified');
        }
      } else if (options?.scope) {
        // Scope explicitly provided via flag
        try {
          scope = parseScope(options.scope);
        } catch (error) {
          throw new Error(error instanceof Error ? error.message : String(error));
        }
      } else {
        // No scope or path provided: default to global
        scope = 'global';
      }

      // Prompt for package name if not provided
      if (!packageName) {
        packageName = await promptPackageName();
      }

      // Validate scope and package name combination (skip for custom paths)
      if (scope && !customPath) {
        try {
          validateScopeWithPackageName(scope, packageName, false);
        } catch (error) {
          throw new Error(error instanceof Error ? error.message : String(error));
        }
      }

      logger.debug('Creating new package', {
        scope,
        customPath,
        packageName,
        force: options?.force,
        interactive: false
      });

      // Create the package (non-interactive mode)
      const result = await createPackage({
        cwd,
        scope,
        customPath,
        packageName,
        force: options?.force || false,
        interactive: false
      });

      if (!result.success) {
        throw new Error(result.error || 'Package creation failed');
      }

      // Get the actual package name from the result context
      const actualPackageName = result.context?.name || packageName;

      // Additional success messaging based on scope or custom path
      if (customPath) {
        console.log(`\n💡 Next steps:`);
        console.log(`   1. Add files to your package at: ${customPath}`);
        console.log(`   2. Install to workspace: opkg install ${customPath}`);
      } else if (scope === 'local') {
        console.log(`\n💡 Next steps:`);
        console.log(`   1. Add files to your package: cd .openpackage/packages/${actualPackageName}/`);
        console.log(`   2. Install to this workspace: opkg install ${actualPackageName}`);
      } else if (scope === 'global') {
        console.log(`\n💡 Next steps:`);
        console.log(`   1. Add files to your package: cd ~/.openpackage/packages/${actualPackageName}/`);
        console.log(`   2. Install to any workspace: opkg install ${actualPackageName}`);
      } else if (scope === 'root') {
        console.log(`\n💡 Next steps:`);
        console.log(`   1. Add files to your package in current directory`);
        console.log(`   2. Install to other workspaces: opkg install ${actualPackageName}`);
      }
    }));
}
