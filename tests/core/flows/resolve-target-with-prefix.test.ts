import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveTargetFromGlob } from '../../../src/core/flows/flow-execution-coordinator.js';
import type { FlowContext } from '../../../src/types/flows.js';

describe('resolveTargetFromGlob with prefix', () => {
  const baseContext: FlowContext = {
    workspaceRoot: '/workspace',
    packageRoot: '/packages/my-plugin',
    platform: 'cursor',
    packageName: 'my-plugin',
    variables: {
      name: 'my-plugin',
      withPrefix: false
    },
    direction: 'install',
    dryRun: false
  };

  describe('without withPrefix', () => {
    it('should preserve original filename for direct paths', () => {
      const result = resolveTargetFromGlob(
        '/packages/my-plugin/agents.md',
        'agents.md',
        '.cursor/agents/agents.md',
        baseContext
      );
      assert.equal(result, '/workspace/.cursor/agents/agents.md');
    });
  });

  describe('with withPrefix enabled', () => {
    const prefixContext: FlowContext = {
      ...baseContext,
      variables: { ...baseContext.variables, withPrefix: true }
    };

    it('should prepend package name to direct path filename', () => {
      const result = resolveTargetFromGlob(
        '/packages/my-plugin/agents.md',
        'agents.md',
        '.cursor/agents/agents.md',
        prefixContext
      );
      assert.equal(result, '/workspace/.cursor/agents/my-plugin-agents.md');
    });

    it('should prepend package name to glob pattern filename', () => {
      const result = resolveTargetFromGlob(
        '/packages/my-plugin/rules/style.md',
        'rules/*.md',
        '.cursor/rules/*.md',
        prefixContext
      );
      assert.equal(result, '/workspace/.cursor/rules/my-plugin-style.md');
    });

    it('should preserve directory structure with prefix', () => {
      const result = resolveTargetFromGlob(
        '/packages/my-plugin/commands/utils/helper.md',
        'commands/**/*.md',
        '.cursor/commands/**/*.md',
        prefixContext
      );
      // Should prefix only the filename, not directories
      assert.ok(result.endsWith('my-plugin-helper.md'));
      assert.ok(result.includes('/commands/utils/'));
    });

    it('should handle extensions correctly', () => {
      const result = resolveTargetFromGlob(
        '/packages/my-plugin/config.yaml',
        'config.yaml',
        '.cursor/config.json',
        prefixContext
      );
      assert.equal(result, '/workspace/.cursor/my-plugin-config.json');
    });
  });

  describe('root files should not be prefixed', () => {
    const prefixContext: FlowContext = {
      ...baseContext,
      variables: { ...baseContext.variables, withPrefix: true }
    };

    it('should NOT prefix AGENTS.md root file', () => {
      const result = resolveTargetFromGlob(
        '/packages/my-plugin/AGENTS.md',
        'AGENTS.md',
        'AGENTS.md',
        prefixContext
      );
      // Root files at workspace root should NOT be prefixed
      assert.equal(result, '/workspace/AGENTS.md');
    });

    it('should NOT prefix CLAUDE.md root file', () => {
      const result = resolveTargetFromGlob(
        '/packages/my-plugin/CLAUDE.md',
        'CLAUDE.md',
        'CLAUDE.md',
        prefixContext
      );
      assert.equal(result, '/workspace/CLAUDE.md');
    });

    it('should prefix non-root files even if similarly named', () => {
      const result = resolveTargetFromGlob(
        '/packages/my-plugin/agents.md',
        'agents.md',
        '.cursor/agents.md',
        prefixContext
      );
      // Not a root file (has directory prefix), should be prefixed
      assert.equal(result, '/workspace/.cursor/my-plugin-agents.md');
    });
  });
});
