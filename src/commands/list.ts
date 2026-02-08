import { Command } from 'commander';

import { CommandResult, type ExecutionContext } from '../types/index.js';
import { withErrorHandling, ValidationError } from '../utils/errors.js';
import { runListPipeline, type ListPackageReport, type ListTreeNode, type ListPipelineResult } from '../core/list/list-pipeline.js';
import { logger } from '../utils/logger.js';
import { parsePackageYml } from '../utils/package-yml.js';
import { getLocalPackageYmlPath } from '../utils/paths.js';
import { createExecutionContext, getDisplayTargetDir } from '../core/execution-context.js';
import type { UntrackedScanResult } from '../core/list/untracked-files-scanner.js';
import { classifyInput } from '../core/install/preprocessing/index.js';
import { resolveRemoteList, type RemoteListResult } from '../core/list/remote-list-resolver.js';

interface ListOptions {
  global?: boolean;
  project?: boolean;
  all?: boolean;
  files?: boolean;
  tracked?: boolean;
  untracked?: boolean;
  platforms?: string[];
  remote?: boolean;
  profile?: string;
  apiKey?: string;
}

const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';

function dim(text: string): string {
  return `${DIM}${text}${RESET}`;
}

function green(text: string): string {
  return `${GREEN}${text}${RESET}`;
}

function red(text: string): string {
  return `${RED}${text}${RESET}`;
}

function formatPackageLine(pkg: ListPackageReport): string {
  const version = pkg.version && pkg.version !== '0.0.0' ? `@${pkg.version}` : '';

  let fileCount = '';
  if (pkg.totalFiles > 0) {
    fileCount = dim(` (${pkg.totalFiles})`);
  }

  let stateSuffix = '';
  if (pkg.state === 'missing') {
    stateSuffix = dim(' (missing)');
  }

  return `${pkg.name}${version}${stateSuffix}${fileCount}`;
}

function printFileList(
  files: { source: string; target: string; exists: boolean }[],
  prefix: string
): void {
  // Sort files alphabetically by target path
  const sortedFiles = [...files].sort((a, b) => a.target.localeCompare(b.target));

  for (let i = 0; i < sortedFiles.length; i++) {
    const file = sortedFiles[i];
    const isLast = i === sortedFiles.length - 1;
    const connector = isLast ? '└── ' : '├── ';
    const label = file.exists
      ? dim(file.target)
      : `${dim(file.target)} ${red('[MISSING]')}`;
    console.log(`${prefix}${connector}${label}`);
  }
}

function printTreeNode(
  node: ListTreeNode,
  prefix: string,
  isLast: boolean,
  showFiles: boolean
): void {
  const hasChildren = node.children.length > 0;
  const hasFiles = showFiles && node.report.fileList && node.report.fileList.length > 0;
  const hasBranches = hasChildren || hasFiles;

  const connector = isLast
    ? (hasBranches ? '└─┬ ' : '└── ')
    : (hasBranches ? '├─┬ ' : '├── ');
  const childPrefix = prefix + (isLast ? '  ' : '│ ');

  console.log(`${prefix}${connector}${formatPackageLine(node.report)}`);

  if (hasFiles) {
    const files = node.report.fileList!;
    const filePrefix = node.children.length > 0 ? '│ ' : '  ';
    printFileList(files, childPrefix);
  }

  node.children.forEach((child, index) => {
    const isLastChild = index === node.children.length - 1;
    printTreeNode(child, childPrefix, isLastChild, showFiles);
  });
}

function printUntrackedSummary(result: UntrackedScanResult): void {
  printUntrackedSummaryWithLabel(result, undefined);
}

function printUntrackedSummaryWithLabel(result: UntrackedScanResult, scopeLabel?: string): void {
  if (result.totalFiles === 0) return;

  const label = scopeLabel ? `${scopeLabel} Untracked:` : 'Untracked:';
  console.log(label);

  const sortedPlatforms = Array.from(result.platformGroups.keys()).sort();
  
  for (let i = 0; i < sortedPlatforms.length; i++) {
    const platform = sortedPlatforms[i];
    const files = result.platformGroups.get(platform)!;
    const isLast = i === sortedPlatforms.length - 1;
    const connector = isLast ? '└── ' : '├── ';
    console.log(`${connector}${platform}${dim(` (${files.length})`)}`);
  }
}

