/**
 * Conversion Context Tests
 * 
 * Tests for Phase 3: Conversion Context Management
 */

import { describe, it, expect } from '@jest/globals';
import {
  createConversionContext,
  recordGroupConversion,
  recordConversionError,
  finalizeConversion,
  getConversionSummary,
  isConversionSuccessful,
  getConversionErrors,
  cacheImportFlows,
  getCachedImportFlows,
  createFormatGroupsFromPaths
} from '../../../src/core/install/conversion-context.js';
import type { PackageFile } from '../../../src/core/install/detection-types.js';
import type { Flow } from '../../../src/types/flows.js';

describe('Conversion Context', () => {
  describe('createConversionContext', () => {
    it('should create context with initial state', () => {
      const formatGroups = new Map<string, PackageFile[]>([
        ['claude', [
          { path: 'agents/agent1.md', content: 'Agent 1' },
          { path: 'agents/agent2.md', content: 'Agent 2' }
        ]],
        ['universal', [
          { path: 'commands/build.md', content: 'Build' }
        ]]
      ]);

      const context = createConversionContext(formatGroups);

      expect(context.formatGroups).toEqual(formatGroups);
      expect(context.convertedGroups.size).toBe(0);
      expect(context.errors.size).toBe(0);
      expect(context.metadata.totalFiles).toBe(3);
      expect(context.metadata.convertedFiles).toBe(0);
      expect(context.metadata.skippedFiles).toBe(0);
      expect(context.metadata.failedFiles).toBe(0);
      expect(context.metadata.startTime).toBeDefined();
      expect(context.importFlowsCache.size).toBe(0);
    });

    it('should handle empty format groups', () => {
      const formatGroups = new Map<string, PackageFile[]>();

      const context = createConversionContext(formatGroups);

      expect(context.metadata.totalFiles).toBe(0);
    });
  });

  describe('recordGroupConversion', () => {
    it('should record successful group conversion', () => {
      const context = createConversionContext(new Map([
        ['claude', [
          { path: 'agents/agent1.md', content: 'Agent 1' },
          { path: 'agents/agent2.md', content: 'Agent 2' }
        ]]
      ]));

      const convertedFiles: PackageFile[] = [
        { path: 'agents/agent1.md', content: 'Converted 1' },
        { path: 'agents/agent2.md', content: 'Converted 2' }
      ];

      recordGroupConversion(context, 'claude', convertedFiles, 2, 0);

      expect(context.convertedGroups.get('claude')).toEqual(convertedFiles);
      expect(context.metadata.convertedFiles).toBe(2);
      expect(context.metadata.skippedFiles).toBe(0);
    });

    it('should accumulate counts across multiple groups', () => {
      const context = createConversionContext(new Map([
        ['claude', [{ path: 'a.md', content: 'a' }]],
        ['opencode', [{ path: 'b.md', content: 'b' }]]
      ]));

      recordGroupConversion(context, 'claude', [{ path: 'a.md', content: 'a-converted' }], 1, 0);
      recordGroupConversion(context, 'opencode', [{ path: 'b.md', content: 'b-converted' }], 0, 1);

      expect(context.metadata.convertedFiles).toBe(1);
      expect(context.metadata.skippedFiles).toBe(1);
    });
  });

  describe('recordConversionError', () => {
    it('should record file conversion error', () => {
      const context = createConversionContext(new Map([
        ['claude', [{ path: 'agents/bad.md', content: 'Bad' }]]
      ]));

      const error = new Error('Conversion failed');
      recordConversionError(context, 'agents/bad.md', error);

      expect(context.errors.get('agents/bad.md')).toBe(error);
      expect(context.metadata.failedFiles).toBe(1);
    });

    it('should accumulate multiple errors', () => {
      const context = createConversionContext(new Map());

      recordConversionError(context, 'file1.md', new Error('Error 1'));
      recordConversionError(context, 'file2.md', new Error('Error 2'));

      expect(context.errors.size).toBe(2);
      expect(context.metadata.failedFiles).toBe(2);
    });
  });

  describe('finalizeConversion', () => {
    it('should set end time and duration', (done) => {
      const context = createConversionContext(new Map());
      
      // Wait a bit to have measurable duration
      setTimeout(() => {
        finalizeConversion(context);

        expect(context.metadata.endTime).toBeDefined();
        expect(context.metadata.durationMs).toBeDefined();
        expect(context.metadata.durationMs!).toBeGreaterThan(0);
        done();
      }, 10);
    });
  });

  describe('getConversionSummary', () => {
    it('should generate summary string', () => {
      const context = createConversionContext(new Map([
        ['claude', [
          { path: 'a.md', content: 'a' },
          { path: 'b.md', content: 'b' }
        ]]
      ]));

      context.metadata.convertedFiles = 1;
      context.metadata.skippedFiles = 1;
      context.metadata.failedFiles = 0;
      context.metadata.durationMs = 150;

      const summary = getConversionSummary(context);

      expect(summary).toContain('Total: 2 files');
      expect(summary).toContain('Converted: 1');
      expect(summary).toContain('Skipped: 1');
      expect(summary).toContain('Duration: 150ms');
    });

    it('should include failed count when present', () => {
      const context = createConversionContext(new Map());
      context.metadata.totalFiles = 3;
      context.metadata.convertedFiles = 1;
      context.metadata.skippedFiles = 1;
      context.metadata.failedFiles = 1;

      const summary = getConversionSummary(context);

      expect(summary).toContain('Failed: 1');
    });
  });

  describe('isConversionSuccessful', () => {
    it('should return true when no failures', () => {
      const context = createConversionContext(new Map());
      context.metadata.failedFiles = 0;

      expect(isConversionSuccessful(context)).toBe(true);
    });

    it('should return false when failures exist', () => {
      const context = createConversionContext(new Map());
      context.metadata.failedFiles = 1;

      expect(isConversionSuccessful(context)).toBe(false);
    });
  });

  describe('getConversionErrors', () => {
    it('should return array of errors', () => {
      const context = createConversionContext(new Map());
      
      const error1 = new Error('Error 1');
      const error2 = new Error('Error 2');
      
      recordConversionError(context, 'file1.md', error1);
      recordConversionError(context, 'file2.md', error2);

      const errors = getConversionErrors(context);

      expect(errors).toHaveLength(2);
      expect(errors[0][0]).toBe('file1.md');
      expect(errors[0][1]).toBe(error1);
      expect(errors[1][0]).toBe('file2.md');
      expect(errors[1][1]).toBe(error2);
    });
  });

  describe('Import flows caching', () => {
    it('should cache import flows', () => {
      const context = createConversionContext(new Map());

      const flows: Flow[] = [
        {
          from: '.claude/agents/**/*.md',
          to: 'agents/**/*.md'
        }
      ];

      cacheImportFlows(context, 'claude', flows);

      expect(context.importFlowsCache.get('claude')).toEqual(flows);
    });

    it('should retrieve cached flows', () => {
      const context = createConversionContext(new Map());

      const flows: Flow[] = [
        {
          from: '.claude/agents/**/*.md',
          to: 'agents/**/*.md'
        }
      ];

      cacheImportFlows(context, 'claude', flows);

      const cached = getCachedImportFlows(context, 'claude');

      expect(cached).toEqual(flows);
    });

    it('should return null for uncached platform', () => {
      const context = createConversionContext(new Map());

      const cached = getCachedImportFlows(context, 'opencode');

      expect(cached).toBeNull();
    });
  });

  describe('createFormatGroupsFromPaths', () => {
    it('should create format groups from path map', () => {
      const files: PackageFile[] = [
        { path: 'agents/agent1.md', content: 'Agent 1' },
        { path: 'agents/agent2.md', content: 'Agent 2' },
        { path: 'rules/rule1.md', content: 'Rule 1' }
      ];

      const formatGroups = new Map<string, string[]>([
        ['claude', ['agents/agent1.md', 'rules/rule1.md']],
        ['opencode', ['agents/agent2.md']]
      ]);

      const result = createFormatGroupsFromPaths(files, formatGroups);

      expect(result.size).toBe(2);
      expect(result.get('claude')).toHaveLength(2);
      expect(result.get('opencode')).toHaveLength(1);
      expect(result.get('claude')?.[0].path).toBe('agents/agent1.md');
      expect(result.get('opencode')?.[0].path).toBe('agents/agent2.md');
    });

    it('should handle missing files gracefully', () => {
      const files: PackageFile[] = [
        { path: 'agents/agent1.md', content: 'Agent 1' }
      ];

      const formatGroups = new Map<string, string[]>([
        ['claude', ['agents/agent1.md', 'agents/missing.md']]
      ]);

      const result = createFormatGroupsFromPaths(files, formatGroups);

      expect(result.get('claude')).toHaveLength(1);
      expect(result.get('claude')?.[0].path).toBe('agents/agent1.md');
    });

    it('should skip empty groups', () => {
      const files: PackageFile[] = [
        { path: 'agents/agent1.md', content: 'Agent 1' }
      ];

      const formatGroups = new Map<string, string[]>([
        ['claude', ['agents/agent1.md']],
        ['opencode', ['nonexistent.md']]
      ]);

      const result = createFormatGroupsFromPaths(files, formatGroups);

      expect(result.size).toBe(1);
      expect(result.has('claude')).toBe(true);
      expect(result.has('opencode')).toBe(false);
    });
  });
});
