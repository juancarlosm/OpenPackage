/**
 * Console Progress Adapter (Default/CI)
 * 
 * Plain console-based implementation of ProgressPort.
 * Used as the default fallback when no interactive UI is available.
 * 
 * In CI/CD: logs structured events as single-line messages.
 * Can be replaced with a silent/no-op adapter if desired.
 */

import type { ProgressPort, ProgressEvent, ProgressLogLevel } from './progress.js';

/**
 * Console-based progress adapter.
 * Logs events as concise single-line messages to stdout/stderr.
 */
export const consoleProgress: ProgressPort = {
  emit(event: ProgressEvent): void {
    switch (event.type) {
      case 'install:start':
        console.log(`[progress] Installing: ${event.packages.join(', ')}`);
        break;
      case 'install:resolve':
      case 'install:download':
      case 'install:extract':
        if (event.status === 'failed') {
          console.log(`[progress] ${event.type} ${event.package}: ${event.status}${event.detail ? ` - ${event.detail}` : ''}`);
        }
        break;
      case 'install:complete':
        console.log(`[progress] Install complete: ${event.summary.installed} installed, ${event.summary.failed} failed, ${event.summary.skipped} skipped`);
        break;

      case 'publish:start':
        console.log(`[progress] Publishing ${event.package}@${event.version}`);
        break;
      case 'publish:upload':
        if (event.status === 'failed') {
          console.log(`[progress] Upload failed: ${event.package}${event.detail ? ` - ${event.detail}` : ''}`);
        }
        break;
      case 'publish:complete':
        console.log(`[progress] Publish ${event.package}: ${event.success ? 'success' : 'failed'}`);
        break;

      case 'uninstall:start':
        console.log(`[progress] Uninstalling: ${event.packages.join(', ')}`);
        break;
      case 'uninstall:remove':
        if (event.status === 'failed') {
          console.log(`[progress] Remove ${event.package}: ${event.status}${event.detail ? ` - ${event.detail}` : ''}`);
        }
        break;
      case 'uninstall:complete':
        console.log(`[progress] Uninstall complete: ${event.summary.removed} removed, ${event.summary.failed} failed`);
        break;

      case 'search:start':
        console.log(`[progress] Searching: ${event.query}`);
        break;
      case 'search:scanning':
        // Intentionally quiet in console mode
        break;
      case 'search:complete':
        console.log(`[progress] Search complete: ${event.resultCount} results`);
        break;

      case 'pipeline:start':
        console.log(`[progress] ${event.pipeline} started${event.detail ? `: ${event.detail}` : ''}`);
        break;
      case 'pipeline:step':
        console.log(`[progress] ${event.pipeline} > ${event.step}${event.detail ? `: ${event.detail}` : ''}`);
        break;
      case 'pipeline:complete':
        console.log(`[progress] ${event.pipeline} ${event.success ? 'completed' : 'failed'}${event.detail ? `: ${event.detail}` : ''}`);
        break;
    }
  },

  log(level: ProgressLogLevel, message: string): void {
    switch (level) {
      case 'debug':
        // Silent in default console mode; only visible with verbose flag
        break;
      case 'info':
        console.log(`[info] ${message}`);
        break;
      case 'warn':
        console.warn(`[warn] ${message}`);
        break;
      case 'error':
        console.error(`[error] ${message}`);
        break;
    }
  },
};

/**
 * Silent progress adapter. Discards all events.
 * Useful for testing or when progress output is not wanted.
 */
export const silentProgress: ProgressPort = {
  emit(_event: ProgressEvent): void {
    // No-op
  },
  log(_level: ProgressLogLevel, _message: string): void {
    // No-op
  },
};
