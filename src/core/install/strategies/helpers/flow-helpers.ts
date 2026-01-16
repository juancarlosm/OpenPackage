/**
 * Flow Helpers Module
 * 
 * Utilities for retrieving and manipulating flows for installation strategies.
 */

import type { Flow } from '../../../../types/flows.js';
import type { Platform } from '../../../platforms.js';
import { getPlatformDefinition, getGlobalExportFlows } from '../../../platforms.js';

/**
 * Get applicable flows for a platform, including global flows
 */
export function getApplicableFlows(platform: Platform, cwd: string): Flow[] {
  const flows: Flow[] = [];
  
  const globalExportFlows = getGlobalExportFlows(cwd);
  if (globalExportFlows && globalExportFlows.length > 0) {
    flows.push(...globalExportFlows);
  }
  
  const definition = getPlatformDefinition(platform, cwd);
  if (definition.export && definition.export.length > 0) {
    flows.push(...definition.export);
  }
  
  return flows;
}

/**
 * Strip content transformations from flows (for path-mapping-only strategies)
 * Preserves flow structure and merge behavior, but removes transform operations
 */
export function stripContentTransformations(flows: Flow[]): Flow[] {
  return flows.map(flow => {
    const strippedFlow: Flow = {
      from: flow.from,
      to: flow.to
    };
    
    if (flow.merge) {
      strippedFlow.merge = flow.merge;
    }
    
    if (flow.when) {
      strippedFlow.when = flow.when;
    }
    
    return strippedFlow;
  });
}
