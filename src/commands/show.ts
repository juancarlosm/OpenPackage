/**
 * @fileoverview Show command implementation
 * 
 * Displays detailed information about a package from any source.
 * Supports package names, paths, git URLs, and tarballs.
 */

import { Command } from 'commander';
import { withErrorHandling } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { runShowPipeline } from '../core/show/show-pipeline.js';

/**
 * Show package details command
 */
async function showPackageCommand(packageInput: string): Promise<void> {
  logger.debug('Show command invoked', { packageInput });

  const cwd = process.cwd();
  const result = await runShowPipeline(packageInput, cwd);

  if (!result.success) {
    throw new Error(result.error || 'Show operation failed');
  }
}

/**
 * Setup the show command
 */
export function setupShowCommand(program: Command): void {
  program
    .command('show')
    .description('Show package details')
    .argument('<package>', 'package name, path, git URL, or tarball')
    .action(withErrorHandling(async (packageInput: string) => {
      await showPackageCommand(packageInput);
    }));
}