function printUntrackedExpanded(result: UntrackedScanResult): void {
  printUntrackedExpandedWithLabel(result, 'Untracked:');
}

function printUntrackedExpandedWithLabel(result: UntrackedScanResult, label: string): void {
  if (result.totalFiles === 0) {
    console.log('No untracked files detected.');
    console.log(dim('All files matching platform patterns are tracked in the index.'));
    return;
  }

  console.log(label);

  const sortedPlatforms = Array.from(result.platformGroups.keys()).sort();

  for (let i = 0; i < sortedPlatforms.length; i++) {
    const platform = sortedPlatforms[i];
    const files = result.platformGroups.get(platform)!;
    const isLastPlatform = i === sortedPlatforms.length - 1;
    const platformConnector = isLastPlatform ? '└─┬ ' : '├─┬ ';
    const platformPrefix = isLastPlatform ? '  ' : '│ ';
    
    console.log(`${platformConnector}${platform}${dim(` (${files.length})`)}`);

    // Sort files alphabetically by workspace path
    const sortedFiles = [...files].sort((a, b) => a.workspacePath.localeCompare(b.workspacePath));

    for (let j = 0; j < sortedFiles.length; j++) {
      const file = sortedFiles[j];
      const isLastFile = j === sortedFiles.length - 1;
      const fileConnector = isLastFile ? '└── ' : '├── ';
      console.log(`${platformPrefix}${fileConnector}${dim(file.workspacePath)}`);
    }
  }
}

function printDefaultView(
  headerName: string,
  headerVersion: string | undefined,
  headerPath: string,
  tree: ListTreeNode[],
  data: ListPipelineResult,
  showFiles: boolean,
  scopeLabel?: string
): void {
  const version = headerVersion && headerVersion !== '0.0.0' ? `@${headerVersion}` : '';
  const label = scopeLabel ? `${scopeLabel} ` : '';
  console.log(`${label}${headerName}${version} ${headerPath}`);

  if (tree.length === 0) {
    console.log(dim('  No packages installed.'));
    return;
  }

  tree.forEach((node, index) => {
    const isLast = index === tree.length - 1;
    printTreeNode(node, '', isLast, showFiles);
  });

  if (data.untrackedFiles && data.untrackedFiles.totalFiles > 0) {
    if (showFiles) {
      const untrackedLabel = scopeLabel ? `${scopeLabel} Untracked:` : 'Untracked:';
      printUntrackedExpandedWithLabel(data.untrackedFiles, untrackedLabel);
    } else {
      printUntrackedSummaryWithLabel(data.untrackedFiles, scopeLabel);
    }
  }
}

function printTrackedView(
  headerName: string,
  headerVersion: string | undefined,
  headerPath: string,
  tree: ListTreeNode[],
  data: ListPipelineResult,
  showFiles: boolean,
  scopeLabel?: string
): void {
  const version = headerVersion && headerVersion !== '0.0.0' ? `@${headerVersion}` : '';
  const label = scopeLabel ? `${scopeLabel} ` : '';
  console.log(`${label}${headerName}${version} ${headerPath}`);

  if (tree.length === 0) {
    console.log(dim('  No packages installed.'));
    return;
  }

  tree.forEach((node, index) => {
    const isLast = index === tree.length - 1;
    printTreeNode(node, '', isLast, showFiles);
  });
}

function printUntrackedView(
  data: ListPipelineResult,
  showFiles: boolean
): void {
  if (!data.untrackedFiles || data.untrackedFiles.totalFiles === 0) {
    console.log('No untracked files detected.');
    console.log(dim('All files matching platform patterns are tracked in the index.'));
    return;
  }

  if (showFiles) {
    printUntrackedExpanded(data.untrackedFiles);
  } else {
    printUntrackedSummary(data.untrackedFiles);
  }
}

function printPackageDetail(
  targetPackage: ListPackageReport,
  tree: ListTreeNode[],
  data: ListPipelineResult,
  showFiles: boolean
): void {
  console.log(formatPackageLine(targetPackage));

  if (targetPackage.fileList && targetPackage.fileList.length > 0) {
    printFileList(targetPackage.fileList, '');
  }

  if (tree.length > 0) {
    console.log();
    console.log('Dependencies:');
    tree.forEach((node, index) => {
      const isLast = index === tree.length - 1;
      printTreeNode(node, '', isLast, showFiles);
    });
  }
}

