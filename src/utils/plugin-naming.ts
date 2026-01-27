import { basename } from 'path';
import { extractGitHubInfo } from './git-url-parser.js';
import { logger } from './logger.js';

/**
 * Context for generating scoped plugin names.
 */
export interface PluginNamingContext {
  gitUrl?: string;              // Git URL (for extracting GitHub info)
  path?: string;                // Path within repo
  pluginManifestName?: string;  // Name from plugin.json (may be undefined)
  repoPath?: string;            // Path to repository root (for fallback)
}

/**
 * Generate a scoped name for a Claude Code plugin.
 * 
 * Format:
 * - GitHub repo with path: gh@username/repo/path
 * - GitHub repo (plugin is the repo): gh@username/repo
 * - Non-GitHub or local: plugin-name (no scoping)
 * 
 * Fallback behavior:
 * - If pluginManifestName is undefined → use path name or repo name
 */
export function generatePluginName(
  context: PluginNamingContext
): string {
  const {
    gitUrl,
    path,
    pluginManifestName,
    repoPath
  } = context;
  
  // If no Git URL, use plugin manifest name or fallback
  if (!gitUrl) {
    const generated =
      pluginManifestName || (path ? basename(path) : 'unnamed-plugin');
    return generated;
  }
  
  // Try to extract GitHub info
  const githubInfo = extractGitHubInfo(gitUrl);
  
  // If not GitHub, use plugin manifest name
  if (!githubInfo) {
    logger.debug('Non-GitHub URL, using plugin manifest name', { gitUrl });
    const generated =
      pluginManifestName || (path ? basename(path) : 'unnamed-plugin');
    return generated;
  }
  
  // GitHub URL - generate scoped name using repo name
  const { username, repo } = githubInfo;
  
  // Determine if this is a marketplace plugin (has path)
  const isMarketplacePlugin = Boolean(path);
  
  if (isMarketplacePlugin) {
    // Use the full path for maximum clarity and unambiguity
    // Example: plugins/feature-dev -> gh@username/repo/plugins/feature-dev
    const pluginPath = path!.toLowerCase();
    const generated = `gh@${username}/${repo}/${pluginPath}`;
    return generated;
  } else {
    // Format: gh@username/repo
    const generated = `gh@${username}/${repo}`;
    return generated;
  }
}

/**
 * Generate a scoped name for a marketplace.
 * 
 * Format:
 * - GitHub: gh@username/repo
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
  
  return `gh@${username}/${repo}`;
}

/**
 * Parse a scoped plugin name into its components.
 * Supports GitHub (gh@username/repo or gh@username/repo/path) and
 * old (@username/...) formats.
 * Returns null if the name is not scoped.
 */
export function parseScopedPluginName(name: string): {
  username: string;
  repo: string;
  plugin?: string;
  isGitHub: boolean;
} | null {
  // GitHub format: gh@username/repo or gh@username/repo/...
  const ghMatch = name.match(/^gh@([^\/]+)\/([^\/]+)(?:\/(.+))?$/);
  if (ghMatch) {
    const [, username, repo, rest] = ghMatch;
    
    // If has path after repo
    if (rest) {
      return {
        username,
        repo,
        plugin: rest,
        isGitHub: true
      };
    }
    
    // Standalone repo: gh@username/repo
    return {
      username,
      repo,
      plugin: undefined,
      isGitHub: true
    };
  }
  
  // Old format with plugin: @username/repo/plugin
  const oldPluginMatch = name.match(/^@([^\/]+)\/([^\/]+)\/(.+)$/);
  if (oldPluginMatch) {
    const [, username, repo, plugin] = oldPluginMatch;
    return {
      username,
      repo,
      plugin,
      isGitHub: false
    };
  }
  
  // Old format standalone: @username/repo
  const oldRepoMatch = name.match(/^@([^\/]+)\/([^\/]+)$/);
  if (oldRepoMatch) {
    const [, username, repo] = oldRepoMatch;
    return {
      username,
      repo,
      plugin: undefined,
      isGitHub: false
    };
  }
  
  return null;
}

/**
 * Check if a name is a scoped plugin name (either new gh@ format or old @ format).
 */
export function isScopedPluginName(name: string): boolean {
  return parseScopedPluginName(name) !== null;
}

/**
 * Check if a name uses the new GitHub format (gh@username/...).
 */
export function isGitHubPluginName(name: string): boolean {
  return name.startsWith('gh@');
}

/**
 * Detect if a plugin dependency uses old naming format.
 * Returns the correct new name if migration needed, null otherwise.
 * 
 * Old format: @username/marketplace-name/plugin (marketplace name from marketplace.json)
 * New format: @username/repo/plugin (always use repo name)
 */
export function detectOldPluginNaming(dep: { name: string; git?: string; path?: string; subdirectory?: string }): string | null {
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
  
  // If there's a path, this should be a 3-part name
  if (dep.path) {
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

/**
 * Detect if a plugin dependency uses old GitHub naming format without gh@ prefix.
 * Returns the correct new name if migration needed, null otherwise.
 * 
 * Old format: @username/repo or @username/repo/path
 * New format: gh@username/repo or gh@username/repo/path
 * 
 * Also handles path mismatches where package name doesn't match the path/subdirectory field.
 */
export function detectOldGitHubNaming(dep: { name: string; git?: string; path?: string; subdirectory?: string }): string | null {
  // Skip if not a git source
  if (!dep.git) {
    return null;
  }
  
  const githubInfo = extractGitHubInfo(dep.git);
  if (!githubInfo) {
    return null;
  }
  
  const { username, repo } = githubInfo;
  
  // Get the actual path (prefer path over subdirectory, normalize subdirectory)
  const actualPath = dep.path || (dep.subdirectory?.startsWith('./') 
    ? dep.subdirectory.substring(2) 
    : dep.subdirectory);
  
  // Check if name is missing gh@ prefix
  if (!dep.name.startsWith('gh@')) {
    // Handle old format with @ prefix
    if (dep.name.startsWith('@')) {
      // @username/repo/path or @username/repo
      if (actualPath) {
        return `gh@${username}/${repo}/${actualPath}`;
      }
      return `gh@${username}/${repo}`;
    }
    
    // Handle format without @ prefix: username/repo/path or username/repo
    // This happens when the @ was stripped somewhere
    if (actualPath) {
      return `gh@${username}/${repo}/${actualPath}`;
    }
    return `gh@${username}/${repo}`;
  }
  
  // Check if package name path matches the actual path field
  // This handles cases where name has basename instead of full path
  if (actualPath && dep.name.startsWith('gh@')) {
    // Extract the path portion from the package name
    const nameMatch = dep.name.match(/^gh@([^\/]+)\/([^\/]+)(?:\/(.+))?$/);
    if (nameMatch) {
      const [, nameUsername, nameRepo, namePath] = nameMatch;
      
      // Verify username and repo match
      if (nameUsername === username && nameRepo === repo) {
        // If actualPath exists but namePath is different, update to use full path
        if (namePath !== actualPath) {
          return `gh@${username}/${repo}/${actualPath}`;
        }
      }
    }
  }
  
  return null;
}
