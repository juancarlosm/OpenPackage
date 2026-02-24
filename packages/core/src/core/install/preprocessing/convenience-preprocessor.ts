import { join } from 'path';
import { exists } from '../../../utils/fs.js';
import type { ConvenienceFilterOptions, ResourceInstallationSpec } from '../convenience-matchers.js';
import { applyConvenienceFilters, displayFilterErrors } from '../convenience-matchers.js';
import { buildResourceInstallContexts, prepareResourceContextsForMultiInstall } from '../unified/context-builders.js';
import { logger } from '../../../utils/logger.js';
import type { InstallationContext } from '../unified/context.js';
import type { LoadedPackage } from '../sources/base.js';

/**
 * Find the base path where agents/skills/rules/commands subdirs live.
 * Registry packages may have these at contentRoot or under platform dirs (.opencode, .cursor, etc.).
 */
export async function findBaseForConvenienceFilters(
  contentRoot: string,
  options: ConvenienceFilterOptions
): Promise<string> {
  const candidates = [contentRoot];
  for (const sub of ['.opencode', '.cursor', '.claude', '.claude-plugin']) {
    candidates.push(join(contentRoot, sub));
  }
  for (const base of candidates) {
    if (options.agents?.length && (await exists(join(base, 'agents')))) return base;
    if (options.skills?.length && (await exists(join(base, 'skills')))) return base;
    if (options.rules?.length && (await exists(join(base, 'rules')))) return base;
    if (options.commands?.length && (await exists(join(base, 'commands')))) return base;
  }
  return contentRoot;
}

/**
 * Resolve convenience resources (agents/skills) to install.
 *
 * This centralizes user-facing error display and "continue with partial matches"
 * behavior so strategies/handlers don't duplicate it.
 *
 * @throws Error if none of the requested resources can be found.
 */
export async function resolveConvenienceResources(
  basePath: string,
  repoRoot: string,
  options: ConvenienceFilterOptions
): Promise<ResourceInstallationSpec[]> {
  const filterResult = await applyConvenienceFilters(basePath, repoRoot, options);

  if (filterResult.errors.length > 0) {
    displayFilterErrors(filterResult.errors);

    if (filterResult.resources.length === 0) {
      throw new Error('None of the requested resources were found');
    }

    logger.debug(`Continuing with ${filterResult.resources.length} resource(s)`);
  }

  return filterResult.resources;
}

/** Options for base path resolution */
export interface ConvenienceFilterInstallOpts {
  /** Use context.detectedBase as base (e.g. when loader already ran base detection). Otherwise uses findBaseForConvenienceFilters. */
  useDetectedBase?: boolean;
}

/**
 * Run the full convenience filter flow: resolve resources, build contexts, prepare for pipeline.
 * Shared by registry, path, and git strategies.
 *
 * @param context - Installation context (must have source populated)
 * @param loaded - Loaded package from loader
 * @param options - Convenience filter options (agents, skills, rules, commands)
 * @param opts - Base path resolution: useDetectedBase=true for git (has base detection)
 * @returns Resource contexts ready for createMultiResourceResult
 */
export async function runConvenienceFilterInstall(
  context: InstallationContext,
  loaded: LoadedPackage,
  options: ConvenienceFilterOptions,
  opts?: ConvenienceFilterInstallOpts
): Promise<InstallationContext[]> {
  const contentRoot = loaded.contentRoot;
  const repoRoot = loaded.sourceMetadata?.repoPath ?? contentRoot;

  const basePath = opts?.useDetectedBase && context.detectedBase
    ? context.detectedBase
    : await findBaseForConvenienceFilters(contentRoot, options);

  const resources = await resolveConvenienceResources(basePath, repoRoot, options);
  const resourceContexts = buildResourceInstallContexts(context, resources, repoRoot);
  return prepareResourceContextsForMultiInstall(resourceContexts, repoRoot);
}
