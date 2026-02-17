import { Command } from 'commander';

import { withErrorHandling } from '../utils/errors.js';
import { runRemoveFromSourcePipeline, type RemoveFromSourceOptions } from '../core/remove/remove-from-source-pipeline.js';
import { readWorkspaceIndex } from '../utils/workspace-index-yml.js';
import { formatPathForDisplay } from '../utils/formatters.js';
import { interactiveFileSelect } from '../utils/interactive-file-selector.js';
import { expandDirectorySelections, hasDirectorySelections, countSelectionTypes } from '../utils/expand-directory-selections.js';
import { interactivePackageSelect, resolvePackageSelection } from '../utils/interactive-package-selector.js';
import { createExecutionContext } from '../core/execution-context.js';
import { createInteractionPolicy, PromptTier } from '../core/interaction-policy.js';
import type { ExecutionContext } from '../types/execution-context.js';
import { getLocalPackageDir } from '../utils/paths.js';

export function setupRemoveCommand(program: Command): void {
  program
    .command('remove')
    .alias('rm')
    .argument('[path]', 'file or directory to remove. If omitted, shows interactive file selector.')
    .description('Remove files from a mutable package source or workspace package')
    .option('--from <package-name>', 'source package name (defaults to workspace package)')
    .option('--force', 'Skip confirmation prompts')
    .option('--dry-run', 'Preview what would be removed without actually deleting')
    .action(
      withErrorHandling(async (pathArg: string | undefined, options: RemoveFromSourceOptions & { from?: string }, command: Command) => {
        const cwd = process.cwd();
        const programOpts = command.parent?.opts() || {};

        const execContext = await createExecutionContext({
          global: false,
          cwd: programOpts.cwd,
        });

        const policy = createInteractionPolicy({
          interactive: !pathArg,
          force: options.force,
        });
        execContext.interactionPolicy = policy;

        // If no path argument provided, show interactive selector
        if (!pathArg) {
          if (!policy.canPrompt(PromptTier.OptionalMenu)) {
            throw new Error(
              '<path> argument is required in non-interactive mode.\n' +
              'Usage: opkg remove <path> [options]\n\n' +
              'Examples:\n' +
              '  opkg remove file.txt                        # Remove from workspace package\n' +
              '  opkg remove file.txt --from package-name    # Remove from specific package\n' +
              '  opkg remove                                 # Interactive mode (TTY only)'
            );
          }
          
          // Step 1: Select package (if not specified via --from)
          let selectedPackage: string | null = null;
          let packageDir: string;
          
          if (options.from) {
            // Package specified via --from option
            selectedPackage = options.from;
            // Get package directory (will be validated later by pipeline)
            packageDir = getLocalPackageDir(cwd, options.from);
          } else {
            // Show interactive package selector
            const selection = await interactivePackageSelect({
              cwd,
              message: 'Select package to remove files from',
              allowWorkspace: true
            });
            
            if (!selection) {
              return;
            }
            
            const resolved = resolvePackageSelection(cwd, selection);
            if (!resolved) {
              return;
            }
            
            selectedPackage = resolved.packageName;
            packageDir = resolved.packageDir;
          }
          
          // Step 2: Select files from package
          const packageLabel = selectedPackage || 'workspace package';
          const selectedFiles = await interactiveFileSelect({
            cwd,
            basePath: packageDir,
            message: `Select files or directories to remove from ${packageLabel}`,
            placeholder: 'Type to search...',
            includeDirs: true
          });
          
          // Handle cancellation or empty selection
          if (!selectedFiles || selectedFiles.length === 0) {
            return;
          }
          
          // Expand any directory selections to individual files
          let filesToProcess: string[];
          if (hasDirectorySelections(selectedFiles)) {
            const counts = countSelectionTypes(selectedFiles);
            console.log(`\nExpanding ${counts.dirs} director${counts.dirs === 1 ? 'y' : 'ies'} and ${counts.files} file${counts.files === 1 ? '' : 's'}...`);
            filesToProcess = await expandDirectorySelections(selectedFiles, packageDir);
            console.log(`Found ${filesToProcess.length} total file${filesToProcess.length === 1 ? '' : 's'} to remove`);
          } else {
            filesToProcess = selectedFiles;
          }
          
          // Step 3: Process each selected file sequentially
          console.log(); // Add spacing before results
          for (let i = 0; i < filesToProcess.length; i++) {
            const file = filesToProcess[i];
            
            // Show progress for multiple files
            if (filesToProcess.length > 1) {
              console.log(`\n[${i + 1}/${filesToProcess.length}] Processing: ${file}`);
            }
            
            try {
              await processRemoveResource(selectedPackage ?? undefined, file, options, cwd, execContext);
            } catch (error) {
              console.error(`✗ Failed to remove ${file}: ${error}`);
              // Continue with remaining files
            }
          }
          
          return;
        }
        
        // Process single path argument (existing behavior)
        await processRemoveResource(options.from, pathArg, options, cwd, execContext);
      })
    );
}

