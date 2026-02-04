import { formatPathForDisplay } from '../../utils/formatters.js';

export interface UninstallResult {
  packageName: string;
  removedFiles: string[];
  rootFilesUpdated: string[];
}

/**
 * Report uninstall results to console
 */
export function reportUninstallResult(result: UninstallResult): void {
  console.log(`✓ Uninstalled ${result.packageName}`);
  
  if (result.removedFiles.length > 0) {
    console.log(`✓ Removed files: ${result.removedFiles.length}`);
    const sortedFiles = [...result.removedFiles].sort((a, b) => a.localeCompare(b));
    for (const file of sortedFiles) {
      console.log(`   ├── ${formatPathForDisplay(file)}`);
    }
  }
  
  if (result.rootFilesUpdated.length > 0) {
    console.log(`✓ Updated root files: ${result.rootFilesUpdated.length}`);
    const sortedFiles = [...result.rootFilesUpdated].sort((a, b) => a.localeCompare(b));
    for (const file of sortedFiles) {
      console.log(`   ├── ${formatPathForDisplay(file)} (updated)`);
    }
  }
}
