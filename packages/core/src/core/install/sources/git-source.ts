import type { PackageSourceLoader, LoadedPackage } from './base.js';
import type { PackageSource } from '../unified/context.js';
import type { InstallOptions, ExecutionContext } from '../../../types/index.js';
import { SourceLoadError } from './base.js';
import { loadPackageFromGit } from '../git-package-loader.js';
import { loadPackageFromPath } from '../path-package-loader.js';
import { detectPluginType } from '../plugin-detector.js';
import { detectBase } from '../base-detector.js';
import { getPlatformsState } from '../../../core/platforms.js';
import { logger } from '../../../utils/logger.js';
import { stat } from 'fs/promises';
import { resolve, dirname } from 'path';

/**
 * Loads packages from git repositories
 */
export class GitSourceLoader implements PackageSourceLoader {
  canHandle(source: PackageSource): boolean {
    return source.type === 'git';
  }
  
  async load(
    source: PackageSource,
    options: InstallOptions,
    execContext: ExecutionContext
  ): Promise<LoadedPackage> {
    if (!source.gitUrl) {
      throw new SourceLoadError(source, 'Git URL is required for git sources');
    }
    
    try {
      // Load package from git
      // Use skipCache when resolutionMode is 'remote-primary' (--remote flag)
      const skipCache = options.resolutionMode === 'remote-primary';
      const result = await loadPackageFromGit({
        url: source.gitUrl,
        ref: source.gitRef,
        path: source.gitPath,
        resourcePath: source.resourcePath,
        skipCache
      });
      
      // Phase 5: If manifest base is present, skip detection (reproducibility)
      let detectedBaseInfo: any = null;
      if (source.manifestBase) {
        // Use base from manifest instead of detecting
        const absoluteBase = resolve(result.repoPath, source.manifestBase);
        detectedBaseInfo = {
          matchType: 'manifest',
          base: absoluteBase,
          baseRelative: source.manifestBase,
          matchedPattern: null
        };
        
        source.detectedBase = absoluteBase;
        
        logger.info('Using base from manifest for git source', {
          base: source.manifestBase,
          absoluteBase
        });
      } else if (source.resourcePath || source.gitPath) {
        // NEW: If a resource path was specified, detect base
        const platformsState = getPlatformsState(execContext.targetDir);
        const platformsConfig = platformsState.config;
        const pathToDetect = source.resourcePath || source.gitPath || '';
        
        detectedBaseInfo = await detectBase(
          pathToDetect,
          result.repoPath,
          platformsConfig
        );
        
        logger.info('Base detection result for git source', {
          matchType: detectedBaseInfo.matchType,
          base: detectedBaseInfo.base,
          matchedPattern: detectedBaseInfo.matchedPattern
        });
        
        // Store detected base in source
        if (detectedBaseInfo.base) {
          source.detectedBase = detectedBaseInfo.base;
        }
      }
      
      // When resourcePath is set, treat as concrete resource install (no marketplace selection).
      // Otherwise, if repo is a marketplace, return placeholder for selection flow.
      if (
        !source.resourcePath &&
        (result.isMarketplace || detectedBaseInfo?.matchType === 'marketplace')
      ) {
        const pluginDetection = await detectPluginType(result.sourcePath);
        
        return {
          metadata: null as any, // Marketplace doesn't have single package
          packageName: '', // Unknown until plugin selection
          version: '0.0.0',
          contentRoot: result.sourcePath,
          source: 'git',
          pluginMetadata: {
            isPlugin: true,
            pluginType: 'marketplace',
            manifestPath: pluginDetection.manifestPath || detectedBaseInfo?.manifestPath
          },
          sourceMetadata: {
            repoPath: result.repoPath,
            commitSha: result.commitSha,
            baseDetection: detectedBaseInfo
          }
        };
      }
      
      // Determine content root.
      // When resourcePath is specified, it is authoritative — the user explicitly requested
      // this specific resource. The detected base serves as validation/metadata, not resolution.
      //
      // Use detectedBase when it has a meaningful containment relationship with resourceRoot:
      //   - detectedBase is at or within resourceRoot (base detection found something more
      //     specific, e.g. a nested plugin.json)
      //   - resourceRoot is within detectedBase AND detectedBase is NOT the repo root
      //     (base detection found the plugin/package root that contains the resource file,
      //     e.g. plugin.json at plugins/codebase-cleanup while resource is
      //     plugins/codebase-cleanup/agents/code-reviewer.md)
      //
      // The repo root is explicitly excluded from the ancestor check because every
      // resourceRoot trivially starts with repoPath + '/'. When detectedBase collapses
      // to the repo root (e.g. marketplace or top-level pattern match), it does not
      // represent a meaningful package base for the specific resource.
      //
      // Fall back to resourceRoot when detectedBase is unrelated, absent, or the repo root.
      // If resourceRoot is a file, use its parent directory since a content root must be
      // a directory.
      let contentRoot: string;
      if (source.resourcePath) {
        const resourceRoot = resolve(result.repoPath, source.resourcePath);
        const detectedBase = detectedBaseInfo?.base;
        
        if (detectedBase && (
          detectedBase.startsWith(resourceRoot) ||   // detectedBase at or within resourceRoot
          (                                          // resourceRoot within detectedBase (file-in-plugin)
            detectedBase !== result.repoPath &&      //   but NOT the repo root (trivially matches everything)
            resourceRoot.startsWith(detectedBase + '/')
          )
        )) {
          // Detected base has a meaningful containment relationship — use it (always a directory).
          contentRoot = detectedBase;
        } else if (detectedBase && detectedBase !== result.repoPath) {
          // Detected base is a meaningful directory that isn't the repo root.
          // This handles cases where base detection found a valid package root
          // that doesn't strictly contain resourceRoot but is still relevant.
          contentRoot = detectedBase;
        } else {
          // Detected base is absent, is the repo root (marketplace/pattern collapsed),
          // or has no relationship. Fall back to resourceRoot, using dirname if it's a file.
          try {
            const s = await stat(resourceRoot);
            contentRoot = s.isDirectory() ? resourceRoot : dirname(resourceRoot);
          } catch {
            // If stat fails (path doesn't exist), use dirname as safe default
            contentRoot = dirname(resourceRoot);
          }
        }
        
        logger.info('Content root resolved via resourcePath', {
          resourcePath: source.resourcePath,
          detectedBase,
          contentRoot
        });
      } else {
        // No resourcePath: use detected base or sourcePath as before.
        contentRoot = detectedBaseInfo?.base || result.sourcePath;
      }
      
      // Load individual package/plugin
      let sourcePackage = await loadPackageFromPath(contentRoot, {
        gitUrl: source.gitUrl,
        path: source.gitPath,
        resourcePath: source.resourcePath,
        repoPath: result.repoPath,
        marketplaceEntry: source.pluginMetadata?.marketplaceEntry
      });
      
      // Detect plugin type at content root
      const pluginDetection = await detectPluginType(contentRoot);
      
      // When resourcePath is set, the user explicitly requested a specific resource.
      // Never propagate pluginType 'marketplace' in this case — it would trigger the
      // marketplace selection prompt in applyBaseDetection, which is wrong because we
      // already have enough information to install directly.
      const suppressMarketplace = source.resourcePath && pluginDetection.type === 'marketplace';
      
      const packageName = sourcePackage.metadata.name;
      const version = sourcePackage.metadata.version || '0.0.0';
      
      // Note: Plugin transformation is handled by the main flow, not here
      return {
        metadata: sourcePackage.metadata,
        packageName,
        version,
        contentRoot,
        source: 'git',
        pluginMetadata: (pluginDetection.isPlugin && !suppressMarketplace) ? {
          isPlugin: true,
          pluginType: pluginDetection.type as any,  // Can be 'individual', 'marketplace', or 'marketplace-defined'
          manifestPath: pluginDetection.manifestPath
        } : undefined,
        sourceMetadata: {
          repoPath: result.repoPath,
          commitSha: result.commitSha,
          baseDetection: detectedBaseInfo
        }
      };
    } catch (error) {
      if (error instanceof SourceLoadError) {
        throw error;
      }
      const err = error as Error;
      const ref = source.gitRef ? `#${source.gitRef}` : '';
      const subdir = source.gitPath ? ` (path: ${source.gitPath})` : '';
      const causeMsg = err?.message ? ` - ${err.message}` : '';
      throw new SourceLoadError(
        source,
        `Failed to load package from git: ${source.gitUrl}${ref}${subdir}${causeMsg}`,
        err
      );
    }
  }
  
}
