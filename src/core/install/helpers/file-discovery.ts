import { packageManager } from '../../package.js';
import { FILE_PATTERNS, PACKAGE_PATHS } from '../../../constants/index.js';
import type { PackageFile } from '../../../types/index.js';
import type { Platform } from '../../platforms.js';
import { isManifestPath, normalizePackagePath } from '../../../utils/manifest-paths.js';
import { getPlatformRootFileNames, stripRootCopyPrefix } from '../../../utils/platform-root-files.js';
import { minimatch } from 'minimatch';

export interface CategorizedInstallFiles {
  pathBasedFiles: PackageFile[];
  rootFiles: Map<string, string>;
  rootCopyFiles: PackageFile[];
}

export async function discoverAndCategorizeFiles(
  packageName: string,
  version: string,
  platforms: Platform[],
  contentRoot?: string,
  matchedPattern?: string  // Phase 4: Pattern for filtering
): Promise<CategorizedInstallFiles> {
  // Load once
  const pkg = await packageManager.loadPackage(packageName, version, {
    packageRootDir: contentRoot
  });

  // Phase 4: Build include filter that considers matchedPattern
  const shouldInclude = (path: string): boolean => {
    // Check matched pattern (from base detection or resource scoping)
    if (matchedPattern && !minimatch(path, matchedPattern)) {
      return false;
    }
    
    return true;
  };

  // Precompute platform root filenames
  const platformRootNames = getPlatformRootFileNames(platforms);

  // Single pass classification
  const pathBasedFiles: PackageFile[] = [];
  const rootFiles = new Map<string, string>();
  const rootCopyFiles: PackageFile[] = [];
  for (const file of pkg.files) {
    const p = file.path;
    const normalized = normalizePackagePath(p);
    // Never install registry package metadata files
    if (isManifestPath(p) || normalized === PACKAGE_PATHS.INDEX_RELATIVE) continue;
    if (!shouldInclude(p)) continue;

    // root/** copy-to-root handling
    const stripped = stripRootCopyPrefix(normalized);
    if (stripped !== null) {
      rootCopyFiles.push({ ...file, path: stripped });
      continue;
    }

    pathBasedFiles.push(file);

    if (normalized === FILE_PATTERNS.AGENTS_MD || platformRootNames.has(normalized)) {
      rootFiles.set(normalized, file.content);
    }
  }

  return { pathBasedFiles, rootFiles, rootCopyFiles };
}


