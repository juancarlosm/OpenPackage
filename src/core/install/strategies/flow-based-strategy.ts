/**
 * Standard Flow-Based Installation Strategy
 * 
 * Applies platform flows with full transformations.
 * Used for universal format packages.
 */

import { join, relative, dirname, basename } from 'path';
import type { Platform } from '../../platforms.js';
import type { PackageFormat } from '../format-detector.js';
import type { InstallOptions } from '../../../types/index.js';
import type { FlowInstallContext, FlowInstallResult } from './types.js';
import type { Flow, FlowContext, SwitchExpression } from '../../../types/flows.js';
import { BaseStrategy } from './base-strategy.js';
import { platformUsesFlows } from '../../platforms.js';
import { filterSourcesByPlatform } from './helpers/platform-filtering.js';
import { convertToInstallResult } from './helpers/result-converter.js';
import { discoverFlowSources } from '../../flows/flow-source-discovery.js';
import { executeFlowsForSources } from '../../flows/flow-execution-coordinator.js';
import {
  resolveTargetFromGlob,
} from '../../flows/flow-execution-coordinator.js';
import {
  resolvePattern,
  extractCapturedName,
  getFirstFromPattern,
} from '../../flows/flow-source-discovery.js';
import { resolveSwitchExpression } from '../../flows/switch-resolver.js';
import {
  buildOwnershipContext,
  resolveConflictsForTargets,
  type TargetEntry,
} from '../conflicts/file-conflict-resolver.js';
import { logger } from '../../../utils/logger.js';
import { readWorkspaceIndex } from '../../../utils/workspace-index-yml.js';

/**
 * Standard Flow-Based Installation Strategy
 * 
 * Applies platform flows with full transformations.
 * Used for universal format packages.
 */
export class FlowBasedInstallStrategy extends BaseStrategy {
  readonly name = 'flow-based';
  
  canHandle(format: PackageFormat, platform: Platform): boolean {
    // Default strategy - handles all remaining cases
    return true;
  }
  
