/**
 * Progress Port Interface
 * 
 * Defines the contract for streaming progress events from core pipelines
 * to any UI frontend. Core logic emits typed progress events; the UI
 * subscribes and renders them appropriately.
 * 
 * Implementations:
 *   - ConsoleProgressAdapter (default/CI): logs to console
 *   - ClackProgressAdapter (CLI): routes to @clack/prompts spinners + logs
 *   - GUI adapter (Tauri): routes to frontend via IPC for progress bars, etc.
 * 
 * Unlike OutputPort (which is for user-facing messages) and PromptPort
 * (which is for interactive input), ProgressPort is specifically for
 * structured, machine-readable progress reporting that UIs can render
 * as progress bars, status indicators, or activity feeds.
 */

// ============================================================================
// Progress Event Types
// ============================================================================

/** Base event shape -- all events carry a type discriminant and timestamp. */
export interface ProgressEventBase {
  /** ISO 8601 timestamp of when the event was emitted. */
  timestamp: string;
}

/** Install pipeline progress events. */
export type InstallProgressEvent =
  | { type: 'install:start'; packages: string[] }
  | { type: 'install:resolve'; package: string; status: 'resolving' | 'resolved' | 'failed'; detail?: string }
  | { type: 'install:download'; package: string; status: 'downloading' | 'downloaded' | 'failed'; detail?: string }
  | { type: 'install:extract'; package: string; status: 'extracting' | 'extracted' | 'failed'; detail?: string }
  | { type: 'install:complete'; summary: { installed: number; failed: number; skipped: number } };

/** Publish pipeline progress events. */
export type PublishProgressEvent =
  | { type: 'publish:start'; package: string; version: string }
  | { type: 'publish:upload'; package: string; status: 'uploading' | 'uploaded' | 'failed'; detail?: string }
  | { type: 'publish:complete'; package: string; success: boolean };

/** Uninstall pipeline progress events. */
export type UninstallProgressEvent =
  | { type: 'uninstall:start'; packages: string[] }
  | { type: 'uninstall:remove'; package: string; status: 'removing' | 'removed' | 'failed'; detail?: string }
  | { type: 'uninstall:complete'; summary: { removed: number; failed: number } };

/** Search pipeline progress events. */
export type SearchProgressEvent =
  | { type: 'search:start'; query: string }
  | { type: 'search:scanning'; source: string }
  | { type: 'search:complete'; resultCount: number };

/** Generic lifecycle events applicable to any pipeline. */
export type LifecycleProgressEvent =
  | { type: 'pipeline:start'; pipeline: string; detail?: string }
  | { type: 'pipeline:step'; pipeline: string; step: string; detail?: string }
  | { type: 'pipeline:complete'; pipeline: string; success: boolean; detail?: string };

/** Union of all progress event types. */
export type ProgressEvent = ProgressEventBase & (
  | InstallProgressEvent
  | PublishProgressEvent
  | UninstallProgressEvent
  | SearchProgressEvent
  | LifecycleProgressEvent
);

// ============================================================================
// Log Levels
// ============================================================================

export type ProgressLogLevel = 'debug' | 'info' | 'warn' | 'error';

// ============================================================================
// ProgressPort Interface
// ============================================================================

/**
 * ProgressPort defines all structured progress reporting operations.
 * 
 * Core pipelines call `emit()` with typed events and `log()` for
 * unstructured diagnostic messages. UI frontends implement this
 * interface to render progress in their own way.
 */
export interface ProgressPort {
  /**
   * Emit a typed progress event.
   * Events are fire-and-forget -- the core pipeline does not wait
   * for the UI to process them.
   */
  emit(event: ProgressEvent): void;

  /**
   * Log an unstructured diagnostic message.
   * Use for verbose/debug output that doesn't map to a typed event.
   */
  log(level: ProgressLogLevel, message: string): void;
}
