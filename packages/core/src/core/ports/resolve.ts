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

/**
 * Execute a prompt-bearing callback with rich output/progress temporarily
 * active on the ExecutionContext. Restores the original ports afterward.
 *
 * This MUST only be used to wrap code that actually invokes prompts
 * (and any immediately adjacent output that should match the prompt style).
 * It must NOT be used to wrap entire handlers or pipelines.
 *
 * If rich ports are not available (e.g. non-CLI environment or already
 * using rich output), the callback runs with the existing ports unchanged.
 */
export async function withPromptOutput<T>(
  ctx: ExecutionContext,
  fn: () => Promise<T>
): Promise<T> {
  if (!ctx.richOutput) {
    return fn();
  }
  const prev = { output: ctx.output, progress: ctx.progress };
  ctx.output = ctx.richOutput;
  ctx.progress = ctx.richProgress ?? ctx.progress;
  try {
    return await fn();
  } finally {
    ctx.output = prev.output;
    ctx.progress = prev.progress;
  }
}
