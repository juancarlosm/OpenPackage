/**
 * CLI Context Factory
 * 
 * Creates ExecutionContext instances with CLI-specific port implementations
 * (Clack output adapter, Clack prompt adapter).
 * 
 * This is the CLI entry point for creating contexts -- command handlers
 * should use this instead of directly calling createExecutionContext()
 * to ensure ports are properly injected.
 */

import type { ExecutionContext, ExecutionOptions } from '../types/execution-context.js';
import { createExecutionContext } from '../core/execution-context.js';
import { createClackOutput, createPlainOutput } from './clack-output-adapter.js';
import { createClackPrompt } from './clack-prompt-adapter.js';
import { nonInteractivePrompt } from '../core/ports/console-prompt.js';

export interface CliContextOptions extends ExecutionOptions {
  /** Override interactive mode detection */
  interactive?: boolean;
}

/**
 * Create an ExecutionContext with CLI-specific ports injected.
 * 
 * In interactive mode (TTY): uses Clack for output and prompts.
 * In non-interactive mode (CI/piped): uses plain console output and throws on prompts.
 */
export async function createCliExecutionContext(options: CliContextOptions = {}): Promise<ExecutionContext> {
  const ctx = await createExecutionContext(options);

  const isTTY = process.stdin.isTTY === true;
  const isInteractive = options.interactive || (isTTY && process.env.CI !== 'true');

  ctx.output = isInteractive ? createClackOutput() : createPlainOutput();
  ctx.prompt = isInteractive ? createClackPrompt() : nonInteractivePrompt;

  return ctx;
}
