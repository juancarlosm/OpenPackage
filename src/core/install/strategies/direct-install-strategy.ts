/**
 * Direct Installation Strategy
 * 
 * Copies files AS-IS from package to workspace without any transformations.
 * Used when source platform = target platform and no structure changes needed.
 */

import { join, relative, dirname } from 'path';
import { promises as fs } from 'fs';
import type { Platform } from '../../platforms.js';
import type { PackageFormat } from '../format-detector.js';
import type { InstallOptions } from '../../../types/index.js';
import type { FlowInstallContext, FlowInstallResult } from './types.js';
import { BaseStrategy } from './base-strategy.js';
import { shouldInstallDirectly } from '../format-detector.js';
import { walkFiles } from '../../../utils/file-walker.js';
import { ensureDir } from '../../../utils/fs.js';
import { logger } from '../../../utils/logger.js';

/**
 * Direct Installation Strategy
 * 
 * Copies files AS-IS from package to workspace without any transformations.
 * Used when source platform = target platform and no structure changes needed.
 */
export class DirectInstallStrategy extends BaseStrategy {
  readonly name = 'direct';
  
  canHandle(format: PackageFormat, platform: Platform): boolean {
    return shouldInstallDirectly(format, platform);
  }
  
  async install(
    context: FlowInstallContext,
    options?: InstallOptions
  ): Promise<FlowInstallResult> {
    const { packageName, packageRoot, workspaceRoot, platform, dryRun } = context;
    
    this.logStrategySelection(context);
    
    const result = this.createEmptyResult();
    result.success = true;
    
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
      return this.createErrorResult(
        context,
        error as Error,
        `Failed to install directly: ${(error as Error).message}`
      );
    }
    
    return result;
  }
}
