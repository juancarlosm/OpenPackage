/**
 * Display utilities for dependency resolution results.
 */

import type { ResolvedPackage } from './types.js';

/**
 * Display dependency tree to user
 */
export function displayDependencyTree(resolvedPackages: ResolvedPackage[], silent: boolean = false): void {
  if (silent) return;
  const root = resolvedPackages.find(f => f.isRoot);
  if (!root) return;
  
  console.log(`\n✓ Installing ${root.name}@${root.version} with dependencies:\n`);
  
  // Show root
  console.log(`${root.name}@${root.version} (root)`);
  
  // Show transitive dependencies
  const transitive = resolvedPackages.filter(f => !f.isRoot);
  for (const dep of transitive) {
    const status = dep.conflictResolution 
      ? ` (${dep.conflictResolution})`
      : '';
    
    // Show version range information if available
    const rangeInfo = dep.requiredRange && dep.requiredRange !== dep.version
      ? ` [from ${dep.requiredRange}]`
      : '';
    
    console.log(`├── ${dep.name}@${dep.version}${rangeInfo}${status}`);
  }
  
  console.log(`\n🔍 Total: ${resolvedPackages.length} packages\n`);
}
