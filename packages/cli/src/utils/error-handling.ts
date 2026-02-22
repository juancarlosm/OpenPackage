/**
 * CLI-specific error handling wrapper for Commander.js actions.
 *
 * This belongs in the CLI package (not core) because it calls
 * process.exit() and writes directly to stderr -- both are
 * terminal/process-level concerns that core should not own.
 */

import { handleError, UserCancellationError } from '@opkg/core/utils/errors.js';

/**
 * Wraps an async function with error handling for Commander.js actions.
 * Catches errors, formats them, and exits the process with the appropriate code.
 */
export function withErrorHandling<T extends any[]>(
  fn: (...args: T) => Promise<void>
): (...args: T) => Promise<void> {
  return async (...args: T): Promise<void> => {
    try {
      await fn(...args);
    } catch (error) {
      // Handle user cancellation gracefully - just exit without error message
      if (error instanceof UserCancellationError) {
        process.exit(0);
        return;
      }

      const result = handleError(error);
      console.error(result.error);
      process.exit(1);
    }
  };
}
