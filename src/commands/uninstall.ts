import path from 'path';
import { Command } from 'commander';
import prompts from 'prompts';

import type { UninstallOptions, ExecutionContext } from '../types/index.js';
import { withErrorHandling, ValidationError, UserCancellationError } from '../utils/errors.js';
import { runUninstallPipeline, runSelectiveUninstallPipeline } from '../core/uninstall/uninstall-pipeline.js';
import { reportUninstallResult, reportResourceUninstallResult } from '../core/uninstall/uninstall-reporter.js';
import { createExecutionContext } from '../core/execution-context.js';
import { getHomeDirectory } from '../utils/home-directory.js';
import { remove, exists } from '../utils/fs.js';
import { buildWorkspaceResources, type ResolvedResource, type ResolvedPackage } from '../core/uninstall/resource-builder.js';
import { resolveByName, type ResolutionCandidate } from '../core/uninstall/resource-resolver.js';
import { buildPreservedDirectoriesSet } from '../utils/directory-preservation.js';
import { logger } from '../utils/logger.js';

interface UninstallCommandOptions extends UninstallOptions {
  list?: boolean;
}

async function uninstallCommand(
  nameArg: string | undefined,
  options: UninstallCommandOptions,
  command: Command
) {
  const programOpts = command.parent?.opts() || {};

  if (options.list) {
    await handleListUninstall(nameArg, options, programOpts);
    return;
  }

  if (!nameArg) {
    throw new ValidationError('Resource or package name is required. Use --list to interactively select.');
  }

  await handleDirectUninstall(nameArg, options, programOpts);
}

// ---------------------------------------------------------------------------
// Direct uninstall: opkg un <name>
// ---------------------------------------------------------------------------

async function handleDirectUninstall(
  name: string,
  options: UninstallCommandOptions,
  programOpts: Record<string, any>
) {
  // Collect candidates across applicable scopes
  const candidates: ResolutionCandidate[] = [];
  const showProject = !options.global;
  const showGlobal = true; // always include global scope

  if (showProject) {
    try {
      const projectCtx = await createExecutionContext({ global: false, cwd: programOpts.cwd });
      const projectResult = await resolveByName(name, projectCtx.targetDir, 'project');
      candidates.push(...projectResult.candidates);
    } catch (error) {
      logger.debug(`Project scope resolution skipped: ${error}`);
    }
  }

  if (showGlobal) {
    try {
      const globalCtx = await createExecutionContext({ global: true, cwd: programOpts.cwd });
      const globalResult = await resolveByName(name, globalCtx.targetDir, 'global');
      candidates.push(...globalResult.candidates);
    } catch (error) {
      logger.debug(`Global scope resolution skipped: ${error}`);
    }
  }

  if (candidates.length === 0) {
    throw new ValidationError(
      `"${name}" not found as a resource or package.\n` +
      `Run \`opkg ls\` to see installed resources.`
    );
  }

  // Single match — proceed directly
  if (candidates.length === 1) {
    const ctx = await createExecutionContext({
      global: candidates[0].resource?.scope === 'global' || candidates[0].package?.scope === 'global',
      cwd: programOpts.cwd
    });
    await executeCandidate(candidates[0], options, ctx);
    return;
  }

  // Multiple matches — prompt for disambiguation
  const choices = candidates.map((c, i) => ({
    title: formatCandidateTitle(c),
    description: formatCandidateDescription(c),
    value: i
  }));

  console.log(`\n"${name}" matches multiple items:\n`);

  let selected: number[];
  try {
    const response = await prompts(
      {
        type: 'multiselect',
        name: 'items',
        message: 'Select which to uninstall:',
        choices,
        hint: '- Space: select/deselect • Enter: confirm',
        min: 1,
        instructions: false
      },
      {
        onCancel: () => {
          throw new UserCancellationError('Operation cancelled by user');
        }
      }
    );

    selected = response.items || [];
  } catch (error) {
    if (error instanceof UserCancellationError) {
      console.log('Uninstall cancelled.');
      return;
    }
    throw error;
  }

  if (selected.length === 0) {
    console.log('No items selected. Uninstall cancelled.');
    return;
  }

  for (const idx of selected) {
    const candidate = candidates[idx];
    const ctx = await createExecutionContext({
      global: candidate.resource?.scope === 'global' || candidate.package?.scope === 'global',
      cwd: programOpts.cwd
    });
    await executeCandidate(candidate, options, ctx);
  }
}

// ---------------------------------------------------------------------------
// Interactive list: opkg un --list [package-name]
// ---------------------------------------------------------------------------

