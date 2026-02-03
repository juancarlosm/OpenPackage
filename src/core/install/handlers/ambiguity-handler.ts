import type { InstallationContext } from '../unified/context.js';
import type { InstallOptions } from '../../../types/index.js';
import { 
  promptBaseSelection, 
  canPrompt, 
  handleAmbiguityNonInteractive,
  type BaseMatch 
} from '../ambiguity-prompts.js';
import { logger } from '../../../utils/logger.js';
import { relative } from 'path';

/**
 * Ambiguity resolution result.
 */
export interface AmbiguityResolution {
  /** The selected base path */
  base: string;
  /** The matched pattern */
  pattern: string;
  /** Relative path from repo root */
  baseRelative: string;
}

/**
 * Resolve ambiguous base detection.
 * 
 * When multiple valid bases are detected, this handler either:
 * - Prompts the user to select (interactive mode)
 * - Auto-selects the deepest match (non-interactive / --force)
 * 
 * @param matches - Array of ambiguous base matches
 * @param context - Installation context (for resource path info)
 * @param repoRoot - Repository root path
 * @param options - Install options
 * @returns Resolution with selected base
 */
export async function resolveAmbiguity(
  matches: BaseMatch[],
  context: InstallationContext,
  repoRoot: string,
  options: InstallOptions
): Promise<AmbiguityResolution> {
  logger.debug('Resolving ambiguous base', {
    matchCount: matches.length,
    matches: matches.map(m => ({ base: m.base, pattern: m.pattern }))
  });
  
  // Format matches for display
  const formattedMatches = matches.map(m => ({
    base: m.base,
    pattern: m.pattern,
    startIndex: m.startIndex,
    exampleTarget: `${m.pattern} → <platforms>/${m.pattern.replace('**/', '').replace('*', 'file')}`
  }));
  
  let selectedMatch: BaseMatch;
  
  if (options.force || !canPrompt()) {
    // Non-interactive: use deepest match
    selectedMatch = handleAmbiguityNonInteractive(formattedMatches);
    logger.info('Auto-selected deepest base (non-interactive)', { 
      base: selectedMatch.base 
    });
  } else {
    // Interactive: prompt user
    const resourcePath = context.source.resourcePath || context.source.gitPath || '';
    selectedMatch = await promptBaseSelection(resourcePath, formattedMatches, repoRoot);
    logger.info('User selected base', { base: selectedMatch.base });
  }
  
  // Calculate relative path
  const baseRelative = relative(repoRoot, selectedMatch.base) || '.';
  
  return {
    base: selectedMatch.base,
    pattern: selectedMatch.pattern,
    baseRelative
  };
}

/**
 * Apply ambiguity resolution to context.
 * Mutates the context with the selected base.
 * 
 * @param context - Installation context to update
 * @param resolution - The ambiguity resolution
 */
export function applyAmbiguityResolution(
  context: InstallationContext,
  resolution: AmbiguityResolution
): void {
  context.detectedBase = resolution.base;
  context.matchedPattern = resolution.pattern;
  context.baseSource = 'user-selection';
  context.baseRelative = resolution.baseRelative;
  
  logger.info('Applied ambiguity resolution to context', {
    base: context.detectedBase,
    pattern: context.matchedPattern
  });
}

/**
 * Full ambiguity handling flow.
 * Resolves ambiguity and updates context in one call.
 * 
 * @param matches - Array of ambiguous base matches
 * @param context - Installation context (will be mutated)
 * @param repoRoot - Repository root path
 * @param options - Install options
 * @returns The updated context
 */
export async function handleAmbiguity(
  matches: BaseMatch[],
  context: InstallationContext,
  repoRoot: string,
  options: InstallOptions
): Promise<InstallationContext> {
  const resolution = await resolveAmbiguity(matches, context, repoRoot, options);
  applyAmbiguityResolution(context, resolution);
  return context;
}
