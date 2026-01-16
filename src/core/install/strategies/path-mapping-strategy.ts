/**
 * Path Mapping Installation Strategy
 * 
 * Applies flow-based path mappings without content transformations.
 * Used for native format packages (e.g., Claude plugin with Claude-format content).
 */

import type { Platform } from '../../platforms.js';
import type { PackageFormat } from '../format-detector.js';
import type { InstallOptions } from '../../../types/index.js';
import type { FlowInstallContext, FlowInstallResult } from './types.js';
import { BaseStrategy } from './base-strategy.js';
import { DirectInstallStrategy } from './direct-install-strategy.js';
import { shouldUsePathMappingOnly } from '../format-detector.js';
import { platformUsesFlows } from '../../platforms.js';
import { stripContentTransformations } from './helpers/flow-helpers.js';
import { filterSourcesByPlatform } from './helpers/platform-filtering.js';
import { convertToInstallResult } from './helpers/result-converter.js';
import { discoverFlowSources } from '../../flows/flow-source-discovery.js';
import { executeFlowsForSources } from '../../flows/flow-execution-coordinator.js';
import { logger } from '../../../utils/logger.js';

/**
 * Path Mapping Installation Strategy
 * 
 * Applies flow-based path mappings without content transformations.
 * Used for native format packages (e.g., Claude plugin with Claude-format content).
 */
export class PathMappingInstallStrategy extends BaseStrategy {
  readonly name = 'path-mapping';
  
  canHandle(format: PackageFormat, platform: Platform): boolean {
    return shouldUsePathMappingOnly(format, platform);
  }
  
  async install(
    context: FlowInstallContext,
    options?: InstallOptions
  ): Promise<FlowInstallResult> {
    const { packageName, packageRoot, workspaceRoot, platform, dryRun } = context;
    
    this.logStrategySelection(context);
    
    logger.info(`Installing ${packageName} with path mapping only for ${platform} (native format)`);
    
    // Check if platform uses flows
    if (!platformUsesFlows(platform, workspaceRoot)) {
      logger.warn(`Platform ${platform} does not use flows, falling back to direct installation`);
      const directStrategy = new DirectInstallStrategy();
      return await directStrategy.install(context, options);
    }
    
    // Get flows and strip content transformations
    let flows = this.getApplicableFlows(platform, workspaceRoot);
    if (flows.length === 0) {
      logger.warn(`No flows defined for platform ${platform}, falling back to direct installation`);
      const directStrategy = new DirectInstallStrategy();
      return await directStrategy.install(context, options);
    }
    
    flows = stripContentTransformations(flows);
    
    logger.debug(`Using ${flows.length} path-mapping-only flows for ${platform}`);
    
    // Build context and execute flows
    const flowContext = this.buildFlowContext(context, 'install');
    
    // Discover sources
    const flowSources = await discoverFlowSources(flows, packageRoot, flowContext);
    
    // Filter sources by platform
    const filteredSources = filterSourcesByPlatform(flowSources, platform);
    
    // Execute flows
    const executionResult = await executeFlowsForSources(filteredSources, flowContext);
    
    // Convert to FlowInstallResult
    const result = convertToInstallResult(executionResult, packageName, platform, dryRun);
    
    this.logResults(result, context);
    
    return result;
  }
}
