import { join, basename, dirname, extname } from 'path';
import {
  getPlatformDefinition,
  getDetectedPlatforms,
  getAllPlatforms,
  getPlatformDirectoryPathsForPlatform,
  getWorkspaceExt,
  getPackageExt,
  isExtAllowed,
  type Platform,
  type PlatformPaths,
  type PlatformDefinition
} from '../core/platforms.js';
import { logger } from './logger.js';
import { type UniversalSubdir } from '../constants/index.js';
import { normalizePathForProcessing, findSubpathIndex } from './path-normalization.js';

/**
 * Normalize platform names from command line input
 */
export function normalizePlatforms(platforms?: string[]): string[] | undefined {
  if (!platforms || platforms.length === 0) {
    return undefined;
  }
  
  return platforms.map(p => p.toLowerCase());
}

/**
 * Platform Mapper Module
 * Unified functions for mapping between universal subdirs and platform-specific paths
 * 
 * Note: This module currently uses subdirs-based mapping. Flow-based path resolution
 * will be added in a future update (Section 6.4 of platform-flows implementation).
 */

/**
 * Map a universal file path to platform-specific directory and file paths
 * 
 * TODO (Section 6.4): Update to support flow-based path resolution when flows are defined
 */
export function mapUniversalToPlatform(
  platform: Platform,
  subdir: string,
  relPath: string,
  cwd?: string
): { absDir: string; absFile: string } {
  const definition = getPlatformDefinition(platform, cwd);
  
  // Check if platform uses flows
  if (definition.flows && definition.flows.length > 0) {
    // Use flow-based resolution
    return mapUniversalToPlatformWithFlows(definition, subdir, relPath);
  }
  
  const subdirDef = definition.subdirs.get(subdir);

  if (!subdirDef) {
    throw new Error(`Platform ${platform} does not support subdir ${subdir}`);
  }

  // Build the absolute directory path
  const absDir = join(definition.rootDir, subdirDef.path);

  const packageExtMatch = relPath.match(/\.[^.]+$/);
  const packageExt = packageExtMatch?.[0] ?? '';
  const baseName = packageExt ? relPath.slice(0, -packageExt.length) : relPath;
  const targetExt = packageExt ? getWorkspaceExt(subdirDef, packageExt) : '';
  if (targetExt && !isExtAllowed(subdirDef, targetExt)) {
    logger.warn(
      `Skipped ${relPath} for platform ${platform}: extension ${targetExt} is not allowed in ${subdir}`
    );
    throw new Error(
      `Extension ${targetExt} is not allowed for subdir ${subdir} on platform ${platform}`
    );
  }
  const targetFileName = packageExt ? `${baseName}${targetExt}` : relPath;
  const absFile = join(absDir, targetFileName);

  return { absDir, absFile };
}

/**
 * Map a platform-specific file path back to universal subdir and relative path
 * Supports local platform configs via cwd.
 */
export function mapPlatformFileToUniversal(
  absPath: string,
  cwd = process.cwd()
): { platform: Platform; subdir: string; relPath: string } | null {
  const normalizedPath = normalizePathForProcessing(absPath);


  // Check each platform
  for (const platform of getAllPlatforms({ includeDisabled: true }, cwd)) {
    const definition = getPlatformDefinition(platform, cwd);

    // Check each subdir in this platform
    for (const [subdirName, subdirDef] of definition.subdirs.entries()) {
      const subdir = subdirName;
      const platformSubdirPath = join(definition.rootDir, subdirDef.path);

      // Check if the path contains this platform subdir
      const subdirIndex = findSubpathIndex(normalizedPath, platformSubdirPath);
      if (subdirIndex !== -1) {
        // Extract the relative path within the subdir
        // Find where the subdir ends (either /subdir/ or subdir/)
        const absPattern = `/${platformSubdirPath}/`;
        const relPattern = `${platformSubdirPath}/`;
        const isAbsPattern = normalizedPath.indexOf(absPattern) !== -1;

        const patternLength = isAbsPattern ? absPattern.length : relPattern.length;
        const relPathStart = subdirIndex + patternLength;

        let relPath = normalizedPath.substring(relPathStart);

        const workspaceExtMatch = relPath.match(/\.[^.]+$/);
        if (workspaceExtMatch) {
          const workspaceExt = workspaceExtMatch[0];
          const packageExt = getPackageExt(subdirDef, workspaceExt);
          if (packageExt !== workspaceExt) {
            relPath = relPath.slice(0, -workspaceExt.length) + packageExt;
          }
        }

        return { platform, subdir, relPath };
      }
    }
  }

  return null;
}

/**
 * Resolve install targets for a universal file across all detected platforms
 */
