/**
 * Shared helpers for populating installation context from loaded package data.
 * Used by install strategies, list-handler, and load phase.
 */

import type { LoadedPackage } from '../sources/base.js';
import type { InstallationContext, PackageSource } from '../unified/context.js';
import type { ResolvedPackage } from '../../dependency-resolver/types.js';

/**
 * Map PackageSource type to ResolvedPackage source format.
 */
function toResolvedPackageSource(sourceType: PackageSource['type']): ResolvedPackage['source'] {
  if (sourceType === 'registry' || sourceType === 'workspace') return 'local';
  if (sourceType === 'path' || sourceType === 'git') return sourceType;
  return 'local';
}

/**
 * Create a root ResolvedPackage entry from loaded package data.
 * Used when strategies or handlers pre-populate context so the pipeline skips re-loading.
 */
export function createResolvedPackageFromLoaded(
  loaded: LoadedPackage,
  context: { source: PackageSource },
  overrides?: { source?: ResolvedPackage['source']; contentRoot?: string }
): ResolvedPackage {
  const resolvedSource = overrides?.source ?? toResolvedPackageSource(context.source.type);
  const contentRoot = overrides?.contentRoot ?? context.source.contentRoot ?? loaded.contentRoot;
  const version = context.source.version || loaded.version;

  return {
    name: context.source.packageName || loaded.packageName,
    version,
    pkg: {
      metadata: loaded.metadata,
      files: [],
      _format: (loaded.metadata as any)?._format || context.source.pluginMetadata?.format
    } as any,
    isRoot: true,
    source: resolvedSource,
    contentRoot
  } as ResolvedPackage;
}
