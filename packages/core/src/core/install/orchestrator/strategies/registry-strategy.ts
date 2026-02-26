/**
 * RegistryInstallStrategy handles installs from the OpenPackage registry.
 *
 * Registry sources are loaded by the unified pipeline (load phase), since their metadata
 * and resolution behavior is centralized there.
 * When convenience filters (--agents, --skills, etc.) are specified, we load during
 * preprocess and route to multi-resource install, matching git/path strategy behavior.
 */
import type { InstallationContext, PackageSource } from '../../unified/context.js';
import type { ExecutionContext } from '../../../../types/index.js';
import type { NormalizedInstallOptions, InputClassification, PreprocessResult } from '../types.js';
import type { UnifiedSpinner } from '../../../ports/output.js';
import { BaseInstallStrategy } from './base.js';
import { normalizePlatforms } from '../../../platform/platform-mapper.js';
import { getLoaderForSource } from '../../sources/loader-factory.js';
import { createResolvedPackageFromLoaded } from '../../preprocessing/context-population.js';
import { runConvenienceFilterInstall } from '../../preprocessing/convenience-preprocessor.js';

export class RegistryInstallStrategy extends BaseInstallStrategy {
  readonly name = 'registry';
  
  canHandle(classification: InputClassification): boolean {
    return classification.type === 'registry';
  }
  
  async buildContext(
    classification: InputClassification,
    options: NormalizedInstallOptions,
    execContext: ExecutionContext
  ): Promise<InstallationContext> {
    if (classification.type !== 'registry') {
      throw new Error('RegistryStrategy cannot handle non-registry classification');
    }
    
    const source: PackageSource = {
      type: 'registry',
      packageName: classification.packageName,
      version: classification.version,
      resourcePath: classification.resourcePath
    };
    
    return {
      execution: execContext,
      targetDir: execContext.targetDir,
      source,
      mode: 'install',
      options,
      platforms: normalizePlatforms(options.platforms) || [],
      resolvedPackages: [],
      warnings: [],
      errors: []
    };
  }
  
  async preprocess(
    context: InstallationContext,
    options: NormalizedInstallOptions,
    execContext: ExecutionContext,
    spinner?: UnifiedSpinner
  ): Promise<PreprocessResult> {
    // Apply convenience filters (--agents, --skills, etc.) - same as git/path strategies
    if (options.agents?.length || options.skills?.length || options.rules?.length || options.commands?.length) {
      return this.handleConvenienceFilters(context, options, execContext, spinner);
    }

    // Registry sources are handled by the pipeline's load phase
    return this.createNormalResult(context);
  }

  /**
   * Handle convenience filter options for registry packages.
   * Load package, resolve filtered resources, and return multi-resource result.
   */
  private async handleConvenienceFilters(
    context: InstallationContext,
    options: NormalizedInstallOptions,
    _execContext: ExecutionContext,
    spinner?: UnifiedSpinner
  ): Promise<PreprocessResult> {
    const loader = getLoaderForSource(context.source);
    const loaded = await loader.load(context.source, options, _execContext, spinner);

    context.source.packageName = loaded.packageName;
    context.source.version = loaded.version;
    context.source.contentRoot = loaded.contentRoot;
    context.source.pluginMetadata = loaded.pluginMetadata;
    context.resolvedPackages = [createResolvedPackageFromLoaded(loaded, context, { source: 'local' })];

    const convenienceOptions = {
      agents: options.agents,
      skills: options.skills,
      rules: options.rules,
      commands: options.commands
    };
    const resourceContexts = await runConvenienceFilterInstall(context, loaded, convenienceOptions);

    return this.createMultiResourceResult(context, resourceContexts);
  }
}