  async install(
    context: FlowInstallContext,
    options?: InstallOptions,
    forceOverwrite: boolean = false
  ): Promise<FlowInstallResult> {
    const { packageName, packageRoot, workspaceRoot, platform, dryRun } = context;
    
    this.logStrategySelection(context);
    
    // Check if platform uses flows
    if (!platformUsesFlows(platform, workspaceRoot)) {
      return this.createEmptyResult();
    }
    
    // Get applicable flows
    const flows = this.getApplicableFlows(platform, workspaceRoot);
    if (flows.length === 0) {
      return this.createEmptyResult();
    }
    
    // Build context
    const flowContext = this.buildFlowContext(context, 'install');
    
    // Discover sources
    const flowSources = await discoverFlowSources(flows, packageRoot, flowContext);

    // Apply resource filtering if specified
    const resourceFilteredSources = this.applyResourceFiltering(
      flowSources,
      context.matchedPattern,
      packageRoot
    );
    
    // Filter by platform
    const filteredSources = filterSourcesByPlatform(resourceFilteredSources, platform);

    // -----------------------------------------------------------------------
    // File-level conflict resolution (Phase 3)
    // -----------------------------------------------------------------------
    const effectiveOptions = options ?? {};
    const conflictWarnings: string[] = [];

    try {
      // Pre-compute the target paths that will be written by the flows
      const targets = this.computeTargetEntries(filteredSources, flowContext);

      if (targets.length > 0) {
        // Load the package's previous workspace-index record to determine previously-owned paths
        const previousRecord = await this.readPreviousIndexRecord(workspaceRoot, packageName);

        // Build ownership context (other-package indexes + previous-owned paths)
        const ownershipContext = await buildOwnershipContext(
          workspaceRoot,
          packageName,
          previousRecord
        );

        // Resolve conflicts — get back the filtered set of allowed targets
        const { allowedTargets, warnings } = await resolveConflictsForTargets(
          workspaceRoot,
          targets,
          ownershipContext,
          effectiveOptions,
          forceOverwrite
        );
        conflictWarnings.push(...warnings);

        // Rebuild filteredSources keeping only flows whose targets were allowed
        const allowedRelPaths = new Set(allowedTargets.map(t => t.relPath));
        const prunedSources = this.pruneSourcesByAllowedTargets(
          filteredSources,
          flowContext,
          allowedRelPaths
        );

        // Execute flows on the pruned source set
        const executionResult = await executeFlowsForSources(prunedSources, flowContext);
        const result = convertToInstallResult(executionResult, packageName, platform, dryRun);

        // Surface conflict warnings as additional FlowConflictReport entries
        for (const msg of conflictWarnings) {
          logger.warn(msg);
          result.conflicts.push({
            targetPath: '',
            packages: [{ packageName, priority: 0, chosen: true }],
            message: msg
          });
        }

        this.logResults(result, context);
        return result;
      }
    } catch (error) {
      // Conflict resolution is best-effort: on unexpected failure log and continue
      logger.warn(`File conflict resolution failed for ${packageName}: ${error}. Proceeding without conflict checks.`);
    }

    // Execute flows (no targets to conflict-check, or conflict resolution errored)
    const executionResult = await executeFlowsForSources(filteredSources, flowContext);
    
    // Convert to result
    const result = convertToInstallResult(executionResult, packageName, platform, dryRun);
    
    this.logResults(result, context);
    
    return result;
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /**
   * Pre-compute the workspace-relative target path for each (flow, source) pair
   * using the same resolution logic as the flow execution coordinator.
   */
  private computeTargetEntries(
    flowSources: Map<Flow, string[]>,
    flowContext: FlowContext
  ): TargetEntry[] {
    const entries: TargetEntry[] = [];

    for (const [flow, sources] of flowSources) {
      const firstPattern = getFirstFromPattern(flow.from);

      for (const sourceRel of sources) {
        try {
          const sourceAbs = join(flowContext.packageRoot, sourceRel);
          const capturedName = extractCapturedName(sourceRel, firstPattern);

          const sourceContext: FlowContext = {
            ...flowContext,
            variables: {
              ...flowContext.variables,
              sourcePath: sourceRel,
              sourceDir: dirname(sourceRel),
              sourceFile: basename(sourceRel),
              ...(capturedName ? { capturedName } : {})
            }
          };

          let rawToPattern: string;
          if (typeof flow.to === 'string') {
            rawToPattern = flow.to;
          } else if (isSwitchExpression(flow.to)) {
            rawToPattern = resolveSwitchExpression(flow.to as SwitchExpression, sourceContext);
          } else if (typeof flow.to === 'object' && flow.to !== null && 'pattern' in flow.to) {
            rawToPattern = (flow.to as { pattern: string }).pattern;
          } else {
            rawToPattern = Object.keys(flow.to as object)[0] ?? '';
          }

          const resolvedToPattern = resolvePattern(rawToPattern, sourceContext, capturedName);
          const targetAbs = resolveTargetFromGlob(
            sourceAbs,
            firstPattern,
            resolvedToPattern,
            sourceContext
          );

          const targetRelRaw = relative(flowContext.workspaceRoot, targetAbs);
          const targetRel = targetRelRaw.replace(/\\/g, '/');

          entries.push({ relPath: targetRel, absPath: targetAbs });
        } catch {
          // If target resolution fails for a source, skip it — the executor
          // will handle the error properly during execution.
        }
      }
    }

    return entries;
  }

  /**
   * Remove from filteredSources any (flow, source) pair whose resolved target
   * was not in the allowedRelPaths set.
   */
  private pruneSourcesByAllowedTargets(
    flowSources: Map<Flow, string[]>,
    flowContext: FlowContext,
    allowedRelPaths: Set<string>
  ): Map<Flow, string[]> {
    const pruned = new Map<Flow, string[]>();

    for (const [flow, sources] of flowSources) {
      const firstPattern = getFirstFromPattern(flow.from);
      const keptSources: string[] = [];

      for (const sourceRel of sources) {
        try {
          const sourceAbs = join(flowContext.packageRoot, sourceRel);
          const capturedName = extractCapturedName(sourceRel, firstPattern);

          const sourceContext: FlowContext = {
            ...flowContext,
            variables: {
              ...flowContext.variables,
              sourcePath: sourceRel,
              sourceDir: dirname(sourceRel),
              sourceFile: basename(sourceRel),
              ...(capturedName ? { capturedName } : {})
            }
          };

          let rawToPattern: string;
          if (typeof flow.to === 'string') {
            rawToPattern = flow.to;
          } else if (isSwitchExpression(flow.to)) {
            rawToPattern = resolveSwitchExpression(flow.to as SwitchExpression, sourceContext);
          } else if (typeof flow.to === 'object' && flow.to !== null && 'pattern' in flow.to) {
            rawToPattern = (flow.to as { pattern: string }).pattern;
          } else {
            rawToPattern = Object.keys(flow.to as object)[0] ?? '';
          }

          const resolvedToPattern = resolvePattern(rawToPattern, sourceContext, capturedName);
          const targetAbs = resolveTargetFromGlob(
            sourceAbs,
            firstPattern,
            resolvedToPattern,
            sourceContext
          );
          const targetRelRaw = relative(flowContext.workspaceRoot, targetAbs);
          const targetRel = targetRelRaw.replace(/\\/g, '/');

          if (allowedRelPaths.has(targetRel)) {
            keptSources.push(sourceRel);
          }
        } catch {
          // On resolution failure, keep the source so the executor handles it
          keptSources.push(sourceRel);
        }
      }

      if (keptSources.length > 0) {
        pruned.set(flow, keptSources);
      }
    }

    return pruned;
  }

  /**
   * Read the package's existing workspace-index entry (its files mapping),
   * used to determine which paths were previously owned by this package.
   */
  private async readPreviousIndexRecord(
    cwd: string,
    packageName: string
  ): Promise<{ files: Record<string, any[]> } | null> {
    try {
      const wsRecord = await readWorkspaceIndex(cwd);
      const entry = wsRecord.index.packages?.[packageName];
      if (!entry) return null;
      return { files: entry.files ?? {} };
    } catch {
      return null;
    }
  }
}

// -------------------------------------------------------------------------
// Module-private helper (mirrors isSwitchExpression in flow-execution-coordinator)
// -------------------------------------------------------------------------
function isSwitchExpression(value: unknown): value is SwitchExpression {
  return (
    typeof value === 'object' &&
    value !== null &&
    '$switch' in (value as object)
  );
}
