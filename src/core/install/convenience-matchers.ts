/**
 * Convenience matchers for --agents and --skills filtering.
 * 
 * Matches resource names against frontmatter fields and file/directory names
 * with deepest match resolution for ambiguous cases.
 */

import { join, basename, dirname, relative, resolve, sep } from 'path';
import { walkFiles } from '../../utils/file-walker.js';
import { exists, readTextFile } from '../../utils/fs.js';
import { splitFrontmatter } from '../../utils/markdown-frontmatter.js';
import { logger } from '../../utils/logger.js';

/**
 * Result of a resource match
 */
export interface ResourceMatchResult {
  /** Resource name that was searched for */
  name: string;
  
  /** Whether the resource was found */
  found: boolean;
  
  /** Path to the matched resource (if found) */
  path?: string;
  
  /** For skills, the directory to install (parent of SKILL.md) */
  installDir?: string;
  
  /** How the resource was matched */
  matchedBy?: 'frontmatter' | 'filename' | 'dirname';
  
  /** Error message (if not found) */
  error?: string;
}

/**
 * Container for all filtering results
 */
export interface ResourceInstallationSpec {
  /** Resource name that was requested */
  name: string;

  /** Resource type */
  resourceType: 'agent' | 'skill';

  /** Path to resource relative to repo root */
  resourcePath: string;

  /** Base path where resource was discovered */
  basePath: string;

  /** Resource kind for scoping */
  resourceKind: 'file' | 'directory';

  /** How the resource was matched */
  matchedBy: 'frontmatter' | 'filename' | 'dirname';
}

export interface ConvenienceMatcherResult {
  /** Matched resources to install */
  resources: ResourceInstallationSpec[];
  
  /** Errors for resources that weren't found */
  errors: string[];
}

/**
 * Options for convenience filtering
 */
export interface ConvenienceFilterOptions {
  /** Agent names to match */
  agents?: string[];
  
  /** Skill names to match */
  skills?: string[];
  
  /** Plugin scope filter (marketplace context) */
  pluginScope?: string[];
}

/**
 * Apply convenience filters (--agents, --skills) to a resource.
 * 
 * @param basePath - Base path to search from
 * @param options - Filter options
 * @returns Filter results with matched resources and errors
 */
export async function applyConvenienceFilters(
  basePath: string,
  repoRoot: string,
  options: ConvenienceFilterOptions
): Promise<ConvenienceMatcherResult> {
  const resources: ResourceInstallationSpec[] = [];
  const errors: string[] = [];
  const baseRoot = resolve(basePath);
  const repoRootResolved = resolve(repoRoot);
  const scopeRoots = options.pluginScope?.map(scope => resolve(repoRootResolved, scope)) ?? [];

  const isInScope = (absPath: string): boolean => {
    if (scopeRoots.length === 0) {
      return true;
    }
    return scopeRoots.some(scopeRoot => {
      if (absPath === scopeRoot) {
        return true;
      }
      return absPath.startsWith(`${scopeRoot}${sep}`);
    });
  };

  const toRepoRelative = (absPath: string): string => {
    const rel = relative(repoRootResolved, absPath);
    return rel.replace(/\\/g, '/').replace(/^\.\/?/, '');
  };

  logger.debug('Applying convenience filters', {
    basePath,
    repoRoot: repoRootResolved,
    hasAgents: !!options.agents,
    hasSkills: !!options.skills,
    agentCount: options.agents?.length || 0,
    skillCount: options.skills?.length || 0
  });

  // Match agents
  if (options.agents && options.agents.length > 0) {
    const agentResults = await matchAgents(basePath, options.agents);

    for (const result of agentResults) {
      if (result.found && result.path) {
        const absPath = resolve(result.path);
        if (!isInScope(absPath)) {
          errors.push(`Agent '${result.name}' not found in selected plugin scope`);
          continue;
        }
        const resourcePath = toRepoRelative(absPath);
        resources.push({
          name: result.name,
          resourceType: 'agent',
          resourcePath,
          basePath: baseRoot,
          resourceKind: 'file',
          matchedBy: (result.matchedBy || 'filename') as 'frontmatter' | 'filename' | 'dirname'
        });
      } else if (result.error) {
        errors.push(result.error);
      }
    }
  }

  // Match skills
  if (options.skills && options.skills.length > 0) {
    const skillResults = await matchSkills(basePath, options.skills);

    for (const result of skillResults) {
      if (result.found && result.path && result.installDir) {
        const absDir = resolve(result.installDir);
        if (!isInScope(absDir)) {
          errors.push(`Skill '${result.name}' not found in selected plugin scope`);
          continue;
        }
        const resourcePath = toRepoRelative(absDir);
        resources.push({
          name: result.name,
          resourceType: 'skill',
          resourcePath,
          basePath: baseRoot,
          resourceKind: 'directory',
          matchedBy: (result.matchedBy || 'dirname') as 'frontmatter' | 'filename' | 'dirname'
        });
      } else if (result.error) {
        errors.push(result.error);
      }
    }
  }

  logger.info('Convenience filter results', {
    resourceCount: resources.length,
    errorCount: errors.length
  });

  return {
    resources,
    errors
  };
}

/**
 * Match agents by name using frontmatter and filename matching.
 * 
 * @param basePath - Base path to search from
 * @param requestedNames - Agent names to find
 * @returns Array of match results
 */
