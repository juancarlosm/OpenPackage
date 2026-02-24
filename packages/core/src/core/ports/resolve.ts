/**
 * Port Resolution Helpers
 * 
 * Utilities for resolving OutputPort, PromptPort, and ProgressPort from
 * ExecutionContext, falling back to safe defaults when ports are not
 * explicitly provided.
 */

import type { ExecutionContext } from '../../types/execution-context.js';
import type { OutputPort } from './output.js';
import type { PromptPort } from './prompt.js';
import type { ProgressPort } from './progress.js';
import { consoleOutput } from './console-output.js';
import { nonInteractivePrompt } from './console-prompt.js';
import { silentProgress } from './console-progress.js';

/**
 * Resolve the OutputPort from an ExecutionContext.
 * Falls back to consoleOutput (plain console.log) if not provided.
 */
export function resolveOutput(ctx?: ExecutionContext | { output?: OutputPort }): OutputPort {
  return ctx?.output ?? consoleOutput;
}

/**
 * Resolve the PromptPort from an ExecutionContext.
 * Falls back to nonInteractivePrompt (throws on any prompt) if not provided.
 */
export function resolvePrompt(ctx?: ExecutionContext | { prompt?: PromptPort }): PromptPort {
  return ctx?.prompt ?? nonInteractivePrompt;
}

/**
 * Resolve the ProgressPort from an ExecutionContext.
 * Falls back to silentProgress (no-op) if not provided.
 * 
 * The default is silent (not consoleProgress) because progress events
 * are opt-in: the CLI adapter or GUI adapter must explicitly subscribe.
 * This prevents noisy [progress] logs in CI/CD unless explicitly requested.
 */
export function resolveProgress(ctx?: ExecutionContext | { progress?: ProgressPort }): ProgressPort {
  return ctx?.progress ?? silentProgress;
}
