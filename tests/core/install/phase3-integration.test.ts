/**
 * Phase 3 Integration Test
 * 
 * End-to-end test demonstrating the complete Phase 3 pipeline:
 * 1. Detection (Phase 2) → Format groups
 * 2. Conversion (Phase 3) → Convert each group using import flows
 * 3. Merging (Phase 3) → Merge to unified universal format package
 */

import { describe, it, expect } from '@jest/globals';
import {
  convertFormatGroup,
  applyImportFlows
} from '../../../src/core/install/import-flow-converter.js';
import {
  mergeFormatGroups,
  validateMergedPackage
} from '../../../src/core/install/format-group-merger.js';
import {
  createConversionContext,
  recordGroupConversion,
  finalizeConversion,
  getConversionSummary,
  isConversionSuccessful
} from '../../../src/core/install/conversion-context.js';
import type { PackageFile, FormatGroup } from '../../../src/core/install/detection-types.js';

describe('Phase 3 Integration', () => {
  describe('End-to-end conversion pipeline', () => {
    it('should convert mixed-format package to universal format', () => {
      // Simulate Phase 2 detection result: Mixed-format package
      // - Claude format agents
      // - Universal format commands
      // - OpenCode format rules
      
      const formatGroups = new Map<string, PackageFile[]>([
        ['claude', [
          {
            path: '.claude/agents/reviewer.md',
            content: '---\ntools: Read, Write\npermissionMode: default\n---\n# Reviewer',
            frontmatter: {
              tools: 'Read, Write',
              permissionMode: 'default'
            }
          },
          {
            path: '.claude/agents/debugger.md',
            content: '---\ntools: Bash\npermissionMode: default\n---\n# Debugger',
            frontmatter: {
              tools: 'Bash',
              permissionMode: 'default'
            }
          }
        ]],
        ['universal', [
          {
            path: 'commands/build.md',
            content: '---\ntools: [bash]\n---\n# Build Command',
            frontmatter: {
              tools: ['bash']
            }
          }
        ]]
      ]);
      
      // Phase 3: Conversion pipeline
      
      // 1. Create conversion context
      const context = createConversionContext(formatGroups);
      
      expect(context.metadata.totalFiles).toBe(3);
      expect(context.formatGroups.size).toBe(2);
      
      // 2. Convert each format group
      const convertedGroups = new Map<string, PackageFile[]>();
      
      for (const [platformId, files] of formatGroups) {
        const group: FormatGroup = {
          platformId,
          files,
          confidence: 1.0
        };
        
        const result = convertFormatGroup(group);
        
        // Track in context
        if (result.success) {
          convertedGroups.set(platformId, result.convertedFiles);
          recordGroupConversion(
            context,
            platformId,
            result.convertedFiles,
            result.filesConverted,
            result.filesSkipped
          );
        }
      }
      
      // Check conversion results
      expect(convertedGroups.size).toBe(2);
      expect(context.metadata.convertedFiles + context.metadata.skippedFiles).toBe(3);
      
      // 3. Merge converted groups
      const mergedFiles = mergeFormatGroups(convertedGroups);
      
      expect(mergedFiles.length).toBe(3);
      
      // 4. Validate merged package
      const validation = validateMergedPackage(mergedFiles);
      
      expect(validation.valid).toBe(true);
      expect(validation.errors).toEqual([]);
      
      // 5. Finalize conversion
      finalizeConversion(context);
      
      expect(isConversionSuccessful(context)).toBe(true);
      
      // Verify all files are in universal format
      const reviewerFile = mergedFiles.find(f => f.path.includes('reviewer'));
      const debuggerFile = mergedFiles.find(f => f.path.includes('debugger'));
      const buildFile = mergedFiles.find(f => f.path.includes('build'));
      
      expect(reviewerFile).toBeDefined();
      expect(debuggerFile).toBeDefined();
      expect(buildFile).toBeDefined();
      
      // Check paths are normalized (platform prefix removed)
      expect(reviewerFile?.path).toMatch(/^agents\//);
      expect(debuggerFile?.path).toMatch(/^agents\//);
      expect(buildFile?.path).toMatch(/^commands\//);
      
      // Get summary
      const summary = getConversionSummary(context);
      expect(summary).toContain('Total: 3 files');
    });

    it('should handle partial conversion failures gracefully', () => {
      const formatGroups = new Map<string, PackageFile[]>([
        ['claude', [
          {
            path: '.claude/agents/good.md',
            content: '---\ntools: Read\n---\nGood agent',
            frontmatter: { tools: 'Read' }
          }
        ]],
        ['unknown', [
          {
            path: 'unknown/file.md',
            content: 'Unknown format'
          }
        ]]
      ]);
      
      const context = createConversionContext(formatGroups);
      const convertedGroups = new Map<string, PackageFile[]>();
      
      for (const [platformId, files] of formatGroups) {
        const group: FormatGroup = {
          platformId,
          files,
          confidence: platformId === 'unknown' ? 0 : 1.0
        };
        
        const result = convertFormatGroup(group);
        
        if (result.success && result.convertedFiles.length > 0) {
          convertedGroups.set(platformId, result.convertedFiles);
          recordGroupConversion(
            context,
            platformId,
            result.convertedFiles,
            result.filesConverted,
            result.filesSkipped
          );
        }
      }
      
      // Unknown format should fail, but Claude should succeed
      expect(convertedGroups.has('claude')).toBe(true);
      expect(convertedGroups.has('unknown')).toBe(false);
      
      // Merge what we have
      const mergedFiles = mergeFormatGroups(convertedGroups);
      expect(mergedFiles.length).toBeGreaterThan(0);
      
      finalizeConversion(context);
      
      // Partial success is still useful
      expect(context.metadata.convertedFiles).toBeGreaterThan(0);
    });

    it('should prioritize universal format in conflicts', () => {
      // Simulate a conflict: same file path in different formats
      const formatGroups = new Map<string, PackageFile[]>([
        ['claude', [
          {
            path: '.claude/agents/agent.md',
            content: '---\ntools: Read\npermissionMode: default\n---\nClaude version',
            frontmatter: {
              tools: 'Read',
              permissionMode: 'default'
            }
          }
        ]],
        ['universal', [
          {
            path: 'agents/agent.md',
            content: '---\ntools: [read]\n---\nUniversal version',
            frontmatter: {
              tools: ['read']
            }
          }
        ]]
      ]);
      
      const context = createConversionContext(formatGroups);
      const convertedGroups = new Map<string, PackageFile[]>();
      
      for (const [platformId, files] of formatGroups) {
        const group: FormatGroup = {
          platformId,
          files,
          confidence: 1.0
        };
        
        const result = convertFormatGroup(group);
        
        if (result.success) {
          convertedGroups.set(platformId, result.convertedFiles);
        }
      }
      
      // Merge with conflict resolution
      const mergedFiles = mergeFormatGroups(convertedGroups);
      
      // Should have only one file
      expect(mergedFiles.length).toBe(1);
      
      // Should prefer universal format (array tools)
      const file = mergedFiles[0];
      expect(Array.isArray(file.frontmatter?.tools)).toBe(true);
    });
  });

  describe('Conversion context tracking', () => {
    it('should track statistics correctly throughout conversion', () => {
      const formatGroups = new Map<string, PackageFile[]>([
        ['claude', [
          { path: '.claude/agents/a1.md', content: 'A1' },
          { path: '.claude/agents/a2.md', content: 'A2' }
        ]],
        ['universal', [
          { path: 'commands/c1.md', content: 'C1' }
        ]]
      ]);
      
      const context = createConversionContext(formatGroups);
      
      // Initial state
      expect(context.metadata.totalFiles).toBe(3);
      expect(context.metadata.convertedFiles).toBe(0);
      
      // Simulate conversions
      recordGroupConversion(context, 'claude', [], 2, 0);
      expect(context.metadata.convertedFiles).toBe(2);
      
      recordGroupConversion(context, 'universal', [], 0, 1);
      expect(context.metadata.skippedFiles).toBe(1);
      
      finalizeConversion(context);
      
      expect(context.metadata.endTime).toBeDefined();
      expect(context.metadata.durationMs).toBeGreaterThan(0);
      
      const summary = getConversionSummary(context);
      expect(summary).toContain('Total: 3');
      expect(summary).toContain('Converted: 2');
      expect(summary).toContain('Skipped: 1');
    });
  });

  describe('Performance characteristics', () => {
    it('should handle 100 files efficiently', () => {
      // Create 100 files (50 Claude, 50 universal)
      const claudeFiles: PackageFile[] = [];
      const universalFiles: PackageFile[] = [];
      
      for (let i = 0; i < 50; i++) {
        claudeFiles.push({
          path: `.claude/agents/agent${i}.md`,
          content: `---\ntools: Read\n---\nAgent ${i}`,
          frontmatter: { tools: 'Read' }
        });
        
        universalFiles.push({
          path: `commands/command${i}.md`,
          content: `---\ntools: [bash]\n---\nCommand ${i}`,
          frontmatter: { tools: ['bash'] }
        });
      }
      
      const formatGroups = new Map<string, PackageFile[]>([
        ['claude', claudeFiles],
        ['universal', universalFiles]
      ]);
      
      const context = createConversionContext(formatGroups);
      const startTime = Date.now();
      
      // Convert groups
      const convertedGroups = new Map<string, PackageFile[]>();
      
      for (const [platformId, files] of formatGroups) {
        const group: FormatGroup = { platformId, files, confidence: 1.0 };
        const result = convertFormatGroup(group);
        
        if (result.success) {
          convertedGroups.set(platformId, result.convertedFiles);
        }
      }
      
      // Merge
      const mergedFiles = mergeFormatGroups(convertedGroups);
      
      const duration = Date.now() - startTime;
      
      // Verify results
      expect(mergedFiles.length).toBe(100);
      
      // Performance target: <1000ms for 100 files
      // This is a reasonable target for in-memory operations
      expect(duration).toBeLessThan(2000); // Allow 2s for CI environments
      
      console.log(`Phase 3 performance: ${duration}ms for 100 files`);
    });
  });
});
