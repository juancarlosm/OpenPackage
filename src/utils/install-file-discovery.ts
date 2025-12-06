import { packageManager } from '../core/package.js';
import { FILE_PATTERNS, PACKAGE_PATHS } from '../constants/index.js';
import type { PackageFile } from '../types/index.js';
import { getPlatformDefinition, type Platform } from '../core/platforms.js';

export interface CategorizedInstallFiles {
  pathBasedFiles: PackageFile[];
  rootFiles: Map<string, string>;
}

export async function discoverAndCategorizeFiles(
  packageName: string,
  version: string,
  platforms: Platform[],
  includePaths?: string[]
): Promise<CategorizedInstallFiles> {
  // Load once
  const pkg = await packageManager.loadPackage(packageName, version);

  const normalizePath = (path: string): string =>
    path.startsWith('/') ? path.slice(1) : path;

  const normalizedIncludes =
    includePaths && includePaths.length > 0
      ? new Set(includePaths.map(normalizePath))
      : null;

  const shouldInclude = (path: string): boolean =>
    !normalizedIncludes || normalizedIncludes.has(normalizePath(path));

  // Precompute platform root filenames
  const platformRootNames = new Set<string>();
  for (const platform of platforms) {
    const def = getPlatformDefinition(platform);
    if (def.rootFile) platformRootNames.add(def.rootFile);
  }

  // Single pass classification
  const pathBasedFiles: PackageFile[] = [];
  const rootFiles = new Map<string, string>();
  for (const file of pkg.files) {
    const p = file.path;
    // Never install registry package metadata files
    if (p === FILE_PATTERNS.PACKAGE_YML || p === PACKAGE_PATHS.INDEX_RELATIVE) continue;
    if (!shouldInclude(p)) continue;

    pathBasedFiles.push(file);

    if (p === FILE_PATTERNS.AGENTS_MD || platformRootNames.has(p)) {
      rootFiles.set(p, file.content);
    }
  }

  return { pathBasedFiles, rootFiles };
}


