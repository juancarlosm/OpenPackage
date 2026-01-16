/**
 * Format Conversion Installation Strategy
 * 
 * Converts package from source format → universal → target platform format.
 * Used when source platform ≠ target platform.
 */

import { join, relative } from 'path';
import type { Platform } from '../../platforms.js';
import type { Package } from '../../../types/index.js';
import type { PackageFormat } from '../format-detector.js';
import type { InstallOptions } from '../../../types/index.js';
import type { FlowInstallContext, FlowInstallResult } from './types.js';
import { BaseStrategy } from './base-strategy.js';
import { needsConversion, detectPackageFormat } from '../format-detector.js';
import { createPlatformConverter } from '../../flows/platform-converter.js';
import { walkFiles } from '../../../utils/file-walker.js';
import { readTextFile } from '../../../utils/fs.js';
import { logger } from '../../../utils/logger.js';
import {
  createTempPackageDirectory,
  writeTempPackageFiles,
  cleanupTempDirectory
} from './helpers/temp-directory.js';

/**
 * Format Conversion Installation Strategy
 * 
 * Converts package from source format → universal → target platform format.
 * Used when source platform ≠ target platform.
 */
export class ConversionInstallStrategy extends BaseStrategy {
  readonly name = 'conversion';
  
  canHandle(format: PackageFormat, platform: Platform): boolean {
    return needsConversion(format, platform);
  }
  
  async install(
    context: FlowInstallContext,
    options?: InstallOptions
  ): Promise<FlowInstallResult> {
    const { packageName, packageRoot, workspaceRoot, platform, dryRun } = context;
    
    this.logStrategySelection(context);
    
    logger.info(`Converting ${packageName} to ${platform} format`);
    
    try {
      // Phase 1: Load package files
      const packageFiles = await this.loadPackageFiles(packageRoot);
      
      // Phase 2: Create package object
      const pkg: Package = {
        metadata: {
          name: packageName,
          version: context.packageVersion
        },
        files: packageFiles,
        _format: context.packageFormat || await this.detectFormat(packageRoot)
      };
      
      // Phase 3: Convert to universal format
      const converter = createPlatformConverter(workspaceRoot);
      const conversionResult = await converter.convert(pkg, platform, { dryRun });
      
      if (!conversionResult.success || !conversionResult.convertedPackage) {
        logger.error('Package conversion failed', {
          package: packageName,
          stages: conversionResult.stages
        });
        
        return this.createErrorResult(
          context,
          new Error('Conversion failed'),
          'Failed to convert package format'
        );
      }
      
      logger.info(
        `Conversion to universal format complete (${conversionResult.stages.length} stages), ` +
        `now applying ${platform} platform flows`
      );
      
      // Phase 4: Write converted files to temp directory and install
      return await this.installConvertedPackage(
        conversionResult.convertedPackage,
        context,
        options
      );
      
    } catch (error) {
      logger.error('Conversion installation failed', { packageName, error });
      return this.createErrorResult(
        context,
        error as Error,
        `Failed to install with conversion: ${(error as Error).message}`
      );
    }
  }
  
  /**
   * Load all package files from directory
   */
  private async loadPackageFiles(packageRoot: string): Promise<Array<{ path: string; content: string }>> {
    const packageFiles: Array<{ path: string; content: string }> = [];
    
    for await (const sourcePath of walkFiles(packageRoot)) {
      const relativePath = relative(packageRoot, sourcePath);
      
      if (relativePath.startsWith('.openpackage/') || relativePath === 'openpackage.yml') {
        continue;
      }
      
      const content = await readTextFile(sourcePath);
      packageFiles.push({ path: relativePath, content, encoding: 'utf8' } as any);
    }
    
    return packageFiles;
  }
  
  /**
   * Detect package format from directory
   */
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
  
  /**
   * Install converted package from temp directory
   */
  private async installConvertedPackage(
    convertedPackage: Package,
    context: FlowInstallContext,
    options?: InstallOptions
  ): Promise<FlowInstallResult> {
    let tempPackageRoot: string | null = null;
    
    try {
      // Create temp directory
      tempPackageRoot = await createTempPackageDirectory();
      
      // Write converted files
      await writeTempPackageFiles(convertedPackage.files, tempPackageRoot);
      
      logger.debug(
        `Wrote ${convertedPackage.files.length} converted files to temp directory`,
        { tempPackageRoot }
      );
      
      // Install from temp directory using flow-based installation
      // Import here to avoid circular dependency
      const { FlowBasedInstallStrategy } = await import('./flow-based-strategy.js');
      const flowStrategy = new FlowBasedInstallStrategy();
      
      const convertedContext: FlowInstallContext = {
        ...context,
        packageRoot: tempPackageRoot
      };
      
      const installResult = await flowStrategy.install(convertedContext, options);
      
      // Cleanup temp directory
      await cleanupTempDirectory(tempPackageRoot);
      
      return installResult;
      
    } catch (error) {
      await cleanupTempDirectory(tempPackageRoot);
      
      logger.error('Failed to install converted package', { 
        packageName: context.packageName, 
        error 
      });
      
      return this.createErrorResult(
        context,
        error as Error,
        `Failed to install converted package: ${(error as Error).message}`
      );
    }
  }
}
