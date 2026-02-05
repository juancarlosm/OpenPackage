import type { PackageSourceLoader, LoadedPackage } from './base.js';
import type { PackageSource } from '../unified/context.js';
import type { InstallOptions, ExecutionContext } from '../../../types/index.js';
import { SourceLoadError } from './base.js';
import { parsePackageYml } from '../../../utils/package-yml.js';
import { resolvePackageContentRoot } from '../local-source-resolution.js';
import { join } from 'path';

/**
 * Loads packages from the local registry
 */
export class RegistrySourceLoader implements PackageSourceLoader {
  canHandle(source: PackageSource): boolean {
    return source.type === 'registry';
  }
  
  async load(
    source: PackageSource,
    options: InstallOptions,
    execContext: ExecutionContext
  ): Promise<LoadedPackage> {
    if (!source.packageName) {
      throw new SourceLoadError(source, 'Package name is required for registry sources');
    }
    
    if (!source.version) {
      throw new SourceLoadError(source, 'Version is required for registry sources');
    }
    
    try {
      // Resolve content root (use targetDir for registry location)
      const contentRoot = await resolvePackageContentRoot({
        cwd: execContext.targetDir,
        packageName: source.packageName,
        version: source.version
      });
      
      // Load package metadata
      const manifestPath = join(contentRoot, 'openpackage.yml');
      const metadata = await parsePackageYml(manifestPath);
      
      return {
        metadata,
        packageName: source.packageName,
        version: source.version,
        contentRoot,
        source: 'registry'
      };
    } catch (error) {
      throw new SourceLoadError(
        source,
        `Failed to load package ${source.packageName}@${source.version} from registry`,
        error as Error
      );
    }
  }
  
}
