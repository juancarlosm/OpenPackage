/**
 * View Pipeline
 *
 * Core logic for resolving and viewing package details.
 * No terminal-UI dependencies — display is handled by the CLI command layer.
 */

import { join } from 'path';
import { resolvePackageByName, type PackageSourceType } from '../../utils/package-name-resolution.js';
import { parsePackageYml } from '../../utils/package-yml.js';
import { exists } from '../../utils/fs.js';
import { detectEntityType } from '../../utils/entity-detector.js';
import { formatPathForDisplay } from '../../utils/formatters.js';
import { logger } from '../../utils/logger.js';
import { collectFiles } from '../list/remote-list-resolver.js';
import { groupFilesIntoResources, type ListFileMapping, type ListPackageReport } from '../list/list-pipeline.js';
import { extractMetadataFromManifest, type ViewMetadataEntry } from '../list/list-printers.js';
import type { HeaderInfo } from '../list/scope-data-collector.js';
import type { ResourceScope } from '../list/list-tree-renderer.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LocalPackageResult {
  report: ListPackageReport;
  headerInfo: HeaderInfo;
  scope: ResourceScope;
  metadata: ViewMetadataEntry[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sourceTypeToScope(sourceType: PackageSourceType): ResourceScope {
  return sourceType === 'global' ? 'global' : 'project';
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

/**
 * Resolve a package by name from local sources (workspace, global, registry).
 * Returns a LocalPackageResult with all data needed for display, or null if not found.
 */
export async function resolveLocalPackage(
  packageName: string,
  cwd: string,
  options: { showProject: boolean; showGlobal: boolean; searchRegistry: boolean }
): Promise<LocalPackageResult | null> {
  const resolution = await resolvePackageByName({
    cwd,
    packageName,
    checkCwd: false,
    searchWorkspace: options.showProject,
    searchGlobal: options.showGlobal,
    searchRegistry: options.searchRegistry
  });

  if (!resolution.found || !resolution.path) {
    return null;
  }

  const packageDir = resolution.path;
  let name = packageName;
  let version = resolution.version;
  let dependencies: string[] | undefined;
  let metadata: ViewMetadataEntry[] = [];

  const manifestPath = join(packageDir, 'openpackage.yml');
  if (await exists(manifestPath)) {
    try {
      const manifest = await parsePackageYml(manifestPath);
      name = manifest.name || packageName;
      version = manifest.version || version;
      metadata = extractMetadataFromManifest(manifest);
      const allDeps = [
        ...(manifest.dependencies || []),
        ...(manifest['dev-dependencies'] || [])
      ];
      dependencies = allDeps.map(dep => dep.name);
    } catch (error) {
      logger.debug(`Failed to parse manifest at ${manifestPath}: ${error}`);
    }
  }
  if (metadata.length === 0) metadata = extractMetadataFromManifest({ name, version });

  const files = await collectFiles(packageDir, packageDir);
  const fileList: ListFileMapping[] = files.map(f => ({
    source: f,
    target: join(packageDir, f),
    exists: true
  }));
  const resourceGroups = fileList.length > 0 ? groupFilesIntoResources(fileList) : undefined;

  const headerType = await detectEntityType(packageDir);
  const scope = sourceTypeToScope(resolution.sourceType!);

  return {
    report: {
      name,
      version,
      path: packageDir,
      state: 'synced',
      totalFiles: fileList.length,
      existingFiles: fileList.length,
      fileList,
      resourceGroups,
      dependencies
    },
    headerInfo: {
      name,
      version: version !== '0.0.0' ? version : undefined,
      path: formatPathForDisplay(packageDir),
      type: headerType
    },
    scope,
    metadata
  };
}
