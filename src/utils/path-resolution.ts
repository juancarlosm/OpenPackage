import os from 'os';
import path from 'path';

/**
 * Expand leading tilde to the provided home directory.
 * Leaves non-tilde inputs unchanged.
 */
export function expandTildePath(input: string, homeDir: string = os.homedir()): string {
  if (!input.startsWith('~')) {
    return input;
  }

  if (input === '~') {
    return homeDir;
  }

  if (input.startsWith('~/')) {
    return path.join(homeDir, input.slice(2));
  }

  // For forms like ~user/project, fall back to returning as-is
  // to avoid incorrect user resolution on platforms without getpwnam.
  return input;
}

/**
 * Resolve a declared path (as written in YAML) to an absolute path,
 * while preserving the original declaration for round-tripping.
 */
export function resolveDeclaredPath(
  declaredPath: string,
  referenceFileDir: string
): { declared: string; absolute: string } {
  const declared = declaredPath;

  let expanded = declaredPath;
  if (declaredPath.startsWith('~')) {
    expanded = expandTildePath(declaredPath);
  }

  const absolute = path.isAbsolute(expanded)
    ? path.resolve(expanded)
    : path.resolve(referenceFileDir, expanded);

  return {
    declared,
    absolute
  };
}
