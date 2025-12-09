import { Command } from 'commander';
import { CommandResult, PullOptions } from '../types/index.js';
import { withErrorHandling } from '../utils/errors.js';
import { parsePathsOption } from '../core/pull/pull-options.js';
import { runPullPipeline } from '../core/pull/pull-pipeline.js';

async function pullPackageCommand(
  packageInput: string,
  options: PullOptions
): Promise<CommandResult> {
  return runPullPipeline(packageInput, options);
}

export function setupPullCommand(program: Command): void {
  program
    .command('pull')
    .description('Pull a package from remote registry. Supports package@version syntax.')
    .argument('<package-name>', 'name of the package to pull. Supports package@version syntax.')
    .option('--profile <profile>', 'profile to use for authentication')
    .option('--api-key <key>', 'API key for authentication (overrides profile)')
    .option('--recursive', 'include dependency metadata (no additional downloads)')
    .option('--paths <list>', 'comma-separated registry paths for partial pull', parsePathsOption)
    .action(withErrorHandling(async (packageName: string, options: PullOptions) => {
      const result = await pullPackageCommand(packageName, options);
      if (!result.success) {
        throw new Error(result.error || 'Pull operation failed');
      }
    }));
}
