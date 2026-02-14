/**
 * Resource Builder
 *
 * Scans all packages in the workspace index and untracked files to build
 * a flat list of resolved resources for resource-level uninstall operations.
 */

import { readWorkspaceIndex } from '../../utils/workspace-index-yml.js';
import { isRootPackage } from '../../utils/paths.js';
import { classifySourceKey } from '../resources/source-key-classifier.js';
import { getTargetPath } from '../../utils/workspace-index-helpers.js';
import { scanUntrackedFiles } from '../list/untracked-files-scanner.js';
import { normalizeType, RESOURCE_TYPE_ORDER } from '../resources/resource-registry.js';
import type { ResourceScope } from '../list/list-tree-renderer.js';

export interface ResolvedResource {
  kind: 'tracked' | 'untracked';
  resourceName: string;
  resourceType: string;
  /** Package name (only for tracked resources) */
  packageName?: string;
  /** Source keys in workspace index that belong to this resource (only for tracked) */
  sourceKeys: Set<string>;
  /** Target file paths in the workspace (for display) */
  targetFiles: string[];
  scope: ResourceScope;
}

export interface ResolvedPackage {
  packageName: string;
  version?: string;
  resourceCount: number;
  targetFiles: string[];
  scope: ResourceScope;
}

export interface WorkspaceResources {
  resources: ResolvedResource[];
  packages: ResolvedPackage[];
}

/**
 * Derive a display name from an untracked file's workspace path.
 * For SKILL.md files nested in a directory, uses the parent directory name.
 * Otherwise uses the filename without extension.
 */
function deriveUntrackedResourceName(workspacePath: string): string {
  const parts = workspacePath.split('/');
  const fileName = parts[parts.length - 1];
  if (fileName === 'SKILL.md' && parts.length >= 2) {
    return parts[parts.length - 2];
  }
  return fileName.replace(/\.[^.]+$/, '') || fileName;
}

/**
 * Build a flat list of all workspace resources (tracked and untracked)
 * for use in resource-level uninstall operations.
 */
export async function buildWorkspaceResources(
  targetDir: string,
  scope: ResourceScope
): Promise<WorkspaceResources> {
  const { index } = await readWorkspaceIndex(targetDir);
  const packages = index.packages || {};

  const resources: ResolvedResource[] = [];
  const resolvedPackages: ResolvedPackage[] = [];

  // Process tracked packages
  for (const [pkgName, pkgEntry] of Object.entries(packages)) {
    if (await isRootPackage(targetDir, pkgName)) {
      continue;
    }

    const filesMapping = pkgEntry.files || {};
    const resourceMap = new Map<string, { sourceKeys: Set<string>; targetFiles: string[] }>();
    const allTargetFiles: string[] = [];

    for (const [sourceKey, mappings] of Object.entries(filesMapping)) {
      const { resourceType, resourceName } = classifySourceKey(sourceKey);

      const key = resourceType === 'other'
        ? 'other::uncategorized'
        : `${resourceType}::${resourceName}`;

      if (!resourceMap.has(key)) {
        resourceMap.set(key, { sourceKeys: new Set(), targetFiles: [] });
      }
      const entry = resourceMap.get(key)!;
      entry.sourceKeys.add(sourceKey);

      for (const mapping of mappings) {
        const target = getTargetPath(mapping);
        entry.targetFiles.push(target);
        allTargetFiles.push(target);
      }
    }

    // Create ResolvedResource entries for this package
    for (const [key, entry] of resourceMap) {
      const [resourceType, resourceName] = key.split('::');
      resources.push({
        kind: 'tracked',
        resourceName,
        resourceType,
        packageName: pkgName,
        sourceKeys: entry.sourceKeys,
        targetFiles: entry.targetFiles,
        scope,
      });
    }

    // Build ResolvedPackage
    resolvedPackages.push({
      packageName: pkgName,
      version: pkgEntry.version,
      resourceCount: resourceMap.size,
      targetFiles: allTargetFiles,
      scope,
    });
  }

  // Process untracked files
  const untrackedResult = await scanUntrackedFiles(targetDir);
  const untrackedMap = new Map<string, string[]>();

  for (const file of untrackedResult.files) {
    const resourceType = normalizeType(file.category);
    const resourceName = deriveUntrackedResourceName(file.workspacePath);
    const key = `${resourceType}::${resourceName}`;

    if (!untrackedMap.has(key)) {
      untrackedMap.set(key, []);
    }
    untrackedMap.get(key)!.push(file.workspacePath);
  }

  for (const [key, targetFiles] of untrackedMap) {
    const [resourceType, resourceName] = key.split('::');
    resources.push({
      kind: 'untracked',
      resourceName,
      resourceType,
      sourceKeys: new Set(),
      targetFiles,
      scope,
    });
  }

  // Sort resources by type order then name
  const typeOrderMap = new Map(RESOURCE_TYPE_ORDER.map((t, i) => [t, i]));
  resources.sort((a, b) => {
    const orderA = typeOrderMap.get(a.resourceType as any) ?? Infinity;
    const orderB = typeOrderMap.get(b.resourceType as any) ?? Infinity;
    if (orderA !== orderB) return orderA - orderB;
    return a.resourceName.localeCompare(b.resourceName);
  });

  // Sort packages by name
  resolvedPackages.sort((a, b) => a.packageName.localeCompare(b.packageName));

  return { resources, packages: resolvedPackages };
}
