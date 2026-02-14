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

export interface ResourceUninstallResult {
  resourceName: string;
  resourceType: string;
  packageName?: string;
  removedFiles: string[];
  rootFilesUpdated: string[];
}

/**
 * Report resource-level uninstall results to console
 */
export function reportResourceUninstallResult(result: ResourceUninstallResult): void {
  const fromPkg = result.packageName ? ` from ${result.packageName}` : '';
  console.log(`✓ Removed ${result.resourceType} "${result.resourceName}"${fromPkg} (${result.removedFiles.length} file${result.removedFiles.length === 1 ? '' : 's'})`);
  
  const sortedFiles = [...result.removedFiles].sort((a, b) => a.localeCompare(b));
  for (const file of sortedFiles) {
    console.log(`  - ${formatPathForDisplay(file)}`);
  }
  
  if (result.rootFilesUpdated.length > 0) {
    for (const file of result.rootFilesUpdated) {
      console.log(`  - ${formatPathForDisplay(file)} (updated)`);
    }
  }
}
