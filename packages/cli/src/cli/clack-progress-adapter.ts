/**
 * Clack Progress Adapter
 * 
 * CLI-specific ProgressPort implementation that routes structured
 * progress events to @clack/prompts log output for terminal display.
 * 
 * This is the CLI's implementation of the ProgressPort interface
 * defined in core/ports/progress.ts.
 */

import { log } from '@clack/prompts';
import type { ProgressPort, ProgressEvent, ProgressLogLevel } from '@opkg/core/core/ports/progress.js';

/**
 * Create a Clack-based ProgressPort for interactive terminal sessions.
 * 
 * Routes progress events to @clack/prompts log methods for rich
 * terminal output. Failed events are highlighted; success events
 * are concise.
 */
export function createClackProgress(): ProgressPort {
  return {
    emit(event: ProgressEvent): void {
      switch (event.type) {
        case 'install:start':
          log.step(`Installing ${event.packages.length} package(s)`);
          break;
        case 'install:resolve':
          if (event.status === 'failed') {
            log.warn(`Failed to resolve ${event.package}${event.detail ? `: ${event.detail}` : ''}`);
          }
          break;
        case 'install:download':
          if (event.status === 'failed') {
            log.warn(`Failed to download ${event.package}${event.detail ? `: ${event.detail}` : ''}`);
          }
          break;
        case 'install:extract':
          if (event.status === 'failed') {
            log.warn(`Failed to extract ${event.package}${event.detail ? `: ${event.detail}` : ''}`);
          }
          break;
        case 'install:complete': {
          const { installed, failed, skipped } = event.summary;
          if (failed > 0) {
            log.warn(`Install complete: ${installed} installed, ${failed} failed, ${skipped} skipped`);
          } else {
            log.info(`Install complete: ${installed} installed${skipped > 0 ? `, ${skipped} skipped` : ''}`);
          }
          break;
        }

        case 'publish:start':
          log.step(`Publishing ${event.package}@${event.version}`);
          break;
        case 'publish:upload':
          if (event.status === 'failed') {
            log.warn(`Upload failed for ${event.package}${event.detail ? `: ${event.detail}` : ''}`);
          }
          break;
        case 'publish:complete':
          if (event.success) {
            log.info(`Published ${event.package}`);
          } else {
            log.warn(`Failed to publish ${event.package}`);
          }
          break;

        case 'uninstall:start':
          log.step(`Uninstalling ${event.packages.length} package(s)`);
          break;
        case 'uninstall:remove':
          if (event.status === 'failed') {
            log.warn(`Failed to remove ${event.package}${event.detail ? `: ${event.detail}` : ''}`);
          }
          break;
        case 'uninstall:complete': {
          const { removed, failed } = event.summary;
          if (failed > 0) {
            log.warn(`Uninstall complete: ${removed} removed, ${failed} failed`);
          } else {
            log.info(`Uninstall complete: ${removed} removed`);
          }
          break;
        }

        case 'search:start':
          // Intentionally quiet -- search is fast
          break;
        case 'search:scanning':
          // Intentionally quiet
          break;
        case 'search:complete':
          log.info(`Found ${event.resultCount} result(s)`);
          break;

        case 'pipeline:start':
          log.step(`${event.pipeline}${event.detail ? `: ${event.detail}` : ''}`);
          break;
        case 'pipeline:step':
          log.info(`${event.step}${event.detail ? `: ${event.detail}` : ''}`);
          break;
        case 'pipeline:complete':
          if (!event.success) {
            log.warn(`${event.pipeline} failed${event.detail ? `: ${event.detail}` : ''}`);
          }
          break;
      }
    },

    log(level: ProgressLogLevel, message: string): void {
      switch (level) {
        case 'debug':
          // Silent in normal CLI mode
          break;
        case 'info':
          log.info(message);
          break;
        case 'warn':
          log.warn(message);
          break;
        case 'error':
          log.error(message);
          break;
      }
    },
  };
}

/**
 * Create a plain console ProgressPort for non-interactive sessions.
 * Minimal output -- only failures and summaries.
 */
export function createPlainProgress(): ProgressPort {
  return {
    emit(event: ProgressEvent): void {
      switch (event.type) {
        case 'install:complete':
          console.log(`Installed: ${event.summary.installed}, failed: ${event.summary.failed}, skipped: ${event.summary.skipped}`);
          break;
        case 'publish:complete':
          console.log(`Publish ${event.package}: ${event.success ? 'success' : 'failed'}`);
          break;
        case 'uninstall:complete':
          console.log(`Removed: ${event.summary.removed}, failed: ${event.summary.failed}`);
          break;
        case 'search:complete':
          console.log(`Found ${event.resultCount} result(s)`);
          break;
        case 'pipeline:complete':
          if (!event.success) {
            console.log(`${event.pipeline} failed${event.detail ? `: ${event.detail}` : ''}`);
          }
          break;
        default:
          // Silent for intermediate events in non-interactive mode
          break;
      }
    },

    log(level: ProgressLogLevel, message: string): void {
      switch (level) {
        case 'debug':
        case 'info':
          break;
        case 'warn':
          console.warn(message);
          break;
        case 'error':
          console.error(message);
          break;
      }
    },
  };
}
