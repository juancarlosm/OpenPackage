/**
 * Flow Installation Strategies
 * 
 * Implements the Strategy pattern for different package installation approaches:
 * - Direct installation (AS-IS copy)
 * - Path mapping only (structure change, no content transform)
 * - Format conversion (platform-specific → universal → target platform)
 * - Standard flow-based (universal → platform-specific)
 */

import { join, relative, dirname, basename } from 'path';
import { promises as fs } from 'fs';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import type { Platform } from '../platforms.js';
import type { FlowContext, Flow } from '../../types/flows.js';
import type { InstallOptions, Package } from '../../types/index.js';
import type { PackageFormat } from './format-detector.js';
import {
  shouldInstallDirectly,
  shouldUsePathMappingOnly,
  needsConversion,
  detectPackageFormat
} from './format-detector.js';
import {
  getPlatformDefinition,
  getGlobalExportFlows,
  platformUsesFlows,
  deriveRootDirFromFlows
} from '../platforms.js';
import { createPlatformConverter } from '../flows/platform-converter.js';
import { discoverFlowSources } from '../flows/flow-source-discovery.js';
import { 
  executeFlowsForSources,
  buildFlowContext 
} from '../flows/flow-execution-coordinator.js';
import {
  buildOverrideMap,
  shouldSkipUniversalFile,
  isPlatformSpecificFileForTarget
} from '../flows/platform-suffix-handler.js';
import { walkFiles } from '../../utils/file-walker.js';
import { exists, ensureDir, readTextFile, writeTextFile } from '../../utils/fs.js';
import { logger } from '../../utils/logger.js';
import { toTildePath } from '../../utils/path-resolution.js';

/**
 * Installation context
 */
export interface FlowInstallContext {
  packageName: string;
  packageRoot: string;
  workspaceRoot: string;
  platform: Platform;
  packageVersion: string;
  priority: number;
  dryRun: boolean;
  packageFormat?: PackageFormat;
}

/**
 * Installation result
 */
export interface FlowInstallResult {
  success: boolean;
  filesProcessed: number;
  filesWritten: number;
  conflicts: FlowConflictReport[];
  errors: FlowInstallError[];
  targetPaths: string[];
  fileMapping: Record<string, any[]>;
}

export interface FlowConflictReport {
  targetPath: string;
  packages: Array<{
    packageName: string;
    priority: number;
    chosen: boolean;
  }>;
  message: string;
}

export interface FlowInstallError {
  flow: Flow;
  sourcePath: string;
  error: Error;
  message: string;
}

/**
 * Installation strategy interface
 */
export interface InstallationStrategy {
  /**
   * Check if this strategy can handle the given format/platform combination
   */
  canHandle(format: PackageFormat, platform: Platform): boolean;
  
  /**
   * Execute installation
   */
  install(
    context: FlowInstallContext,
    options?: InstallOptions
  ): Promise<FlowInstallResult>;
  
  /**
   * Strategy name for logging
   */
  readonly name: string;
}

/**
 * Direct Installation Strategy
 * 
 * Copies files AS-IS from package to workspace without any transformations.
 * Used when source platform = target platform and no structure changes needed.
 */
export class DirectInstallStrategy implements InstallationStrategy {
  readonly name = 'direct';
  
  canHandle(format: PackageFormat, platform: Platform): boolean {
    return shouldInstallDirectly(format, platform);
  }
  
  async install(
    context: FlowInstallContext,
    options?: InstallOptions
  ): Promise<FlowInstallResult> {
    const { packageName, packageRoot, workspaceRoot, platform, dryRun } = context;
    
    const result: FlowInstallResult = {
      success: true,
      filesProcessed: 0,
      filesWritten: 0,
      conflicts: [],
      errors: [],
      targetPaths: [],
      fileMapping: {}
    };
    
    logger.info(`Installing ${packageName} directly for ${platform} (no transformations)`);
    
    try {
      for await (const sourcePath of walkFiles(packageRoot)) {
        const relativePath = relative(packageRoot, sourcePath);
        
        // Skip metadata files
        if (relativePath.startsWith('.openpackage/') || relativePath === 'openpackage.yml') {
          continue;
        }
        
        const targetPath = join(workspaceRoot, relativePath);
        result.filesProcessed++;
        
        if (!dryRun) {
          await ensureDir(dirname(targetPath));
          await fs.copyFile(sourcePath, targetPath);
          result.filesWritten++;
        }
        
        result.targetPaths.push(targetPath);
        
        if (!result.fileMapping[relativePath]) {
          result.fileMapping[relativePath] = [];
        }
        result.fileMapping[relativePath].push(relativePath);
      }
      
      logger.info(`Direct installation complete: ${result.filesProcessed} files processed`);
      
    } catch (error) {
      logger.error('Direct installation failed', { packageName, error });
      result.success = false;
      result.errors.push({
        flow: { from: packageRoot, to: workspaceRoot },
        sourcePath: packageRoot,
        error: error as Error,
        message: `Failed to install directly: ${(error as Error).message}`
      });
    }
    
    return result;
  }
}

