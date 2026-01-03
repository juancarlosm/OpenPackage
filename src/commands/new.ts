import { Command } from 'commander';
import { withErrorHandling } from '../utils/errors.js';
import { createPackage } from '../core/package-creation.js';
import { parseScope, validateScopeWithPackageName, type PackageScope } from '../utils/scope-resolution.js';
import { promptPackageScope, promptCustomPath } from '../utils/prompts.js';
import { logger } from '../utils/logger.js';

/**
 * Command options for 'opkg new'
 */
interface NewCommandOptions {
  scope?: string;
  path?: string;
  force?: boolean;
  nonInteractive?: boolean;
}

/**
 * Setup the 'opkg new' command
 * 
 * This command creates a new package with scope support:
 * - root: Create openpackage.yml in current directory
 * - local: Create in .openpackage/packages/<name>/ (default)
 * - global: Create in ~/.openpackage/packages/<name>/
 * - custom: Create at a user-specified path
 */
export function setupNewCommand(program: Command): void {
  program
    .command('new')
    .argument('[package-name]', 'package name (optional - will prompt if not provided in interactive mode)')
    .description('Create a new package with manifest')
    .option('--scope <scope>', 'package scope: root, local, or global')
    .option('--path <path>', 'custom path for package directory (overrides scope)')
    .option('-f, --force', 'overwrite existing package without confirmation')
    .option('--non-interactive', 'skip interactive prompts, use defaults')
    .action(withErrorHandling(async (packageName?: string, options?: NewCommandOptions) => {
      const cwd = process.cwd();

      const isInteractive = !options?.nonInteractive;

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
      } else if (isInteractive) {
        // Interactive mode without --scope or --path: prompt user to choose
        const scopeOrCustom = await promptPackageScope();
        
        if (scopeOrCustom === 'custom') {
          // User selected custom path - prompt for it
          customPath = await promptCustomPath(packageName);
        } else {
          // User selected a predefined scope
          scope = scopeOrCustom as PackageScope;
        }
        
        console.log(); // Add blank line after prompt for better formatting
      } else {
        // Non-interactive mode without --scope or --path: error
        throw new Error(
          'Either --scope or --path is required in non-interactive mode.\n\n' +
          'Usage with scope:\n' +
          '  opkg new [package-name] --scope <root|local|global> --non-interactive\n\n' +
          'Usage with custom path:\n' +
          '  opkg new [package-name] --path <directory> --non-interactive\n\n' +
          'Available scopes:\n' +
          '  root   - Create in current directory\n' +
          '  local  - Create in .openpackage/packages/\n' +
          '  global - Create in ~/.openpackage/packages/'
        );
      }

      // Validate scope and package name combination (skip for custom paths)
      if (scope && !customPath) {
        try {
          validateScopeWithPackageName(scope, packageName, isInteractive);
        } catch (error) {
          throw new Error(error instanceof Error ? error.message : String(error));
        }
      }

      logger.debug('Creating new package', {
        scope,
        customPath,
        packageName,
        force: options?.force,
        interactive: isInteractive
      });

      // Create the package
      const result = await createPackage({
        cwd,
        scope,
        customPath,
        packageName,
        force: options?.force || false,
        interactive: !options?.nonInteractive
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
