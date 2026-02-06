import { Command } from 'commander';

import { withErrorHandling } from '../utils/errors.js';
import { runSavePipeline, type SavePipelineOptions, type SavePipelineResult } from '../core/save/save-pipeline.js';
import { formatPathForDisplay } from '../utils/formatters.js';

/**
 * Display save operation results
 */
function displaySaveResults(data: SavePipelineResult): void {
  const cwd = process.cwd();
  const { packageName, packagePath, filesSaved, savedFiles } = data;

  if (filesSaved === 0) {
    console.log(`✓ No changes to save for ${packageName}`);
    console.log(`  Source: ${formatPathForDisplay(packagePath, cwd)}`);
    return;
  }

  console.log(`✓ Updated ${filesSaved} file(s) in ${packageName}`);
  console.log(`  Source: ${formatPathForDisplay(packagePath, cwd)}`);

  // Display saved files
  const sortedFiles = [...savedFiles].sort((a, b) => a.localeCompare(b));
  for (const file of sortedFiles) {
    console.log(`   ├── ${file}`);
  }

  // Show hint about syncing to workspace
  console.log(`💡 Changes saved to package source.`);
  console.log(`   To sync changes to workspace, run:`);
  console.log(`     opkg install ${packageName}`);
}

export function setupSaveCommand(program: Command): void {
  program
    .command('save')
    .argument('<package-name>', 'package name to save workspace changes to')
    .description('Save workspace edits back to mutable package source')
    .action(
      withErrorHandling(async (packageName: string, options: SavePipelineOptions) => {
        const result = await runSavePipeline(packageName, options);
        if (!result.success) {
          throw new Error(result.error || 'Save operation failed');
        }

        // Display results
        if (result.data) {
          displaySaveResults(result.data);
        }
      })
    );
}
