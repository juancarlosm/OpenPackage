import { runPublishPipeline } from '@opkg/core/core/publish/publish-pipeline.js';
import type { PublishOptions } from '@opkg/core/core/publish/publish-types.js';
import { createCliExecutionContext } from '../cli/context.js';

export async function setupPublishCommand(args: any[]): Promise<void> {
  const [packageInput, options] = args as [string | undefined, PublishOptions];
  const ctx = await createCliExecutionContext();
  const result = await runPublishPipeline(packageInput, options, ctx);
  if (!result.success) {
    throw new Error(result.error || 'Publish operation failed');
  }
}
