import { basename } from 'path';
import { extractGitHubInfo } from './git-url-parser.js';
import { logger } from './logger.js';

/**
 * Context for generating scoped plugin names.
 */
export interface PluginNamingContext {
  gitUrl?: string;              // Git URL (for extracting GitHub info)
  subdirectory?: string;        // Subdirectory within repo
  pluginManifestName?: string;  // Name from plugin.json (may be undefined)
  repoPath?: string;            // Path to repository root (for fallback)
}

/**
 * Generate a scoped name for a Claude Code plugin.
 * 
 * Format:
 * - GitHub repo with subdirectory: @username/repo/plugin-name
 * - GitHub repo (plugin is the repo): @username/repo
 * - Non-GitHub or local: plugin-name (no scoping)
 * 
 * Fallback behavior:
 * - If pluginManifestName is undefined → use subdirectory name or repo name
 */
export function generatePluginName(
  context: PluginNamingContext
): string {
  const {
    gitUrl,
    subdirectory,
    pluginManifestName,
    repoPath
  } = context;
  
  // If no Git URL, use plugin manifest name or fallback
  if (!gitUrl) {
    const generated =
      pluginManifestName || (subdirectory ? basename(subdirectory) : 'unnamed-plugin');
    return generated;
  }
  
  // Try to extract GitHub info
  const githubInfo = extractGitHubInfo(gitUrl);
  
  // If not GitHub, use plugin manifest name
  if (!githubInfo) {
    logger.debug('Non-GitHub URL, using plugin manifest name', { gitUrl });
    const generated =
      pluginManifestName || (subdirectory ? basename(subdirectory) : 'unnamed-plugin');
    return generated;
  }
  
  // GitHub URL - generate scoped name using repo name
  const { username, repo } = githubInfo;
  
  // Determine if this is a marketplace plugin (has subdirectory)
  const isMarketplacePlugin = Boolean(subdirectory);
  
  if (isMarketplacePlugin) {
    // Determine plugin name
    let pluginName: string;
    
    if (pluginManifestName) {
      // Use plugin manifest name if provided
      pluginName = pluginManifestName;
    } else if (subdirectory) {
      // Use subdirectory name as fallback
      pluginName = basename(subdirectory);
    } else {
      // Use repo name as fallback
      pluginName = repo;
    }
    
    // Format: @username/repo/plugin-name
    const plugin = pluginName.toLowerCase();
    const generated = `@${username}/${repo}/${plugin}`;
    return generated;
  } else {
    // Format: @username/repo
    const generated = `@${username}/${repo}`;
    return generated;
  }
}

/**
 * Generate a scoped name for a marketplace.
 * 
 * Format:
 * - GitHub: @username/repo
 * - Non-GitHub: marketplace-name
 */
export function generateMarketplaceName(
  gitUrl: string | undefined,
  marketplaceManifestName?: string,
  repoPath?: string
): string {
  // If no Git URL, use marketplace manifest name or fallback
  if (!gitUrl) {
    return marketplaceManifestName || 
           (repoPath ? basename(repoPath) : 'unnamed-marketplace');
  }
  
  // Try to extract GitHub info
  const githubInfo = extractGitHubInfo(gitUrl);
  
  // If not GitHub, use marketplace manifest name
  if (!githubInfo) {
    return marketplaceManifestName || 
           (repoPath ? basename(repoPath) : 'unnamed-marketplace');
  }
  
  // GitHub URL - generate scoped name using repo name
  const { username, repo } = githubInfo;
  
  return `@${username}/${repo}`;
}

/**
 * Parse a scoped plugin name into its components.
 * Returns null if the name is not scoped.
 */
export function parseScopedPluginName(name: string): {
  username: string;
  marketplace?: string;
  plugin: string;
} | null {
  // Format: @username/marketplace/plugin or @username/plugin
  const match = name.match(/^@([^\/]+)\/(?:([^\/]+)\/)?([^\/]+)$/);
  
  if (!match) {
    return null;
  }
  
  const [, username, marketplace, plugin] = match;
  
  return {
    username,
    marketplace,
    plugin
  };
}

/**
 * Check if a name is a scoped plugin name.
 */
export function isScopedPluginName(name: string): boolean {
  return parseScopedPluginName(name) !== null;
}

/**
 * Detect if a plugin dependency uses old naming format.
 * Returns the correct new name if migration needed, null otherwise.
 * 
 * Old format: @username/marketplace-name/plugin (marketplace name from marketplace.json)
 * New format: @username/repo/plugin (always use repo name)
 */
export function detectOldPluginNaming(dep: { name: string; git?: string; subdirectory?: string }): string | null {
  // Only check GitHub git sources with scoped names
  if (!dep.git || !dep.name.startsWith('@')) {
    return null;
  }
  
  const githubInfo = extractGitHubInfo(dep.git);
  if (!githubInfo) {
    return null;
  }
  
  const { username, repo } = githubInfo;
  
  // Parse the current name
  const nameMatch = dep.name.match(/^@([^\/]+)\/(?:([^\/]+)\/)?([^\/]+)$/);
  if (!nameMatch) {
    return null;
  }
  
  const [, nameUsername, middlePart, pluginPart] = nameMatch;
  
  // Check if username matches
  if (nameUsername !== username) {
    return null;
  }
  
  // If there's a subdirectory, this should be a 3-part name
  if (dep.subdirectory) {
    // Expected format: @username/repo/plugin
    const expectedName = `@${username}/${repo}/${pluginPart}`;
    
    // If middle part doesn't match repo name, it's old format
    if (middlePart !== repo) {
      return expectedName;
    }
  } else {
    // No subdirectory - should be 2-part name: @username/repo
    const expectedName = `@${username}/${repo}`;
    
    // If current name has 3 parts or doesn't match repo, it's old format
    if (middlePart || nameUsername + '/' + (middlePart || pluginPart) !== username + '/' + repo) {
      return expectedName;
    }
  }
  
  return null;
}