async function matchAgents(
  basePath: string,
  requestedNames: string[]
): Promise<ResourceMatchResult[]> {
  const results: ResourceMatchResult[] = [];
  
  // Find all agent files (agents/**/*.md)
  const agentsDir = join(basePath, 'agents');
  const agentFiles: string[] = [];
  
  // Check if agents directory exists
  const agentsDirExists = await exists(agentsDir);
  if (agentsDirExists) {
    // Walk the agents directory and collect .md files
    for await (const file of walkFiles(agentsDir)) {
      if (file.endsWith('.md')) {
        agentFiles.push(file);
      }
    }
  }

  logger.debug('Found agent files', {
    basePath,
    count: agentFiles.length
  });

  for (const name of requestedNames) {
    const match = await findAgentByName(agentFiles, name);
    
    if (match) {
      results.push({
        name,
        found: true,
        path: match.path,
        matchedBy: match.matchedBy
      });
    } else {
      results.push({
        name,
        found: false,
        error: `Agent '${name}' not found`
      });
    }
  }

  return results;
}

/**
 * Find an agent by name using frontmatter or filename.
 */
async function findAgentByName(
  files: string[],
  name: string
): Promise<{ path: string; matchedBy: 'frontmatter' | 'filename' } | null> {
  // Priority 1: Frontmatter name match
  for (const file of files) {
    try {
      const content = await readTextFile(file);
      const { frontmatter } = splitFrontmatter(content);
      if (frontmatter?.name === name) {
        logger.debug('Agent matched by frontmatter', { name, file });
        return { path: file, matchedBy: 'frontmatter' };
      }
    } catch (error) {
      // Ignore frontmatter parsing errors
      logger.debug('Failed to parse frontmatter', { file, error });
    }
  }

  // Priority 2: Filename match (without .md extension)
  const byFilename = files.filter(f => basename(f, '.md') === name);

  if (byFilename.length === 1) {
    logger.debug('Agent matched by filename (single)', { name, file: byFilename[0] });
    return { path: byFilename[0], matchedBy: 'filename' };
  }

  if (byFilename.length > 1) {
    // Deepest match - most segments in path
    const deepest = byFilename.sort((a, b) =>
      b.split('/').length - a.split('/').length
    )[0];
    logger.debug('Agent matched by filename (deepest)', { name, file: deepest, candidates: byFilename.length });
    return { path: deepest, matchedBy: 'filename' };
  }

  return null;
}

/**
 * Match skills by name using SKILL.md frontmatter and directory name matching.
 * 
 * @param basePath - Base path to search from
 * @param requestedNames - Skill names to find
 * @returns Array of match results
 */
async function matchSkills(
  basePath: string,
  requestedNames: string[]
): Promise<ResourceMatchResult[]> {
  const results: ResourceMatchResult[] = [];
  
  // Find all SKILL.md files (skills/**/SKILL.md)
  const skillsDir = join(basePath, 'skills');
  const skillFiles: string[] = [];
  
  // Check if skills directory exists
  if (await exists(skillsDir)) {
    // Walk the skills directory and collect SKILL.md files
    for await (const file of walkFiles(skillsDir)) {
      if (basename(file) === 'SKILL.md') {
        skillFiles.push(file);
      }
    }
  }

  logger.debug('Found SKILL.md files', {
    basePath,
    count: skillFiles.length
  });

  for (const name of requestedNames) {
    const match = await findSkillByName(skillFiles, name);
    
    if (match) {
      results.push({
        name,
        found: true,
        path: match.path,
        installDir: dirname(match.path), // Install entire parent directory
        matchedBy: match.matchedBy
      });
    } else {
      results.push({
        name,
        found: false,
        error: `Skill '${name}' not found (requires SKILL.md)`
      });
    }
  }

  return results;
}

/**
 * Find a skill by name using SKILL.md frontmatter or directory name.
 */
async function findSkillByName(
  skillFiles: string[],
  name: string
): Promise<{ path: string; matchedBy: 'frontmatter' | 'dirname' } | null> {
  // Priority 1: Frontmatter name match in SKILL.md
  for (const file of skillFiles) {
    try {
      const content = await readTextFile(file);
      const { frontmatter } = splitFrontmatter(content);
      if (frontmatter?.name === name) {
        logger.debug('Skill matched by frontmatter', { name, file });
        return { path: file, matchedBy: 'frontmatter' };
      }
    } catch (error) {
      // Ignore frontmatter parsing errors
      logger.debug('Failed to parse SKILL.md frontmatter', { file, error });
    }
  }

  // Priority 2: Directory name match (immediate parent of SKILL.md)
  for (const file of skillFiles) {
    const dirName = basename(dirname(file));
    if (dirName === name) {
      logger.debug('Skill matched by dirname (immediate)', { name, file });
      return { path: file, matchedBy: 'dirname' };
    }
  }

  // Priority 3: Nested directory name match (any ancestor directory)
  const matchingByNested = skillFiles.filter(file => {
    const dirPath = dirname(file);
    const segments = dirPath.split('/');
    return segments.includes(name);
  });

  if (matchingByNested.length > 0) {
    // Deepest match - most segments in path
    const deepest = matchingByNested.sort((a, b) =>
      b.split('/').length - a.split('/').length
    )[0];
    logger.debug('Skill matched by dirname (nested deepest)', { name, file: deepest, candidates: matchingByNested.length });
    return { path: deepest, matchedBy: 'dirname' };
  }

  return null;
}

/**
 * Display filter errors to the user.
 * 
 * @param errors - Array of error messages
 * @param available - Available resources (for suggestions)
 */
export function displayFilterErrors(errors: string[]): void {
  if (errors.length === 0) {
    return;
  }

  console.error('\n❌ The following resources were not found:');
  for (const error of errors) {
    console.error(`  • ${error}`);
  }
}