async function handleListUninstall(
  packageFilter: string | undefined,
  options: UninstallCommandOptions,
  programOpts: Record<string, any>
) {
  // Build resources from applicable scopes
  const allResources: ResolvedResource[] = [];
  const allPackages: ResolvedPackage[] = [];
  const showProject = !options.global;
  const showGlobal = true;

  if (showProject) {
    try {
      const projectCtx = await createExecutionContext({ global: false, cwd: programOpts.cwd });
      const projectData = await buildWorkspaceResources(projectCtx.targetDir, 'project');
      allResources.push(...projectData.resources);
      allPackages.push(...projectData.packages);
    } catch (error) {
      logger.debug(`Project scope scan skipped: ${error}`);
    }
  }

  if (showGlobal) {
    try {
      const globalCtx = await createExecutionContext({ global: true, cwd: programOpts.cwd });
      const globalData = await buildWorkspaceResources(globalCtx.targetDir, 'global');
      allResources.push(...globalData.resources);
      allPackages.push(...globalData.packages);
    } catch (error) {
      logger.debug(`Global scope scan skipped: ${error}`);
    }
  }

  // Filter to specific package if provided
  let filteredResources = allResources;
  let filteredPackages = allPackages;
  if (packageFilter) {
    filteredResources = allResources.filter(r => r.packageName === packageFilter);
    filteredPackages = allPackages.filter(p => p.packageName === packageFilter);

    if (filteredResources.length === 0 && filteredPackages.length === 0) {
      throw new ValidationError(`Package '${packageFilter}' not found.`);
    }
  }

  // Only show packages with 2+ resources in the packages section
  // (single-resource packages are fully represented by their resource entry)
  const multiResourcePackages = filteredPackages.filter(p => p.resourceCount >= 2);

  if (filteredResources.length === 0 && multiResourcePackages.length === 0) {
    console.log('No installed resources found.');
    return;
  }

  const totalItems = multiResourcePackages.length + filteredResources.length;
  console.log(`  ${totalItems} item${totalItems === 1 ? '' : 's'}\n`);

  // Build choices with section headers
  type ChoiceValue = { kind: 'resource'; resource: ResolvedResource } | { kind: 'package'; pkg: ResolvedPackage };
  const choices: Array<{ title: string; value?: ChoiceValue; description?: string; disabled?: boolean }> = [];

  // Packages section
  if (multiResourcePackages.length > 0) {
    choices.push({ title: '── packages ──', disabled: true });
    for (const pkg of multiResourcePackages) {
      const versionSuffix = pkg.version && pkg.version !== '0.0.0' ? ` (v${pkg.version})` : '';
      const scopeTag = formatScopeTag(pkg.scope);
      choices.push({
        title: `${pkg.packageName}${versionSuffix} (${pkg.resourceCount} resources)${scopeTag}`,
        value: { kind: 'package', pkg },
        description: formatFileListDescription(pkg.targetFiles)
      });
    }
  }

  // Resources section
  if (filteredResources.length > 0) {
    choices.push({ title: '── resources ──', disabled: true });
    for (const resource of filteredResources) {
      const typeLabel = resource.resourceType;
      const fromPkg = resource.packageName && !packageFilter
        ? `, from ${resource.packageName}`
        : '';
      const scopeTag = formatScopeTag(resource.scope);
      choices.push({
        title: `${resource.resourceName} (${typeLabel}${fromPkg})${scopeTag}`,
        value: { kind: 'resource', resource },
        description: formatFileListDescription(resource.targetFiles)
      });
    }
  }

  let selected: ChoiceValue[];
  try {
    const response = await prompts(
      {
        type: 'multiselect',
        name: 'items',
        message: 'Select items to uninstall:',
        choices: choices as any,
        hint: '- Space: select/deselect • Enter: confirm',
        min: 1,
        instructions: false
      },
      {
        onCancel: () => {
          throw new UserCancellationError('Operation cancelled by user');
        }
      }
    );

    selected = response.items || [];
  } catch (error) {
    if (error instanceof UserCancellationError) {
      console.log('Uninstall cancelled.');
      return;
    }
    throw error;
  }

  if (selected.length === 0) {
    console.log('No items selected. Uninstall cancelled.');
    return;
  }

  // Deduplicate: if a package is selected, skip its individual resources
  const selectedPackageNames = new Set(
    selected.filter(s => s.kind === 'package').map(s => s.pkg!.packageName)
  );
  const deduplicatedSelections = selected.filter(s => {
    if (s.kind === 'resource' && s.resource!.packageName && selectedPackageNames.has(s.resource!.packageName)) {
      return false;
    }
    return true;
  });

  if (deduplicatedSelections.length < selected.length) {
    const skipped = selected.length - deduplicatedSelections.length;
    console.log(`  (${skipped} individual resource${skipped === 1 ? '' : 's'} skipped — package selected)\n`);
  }

  for (const selection of deduplicatedSelections) {
    const candidate: ResolutionCandidate = selection.kind === 'package'
      ? { kind: 'package', package: selection.pkg }
      : { kind: 'resource', resource: selection.resource };
    const ctx = await createExecutionContext({
      global: (selection.kind === 'package' ? selection.pkg!.scope : selection.resource!.scope) === 'global',
      cwd: programOpts.cwd
    });
    await executeCandidate(candidate, options, ctx);
  }
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

async function executeCandidate(
  candidate: ResolutionCandidate,
  options: UninstallOptions,
  execContext: ExecutionContext
): Promise<void> {
  if (candidate.kind === 'package') {
    const pkg = candidate.package!;
    const result = await runUninstallPipeline(pkg.packageName, options, execContext);
    if (!result.success) {
      throw new ValidationError(result.error || `Uninstall failed for ${pkg.packageName}`);
    }
    reportUninstallResult({
      packageName: pkg.packageName,
      removedFiles: result.data?.removedFiles ?? [],
      rootFilesUpdated: result.data?.rootFilesUpdated ?? []
    });
    return;
  }

  const resource = candidate.resource!;

  if (resource.kind === 'tracked') {
    // Selective uninstall from package via source keys
    const result = await runSelectiveUninstallPipeline(
      resource.packageName!,
      resource.sourceKeys,
      options,
      execContext
    );
    if (!result.success) {
      throw new ValidationError(result.error || `Uninstall failed for ${resource.resourceName}`);
    }
    reportResourceUninstallResult({
      resourceName: resource.resourceName,
      resourceType: resource.resourceType,
      packageName: resource.packageName,
      removedFiles: result.data?.removedFiles ?? [],
      rootFilesUpdated: result.data?.rootFilesUpdated ?? []
    });
    return;
  }

  // Untracked resource — direct file deletion
  const targetDir = execContext.targetDir;
  const removedFiles: string[] = [];

  for (const filePath of resource.targetFiles) {
    const absPath = path.join(targetDir, filePath);
    if (options.dryRun) {
      console.log(`(dry-run) Would remove: ${filePath}`);
      removedFiles.push(filePath);
    } else if (await exists(absPath)) {
      await remove(absPath);
      removedFiles.push(filePath);
    }
  }

  // Cleanup empty parent directories
  if (!options.dryRun && removedFiles.length > 0) {
    const preservedDirs = buildPreservedDirectoriesSet(targetDir);
    // Import and reuse cleanupEmptyParents would be ideal but it's not exported;
    // handle inline for simplicity
    for (const filePath of removedFiles) {
      let dir = path.dirname(path.join(targetDir, filePath));
      while (dir !== targetDir && dir.startsWith(targetDir)) {
        if (preservedDirs.has(dir)) break;
        try {
          const { readdir } = await import('fs/promises');
          const entries = await readdir(dir);
          if (entries.length === 0) {
            await remove(dir);
            logger.debug(`Removed empty directory: ${path.relative(targetDir, dir)}`);
          } else {
            break;
          }
        } catch {
          break;
        }
        dir = path.dirname(dir);
      }
    }
  }

  reportResourceUninstallResult({
    resourceName: resource.resourceName,
    resourceType: resource.resourceType,
    removedFiles,
    rootFilesUpdated: []
  });
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatCandidateTitle(candidate: ResolutionCandidate): string {
  if (candidate.kind === 'package') {
    const pkg = candidate.package!;
    const version = pkg.version && pkg.version !== '0.0.0' ? ` (v${pkg.version})` : '';
    const scopeTag = formatScopeTag(pkg.scope);
    return `${pkg.packageName}${version} (package, ${pkg.resourceCount} resources)${scopeTag}`;
  }
  const r = candidate.resource!;
  const fromPkg = r.packageName ? `, from ${r.packageName}` : '';
  const scopeTag = formatScopeTag(r.scope);
  return `${r.resourceName} (${r.resourceType}${fromPkg})${scopeTag}`;
}

function formatCandidateDescription(candidate: ResolutionCandidate): string {
  const files = candidate.kind === 'package'
    ? candidate.package!.targetFiles
    : candidate.resource!.targetFiles;
  return formatFileListDescription(files);
}

function formatFileListDescription(files: string[]): string {
  if (files.length === 0) return '(no files)';
  const displayFiles = files.slice(0, 5);
  const remaining = files.length - displayFiles.length;
  let desc = displayFiles.join('\n');
  if (remaining > 0) {
    desc += `\n(+${remaining} more)`;
  }
  return desc;
}

function formatScopeTag(scope: string): string {
  return scope === 'global' ? ' [g]' : ' [p]';
}

// ---------------------------------------------------------------------------
// Command setup
// ---------------------------------------------------------------------------

export function setupUninstallCommand(program: Command): void {
  program
    .command('uninstall')
    .alias('un')
    .description('Remove installed resources or packages')
    .argument('[resource-spec]', 'name of the resource or package to uninstall')
    .option('-g, --global', 'uninstall from home directory (~/) instead of current workspace')
    .option('--dry-run', 'preview changes without applying them')
    .option('-l, --list', 'interactively select items to uninstall')
    .action(withErrorHandling(async (nameArg: string | undefined, options: UninstallCommandOptions, command: Command) => {
      await uninstallCommand(nameArg, options, command);
    }));
}