/**
 * Process a single resource removal through the remove pipeline
 */
async function processRemoveResource(
  packageName: string | undefined,
  pathArg: string,
  options: RemoveFromSourceOptions & { from?: string },
  cwd: string,
  execContext: ExecutionContext
): Promise<void> {
  const result = await runRemoveFromSourcePipeline(packageName, pathArg, { ...options, execContext });
  if (!result.success) {
    throw new Error(result.error || 'Remove operation failed');
  }
  
  // Provide helpful feedback
  if (result.data) {
    const { filesRemoved, sourcePath, sourceType, packageName: resolvedName, removedPaths } = result.data;
    
    // Format the path for display using unified formatter
    const displayPath = formatPathForDisplay(sourcePath, cwd);
    
    // Determine if this is a workspace root removal
    const isWorkspaceRoot = displayPath.includes('.openpackage') && !displayPath.includes('.openpackage/packages');
    
    if (options.dryRun) {
      if (isWorkspaceRoot) {
        console.log(`\n(dry-run) Would remove ${filesRemoved} file${filesRemoved !== 1 ? 's' : ''} from workspace package`);
      } else {
        console.log(`\n(dry-run) Would remove ${filesRemoved} file${filesRemoved !== 1 ? 's' : ''} from ${resolvedName}`);
      }
    } else {
      if (isWorkspaceRoot) {
        console.log(`\n✓ Removed ${filesRemoved} file${filesRemoved !== 1 ? 's' : ''} from workspace package`);
      } else {
        console.log(`\n✓ Removed ${filesRemoved} file${filesRemoved !== 1 ? 's' : ''} from ${resolvedName}`);
      }
    }
    
    console.log(`  Path: ${displayPath}`);
    console.log(`  Type: ${sourceType} package`);
    
    // Show removed files (limited display)
    if (removedPaths.length > 0) {
      const maxDisplay = 10;
      console.log(`\nFiles ${options.dryRun ? 'to be removed' : 'removed'}:`);
      
      const displayPaths = removedPaths.slice(0, maxDisplay);
      for (const path of displayPaths) {
        console.log(`  - ${path}`);
      }
      
      if (removedPaths.length > maxDisplay) {
        console.log(`  ... and ${removedPaths.length - maxDisplay} more`);
      }
    }
    
    if (!options.dryRun && !isWorkspaceRoot) {
      // Check if package is installed in workspace
      const workspaceIndexRecord = await readWorkspaceIndex(cwd);
      const isInstalled = !!workspaceIndexRecord.index.packages[resolvedName];
      
      if (isInstalled) {
        console.log(`\n💡 Deletions not synced to workspace.`);
        console.log(`   To sync deletions, run:`);
        console.log(`     opkg install ${resolvedName}`);
      } else {
        console.log(`\n💡 Package not installed in workspace.`);
        console.log(`   If you install this package later, the removed files won't be included.`);
      }
    }
  }
}