export async function resolveInstallTargets(
  cwd: string,
  file: { universalSubdir: UniversalSubdir; relPath: string; sourceExt: string }
): Promise<Array<{ platform: Platform; absDir: string; absFile: string }>> {
  const detectedPlatforms = await getDetectedPlatforms(cwd);
  const targets: Array<{ platform: Platform; absDir: string; absFile: string }> = [];

  for (const platform of detectedPlatforms) {
    try {
      const { absDir, absFile } = mapUniversalToPlatform(platform, file.universalSubdir, file.relPath, cwd);
      targets.push({
        platform,
        absDir: join(cwd, absDir),
        absFile: join(cwd, absFile)
      });
    } catch (error) {
      // Skip platforms that don't support this subdir
      continue;
    }
  }

  return targets;
}

/**
 * Get all platform subdirectories for a given platform and working directory
 * Returns dynamic subdirs map for extensibility with custom universal subdirs
 */
export function getAllPlatformSubdirs(
  platform: Platform,
  cwd: string
): PlatformPaths {
  return getPlatformDirectoryPathsForPlatform(platform, cwd)
}

/**
 * Get the appropriate target directory for saving a file based on its registry path
 * Uses platform definitions for scalable platform detection
 */
export function resolveTargetDirectory(targetPath: string, registryPath: string): string {
  const normalized = normalizePathForProcessing(registryPath);
  const dir = dirname(normalized);
  if (!dir || dir === '.' || dir === '') {
    return targetPath;
  }
  return join(targetPath, dir);
}

/**
 * Map universal path to platform-specific path using flows configuration.
 * This is a simplified implementation for backward compatibility with existing tests.
 * Full flow execution happens during install/apply operations.
 */
function mapUniversalToPlatformWithFlows(
  definition: PlatformDefinition,
  subdir: string,
  relPath: string
): { absDir: string; absFile: string } {
  const flows = definition.flows || [];
  
  // Find a flow that matches this subdir
  const matchingFlow = flows.find(flow => {
    const fromPattern = flow.from;
    // Simple pattern matching: check if flow starts with subdir
    return fromPattern.startsWith(`${subdir}/`);
  });
  
  if (!matchingFlow) {
    throw new Error(`Platform ${definition.id} does not support subdir ${subdir}`);
  }
  
  // Extract the file name from relPath
  const fileName = basename(relPath);
  const fileExt = extname(relPath);
  
  // Simple pattern resolution for {name} placeholder
  const toPattern = matchingFlow.to;
  let targetPath: string;
  
  if (typeof toPattern === 'string') {
    // Replace {name} with the base name (without extension)
    const baseName = fileName.slice(0, -fileExt.length);
    targetPath = toPattern.replace('{name}', baseName);
    
    // Check if the target pattern changes the extension
    const targetExt = extname(targetPath);
    
    // If no extension in pattern, preserve original extension
    if (!targetExt && fileExt) {
      targetPath += fileExt;
    }
  } else {
    // Multi-target flow - use first target
    const targets = toPattern as Record<string, Partial<import('../types/flows.js').Flow>>;
    const firstTargetConfig = Object.values(targets)[0];
    const firstTargetPath = typeof firstTargetConfig === 'string' ? firstTargetConfig : (firstTargetConfig as any).to;
    
    if (typeof firstTargetPath === 'string') {
      const baseName = fileName.slice(0, -fileExt.length);
      targetPath = firstTargetPath.replace('{name}', baseName);
      
      const targetExt = extname(targetPath);
      if (!targetExt && fileExt) {
        targetPath += fileExt;
      }
    } else {
      throw new Error(`Invalid multi-target flow configuration for platform ${definition.id}`);
    }
  }
  
  // Extension validation for flows
  const targetExt = extname(targetPath);
  
  // Check if extension is allowed by checking if the flow pattern includes it
  const fromPattern = matchingFlow.from;
  const fromExt = extname(fromPattern);
  
  // If the original file has an extension not matching the pattern, warn
  if (fileExt && fromExt && fileExt !== fromExt) {
    logger.warn(
      `Skipped ${relPath} for platform ${definition.id}: extension ${fileExt} does not match flow pattern ${fromPattern}`
    );
    throw new Error(
      `Extension ${fileExt} is not allowed for subdir ${subdir} on platform ${definition.id}`
    );
  }
  
  const absFile = join(process.cwd(), targetPath);
  const absDir = dirname(absFile);
  
  return { absDir, absFile };
}

/**
 * Get the appropriate target file path for saving
 * Handles platform-specific file naming conventions using platform definitions
 */
export function resolveTargetFilePath(targetDir: string, registryPath: string): string {
  const normalized = normalizePathForProcessing(registryPath);
  const fileName = basename(normalized);
  return join(targetDir, fileName || normalized);
}
