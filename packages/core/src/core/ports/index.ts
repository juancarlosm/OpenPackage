/**
 * Core Ports
 * 
 * Re-exports all port interfaces and default implementations.
 * These ports define the boundary between core business logic
 * and external concerns (UI, I/O, etc.).
 */

export type { OutputPort, UnifiedSpinner } from './output.js';
export type { PromptPort, PromptChoice, PromptGroupChoices, TextPromptOptions } from './prompt.js';
export type {
  ProgressPort,
  ProgressEvent,
  ProgressLogLevel,
  ProgressEventBase,
  InstallProgressEvent,
  PublishProgressEvent,
  UninstallProgressEvent,
  SearchProgressEvent,
  LifecycleProgressEvent,
} from './progress.js';
export { consoleOutput } from './console-output.js';
export { nonInteractivePrompt, NonInteractivePromptError } from './console-prompt.js';
export { consoleProgress, silentProgress } from './console-progress.js';
export { resolveOutput, resolvePrompt, resolveProgress } from './resolve.js';
