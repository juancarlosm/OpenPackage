/**
 * JSONC (JSON with Comments) file utilities
 * Handles reading and parsing JSONC files with comment support
 */

import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'jsonc-parser';
import { logger } from './logger.js';

/**
 * Get the project root directory by walking up from the current file's
 * location until we find platforms.jsonc (a known root marker).
 *
 * This approach is resilient to monorepo restructuring and esbuild bundling,
 * where the runtime __dirname may be at varying depths relative to the
 * repository root (e.g. packages/core/src/utils, packages/cli/dist, etc.).
 */
function getProjectRoot(): string {
  const __filename = fileURLToPath(import.meta.url);
  let dir = dirname(__filename);

  // Walk up at most 10 levels to find the directory containing platforms.jsonc
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, 'platforms.jsonc'))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break; // reached filesystem root
    dir = parent;
  }

  // Fallback: return two levels up (original behaviour) so we get a clear
  // error message pointing at the resolved path rather than a silent failure.
  const fallback = dirname(__filename);
  return join(fallback, '..', '..');
}

/**
 * Read and parse a JSONC file from the project root
 * @param relativePath - Path relative to project root (e.g., 'platforms.jsonc')
 * @returns Parsed JSON object
 */
export function readJsoncFileSync<T = unknown>(relativePath: string): T {
  const projectRoot = getProjectRoot();
  const fullPath = join(projectRoot, relativePath);
  
  try {
    const content = readFileSync(fullPath, 'utf-8');
    const parsed = parse(content);
    
    if (parsed === undefined) {
      throw new Error(`Failed to parse JSONC file: ${relativePath}`);
    }
    
    return parsed as T;
  } catch (error) {
    logger.error(`Failed to read JSONC file: ${relativePath}`, { error, fullPath });
    throw new Error(`Failed to read JSONC file ${relativePath}: ${error}`);
  }
}

/**
 * Read and parse a JSONC or JSON file from an absolute path.
 * Returns undefined if the file doesn't exist, parsing fails, or result is not a plain object.
 * @param fullPath - Absolute path to the file
 * @returns Parsed object or undefined
 */
export function readJsoncOrJson(fullPath: string): Record<string, any> | undefined {
  if (!existsSync(fullPath)) {
    return undefined;
  }

  try {
    const content = readFileSync(fullPath, 'utf-8');
    const parsed = parse(content);

    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed !== null) {
      return parsed as Record<string, any>;
    }
  } catch (error) {
    logger.warn(`Failed to parse JSONC/JSON file ${fullPath}: ${(error as Error).message}`);
  }

  return undefined;
}

