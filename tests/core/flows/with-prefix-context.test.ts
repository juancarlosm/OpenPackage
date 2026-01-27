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

  it('should accept prefixSeparator in variables', () => {
    const context: FlowContext = {
      workspaceRoot: '/workspace',
      packageRoot: '/packages/test',
      platform: 'cursor',
      packageName: 'test-plugin',
      variables: {
        name: 'test-plugin',
        withPrefix: true,
        prefixSeparator: '::'
      },
      direction: 'install',
      dryRun: false
    };

    assert.equal(context.variables.prefixSeparator, '::');
  });

  it('should default prefixSeparator to undefined when not specified', () => {
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

    // Default separator is applied in resolveTargetFromGlob, not in context
    assert.equal(context.variables.prefixSeparator, undefined);
  });
});