/**
 * Path Mapping Installation Strategy
 * 
 * Applies flow-based path mappings without content transformations.
 * Used for native format packages (e.g., Claude plugin with Claude-format content).
 */
export class PathMappingInstallStrategy implements InstallationStrategy {
  readonly name = 'path-mapping';
  
  canHandle(format: PackageFormat, platform: Platform): boolean {
    return shouldUsePathMappingOnly(format, platform);
  }
  
  async install(
    context: FlowInstallContext,
    options?: InstallOptions
  ): Promise<FlowInstallResult> {
    const {
      packageName,
      packageRoot,
      workspaceRoot,
      platform,
      packageVersion,
      priority,
      dryRun
    } = context;
    
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
    
    flows = this.stripContentTransformations(flows);
    
    logger.debug(`Using ${flows.length} path-mapping-only flows for ${platform}`);
    
    // Build context and execute flows
    const platformDef = getPlatformDefinition(platform, workspaceRoot);
    const flowContext = buildFlowContext(
      {
        workspaceRoot,
        packageRoot,
        platform,
        packageName,
        packageVersion,
        priority,
        dryRun,
        direction: 'install'
      },
      {
        rootFile: platformDef.rootFile,
        rootDir: deriveRootDirFromFlows(platformDef)
      }
    );
    
    // Discover sources
    const flowSources = await discoverFlowSources(flows, packageRoot, flowContext);
    
    // Build override map and filter sources
    const filteredSources = this.filterSourcesByPlatform(flowSources, platform);
    
    // Execute flows
    const executionResult = await executeFlowsForSources(filteredSources, flowContext);
    
    // Convert to FlowInstallResult
    const result = this.convertToInstallResult(executionResult, packageName, platform, dryRun);
    
    return result;
  }
  
