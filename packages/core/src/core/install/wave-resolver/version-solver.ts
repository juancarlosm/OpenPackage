/**
 * Version constraint solver for the wave resolver.
 * Accumulates semver constraints per package name across waves
 * and finds the highest satisfying version.
 */

import semver from 'semver';
import type { WaveVersionSolution, WaveVersionConflict } from './types.js';

interface ConstraintEntry {
  ranges: string[];
  requestedBy: string[];
}

function findHighestSatisfying(
  versions: string[],
  ranges: string[]
): string | null {
  if (versions.length === 0) return null;

  const satisfying = versions.filter(v =>
    ranges.every(range => {
      try {
        return semver.satisfies(v, range, { includePrerelease: true });
      } catch {
        return false;
      }
    })
  );

  if (satisfying.length === 0) return null;
  return semver.maxSatisfying(satisfying, '*', { includePrerelease: true });
}

export class WaveVersionSolver {
  private constraints: Map<string, ConstraintEntry> = new Map();
  private availableVersions: Map<string, Set<string>> = new Map();

  /**
   * Add a version constraint for a package.
   * Wildcard-like ranges (undefined, null, empty, '*', 'latest') are ignored
   * since they impose no actual constraint.
   *
   * @param packageName - The package to constrain
   * @param range - Semver range string, or a wildcard/empty value to skip
   * @param requestedBy - Identifier of the dependent that requested this constraint
   */
  addConstraint(packageName: string, range: string | undefined, requestedBy: string): void {
    if (!range || range.trim() === '' || range.trim() === '*' || range.trim().toLowerCase() === 'latest') {
      return;
    }

    let entry = this.constraints.get(packageName);
    if (!entry) {
      entry = { ranges: [], requestedBy: [] };
      this.constraints.set(packageName, entry);
    }

    entry.ranges.push(range.trim());
    entry.requestedBy.push(requestedBy);
  }

  /**
   * Register a known available version for a package.
   * Only valid semver strings are accepted.
   *
   * @param packageName - The package name
   * @param version - A semver version string gathered during fetching
   */
  addAvailableVersion(packageName: string, version: string): void {
    if (!semver.valid(version)) {
      return;
    }

    let versions = this.availableVersions.get(packageName);
    if (!versions) {
      versions = new Set();
      this.availableVersions.set(packageName, versions);
    }

    versions.add(version);
  }

  /**
   * Solve all accumulated constraints and return resolved versions plus any conflicts.
   *
   * For each constrained package the solver finds the highest available version
   * that satisfies every registered range. When no version satisfies all ranges
   * the behaviour depends on the provided options:
   * - `force`: pick the highest available version anyway and record a conflict.
   * - `onConflict`: delegate to the caller (e.g. interactive prompt).
   * - Otherwise: record the conflict with no resolved version.
   *
   * Packages with available versions but no constraints are included in the
   * result with their highest available version.
   *
   * @param options - Optional force flag and conflict callback
   * @returns Resolved version map and list of conflicts
   */
  async solve(options?: {
    force?: boolean;
    onConflict?: (conflict: WaveVersionConflict, versions: string[]) => Promise<string | null>;
  }): Promise<WaveVersionSolution> {
    const { force = false, onConflict } = options ?? {};
    const resolved = new Map<string, string>();
    const conflicts: WaveVersionConflict[] = [];

    // Track which packages we handle via constraints so we can add
    // unconstrained-but-available packages afterwards.
    const handled = new Set<string>();

    for (const [packageName, entry] of this.constraints) {
      handled.add(packageName);

      const versionSet = this.availableVersions.get(packageName);
      const versions = versionSet ? Array.from(versionSet) : [];

      if (entry.ranges.length === 0) {
        // All constraints were wildcards - pick highest available
        const highest = versions.length > 0
          ? semver.maxSatisfying(versions, '*', { includePrerelease: true })
          : null;
        if (highest) {
          resolved.set(packageName, highest);
        }
        continue;
      }

      const satisfying = findHighestSatisfying(versions, entry.ranges);

      if (satisfying) {
        resolved.set(packageName, satisfying);
        continue;
      }

      // No version satisfies all constraints
      const conflict: WaveVersionConflict = {
        packageName,
        ranges: entry.ranges,
        requestedBy: entry.requestedBy,
      };

      if (force && versions.length > 0) {
        const highest = semver.maxSatisfying(versions, '*', { includePrerelease: true });
        if (highest) {
          resolved.set(packageName, highest);
        }
        conflicts.push(conflict);
      } else if (onConflict && versions.length > 0) {
        const chosen = await onConflict(conflict, versions);
        if (chosen) {
          resolved.set(packageName, chosen);
        }
        conflicts.push(conflict);
      } else {
        conflicts.push(conflict);
      }
    }

    // Include packages that have available versions but no constraints
    // (version discovered by the fetcher without any dependent declaring a range).
    for (const [packageName, versionSet] of this.availableVersions) {
      if (handled.has(packageName)) continue;

      const versions = Array.from(versionSet);
      const highest = versions.length > 0
        ? semver.maxSatisfying(versions, '*', { includePrerelease: true })
        : null;
      if (highest) {
        resolved.set(packageName, highest);
      }
    }

    return { resolved, conflicts };
  }

  /**
   * Retrieve the accumulated constraints for a specific package.
   * Useful for debugging and logging.
   *
   * @param packageName - The package to look up
   * @returns The constraint entry, or undefined if no constraints exist
   */
  getConstraintsForPackage(packageName: string): { ranges: string[]; requestedBy: string[] } | undefined {
    return this.constraints.get(packageName);
  }

  /**
   * Reset all accumulated constraints and available versions.
   */
  clear(): void {
    this.constraints.clear();
    this.availableVersions.clear();
  }
}

export default WaveVersionSolver;
