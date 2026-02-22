import { runPublishPipeline } from '../core/publish/publish-pipeline.js';
import type { PublishOptions } from '../core/publish/publish-types.js';
import { createCliExecutionContext } from '../cli/context.js';
import { resolveOutput } from '../core/ports/resolve.js';

export async function setupPublishCommand(args: any[]): Promise<void> {
  const [packageInput, options] = args as [string | undefined, PublishOptions];
  const ctx = await createCliExecutionContext();
  const out = resolveOutput(ctx);
  // Pass packageInput to pipeline with CLI output port
  const result = await runPublishPipeline(packageInput, options, out);
  if (!result.success) {
    throw new Error(result.error || 'Publish operation failed');
  }
}
