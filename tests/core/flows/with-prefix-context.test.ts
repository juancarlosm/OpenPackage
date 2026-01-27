import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { FlowContext } from '../../../src/types/flows.js';

describe('FlowContext withPrefix variable', () => {
  it('should accept withPrefix in variables', () => {
    const context: FlowContext = {
      workspaceRoot: '/workspace',
      packageRoot: '/packages/test',
      platform: 'cursor',
      packageName: 'test-plugin',
      variables: {
        name: 'test-plugin',
        withPrefix: true
      },
      direction: 'install',
      dryRun: false
    };

    assert.equal(context.variables.withPrefix, true);
  });

  it('should default withPrefix to false when not specified', () => {
    const context: FlowContext = {
      workspaceRoot: '/workspace',
      packageRoot: '/packages/test',
      platform: 'cursor',
      packageName: 'test-plugin',
      variables: {
        name: 'test-plugin'
      },
      direction: 'install',
      dryRun: false
    };

    assert.equal(context.variables.withPrefix, undefined);
  });
});
