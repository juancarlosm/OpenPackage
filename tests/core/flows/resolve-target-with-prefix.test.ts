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

    it('should extract plugin name from qualified marketplace package name', () => {
      // Marketplace plugins have names like @scope/marketplace/plugin-name
      const marketplaceContext: FlowContext = {
        ...baseContext,
        packageName: '@wshobson/claude-code-workflows/git-pr-workflows',
        variables: { ...baseContext.variables, withPrefix: true }
      };
      const result = resolveTargetFromGlob(
        '/packages/git-pr-workflows/code-reviewer.md',
        'code-reviewer.md',
        '.opencode/agents/code-reviewer.md',
        marketplaceContext
      );
      // Should use only "git-pr-workflows" as prefix, not the full qualified name
      assert.equal(result, '/workspace/.opencode/agents/git-pr-workflows-code-reviewer.md');
    });

    it('should extract plugin name from scoped package name', () => {
      // Scoped packages have names like @scope/package-name
      const scopedContext: FlowContext = {
        ...baseContext,
        packageName: '@acme/my-tools',
        variables: { ...baseContext.variables, withPrefix: true }
      };
      const result = resolveTargetFromGlob(
        '/packages/my-tools/helper.md',
        'helper.md',
        '.cursor/agents/helper.md',
        scopedContext
      );
      // Should use only "my-tools" as prefix
      assert.equal(result, '/workspace/.cursor/agents/my-tools-helper.md');
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

  describe('skills directories should prefix folder name, not filename', () => {
    const prefixContext: FlowContext = {
      ...baseContext,
      variables: { ...baseContext.variables, withPrefix: true }
    };

    it('should prefix skill directory name for SKILL.md', () => {
      const result = resolveTargetFromGlob(
        '/packages/my-plugin/skills/debugging/SKILL.md',
        'skills/**/*',
        '.opencode/skills/**/*',
        prefixContext
      );
      // Prefix should be on directory, not filename
      assert.equal(result, '/workspace/.opencode/skills/my-plugin-debugging/SKILL.md');
    });

    it('should prefix skill directory name for other files in skill folder', () => {
      const result = resolveTargetFromGlob(
        '/packages/my-plugin/skills/debugging/helper.md',
        'skills/**/*',
        '.opencode/skills/**/*',
        prefixContext
      );
      assert.equal(result, '/workspace/.opencode/skills/my-plugin-debugging/helper.md');
    });

    it('should prefix skill directory for deeply nested skill files', () => {
      const result = resolveTargetFromGlob(
        '/packages/my-plugin/skills/writing/examples/test.md',
        'skills/**/*',
        '.opencode/skills/**/*',
        prefixContext
      );
      // Only the first directory after "skills/" gets prefixed
      assert.equal(result, '/workspace/.opencode/skills/my-plugin-writing/examples/test.md');
    });

    it('should NOT prefix when path has no skill subdirectory', () => {
      // Edge case: file directly in skills/ (shouldn't happen but handle gracefully)
      const result = resolveTargetFromGlob(
        '/packages/my-plugin/commands/run.md',
        'commands/**/*',
        '.opencode/commands/**/*',
        prefixContext
      );
      // Not a skills path, so filename gets prefixed
      assert.equal(result, '/workspace/.opencode/commands/my-plugin-run.md');
    });
  });

  describe('custom prefix separator', () => {
    it('should use custom separator for direct paths', () => {
      const customSepContext: FlowContext = {
        ...baseContext,
        variables: { ...baseContext.variables, withPrefix: true, prefixSeparator: '::' }
      };
      const result = resolveTargetFromGlob(
        '/packages/my-plugin/agents.md',
        'agents.md',
        '.cursor/agents/agents.md',
        customSepContext
      );
      assert.equal(result, '/workspace/.cursor/agents/my-plugin::agents.md');
    });

    it('should use custom separator for glob patterns', () => {
      const customSepContext: FlowContext = {
        ...baseContext,
        variables: { ...baseContext.variables, withPrefix: true, prefixSeparator: '@' }
      };
      const result = resolveTargetFromGlob(
        '/packages/my-plugin/rules/style.md',
        'rules/*.md',
        '.cursor/rules/*.md',
        customSepContext
      );
      assert.equal(result, '/workspace/.cursor/rules/my-plugin@style.md');
    });

    it('should use custom separator for recursive glob patterns', () => {
      const customSepContext: FlowContext = {
        ...baseContext,
        variables: { ...baseContext.variables, withPrefix: true, prefixSeparator: '__' }
      };
      const result = resolveTargetFromGlob(
        '/packages/my-plugin/commands/utils/helper.md',
        'commands/**/*.md',
        '.cursor/commands/**/*.md',
        customSepContext
      );
      assert.ok(result.endsWith('my-plugin__helper.md'));
    });

    it('should use custom separator for skills directory prefix', () => {
      const customSepContext: FlowContext = {
        ...baseContext,
        variables: { ...baseContext.variables, withPrefix: true, prefixSeparator: '::' }
      };
      const result = resolveTargetFromGlob(
        '/packages/my-plugin/skills/debugging/SKILL.md',
        'skills/**/*',
        '.opencode/skills/**/*',
        customSepContext
      );
      assert.equal(result, '/workspace/.opencode/skills/my-plugin::debugging/SKILL.md');
    });

    it('should default to hyphen separator when not specified', () => {
      const prefixContext: FlowContext = {
        ...baseContext,
        variables: { ...baseContext.variables, withPrefix: true }
        // No prefixSeparator specified
      };
      const result = resolveTargetFromGlob(
        '/packages/my-plugin/agents.md',
        'agents.md',
        '.cursor/agents/agents.md',
        prefixContext
      );
      assert.equal(result, '/workspace/.cursor/agents/my-plugin-agents.md');
    });
  });
});
