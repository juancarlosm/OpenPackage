import { dirname } from 'path';
import { normalizePackageName } from '../../utils/package-name.js';
import { logger } from '../../utils/logger.js';
import { getPackageFilesDir, getPackageYmlPath, getPackageRootDir, type PackageContext } from '../package-context.js';
import { ensurePackageWithYml } from '../../utils/package-management.js';
import { LOG_PREFIXES } from './constants.js';
import { UNVERSIONED } from '../../constants/index.js';
import { applyWorkspacePackageRename } from './workspace-rename.js';

export interface LoadPackageOptions {
  renameTo?: string;
}

export async function readOrCreateBasePackageYml(
  cwd: string,
  name: string
): Promise<PackageContext> {
  const normalizedName = normalizePackageName(name);
  const ensured = await ensurePackageWithYml(cwd, normalizedName, {
    defaultVersion: undefined
  });

  if (ensured.isNew) {
    logger.debug('No openpackage.yml found for save, creating', { dir: ensured.packageDir });
    console.log(`${LOG_PREFIXES.CREATED} ${ensured.packageDir}`);
    console.log(`${LOG_PREFIXES.NAME} ${ensured.packageConfig.name}`);
    console.log(`${LOG_PREFIXES.VERSION} ${ensured.packageConfig.version ?? UNVERSIONED}`);
  } else {
    logger.debug('Found existing openpackage.yml for save', { path: ensured.packageYmlPath });
    console.log(
      `✓ Found existing package ${ensured.packageConfig.name}${ensured.packageConfig.version ? `@${ensured.packageConfig.version}` : ''}`
    );
  }

  // Cached packages mirror the payload at their root
  const packageRootDir = ensured.packageDir;
  
  return {
    name: ensured.normalizedName,
    version: ensured.packageConfig.version,
    config: ensured.packageConfig,
    packageYmlPath: ensured.packageYmlPath,
    packageRootDir,
    packageFilesDir: ensured.packageDir,
    location: 'nested',
    isCwdPackage: false,
    isNew: ensured.isNew
  };
}

export async function loadAndPreparePackage(
  cwd: string,
  packageName: string,
  options: LoadPackageOptions = {}
): Promise<PackageContext> {
  const renameTarget = options.renameTo ? normalizePackageName(options.renameTo) : undefined;
  const ctx = await readOrCreateBasePackageYml(cwd, packageName);

  if (!renameTarget || renameTarget === ctx.config.name) {
    return ctx;
  }

  logger.debug(`Renaming package during workspace load`, {
    from: ctx.config.name,
    to: renameTarget
  });

  await applyWorkspacePackageRename(cwd, ctx, renameTarget);

  const packageRootDir = getPackageRootDir(cwd, 'nested', renameTarget);
  const packageYmlPath = getPackageYmlPath(cwd, 'nested', renameTarget);
  const packageFilesDir = getPackageFilesDir(cwd, 'nested', renameTarget);

  return {
    ...ctx,
    name: renameTarget,
    packageYmlPath,
    packageRootDir,
    packageFilesDir,
    config: { ...ctx.config, name: renameTarget }
  };
}