  private getApplicableFlows(platform: Platform, cwd: string): Flow[] {
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
  
  private stripContentTransformations(flows: Flow[]): Flow[] {
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
  
  private filterSourcesByPlatform(
    flowSources: Map<Flow, string[]>,
    platform: Platform
  ): Map<Flow, string[]> {
    const filtered = new Map<Flow, string[]>();
    
    // Build override map once
    const allSources: string[] = [];
    for (const sources of flowSources.values()) {
      allSources.push(...sources);
    }
    const overrideMap = buildOverrideMap(allSources);
    
    for (const [flow, sources] of flowSources) {
      const filteredSourcesForFlow: string[] = [];
      
      for (const sourceRel of sources) {
        // Skip platform-specific files not for this platform
        if (!isPlatformSpecificFileForTarget(sourceRel, platform) && 
            sourceRel.includes('.') && 
            sourceRel.split('.').length >= 3) {
          const parts = basename(sourceRel).split('.');
          const possiblePlatform = parts[parts.length - 2];
          if (possiblePlatform !== platform && isPlatformId(possiblePlatform)) {
            continue;
          }
        }
        
        // Skip universal files with platform overrides
        if (shouldSkipUniversalFile(sourceRel, platform, allSources, overrideMap)) {
          continue;
        }
        
        filteredSourcesForFlow.push(sourceRel);
      }
      
      if (filteredSourcesForFlow.length > 0) {
        filtered.set(flow, filteredSourcesForFlow);
      }
    }
    
    return filtered;
  }
  
  private convertToInstallResult(
    executionResult: any,
    packageName: string,
    platform: Platform,
    dryRun: boolean
  ): FlowInstallResult {
    const result: FlowInstallResult = {
      success: executionResult.success,
      filesProcessed: executionResult.filesProcessed,
      filesWritten: executionResult.filesWritten,
      conflicts: executionResult.conflicts.map((c: any) => ({
        targetPath: c.path,
        packages: [
          { packageName: c.winner, priority: 0, chosen: true },
          ...c.losers.map((loser: string) => ({
            packageName: loser,
            priority: 0,
            chosen: false
          }))
        ],
        message: `Conflict in ${c.path}: ${c.winner} overwrites ${c.losers.join(', ')}`
      })),
      errors: executionResult.errors,
      targetPaths: executionResult.targetPaths,
      fileMapping: executionResult.fileMapping
    };
    
    // Log results
    if (result.filesProcessed > 0) {
      logger.info(
        `Processed ${result.filesProcessed} files for ${packageName} on platform ${platform}` +
        (dryRun ? ' (dry run)' : `, wrote ${result.filesWritten} files`)
      );
    }
    
    return result;
  }
}

/**
 * Import isPlatformId helper
 */
function isPlatformId(id: string): boolean {
  const { isPlatformId: check } = require('../platforms.js');
  return check(id);
}

/**
 * Format Conversion Installation Strategy
 * 
 * Converts package from source format → universal → target platform format.
 * Used when source platform ≠ target platform.
 */
export class ConversionInstallStrategy implements InstallationStrategy {
  readonly name = 'conversion';
  
  canHandle(format: PackageFormat, platform: Platform): boolean {
    return needsConversion(format, platform);
  }
  
  async install(
    context: FlowInstallContext,
    options?: InstallOptions
  ): Promise<FlowInstallResult> {
    const { packageName, packageRoot, workspaceRoot, platform, dryRun } = context;
    
    const result: FlowInstallResult = {
      success: true,
      filesProcessed: 0,
      filesWritten: 0,
      conflicts: [],
      errors: [],
      targetPaths: [],
      fileMapping: {}
    };
    
    logger.info(`Converting ${packageName} to ${platform} format`);
    
    try {
      // Load package files
      const packageFiles: Array<{ path: string; content: string }> = [];
      
      for await (const sourcePath of walkFiles(packageRoot)) {
        const relativePath = relative(packageRoot, sourcePath);
        
        if (relativePath.startsWith('.openpackage/') || relativePath === 'openpackage.yml') {
          continue;
        }
        
        const content = await readTextFile(sourcePath);
        packageFiles.push({ path: relativePath, content, encoding: 'utf8' } as any);
      }
      
      // Create package object
      const pkg: Package = {
        metadata: {
          name: packageName,
          version: context.packageVersion
        },
        files: packageFiles,
        _format: context.packageFormat || await this.detectFormat(packageRoot)
      };
      
      // Convert to universal format
      const converter = createPlatformConverter(workspaceRoot);
      const conversionResult = await converter.convert(pkg, platform, { dryRun });
      
      if (!conversionResult.success || !conversionResult.convertedPackage) {
        logger.error('Package conversion failed', {
          package: packageName,
          stages: conversionResult.stages
        });
        
        result.success = false;
        result.errors.push({
          flow: { from: packageRoot, to: workspaceRoot },
          sourcePath: packageRoot,
          error: new Error('Conversion failed'),
          message: 'Failed to convert package format'
        });
        
        return result;
      }
      
      logger.info(
        `Conversion to universal format complete (${conversionResult.stages.length} stages), ` +
        `now applying ${platform} platform flows`
      );
      
      // Write converted files to temp directory
      let tempPackageRoot: string | null = null;
      
      try {
        tempPackageRoot = await mkdtemp(join(tmpdir(), 'opkg-converted-'));
        
        for (const file of conversionResult.convertedPackage.files) {
          const filePath = join(tempPackageRoot, file.path);
          await ensureDir(dirname(filePath));
          await writeTextFile(filePath, file.content);
        }
        
        logger.debug(
          `Wrote ${conversionResult.convertedPackage.files.length} converted files to temp directory`,
          { tempPackageRoot }
        );
        
        // Install from temp directory using standard flow-based installation
        const flowStrategy = new FlowBasedInstallStrategy();
        const convertedContext: FlowInstallContext = {
          ...context,
          packageRoot: tempPackageRoot
        };
        
        const installResult = await flowStrategy.install(convertedContext, options);
        
        // Cleanup temp directory
        if (tempPackageRoot) {
          await rm(tempPackageRoot, { recursive: true, force: true });
        }
        
        return installResult;
        
      } catch (error) {
        if (tempPackageRoot) {
          try {
            await rm(tempPackageRoot, { recursive: true, force: true });
          } catch (cleanupError) {
            logger.warn('Failed to cleanup temp directory after error', {
              tempPackageRoot,
              cleanupError
            });
          }
        }
        
        logger.error('Failed to install converted package', { packageName, error });
        result.success = false;
        result.errors.push({
          flow: { from: packageRoot, to: workspaceRoot },
          sourcePath: packageRoot,
          error: error as Error,
          message: `Failed to install converted package: ${(error as Error).message}`
        });
        
        return result;
      }
      
    } catch (error) {
      logger.error('Conversion installation failed', { packageName, error });
      result.success = false;
      result.errors.push({
        flow: { from: packageRoot, to: workspaceRoot },
        sourcePath: packageRoot,
        error: error as Error,
        message: `Failed to install with conversion: ${(error as Error).message}`
      });
      
      return result;
    }
  }
  
  private async detectFormat(packageRoot: string): Promise<PackageFormat> {
    const files: Array<{ path: string; content: string }> = [];
    
    for await (const fullPath of walkFiles(packageRoot)) {
      const relativePath = relative(packageRoot, fullPath);
      
      if (relativePath.startsWith('.git/') || relativePath === '.git') {
        continue;
      }
      
      files.push({ path: relativePath, content: '' });
    }
    
    return detectPackageFormat(files);
  }
}

/**
 * Standard Flow-Based Installation Strategy
 * 
 * Applies platform flows with full transformations.
 * Used for universal format packages.
 */
export class FlowBasedInstallStrategy implements InstallationStrategy {
  readonly name = 'flow-based';
  
  canHandle(format: PackageFormat, platform: Platform): boolean {
    // Default strategy - handles all remaining cases
    return true;
  }
  
  async install(
    context: FlowInstallContext,
    options?: InstallOptions
  ): Promise<FlowInstallResult> {
    const {
      packageName,
      packageRoot,
      workspaceRoot,
      platform,
      packageVersion,
      priority,
      dryRun
    } = context;
    
    logger.debug(`Standard flow-based installation for ${packageName}`);
    
    // Check if platform uses flows
    if (!platformUsesFlows(platform, workspaceRoot)) {
      logger.debug(`Platform ${platform} does not use flows, skipping flow-based installation`);
      return {
        success: true,
        filesProcessed: 0,
        filesWritten: 0,
        conflicts: [],
        errors: [],
        targetPaths: [],
        fileMapping: {}
      };
    }
    
    // Get applicable flows
    const flows = this.getApplicableFlows(platform, workspaceRoot);
    if (flows.length === 0) {
      logger.debug(`No flows defined for platform ${platform}`);
      return {
        success: true,
        filesProcessed: 0,
        filesWritten: 0,
        conflicts: [],
        errors: [],
        targetPaths: [],
        fileMapping: {}
      };
    }
    
    // Build context
    const platformDef = getPlatformDefinition(platform, workspaceRoot);
    const flowContext = buildFlowContext(
      {
        workspaceRoot,
        packageRoot,
        platform,
        packageName,
        packageVersion,
        priority,
        dryRun,
        direction: 'install'
      },
      {
        rootFile: platformDef.rootFile,
        rootDir: deriveRootDirFromFlows(platformDef)
      }
    );
    
    // Discover sources
    const flowSources = await discoverFlowSources(flows, packageRoot, flowContext);
    
    // Filter by platform
    const pathMappingStrategy = new PathMappingInstallStrategy();
    const filteredSources = pathMappingStrategy['filterSourcesByPlatform'](flowSources, platform);
    
    // Execute flows
    const executionResult = await executeFlowsForSources(filteredSources, flowContext);
    
    // Convert to result
    const pathMapping = new PathMappingInstallStrategy();
    const result = pathMapping['convertToInstallResult'](
      executionResult,
      packageName,
      platform,
      dryRun
    );
    
    // Log conflicts and errors
    if (result.conflicts.length > 0) {
      logger.warn(`Detected ${result.conflicts.length} conflicts during installation`);
      for (const conflict of result.conflicts) {
        const winner = conflict.packages.find(p => p.chosen);
        logger.warn(
          `  ${toTildePath(conflict.targetPath)}: ${winner?.packageName} (priority ${winner?.priority}) overwrites ` +
          `${conflict.packages.find(p => !p.chosen)?.packageName}`
        );
      }
    }
    
    if (result.errors.length > 0) {
      logger.error(`Encountered ${result.errors.length} errors during installation`);
      for (const error of result.errors) {
        logger.error(`  ${error.sourcePath}: ${error.message}`);
      }
    }
    
    return result;
  }
  
  private getApplicableFlows(platform: Platform, cwd: string): Flow[] {
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
}

/**
 * Select the appropriate installation strategy
 */
export function selectInstallStrategy(
  context: FlowInstallContext,
  options?: InstallOptions
): InstallationStrategy {
  const format = context.packageFormat;
  const platform = context.platform;
  
  // Strategy precedence order
  const strategies: InstallationStrategy[] = [
    new DirectInstallStrategy(),
    new PathMappingInstallStrategy(),
    new ConversionInstallStrategy(),
    new FlowBasedInstallStrategy() // Default fallback
  ];
  
  for (const strategy of strategies) {
    if (format && strategy.canHandle(format, platform)) {
      logger.debug(`Selected installation strategy: ${strategy.name}`, {
        package: context.packageName,
        platform,
        formatType: format.type,
        formatPlatform: format.platform
      });
      return strategy;
    }
  }
  
  // Fallback to flow-based
  return new FlowBasedInstallStrategy();
}
