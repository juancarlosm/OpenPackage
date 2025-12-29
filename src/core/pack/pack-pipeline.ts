import path from 'path';
import semver from 'semver';

import type { CommandResult, PackOptions, PackageYml } from '../../types/index.js';
import { FILE_PATTERNS } from '../../constants/index.js';
import { ensureRegistryDirectories, getPackageVersionPath } from '../directory.js';
import { resolvePackageSource } from '../source-resolution/resolve-package-source.js';
import { readPackageFilesForRegistry, writePackageFilesToDirectory } from '../../utils/package-copy.js';
import { parsePackageYml } from '../../utils/package-yml.js';
import { exists, remove } from '../../utils/fs.js';
import { logger } from '../../utils/logger.js';

interface ResolvedSource {
  name: string;
  version: string;
  packageRoot: string;
  manifest: PackageYml;
}

async function resolveSource(
  cwd: string,
  packageName?: string
): Promise<ResolvedSource> {
  if (packageName) {
    const source = await resolvePackageSource(cwd, packageName);
    const manifestPath = path.join(source.absolutePath, FILE_PATTERNS.OPENPACKAGE_YML);
    if (!(await exists(manifestPath))) {
      throw new Error(`openpackage.yml not found at ${manifestPath}`);
    }
    const manifest = await parsePackageYml(manifestPath);
    return {
      name: manifest.name,
      version: manifest.version ?? '',
      packageRoot: source.absolutePath,
      manifest
    };
  }

  const manifestPath = path.join(cwd, FILE_PATTERNS.OPENPACKAGE_YML);
  if (!(await exists(manifestPath))) {
    throw new Error('No openpackage.yml found in current directory; specify a package name or run inside a package root.');
  }
  const manifest = await parsePackageYml(manifestPath);
  return {
    name: manifest.name,
    version: manifest.version ?? '',
    packageRoot: cwd,
    manifest
  };
}

export interface PackPipelineResult {
  destination: string;
  files: number;
}

export async function runPackPipeline(
  packageName: string | undefined,
  options: PackOptions = {}
): Promise<CommandResult<PackPipelineResult>> {
  const cwd = process.cwd();

  try {
    const source = await resolveSource(cwd, packageName);

    if (!source.version || !semver.valid(source.version)) {
      return {
        success: false,
        error: `openpackage.yml must contain a valid semver version to pack (found "${source.version || 'undefined'}").`
      };
    }

    const files = await readPackageFilesForRegistry(source.packageRoot);
    if (files.length === 0) {
      return { success: false, error: 'No package files found to pack.' };
    }

    const destination = options.output
      ? path.resolve(cwd, options.output)
      : getPackageVersionPath(source.name, source.version);

    if (options.dryRun) {
      console.log(`(dry-run) Would write ${files.length} files to: ${destination}`);
      return {
        success: true,
        data: { destination, files: files.length }
      };
    }

    if (!options.output) {
      await ensureRegistryDirectories();
    }

    if (await exists(destination)) {
      await remove(destination);
    }

    await writePackageFilesToDirectory(destination, files);

    logger.info(`Packed ${source.name}@${source.version} to ${destination}`);

    return {
      success: true,
      data: { destination, files: files.length }
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}
