/**
 * Load Package Phase
 * Loads package from source using appropriate loader
 */

import type { InstallationContext } from '../context.js';
import { getLoaderForSource } from '../../sources/loader-factory.js';
import { addError, getSourceDisplayName } from '../context-helpers.js';
import { logger } from '../../../../utils/logger.js';
import { Spinner } from '../../../../utils/spinner.js';
import { join, relative } from 'path';

/**
 * Load package from source
 */
export async function loadPackagePhase(ctx: InstallationContext): Promise<void> {
  logger.debug(`Loading package from ${ctx.source.type} source`);
  
  const spinner = new Spinner('Loading package from source');
  
  try {
    // Get appropriate loader
    const loader = getLoaderForSource(ctx.source);
    
    // Display loading message with spinner
    const displayName = getSourceDisplayName(ctx);
    spinner.update(`Loading ${displayName}`);
    spinner.start();
    
    // Load package
    const loaded = await loader.load(ctx.source, ctx.options, ctx.cwd);
    
    spinner.stop();

    // Update context
    ctx.source.packageName = loaded.packageName;
    ctx.source.version = loaded.version;
    
    // Propagate base detection results from loader into context (resource model).
    // Bulk installs previously missed this, causing unscoped installs and incorrect workspace-index paths.
    const baseDetection: any = (loaded.sourceMetadata as any)?.baseDetection;
    if (baseDetection?.base) {
      ctx.detectedBase = baseDetection.base;
      ctx.baseSource = baseDetection.matchType;
      if (baseDetection.matchedPattern && !ctx.matchedPattern) {
        ctx.matchedPattern = baseDetection.matchedPattern;
      }
      if (!ctx.baseRelative && (loaded.sourceMetadata as any)?.repoPath) {
        ctx.baseRelative = relative((loaded.sourceMetadata as any).repoPath, baseDetection.base) || '.';
      }
    }

    // If this install targets a concrete resource (file or dir), scope matchedPattern to that resource.
    // This matches the behavior of individual resource installs.
    const resourcePath = (ctx.source as any).resourcePath as string | undefined;
    const repoRoot = (loaded.sourceMetadata as any)?.repoPath as string | undefined;
    if (resourcePath && repoRoot) {
      const baseAbs = ctx.detectedBase || loaded.contentRoot;
      const absResourcePath = join(repoRoot, resourcePath);
      const relToBaseRaw = relative(baseAbs, absResourcePath).replace(/\\/g, '/').replace(/^\.\/?/, '');
      if (relToBaseRaw && !relToBaseRaw.startsWith('..')) {
        let isDirectory = false;
        try {
          const stat = await import('fs/promises').then(m => m.stat(absResourcePath));
          isDirectory = stat.isDirectory();
        } catch {
          // If stat fails, fall back to file-like behavior using the relative path.
        }
        ctx.matchedPattern = isDirectory ? `${relToBaseRaw.replace(/\/$/, '')}/**` : relToBaseRaw;
      }
    }

    // Use detected base as content root if available (Phase 4: Resource model)
    const effectiveContentRoot = ctx.detectedBase || loaded.contentRoot;
    ctx.source.contentRoot = effectiveContentRoot;
    
    ctx.source.pluginMetadata = loaded.pluginMetadata;
    
    // Store commit SHA for git sources (needed for workspace index marketplace metadata)
    if (loaded.sourceMetadata?.commitSha) {
      if (!ctx.source.pluginMetadata) {
        ctx.source.pluginMetadata = { isPlugin: false };
      }
      if (!ctx.source.pluginMetadata.marketplaceSource && loaded.sourceMetadata.commitSha) {
        // Store commit SHA for potential marketplace source tracking
        (ctx.source as any)._commitSha = loaded.sourceMetadata.commitSha;
      }
    }
    
    // Map source type to ResolvedPackage source format
    let resolvedSource: 'local' | 'remote' | 'path' | 'git' | undefined;
    switch (ctx.source.type) {
      case 'registry':
        resolvedSource = 'local'; // Registry packages are local
        break;
      case 'path':
        resolvedSource = 'path';
        break;
      case 'git':
        resolvedSource = 'git';
        break;
      case 'workspace':
        resolvedSource = 'local'; // Workspace packages are local
        break;
    }
    
    // Create root resolved package (simplified - full dependency resolution in next phase)
    const rootPackage: any = {
      name: loaded.packageName,
      version: loaded.version,
      pkg: { 
        metadata: loaded.metadata, 
        files: [], 
        _format: (loaded.metadata as any)?._format || ctx.source.pluginMetadata?.format 
      },
      isRoot: true,
      source: resolvedSource,
      contentRoot: effectiveContentRoot  // Use detected base as content root
    };
    
    // Add marketplace metadata if present
    if (ctx.source.pluginMetadata?.marketplaceSource) {
      rootPackage.marketplaceMetadata = ctx.source.pluginMetadata.marketplaceSource;
    }
    
    ctx.resolvedPackages = [rootPackage];
    
    logger.info(`Loaded ${loaded.packageName}@${loaded.version} from ${loaded.source}`);
    
  } catch (error) {
    spinner.stop();
    const errorMsg = `Failed to load package: ${error}`;
    addError(ctx, errorMsg);
    throw new Error(errorMsg);
  }
}
