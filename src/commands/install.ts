/**
 * Install Command
 * 
 * CLI definition only - all orchestration logic is in the orchestrator module.
 */
import { Command } from 'commander';
import type { CommandResult, InstallOptions } from '../types/index.js';
import { withErrorHandling } from '../utils/errors.js';
import { createOrchestrator } from '../core/install/orchestrator/index.js';
import { normalizeInstallOptions } from '../core/install/preprocessing/index.js';

/**
 * Setup install command
 */
export function setupInstallCommand(program: Command): void {
  program
    .command('install')
    .alias('i')
    .description('Install packages to workspace')
    .argument(
      '[package-name]',
      'name of the package to install (optional - installs workspace-level files and all packages from openpackage.yml if not specified). ' +
      'Supports package@version syntax.'
    )
    .option('--dry-run', 'preview changes without applying them')
    .option('--force', 'overwrite existing files')
    .option('--conflicts <strategy>', 'conflict handling strategy: keep-both, overwrite, skip, or ask')
    .option('--dev', 'add package to dev-dependencies instead of dependencies')
    .option('--platforms <platforms...>', 'prepare specific platforms (e.g., cursor claudecode opencode)')
    .option('--remote', 'pull and install from remote registry, ignoring local versions')
    .option('--local', 'resolve and install using only local registry versions, skipping remote metadata and pulls')
    .option('--profile <profile>', 'profile to use for authentication')
    .option('--api-key <key>', 'API key for authentication (overrides profile)')
    .option('--plugins <names...>', 'install specific plugins from marketplace (bypasses interactive selection)')
    .option('--agents <names...>', 'install specific agents by name (matches frontmatter name or filename)')
    .option('--skills <names...>', 'install specific skills by name (matches SKILL.md frontmatter name or directory name)')
    .action(withErrorHandling(async (
      packageName: string | undefined, 
      options: InstallOptions & { 
        agents?: string[]; 
        skills?: string[];
        conflicts?: string;
      }
    ) => {
      const cwd = process.cwd();
      
      // Normalize all options at CLI boundary
      const normalizedOptions = normalizeInstallOptions(options);
      
      // Create and execute orchestrator
      const orchestrator = createOrchestrator();
      const result = await orchestrator.execute(packageName, normalizedOptions, cwd);
      
      // Handle result
      if (!result.success) {
        if (result.error === 'Package not found') {
          return; // Already displayed message
        }
        throw new Error(result.error || 'Installation operation failed');
      }
    }));
}
