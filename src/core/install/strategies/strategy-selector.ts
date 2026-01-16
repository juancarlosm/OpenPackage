/**
 * Strategy Selector Module
 * 
 * Selects the appropriate installation strategy based on package format and target platform.
 */

import type { InstallOptions } from '../../../types/index.js';
import type { FlowInstallContext, InstallationStrategy } from './types.js';
import { DirectInstallStrategy } from './direct-install-strategy.js';
import { PathMappingInstallStrategy } from './path-mapping-strategy.js';
import { ConversionInstallStrategy } from './conversion-strategy.js';
import { FlowBasedInstallStrategy } from './flow-based-strategy.js';
import { logger } from '../../../utils/logger.js';

/**
 * Strategy registry in precedence order
 */
const STRATEGY_REGISTRY: Array<new () => InstallationStrategy> = [
  DirectInstallStrategy,
  PathMappingInstallStrategy,
  ConversionInstallStrategy,
  FlowBasedInstallStrategy  // Default fallback
];

/**
 * Select the appropriate installation strategy based on package format and platform
 * 
 * Strategy selection precedence:
 * 1. DirectInstallStrategy - Exact match, no transformations needed
 * 2. PathMappingInstallStrategy - Native format, path mapping only
 * 3. ConversionInstallStrategy - Cross-platform conversion required
 * 4. FlowBasedInstallStrategy - Universal format, full flow transformations
 * 
 * @param context - Installation context with package metadata
 * @param options - Installation options
 * @returns Selected installation strategy
 */
export function selectInstallStrategy(
  context: FlowInstallContext,
  options?: InstallOptions
): InstallationStrategy {
  const format = context.packageFormat;
  const platform = context.platform;
  
  // If no format provided, default to flow-based strategy
  if (!format) {
    logger.debug('No package format provided, using flow-based strategy', {
      package: context.packageName,
      platform
    });
    return new FlowBasedInstallStrategy();
  }
  
  // Try each strategy in precedence order
  for (const StrategyClass of STRATEGY_REGISTRY) {
    const strategy = new StrategyClass();
    
    if (strategy.canHandle(format, platform)) {
      logger.debug(`Selected installation strategy: ${strategy.name}`, {
        package: context.packageName,
        platform,
        formatType: format.type,
        formatPlatform: format.platform,
        isNativeFormat: format.isNativeFormat,
        nativePlatform: format.nativePlatform
      });
      
      return strategy;
    }
  }
  
  // Fallback to flow-based (should never reach here due to registry design)
  logger.warn('No strategy matched, falling back to flow-based strategy', {
    package: context.packageName,
    platform,
    formatType: format.type
  });
  
  return new FlowBasedInstallStrategy();
}
