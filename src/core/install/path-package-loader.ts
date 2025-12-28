import { relative, basename } from 'path';
import { readFile } from 'fs/promises';
import { Package, PackageFile, PackageYml } from '../../types/index.js';
import { loadPackageConfig } from '../package-context.js';
import { extractPackageFromTarball } from '../../utils/tarball.js';
import { walkFiles, readTextFile } from '../../utils/fs.js';
import { isJunk } from 'junk';
import { logger } from '../../utils/logger.js';
import { ValidationError } from '../../utils/errors.js';
import { FILE_PATTERNS, PACKAGE_PATHS } from '../../constants/index.js';

export type PathSourceType = 'directory' | 'tarball';

/**
 * Infer the source type from a path string.
 */
export function inferSourceType(path: string): PathSourceType {
  return path.endsWith('.tgz') || path.endsWith('.tar.gz') ? 'tarball' : 'directory';
}

/**
 * Load a package from a local directory.
 * Reads all files from the directory and loads openpackage.yml.
 */
export async function loadPackageFromDirectory(dirPath: string): Promise<Package> {
  logger.debug(`Loading package from directory: ${dirPath}`);
  
  // Load openpackage.yml
  const config = await loadPackageConfig(dirPath);
  if (!config) {
    throw new ValidationError(
      `Directory '${dirPath}' is not a valid OpenPackage directory. ` +
      `Missing ${FILE_PATTERNS.OPENPACKAGE_YML}`
    );
  }

  // Discover all files in the directory
  const files: PackageFile[] = [];
  
  try {
    for await (const fullPath of walkFiles(dirPath)) {
      const relativePath = relative(dirPath, fullPath);
      
      // Filter out junk files
      if (isJunk(basename(relativePath))) {
        continue;
      }
      
      const content = await readTextFile(fullPath);
      
      files.push({
        path: relativePath,
        content,
        encoding: 'utf8'
      });
    }
    
    logger.debug(`Loaded ${files.length} files from directory: ${dirPath}`);
    
    return {
      metadata: config,
      files
    };
  } catch (error) {
    logger.error(`Failed to load package from directory: ${dirPath}`, { error });
    throw new ValidationError(`Failed to load package from directory: ${error}`);
  }
}

/**
 * Load a package from a tarball file.
 * Extracts to a temporary location, reads files, then cleans up.
 */
export async function loadPackageFromTarball(tarballPath: string): Promise<Package> {
  logger.debug(`Loading package from tarball: ${tarballPath}`);
  
  // Read tarball file
  let tarballBuffer: Buffer;
  try {
    tarballBuffer = await readFile(tarballPath);
  } catch (error) {
    throw new ValidationError(`Failed to read tarball file '${tarballPath}': ${error}`);
  }
  
  // Extract tarball
  const extracted = await extractPackageFromTarball(tarballBuffer);
  
  // Find openpackage.yml in extracted files
  const packageYmlFile = extracted.files.find(
    f => f.path === PACKAGE_PATHS.MANIFEST_RELATIVE || f.path === 'openpackage.yml'
  );
  
  if (!packageYmlFile) {
    throw new ValidationError(
      `Tarball '${tarballPath}' does not contain a valid ${FILE_PATTERNS.OPENPACKAGE_YML} file`
    );
  }
  
  // Parse openpackage.yml content
  const yaml = await import('js-yaml');
  const config = yaml.load(packageYmlFile.content) as PackageYml;
  
  if (!config.name) {
    throw new ValidationError(
      `Tarball '${tarballPath}' contains invalid ${FILE_PATTERNS.OPENPACKAGE_YML}: missing name field`
    );
  }
  
  logger.debug(`Loaded package ${config.name}@${config.version} from tarball: ${tarballPath}`);
  
  return {
    metadata: config,
    files: extracted.files
  };
}

/**
 * Load a package from either a directory or tarball path.
 * Automatically detects the source type.
 */
export async function loadPackageFromPath(path: string): Promise<Package> {
  const sourceType = inferSourceType(path);
  
  if (sourceType === 'tarball') {
    return await loadPackageFromTarball(path);
  } else {
    return await loadPackageFromDirectory(path);
  }
}

