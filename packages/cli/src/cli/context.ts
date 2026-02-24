/**
 * CLI Context Factory
 * 
 * Creates ExecutionContext instances with CLI-specific port implementations.
 * 
 * Output mode is committed once at context creation. When the mode is not
 * yet known (e.g. install command that may discover a marketplace), the
 * context starts in plain mode and provides a `commitOutputMode` callback
 * that the orchestrator can invoke to upgrade to rich mode before any
 * visible output is produced.
 */

import type { ExecutionContext, ExecutionOptions, OutputMode } from '@opkg/core/types/execution-context.js';
import { createExecutionContext } from '@opkg/core/core/execution-context.js';
import { createClackOutput, createPlainOutput } from './clack-output-adapter.js';
import { createClackPrompt } from './clack-prompt-adapter.js';
import { createPlainPrompt } from './plain-prompt-adapter.js';
import { createClackProgress, createPlainProgress } from './clack-progress-adapter.js';
import { nonInteractivePrompt } from '@opkg/core/core/ports/console-prompt.js';
import type { OutputPort } from '@opkg/core/core/ports/output.js';
import type { PromptPort } from '@opkg/core/core/ports/prompt.js';
import type { ProgressPort } from '@opkg/core/core/ports/progress.js';

export interface CliContextOptions extends ExecutionOptions {
  /**
   * Explicit output mode.
   * - `'rich'`  – Clack output, Clack prompts, Clack progress
   * - `'plain'` – Console output, readline prompts, plain progress
   * - When omitted, defaults to `'plain'`.
   */
  outputMode?: OutputMode;
}

// ── Cached singletons ──────────────────────────────────────────────────────

let cachedClackOutput: OutputPort | undefined;
let cachedPlainOutput: OutputPort | undefined;
let cachedClackPrompt: PromptPort | undefined;
let cachedPlainPrompt: PromptPort | undefined;
let cachedClackProgress: ProgressPort | undefined;
let cachedPlainProgress: ProgressPort | undefined;

// ── TTY detection ──────────────────────────────────────────────────────────

/** Detect whether the current session is interactive (TTY, no CI). */
function detectInteractive(): boolean {
  const isTTY = process.stdin.isTTY === true;
  return isTTY && process.env.CI !== 'true';
}

// ── Port assignment ────────────────────────────────────────────────────────

/**
 * Apply an output mode to an ExecutionContext, setting all three ports
 * (output, prompt, progress) atomically.
 */
function applyOutputMode(ctx: ExecutionContext, mode: OutputMode, isTTY: boolean): void {
  ctx.outputMode = mode;

  if (mode === 'rich') {
    ctx.output = cachedClackOutput ??= createClackOutput();
    ctx.prompt = isTTY
      ? (cachedClackPrompt ??= createClackPrompt())
      : nonInteractivePrompt;
    ctx.progress = cachedClackProgress ??= createClackProgress();
  } else {
    ctx.output = cachedPlainOutput ??= createPlainOutput();
    ctx.prompt = isTTY
      ? (cachedPlainPrompt ??= createPlainPrompt())
      : nonInteractivePrompt;
    ctx.progress = cachedPlainProgress ??= createPlainProgress();
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Create an ExecutionContext with CLI-specific ports injected.
 *
 * The output mode is committed once. If the caller does not know the
 * mode yet (e.g. the install command before preprocessing), omit
 * `outputMode` -- the context starts in plain mode and exposes a
 * `commitOutputMode` callback that core code can invoke to upgrade
 * to rich mode before any visible output is produced.
 */
export async function createCliExecutionContext(options: CliContextOptions = {}): Promise<ExecutionContext> {
  const ctx = await createExecutionContext(options);
  const isTTY = detectInteractive();
  const initialMode: OutputMode = options.outputMode ?? 'plain';

  applyOutputMode(ctx, initialMode, isTTY);

  // Allow core code to change mode (e.g. after install preprocessing
  // determines marketplace flow). No-op when already in the requested mode.
  ctx.commitOutputMode = (mode: OutputMode) => {
    if (ctx.outputMode === mode) return;
    applyOutputMode(ctx, mode, isTTY);
  };

  return ctx;
}
