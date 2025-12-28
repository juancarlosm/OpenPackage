import { normalizePathForProcessing } from './path-normalization.js';
import { DIR_PATTERNS, FILE_PATTERNS, OPENPACKAGE_DIRS } from '../constants/index.js';

const EXCLUDED_DIR_PREFIXES = [
  'packages', // Nested packages are independent units; never copy inline
  `${DIR_PATTERNS.OPENPACKAGE}/${OPENPACKAGE_DIRS.PACKAGES}` // Current cached package layout under .openpackage/
];

const EXCLUDED_FILES = new Set<string>([FILE_PATTERNS.OPENPACKAGE_INDEX_YML]);

export function isExcludedFromPackage(relativePath: string): boolean {
  const normalized = normalizePathForProcessing(relativePath);
  if (!normalized) {
    return true;
  }

  const baseName = normalized.split('/').pop();
  if (baseName && EXCLUDED_FILES.has(baseName)) {
    return true;
  }

  return EXCLUDED_DIR_PREFIXES.some(prefix => {
    const normalizedPrefix = normalizePathForProcessing(prefix);
    return (
      normalized === normalizedPrefix ||
      normalized.startsWith(`${normalizedPrefix}/`)
    );
  });
}