function printRemotePackageDetail(
  result: RemoteListResult,
  showFiles: boolean
): void {
  const pkg = result.package;
  console.log(`${formatPackageLine(pkg)} ${dim(`[${result.sourceLabel}]`)}`);

  if (showFiles && pkg.fileList && pkg.fileList.length > 0) {
    printFileList(pkg.fileList, '');
  }

  if (result.dependencies.length > 0) {
    console.log();
    console.log('Dependencies:');
    result.dependencies.forEach((dep, index) => {
      const isLast = index === result.dependencies.length - 1;
      const connector = isLast ? '└── ' : '├── ';
      const versionSuffix = dep.version ? `@${dep.version}` : '';
      console.log(`${connector}${dep.name}${versionSuffix}`);
    });
  }
}

interface ScopeResult {
  headerName: string;
  headerVersion: string | undefined;
  headerPath: string;
  tree: ListTreeNode[];
  data: ListPipelineResult;
}

/**
 * Run list pipeline for a specific scope (project or global)
 */
async function runScopeList(
  packageName: string | undefined,
  execContext: ExecutionContext,
  options: ListOptions
): Promise<ScopeResult | null> {
  const skipLocal = options.remote && !!packageName;

  let result: CommandResult<ListPipelineResult> | undefined;
  let packages: ListPackageReport[] = [];
  let tree: ListTreeNode[] = [];
  let data: ListPipelineResult | undefined;

  if (!skipLocal) {
    result = await runListPipeline(packageName, execContext, {
      includeFiles: options.files || !!packageName,
      all: options.all,
      tracked: options.tracked,
      untracked: options.untracked,
      platforms: options.platforms
    });

    packages = result.data?.packages ?? [];
    tree = result.data?.tree ?? [];
    data = result.data!;
  }

  // If we didn't find anything in this scope, return null
  if (!data || (packages.length === 0 && !packageName)) {
    return null;
  }

  const displayDir = getDisplayTargetDir(execContext);
  const manifestPath = getLocalPackageYmlPath(execContext.targetDir);
  
  let headerName = 'Unnamed';
  let headerVersion: string | undefined;
  const headerPath = displayDir;

  try {
    const manifest = await parsePackageYml(manifestPath);
    headerName = manifest.name || 'Unnamed';
    headerVersion = manifest.version;
  } catch (error) {
    logger.debug(`Failed to read workspace manifest: ${error}`);
  }

  return {
    headerName,
    headerVersion,
    headerPath,
    tree,
    data
  };
}

