import { Command } from 'commander';

import { UninstallOptions } from '../types/index.js';
import { withErrorHandling, ValidationError } from '../utils/errors.js';
import { runUninstallPipeline } from '../core/uninstall/uninstall-pipeline.js';
import { validatePackageName } from '../utils/package-name.js';

async function uninstallPackageCommand(
  packageName: string,
  options: UninstallOptions
) {
  validatePackageName(packageName);
  const result = await runUninstallPipeline(packageName, options);
  if (!result.success) {
    throw new ValidationError(result.error || 'Uninstall failed');
  }

  console.log(`✓ Uninstalled ${packageName}`);
  console.log(`✓ Removed files: ${result.data?.removedFiles.length ?? 0}`);
  if (result.data?.rootFilesUpdated.length) {
    console.log(`✓ Updated root files:`);
    result.data.rootFilesUpdated.forEach(f => console.log(` - ${f}`));
  }
}

export function setupUninstallCommand(program: Command): void {
  program
    .command('uninstall')
    .alias('un')
    .description('Remove installed package files')
    .argument('<package-name>', 'name of the package to uninstall')
    .option('--dry-run', 'preview changes without applying them')
    .action(withErrorHandling(async (packageName: string, options: UninstallOptions) => {
      await uninstallPackageCommand(packageName, options);
    }));
}
