import { Command } from 'commander';
import prompts from 'prompts';

import type { UninstallOptions, ExecutionContext } from '../types/index.js';
import { withErrorHandling, ValidationError, UserCancellationError } from '../utils/errors.js';
import { runUninstallPipeline } from '../core/uninstall/uninstall-pipeline.js';
import { reportUninstallResult } from '../core/uninstall/uninstall-reporter.js';
import { createExecutionContext } from '../core/execution-context.js';
import { readWorkspaceIndex } from '../utils/workspace-index-yml.js';
import { isRootPackage } from '../utils/paths.js';

interface UninstallCommandOptions extends UninstallOptions {
  list?: boolean;
}

async function uninstallPackageCommand(
  packageName: string | undefined,
  options: UninstallCommandOptions,
  command: Command
) {
  const programOpts = command.parent?.opts() || {};
  
  const execContext = await createExecutionContext({
    global: options.global,
    cwd: programOpts.cwd
  });

  if (options.list) {
    await handleListUninstall(options, execContext);
    return;
  }

  if (!packageName) {
    throw new ValidationError('Package name is required. Use --list to interactively select packages to uninstall.');
  }
  
  const result = await runUninstallPipeline(packageName, options, execContext);
  if (!result.success) {
    throw new ValidationError(result.error || 'Uninstall failed');
  }

  reportUninstallResult({
    packageName,
    removedFiles: result.data?.removedFiles ?? [],
    rootFilesUpdated: result.data?.rootFilesUpdated ?? []
  });
}

async function handleListUninstall(
  options: UninstallCommandOptions,
  execContext: ExecutionContext
) {
  const targetDir = execContext.targetDir;
  const { index } = await readWorkspaceIndex(targetDir);
  const allPackageNames = Object.keys(index.packages || {}).sort();

  // Filter out the workspace package itself
  const packageNames: string[] = [];
  for (const pkgName of allPackageNames) {
    if (await isRootPackage(targetDir, pkgName)) {
      continue;
    }
    packageNames.push(pkgName);
  }

  if (packageNames.length === 0) {
    console.log('No installed packages found.');
    return;
  }

  console.log(`  ${packageNames.length} installed package${packageNames.length === 1 ? '' : 's'}\n`);

  const choices = packageNames.map(name => {
    const pkg = index.packages[name];
    const files = Object.keys(pkg.files || {});
    const versionSuffix = pkg.version && pkg.version !== '0.0.0' ? ` (v${pkg.version})` : '';
    
    let description: string;
    
    if (files.length === 0) {
      description = '(dependency, no files)';
    } else if (files.length === 1) {
      description = files[0];
    } else {
      // Show up to 5 files, then indicate if there are more
      const displayFiles = files.slice(0, 5);
      const remainingCount = files.length - displayFiles.length;
      
      description = displayFiles.join('\n');
      if (remainingCount > 0) {
        description += `\n(+${remainingCount} more)`;
      }
    }
    
    return {
      title: `${name}${versionSuffix}`,
      value: name,
      description
    };
  });

  let selected: string[];
  try {
    const response = await prompts(
      {
        type: 'multiselect',
        name: 'packages',
        message: 'Select packages to uninstall:',
        choices,
        hint: '- Space: select/deselect \u2022 Enter: confirm',
        min: 1,
        instructions: false
      },
      {
        onCancel: () => {
          throw new UserCancellationError('Operation cancelled by user');
        }
      }
    );

    selected = response.packages || [];
  } catch (error) {
    if (error instanceof UserCancellationError) {
      console.log('Uninstall cancelled.');
      return;
    }
    throw error;
  }

  if (selected.length === 0) {
    console.log('No packages selected. Uninstall cancelled.');
    return;
  }

  console.log(`\n\u2713 Selected ${selected.length} package${selected.length === 1 ? '' : 's'} to uninstall:`);
  for (const name of selected) {
    console.log(`  \u2022 ${name}`);
  }
  console.log('');

  for (const packageName of selected) {
    const result = await runUninstallPipeline(packageName, options, execContext);
    if (!result.success) {
      throw new ValidationError(result.error || `Uninstall failed for ${packageName}`);
    }

    reportUninstallResult({
      packageName,
      removedFiles: result.data?.removedFiles ?? [],
      rootFilesUpdated: result.data?.rootFilesUpdated ?? []
    });
  }
}

export function setupUninstallCommand(program: Command): void {
  program
    .command('uninstall')
    .alias('un')
    .description('Remove installed package files')
    .argument('[resource-spec]', 'name of the resource to uninstall')
    .option('-g, --global', 'uninstall from home directory (~/) instead of current workspace')
    .option('--dry-run', 'preview changes without applying them')
    .option('-l, --list', 'interactively select installed packages to uninstall')
    .action(withErrorHandling(async (packageName: string | undefined, options: UninstallCommandOptions, command: Command) => {
      await uninstallPackageCommand(packageName, options, command);
    }));
}
