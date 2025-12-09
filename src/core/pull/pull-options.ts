import { normalizeRegistryPath } from '../../utils/registry-entry-filter.js';

export function parsePathsOption(value: string): string[] {
  if (!value) {
    return [];
  }
  return normalizePullPaths(value.split(','));
}

export function normalizePullPaths(rawPaths: string[]): string[] {
  const normalized = rawPaths
    .filter(path => typeof path === 'string')
    .map(path => path.trim())
    .filter(path => path.length > 0)
    .map(path => path.startsWith('/') ? path.slice(1) : path)
    .map(path => normalizeRegistryPath(path))
    .filter(path => path.length > 0);

  return Array.from(new Set(normalized));
}

export function buildRequestedPaths(
  optionPaths: string[] | undefined,
  specPath: string | undefined
): string[] {
  return normalizePullPaths([
    ...(optionPaths ?? []),
    ...(specPath ? [specPath] : [])
  ]);
}


