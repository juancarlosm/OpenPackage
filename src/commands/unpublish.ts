import { ValidationError, PackageNotFoundError, UserCancellationError } from '../utils/errors.js';
import { runUnpublishPipeline } from '../core/unpublish/unpublish-pipeline.js';
import type { UnpublishOptions } from '../core/unpublish/unpublish-types.js';
import { 
  listAllPackages, 
  listPackageVersions, 
  getPackageVersionPath,
  findPackageByName 
} from '../core/directory.js';
import { getDirectorySize, countFilesInDirectory } from '../utils/fs.js';
import { formatFileSize, formatFileCount } from '../utils/formatters.js';
import { normalizePackageName } from '../utils/package-name.js';
import { createCliExecutionContext } from '../cli/context.js';
import { resolveOutput, resolvePrompt } from '../core/ports/resolve.js';
import type { OutputPort } from '../core/ports/output.js';
import type { PromptPort } from '../core/ports/prompt.js';

interface UnpublishCommandOptions extends UnpublishOptions {
  interactive?: boolean;
}

/**
 * Format package choice for selection list
 */
function formatPackageChoice(name: string, versionCount: number): string {
  const plural = versionCount !== 1 ? 's' : '';
  return `${name} (${versionCount} version${plural})`;
}

/**
 * Format version choice for selection list
 */
function formatVersionChoice(
  version: string, 
  fileCount: number, 
  size: number
): string {
  return `${version} (${formatFileCount(fileCount)}, ${formatFileSize(size)})`;
}

/**
 * Interactive package selection from registry
 * Returns selected package name or null if cancelled/empty
 */
async function selectPackageFromList(out: OutputPort, prm: PromptPort): Promise<string | null> {
  const packages = await listAllPackages();
  
  if (packages.length === 0) {
    return null;
  }
  
  // Build choices with version counts
  const choices = await Promise.all(
    packages.map(async (name) => {
      const versions = await listPackageVersions(name);
      return {
        title: formatPackageChoice(name, versions.length),
        value: name
      };
    })
  );
  
  out.info(`${packages.length} package${packages.length === 1 ? '' : 's'} in local registry`);
  
  const result = await prm.select(
    'Select package to unpublish:',
    choices
  );
  
  return result || null;
}

/**
 * Interactive version selection for a package
 * Returns array of selected version strings
 */
async function selectVersionsFromPackage(
  packageName: string,
  out: OutputPort,
  prm: PromptPort
): Promise<string[]> {
  const versions = await listPackageVersions(packageName);
  
  if (versions.length === 0) {
    return [];
  }
  
  // Build choices with file count and size metadata
  const choices = await Promise.all(
    versions.map(async (version) => {
      const versionPath = getPackageVersionPath(packageName, version);
      const fileCount = await countFilesInDirectory(versionPath);
      const size = await getDirectorySize(versionPath);
      
      return {
        title: formatVersionChoice(version, fileCount, size),
        value: version
      };
    })
  );
  
  out.info(`${versions.length} version${versions.length === 1 ? '' : 's'} available`);
  
  const result = await prm.multiselect(
    `Select versions of '${packageName}' to unpublish:`,
    choices,
    { min: 1 }
  );
  
  return result || [];
}

/**
 * Handle interactive unpublish with --interactive option
 * Note: --interactive automatically implies --local mode
 */
async function handleListUnpublish(
  packageSpec: string | undefined,
  options: UnpublishCommandOptions,
  out: OutputPort,
  prm: PromptPort
): Promise<void> {
  // --interactive always operates on local registry (no validation needed)
  // The --local flag is auto-implied by the action handler
  
  let selectedPackage: string | null = null;
  
  // Step 1: Determine package (either from spec or interactive selection)
  if (packageSpec) {
    // Package specified - validate it exists
    const normalizedName = normalizePackageName(packageSpec);
    const exists = await findPackageByName(normalizedName);
    
    if (!exists) {
      throw new PackageNotFoundError(normalizedName);
    }
    
    selectedPackage = exists;
  } else {
    // No package specified - show interactive package selector
    selectedPackage = await selectPackageFromList(out, prm);
    
    if (!selectedPackage) {
      out.info('No packages found in local registry.');
      return;
    }
  }
  
  // Step 2: Select versions to unpublish
  const selectedVersions = await selectVersionsFromPackage(selectedPackage, out, prm);
  
  if (selectedVersions.length === 0) {
    out.info('No versions selected. Unpublish cancelled.');
    return;
  }
  
  // Step 3: Show summary
  const versionLines = selectedVersions.map(v => `  ${selectedPackage}@${v}`).join('\n');
  out.step(`Selected ${selectedVersions.length} version${selectedVersions.length === 1 ? '' : 's'} to unpublish:\n${versionLines}`);
  
  // Step 4: Final confirmation (unless --force)
  if (!options.force) {
    const confirmed = await prm.confirm(
      'This will delete the selected versions from the local registry. Continue?',
      false
    );
    
    if (!confirmed) {
      out.info('Unpublish cancelled.');
      return;
    }
  }
  
  // Step 5: Process each version
  for (const version of selectedVersions) {
    const packageSpecWithVersion = `${selectedPackage}@${version}`;
    
    try {
      const result = await runUnpublishPipeline(packageSpecWithVersion, {
        ...options,
        force: true  // Already confirmed, skip individual prompts
      });
      
      if (!result.success) {
        out.error(`Failed to unpublish ${packageSpecWithVersion}: ${result.error}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      out.error(`Failed to unpublish ${packageSpecWithVersion}: ${message}`);
    }
  }
}

export async function setupUnpublishCommand(args: any[]): Promise<void> {
  const [packageSpec, options] = args as [string | undefined, UnpublishCommandOptions];
  const ctx = await createCliExecutionContext();
  const out = resolveOutput(ctx);
  const prm = resolvePrompt(ctx);

  // Handle interactive mode
  if (options.interactive) {
    // Auto-imply --local when --interactive is used (interactive only works with local registry)
    options.local = true;
    await handleListUnpublish(packageSpec, options, out, prm);
    return;
  }
  
  // Validate package spec is provided for non-list mode
  if (!packageSpec) {
    throw new Error('Package specification is required. Usage: opkg unpublish <package[@version]> or use --interactive for interactive selection');
  }
  
  // Run unpublish pipeline (routes to local or remote)
  const result = await runUnpublishPipeline(packageSpec, options);
  if (!result.success) {
    throw new Error(result.error || 'Unpublish operation failed');
  }
}
