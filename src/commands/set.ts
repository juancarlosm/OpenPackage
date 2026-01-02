/**
 * @fileoverview Command setup for 'opkg set'
 * 
 * Updates manifest fields in openpackage.yml for mutable packages.
 */

import { Command } from 'commander';
import { withErrorHandling } from '../utils/errors.js';
import { runSetPipeline } from '../core/set/set-pipeline.js';
import type { SetCommandOptions } from '../core/set/set-types.js';

/**
 * Setup the 'opkg set' command
 */
export function setupSetCommand(program: Command): void {
  program
    .command('set')
    .argument('[package]', 'package name or path (optional if cwd is a package)')
    .description('Update package manifest fields')
    .option('--ver <version>', 'set package version (must be valid semver)')
    .option('--name <name>', 'set package name')
    .option('--description <desc>', 'set description')
    .option('--keywords <keywords>', 'set keywords (space-separated)')
    .option('--author <author>', 'set author')
    .option('--license <license>', 'set license')
    .option('--homepage <url>', 'set homepage URL')
    .option('--private', 'mark as private package')
    .option('-f, --force', 'skip confirmation prompts')
    .option('--non-interactive', 'require flags, no prompting (for CI/CD)')
    .action(
      withErrorHandling(async (packageInput: string | undefined, options: SetCommandOptions) => {
        const result = await runSetPipeline(packageInput, options);
        if (!result.success) {
          throw new Error(result.error || 'Set operation failed');
        }
      })
    );
}
