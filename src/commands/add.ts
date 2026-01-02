import { Command } from 'commander';

import { withErrorHandling } from '../utils/errors.js';
import { runAddToSourcePipeline, type AddToSourceOptions } from '../core/add/add-to-source-pipeline.js';
import { readWorkspaceIndex } from '../utils/workspace-index-yml.js';
import { formatPathForDisplay } from '../utils/formatters.js';

export function setupAddCommand(program: Command): void {
  program
    .command('add')
    .argument('<package-name>', 'package name')
    .argument('<path>', 'file or directory to add')
    .description('Add files to a mutable package source')
    .option('--platform-specific', 'Save platform-specific variants for platform subdir inputs')
    .option('--apply', 'Apply changes to workspace immediately (requires package to be installed)')
    .action(
      withErrorHandling(async (packageName: string | undefined, pathArg: string | undefined, options: AddToSourceOptions) => {
        const result = await runAddToSourcePipeline(packageName, pathArg, options);
        if (!result.success) {
          throw new Error(result.error || 'Add operation failed');
        }
        
        // Provide helpful feedback
        if (result.data) {
          const cwd = process.cwd();
          const { filesAdded, sourcePath, sourceType, packageName: resolvedName } = result.data;
          
          // Format the path for display using unified formatter
          const displayPath = formatPathForDisplay(sourcePath, cwd);
          
          console.log(`\n✓ Added ${filesAdded} file${filesAdded !== 1 ? 's' : ''} to ${resolvedName}`);
          console.log(`  Path: ${displayPath}`);
          console.log(`  Type: ${sourceType} package`);
          
          if (!options.apply) {
            // Check if package is installed in workspace
            const workspaceIndexRecord = await readWorkspaceIndex(cwd);
            const isInstalled = !!workspaceIndexRecord.index.packages[resolvedName];
            
            if (isInstalled) {
              console.log(`\n💡 Changes not synced to workspace.`);
              console.log(`   To sync changes, run:`);
              console.log(`     opkg apply ${resolvedName}`);
            } else {
              console.log(`\n💡 Package not installed in workspace.`);
              console.log(`   To install and sync, run:`);
              console.log(`     opkg install ${resolvedName}`);
            }
          }
        }
      })
    );
}
