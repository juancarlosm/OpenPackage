import { Command } from 'commander';

import { UninstallOptions } from '../types/index.js';
import { withErrorHandling, ValidationError } from '../utils/errors.js';
import { runUninstallPipeline } from '../core/uninstall/uninstall-pipeline.js';
import { formatPathForDisplay } from '../utils/formatters.js';
import { createExecutionContext } from '../core/execution-context.js';

async function uninstallPackageCommand(
  packageName: string,
  options: UninstallOptions,
  command: Command
) {
  // Get program-level options (for --cwd)
  const programOpts = command.parent?.opts() || {};
  
  // Create execution context
  const execContext = await createExecutionContext({
    global: options.global,
    cwd: programOpts.cwd
  });
  
  // Run uninstall pipeline with execution context
  const result = await runUninstallPipeline(packageName, options, execContext);
  if (!result.success) {
    throw new ValidationError(result.error || 'Uninstall failed');
  }

  console.log(`✓ Uninstalled ${packageName}`);
  
  const removedFiles = result.data?.removedFiles ?? [];
  const rootFilesUpdated = result.data?.rootFilesUpdated ?? [];
  
  if (removedFiles.length > 0) {
    console.log(`✓ Removed files: ${removedFiles.length}`);
    const sortedFiles = [...removedFiles].sort((a, b) => a.localeCompare(b));
    for (const file of sortedFiles) {
      console.log(`   ├── ${formatPathForDisplay(file)}`);
    }
  }
  
  if (rootFilesUpdated.length > 0) {
    console.log(`✓ Updated root files: ${rootFilesUpdated.length}`);
    const sortedFiles = [...rootFilesUpdated].sort((a, b) => a.localeCompare(b));
    for (const file of sortedFiles) {
      console.log(`   ├── ${formatPathForDisplay(file)} (updated)`);
    }
  }
}

export function setupUninstallCommand(program: Command): void {
  program
    .command('uninstall')
    .alias('un')
    .description('Remove installed package files')
    .argument('<package-name>', 'name of the package to uninstall')
    .option('-g, --global', 'uninstall from home directory (~/) instead of current workspace')
    .option('--dry-run', 'preview changes without applying them')
    .action(withErrorHandling(async (packageName: string, options: UninstallOptions, command: Command) => {
      await uninstallPackageCommand(packageName, options, command);
    }));
}
