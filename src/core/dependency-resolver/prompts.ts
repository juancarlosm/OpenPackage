/**
 * Prompt utilities for dependency resolution.
 */

import { safePrompts } from '../../utils/prompts.js';

/**
 * Prompt user for overwrite confirmation
 */
export async function promptOverwrite(
  packageName: string, 
  existingVersion: string, 
  newVersion: string
): Promise<boolean> {
  const response = await safePrompts({
    type: 'confirm',
    name: 'shouldOverwrite',
    message: `Package '${packageName}' conflict: existing v${existingVersion} vs required v${newVersion}. Overwrite with v${newVersion}?`,
    initial: true
  });
  
  return response.shouldOverwrite || false;
}
