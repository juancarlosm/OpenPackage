import type { InstallationContext, PackageSource } from '../../unified/context.js';
import type { 
  NormalizedInstallOptions, 
  InputClassification, 
  PreprocessResult 
} from '../types.js';
import { BaseInstallStrategy } from './base.js';
import { getLoaderForSource } from '../../sources/loader-factory.js';
import { applyConvenienceFilters, displayFilterErrors } from '../../convenience-matchers.js';
import { buildResourceInstallContexts } from '../../unified/context-builders.js';
import { normalizePlatforms } from '../../../../utils/platform-mapper.js';
import { logger } from '../../../../utils/logger.js';
import { join, relative } from 'path';
import { stat } from 'fs/promises';

export class GitInstallStrategy extends BaseInstallStrategy {
  readonly name = 'git';
  
  canHandle(classification: InputClassification): boolean {
    return classification.type === 'git';
  }
  
  async buildContext(
    classification: InputClassification,
    options: NormalizedInstallOptions,
    cwd: string
  ): Promise<InstallationContext> {
    if (classification.type !== 'git') {
      throw new Error('GitStrategy cannot handle non-git classification');
    }
    
    const source: PackageSource = {
      type: 'git',
      packageName: '', // Populated after loading
      gitUrl: classification.gitUrl,
      gitRef: classification.gitRef,
      resourcePath: classification.resourcePath
    };
    
    return {
      source,
      mode: 'install',
      options,
      platforms: normalizePlatforms(options.platforms) || [],
      cwd,
      targetDir: '.',
      resolvedPackages: [],
      warnings: [],
      errors: []
    };
  }
  
  async preprocess(
    context: InstallationContext,
    options: NormalizedInstallOptions,
    cwd: string
  ): Promise<PreprocessResult> {
    // Load the source
    const loader = getLoaderForSource(context.source);
    const loaded = await loader.load(context.source, options, cwd);
    
    // Update context with loaded info
    context.source.packageName = loaded.packageName;
    context.source.version = loaded.version;
    context.source.contentRoot = loaded.contentRoot;
    context.source.pluginMetadata = loaded.pluginMetadata;
    
    // Store commitSha for marketplace
    if (loaded.sourceMetadata?.commitSha) {
      (context.source as any)._commitSha = loaded.sourceMetadata.commitSha;
    }
    
    // Check for marketplace (early exit)
    if (loaded.pluginMetadata?.pluginType === 'marketplace') {
      return this.createMarketplaceResult(context);
    }
    
    // Process base detection
    if (loaded.sourceMetadata?.baseDetection) {
      const baseDetection = loaded.sourceMetadata.baseDetection;
      context.detectedBase = baseDetection.base;
      context.matchedPattern = baseDetection.matchedPattern;
      context.baseSource = baseDetection.matchType as any;
      
      if (baseDetection.matchType === 'marketplace') {
        return this.createMarketplaceResult(context);
      }
      
      if (baseDetection.matchType === 'ambiguous' && baseDetection.ambiguousMatches) {
        return this.createAmbiguousResult(context, baseDetection.ambiguousMatches);
      }
      
      // Calculate base relative path
      if (context.detectedBase && loaded.contentRoot) {
        context.baseRelative = relative(loaded.contentRoot, context.detectedBase) || '.';
      }
    }
    
    // Apply resource path scoping
    const resourcePath = context.source.resourcePath;
    if (resourcePath) {
      await this.applyResourcePathScoping(context, loaded, resourcePath);
    }
    
    // Apply convenience filters (--agents, --skills)
    if (options.agents?.length || options.skills?.length) {
      return this.handleConvenienceFilters(context, loaded, options, cwd);
    }
    
    // Warn about unused --plugins flag
    if (options.plugins?.length && !options.agents && !options.skills) {
      console.log('Warning: --plugins flag is only used with marketplace sources. Ignoring.');
    }
    
    return this.createNormalResult(context);
  }
  
  /**
   * Apply resource path scoping to narrow installation.
   */
  private async applyResourcePathScoping(
    context: InstallationContext,
    loaded: any,
    resourcePath: string
  ): Promise<void> {
    const repoRoot = loaded.sourceMetadata?.repoPath || loaded.contentRoot || context.detectedBase || context.cwd;
    const baseAbs = context.detectedBase || loaded.contentRoot || context.cwd;
    const absResourcePath = join(repoRoot, resourcePath);
    const relativeToBase = relative(baseAbs, absResourcePath).replace(/\\/g, '/').replace(/^\.\/?/, '');
    
    if (relativeToBase && !relativeToBase.startsWith('..')) {
      let isDirectory = false;
      try {
        const s = await stat(absResourcePath);
        isDirectory = s.isDirectory();
      } catch {
        // Keep existing matchedPattern
        return;
      }
      
      const scopedPattern = isDirectory
        ? `${relativeToBase.replace(/\/$/, '')}/**`
        : relativeToBase;
      
      context.matchedPattern = scopedPattern;
    }
  }
  
  /**
   * Handle convenience filter options.
   */
  private async handleConvenienceFilters(
    context: InstallationContext,
    loaded: any,
    options: NormalizedInstallOptions,
    cwd: string
  ): Promise<PreprocessResult> {
    const basePath = context.detectedBase || loaded.contentRoot || cwd;
    const repoRoot = loaded.sourceMetadata?.repoPath || loaded.contentRoot || basePath;
    
    const filterResult = await applyConvenienceFilters(basePath, repoRoot, {
      agents: options.agents,
      skills: options.skills
    });
    
    if (filterResult.errors.length > 0) {
      displayFilterErrors(filterResult.errors);
      
      if (filterResult.resources.length === 0) {
        throw new Error('None of the requested resources were found');
      }
      
      console.log(`\n⚠️  Continuing with ${filterResult.resources.length} resource(s)\n`);
    }
    
    const resourceContexts = buildResourceInstallContexts(context, filterResult.resources, repoRoot);
    return this.createMultiResourceResult(context, resourceContexts);
  }
}