async function listCommand(
  packageName: string | undefined,
  options: ListOptions,
  command: Command
): Promise<CommandResult> {
  const programOpts = command.parent?.opts() || {};

  // Validate option combinations
  if (options.tracked && options.untracked) {
    throw new ValidationError('Cannot use --tracked and --untracked together.');
  }

  if (packageName && options.untracked) {
    throw new ValidationError('Cannot use --untracked with a specific package.');
  }

  if (options.all && options.untracked) {
    throw new ValidationError('Cannot use --all with --untracked.');
  }

  if (options.global && options.project) {
    throw new ValidationError('Cannot use --global and --project together.');
  }

  // Determine which scopes to display
  const showBothScopes = !options.global && !options.project;
  const showGlobal = options.global || showBothScopes;
  const showProject = options.project || showBothScopes;

  // Handle package detail view (single package lookup)
  if (packageName) {
    // For package detail, use the originally specified scope (or default to project)
    const execContext = await createExecutionContext({
      global: options.global,
      cwd: programOpts.cwd
    });

    const displayDir = getDisplayTargetDir(execContext);
    const skipLocal = options.remote && !!packageName;

    let result: CommandResult<ListPipelineResult> | undefined;
    let packages: ListPackageReport[] = [];
    let tree: ListTreeNode[] = [];
    let data: ListPipelineResult | undefined;

    if (!skipLocal) {
      result = await runListPipeline(packageName, execContext, {
        includeFiles: options.files || !!packageName,
        all: options.all,
        tracked: options.tracked,
        untracked: options.untracked,
        platforms: options.platforms
      });

      packages = result.data?.packages ?? [];
      tree = result.data?.tree ?? [];
      data = result.data!;
    }

    if (skipLocal || packages.length === 0) {
      const remoteResult = await resolveRemoteListForPackage(packageName, execContext, options);
      if (remoteResult) {
        printRemotePackageDetail(remoteResult, !!options.files);
        return { success: true };
      }
      throw new ValidationError(`Package '${packageName}' not found locally or remotely`);
    }

    if (data?.targetPackage) {
      printPackageDetail(data.targetPackage, tree, data, !!options.files);
      return { success: true };
    }

    return { success: true };
  }

  // Handle list views (no specific package)
  const results: { scope: 'project' | 'global'; result: ScopeResult }[] = [];

  // Collect project scope
  if (showProject) {
    const projectContext = await createExecutionContext({
      global: false,
      cwd: programOpts.cwd
    });

    try {
      const projectResult = await runScopeList(packageName, projectContext, options);
      if (projectResult) {
        results.push({ scope: 'project', result: projectResult });
      }
    } catch (error) {
      logger.debug(`Failed to list project scope: ${error}`);
    }
  }

  // Collect global scope
  if (showGlobal) {
    const globalContext = await createExecutionContext({
      global: true,
      cwd: programOpts.cwd
    });

    try {
      const globalResult = await runScopeList(packageName, globalContext, options);
      if (globalResult) {
        results.push({ scope: 'global', result: globalResult });
      }
    } catch (error) {
      logger.debug(`Failed to list global scope: ${error}`);
    }
  }

  // Display results
  if (results.length === 0) {
    if (options.untracked) {
      console.log('No untracked files detected.');
      console.log(dim('All files matching platform patterns are tracked in the index.'));
    } else {
      console.log(dim('No packages found in any scope.'));
    }
    return { success: true };
  }

  for (let i = 0; i < results.length; i++) {
    const { scope, result } = results[i];
    const scopeLabel = showBothScopes ? `[${scope === 'project' ? 'Project' : 'Global'}]` : undefined;

    if (options.untracked) {
      if (scopeLabel) {
        const label = `${scopeLabel} Untracked:`;
        printUntrackedExpandedWithLabel(result.data.untrackedFiles!, label);
      } else {
        printUntrackedView(result.data, !!options.files);
      }
    } else if (options.tracked) {
      printTrackedView(
        result.headerName,
        result.headerVersion,
        result.headerPath,
        result.tree,
        result.data,
        !!options.files,
        scopeLabel
      );
    } else {
      printDefaultView(
        result.headerName,
        result.headerVersion,
        result.headerPath,
        result.tree,
        result.data,
        !!options.files,
        scopeLabel
      );
    }
  }

  return { success: true };
}

async function resolveRemoteListForPackage(
  packageName: string,
  execContext: ExecutionContext,
  options: ListOptions
): Promise<RemoteListResult | null> {
  try {
    const classification = await classifyInput(packageName, {}, execContext);
    if (classification.type === 'bulk' || classification.type === 'path') {
      return null;
    }
    return await resolveRemoteList(classification, execContext, {
      profile: options.profile,
      apiKey: options.apiKey
    });
  } catch (error) {
    logger.debug(`Remote list resolution failed for '${packageName}': ${error}`);
    return null;
  }
}

export function setupListCommand(program: Command): void {
  program
    .command('list')
    .alias('ls')
    .description('Show installed packages, file status, and untracked files')
    .argument('[resource-spec]', 'show details for a specific resource')
    .option('-p, --project', 'list packages in current workspace only')
    .option('-g, --global', 'list packages in home directory (~/) only')
    .option('-a, --all', 'show full dependency tree including transitive dependencies')
    .option('-f, --files', 'show individual files for each package')
    .option('-t, --tracked', 'show only tracked file information (skip untracked scan)')
    .option('-u, --untracked', 'show only untracked files detected by platforms')
    .option('--platforms <platforms...>', 'filter by specific platforms (e.g., cursor, claude)')
    .option('--remote', 'fetch package info from remote registry or git, skipping local lookup')
    .option('--profile <profile>', 'profile to use for authentication')
    .option('--api-key <key>', 'API key for authentication (overrides profile)')
    .action(withErrorHandling(async (packageName: string | undefined, options: ListOptions, command: Command) => {
      await listCommand(packageName, options, command);
    }));
}
