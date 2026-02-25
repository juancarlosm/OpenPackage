/**
 * Updates openpackage.index.yml with resolved dependency information.
 * Called after successful installation to record resolved versions,
 * source paths, and dependency relationships.
 *
 * This runs after the installation pipeline (not during resolution),
 * ensuring the index reflects actually-installed packages.
 */

import { readWorkspaceIndex, writeWorkspaceIndex } from '../../../utils/workspace-index-yml.js';
import type { WaveGraph } from './types.js';
import { logger } from '../../../utils/logger.js';

/**
 * Update openpackage.index.yml with dependency data from the wave graph.
 *
 * For each resolved node, updates or creates an entry recording the
 * version and dependency list. File mappings are left untouched since
 * those are managed by the install pipeline itself.
 *
 * This is a best-effort operation -- failures are logged but not thrown.
 *
 * @param targetDir - Workspace directory containing the index file
 * @param graph - The resolved wave graph
 */
export async function updateWorkspaceIndex(
  targetDir: string,
  graph: WaveGraph
): Promise<void> {
  let record;
  try {
    record = await readWorkspaceIndex(targetDir);
  } catch {
    logger.warn('Could not read workspace index; skipping index update');
    return;
  }

  const index = record.index;
  let updatedCount = 0;

  for (const node of graph.nodes.values()) {
    // Skip marketplace nodes and nodes without a name
    if (node.isMarketplace) continue;

    const packageName = node.source.packageName ?? node.metadata?.name ?? node.displayName;
    if (!packageName) continue;

    const existing = index.packages[packageName];

    // Only update if we have meaningful info to add
    const version = node.resolvedVersion ?? node.metadata?.version;
    const contentRoot = node.contentRoot ?? node.source.contentRoot ?? node.source.absolutePath;

    if (!existing && !contentRoot) continue;

    // Build dependency list from children
    const dependencies: string[] = [];
    for (const childId of node.children) {
      const childNode = graph.nodes.get(childId);
      if (childNode) {
        const childName =
          childNode.source.packageName ?? childNode.metadata?.name ?? childNode.displayName;
        if (childName) {
          dependencies.push(childName);
        }
      }
    }

    if (existing) {
      // Update existing entry -- preserve file mappings
      if (version) existing.version = version;
      if (dependencies.length > 0) existing.dependencies = dependencies;
      updatedCount++;
    } else if (contentRoot) {
      // Create new entry -- minimal; the install pipeline adds file mappings
      index.packages[packageName] = {
        path: contentRoot,
        version,
        dependencies: dependencies.length > 0 ? dependencies : undefined,
        files: {}
      };
      updatedCount++;
    }
  }

  if (updatedCount > 0) {
    try {
      await writeWorkspaceIndex(record);
      logger.info(`Updated workspace index: ${updatedCount} packages`);
    } catch (error) {
      logger.warn(`Failed to write workspace index: ${error}`);
    }
  }
}
