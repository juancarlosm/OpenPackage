/**
 * Tests for Source Pattern Resolver
 * 
 * Tests priority-based pattern resolution for flows with multiple source patterns.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { SourcePatternResolver } from '../../../src/core/flows/source-resolver.js';

describe('SourcePatternResolver', () => {
  let tmpDir: string;
  let resolver: SourcePatternResolver;

  beforeEach(async () => {
    // Create temp directory for test files
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'opkg-source-resolver-test-'));
    resolver = new SourcePatternResolver();
  });

  afterEach(async () => {
    // Clean up temp directory
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('Single Pattern Resolution', () => {
    it('should resolve literal file path', async () => {
      // Create test file
      const testFile = path.join(tmpDir, 'config.json');
      await fs.writeFile(testFile, '{}');

      const result = await resolver.resolve('config.json', {
        baseDir: tmpDir,
      });

      expect(result.paths).toEqual([testFile]);
      expect(result.warnings).toEqual([]);
    });

    it('should return empty array for non-existent file', async () => {
      const result = await resolver.resolve('nonexistent.json', {
        baseDir: tmpDir,
      });

      expect(result.paths).toEqual([]);
      expect(result.warnings).toEqual([]);
    });

    it('should resolve glob pattern', async () => {
      // Create test files
      await fs.writeFile(path.join(tmpDir, 'config.json'), '{}');
      await fs.writeFile(path.join(tmpDir, 'settings.json'), '{}');

      const result = await resolver.resolve('*.json', {
        baseDir: tmpDir,
      });

      expect(result.paths).toHaveLength(2);
      expect(result.paths.map(p => path.basename(p)).sort()).toEqual([
        'config.json',
        'settings.json',
      ]);
    });

    it('should resolve recursive glob pattern', async () => {
      // Create nested structure
      await fs.mkdir(path.join(tmpDir, 'rules'), { recursive: true });
      await fs.mkdir(path.join(tmpDir, 'rules', 'advanced'), { recursive: true });
      await fs.writeFile(path.join(tmpDir, 'rules', 'basic.md'), '');
      await fs.writeFile(path.join(tmpDir, 'rules', 'advanced', 'expert.md'), '');

      const result = await resolver.resolve('rules/**/*.md', {
        baseDir: tmpDir,
      });

      expect(result.paths).toHaveLength(2);
      const basenames = result.paths.map(p => path.basename(p)).sort();
      expect(basenames).toEqual(['basic.md', 'expert.md']);
    });
  });

  describe('Array Pattern Resolution with Priority', () => {
    it('should use first matching pattern', async () => {
      // Create only .jsonc file
      const jsoncFile = path.join(tmpDir, 'mcp.jsonc');
      await fs.writeFile(jsoncFile, '{}');

      const result = await resolver.resolve(['mcp.jsonc', 'mcp.json'], {
        baseDir: tmpDir,
      });

      expect(result.paths).toEqual([jsoncFile]);
      expect(result.matchedPattern).toBe('mcp.jsonc');
      expect(result.warnings).toEqual([]);
    });

    it('should fallback to second pattern if first does not match', async () => {
      // Create only .json file
      const jsonFile = path.join(tmpDir, 'mcp.json');
      await fs.writeFile(jsonFile, '{}');

      const result = await resolver.resolve(['mcp.jsonc', 'mcp.json'], {
        baseDir: tmpDir,
      });

      expect(result.paths).toEqual([jsonFile]);
      expect(result.matchedPattern).toBe('mcp.json');
      expect(result.warnings).toEqual([]);
    });

    it('should warn when multiple patterns match', async () => {
      // Create both files
      const jsoncFile = path.join(tmpDir, 'mcp.jsonc');
      const jsonFile = path.join(tmpDir, 'mcp.json');
      await fs.writeFile(jsoncFile, '{}');
      await fs.writeFile(jsonFile, '{}');

      const result = await resolver.resolve(['mcp.jsonc', 'mcp.json'], {
        baseDir: tmpDir,
        logWarnings: false, // Don't log to console during test
      });

      expect(result.paths).toEqual([jsoncFile]);
      expect(result.matchedPattern).toBe('mcp.jsonc');
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('priority 1');
      expect(result.warnings[0]).toContain('priority 2');
      expect(result.skippedPatterns).toEqual(['mcp.json']);
    });

    it('should return empty for no matches', async () => {
      const result = await resolver.resolve(['mcp.jsonc', 'mcp.json'], {
        baseDir: tmpDir,
      });

      expect(result.paths).toEqual([]);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('No files matched');
    });

    it('should handle empty array', async () => {
      const result = await resolver.resolve([], {
        baseDir: tmpDir,
      });

      expect(result.paths).toEqual([]);
      expect(result.warnings).toEqual(['Empty pattern array provided']);
    });

    it('should respect priority with glob patterns', async () => {
      // Create files matching both patterns
      await fs.mkdir(path.join(tmpDir, 'configs'), { recursive: true });
      await fs.writeFile(path.join(tmpDir, 'configs', 'cursor.json'), '{}');
      await fs.writeFile(path.join(tmpDir, 'configs', 'generic.json'), '{}');

      const result = await resolver.resolve(
        ['configs/cursor.json', 'configs/*.json'],
        {
          baseDir: tmpDir,
          logWarnings: false,
        }
      );

      // Should only match the specific file, not the glob
      expect(result.paths).toHaveLength(1);
      expect(path.basename(result.paths[0])).toBe('cursor.json');
      expect(result.matchedPattern).toBe('configs/cursor.json');
      expect(result.warnings).toHaveLength(1); // Warning about skipped pattern
    });

    it('should handle three or more patterns', async () => {
      // Create only the third file
      const yamlFile = path.join(tmpDir, 'config.yaml');
      await fs.writeFile(yamlFile, '');

      const result = await resolver.resolve(
        ['config.jsonc', 'config.json', 'config.yaml'],
        {
          baseDir: tmpDir,
        }
      );

      expect(result.paths).toEqual([yamlFile]);
      expect(result.matchedPattern).toBe('config.yaml');
      expect(result.warnings).toEqual([]);
    });
  });

  describe('Edge Cases', () => {
    it('should handle pattern with directory that does not exist', async () => {
      const result = await resolver.resolve('nonexistent/**/*.md', {
        baseDir: tmpDir,
      });

      expect(result.paths).toEqual([]);
      expect(result.warnings).toEqual([]);
    });

    it('should handle mixed literal and glob patterns in array', async () => {
      // Create specific file
      const specificFile = path.join(tmpDir, 'settings.cursor.json');
      await fs.writeFile(specificFile, '{}');

      const result = await resolver.resolve(
        ['settings.cursor.json', 'settings.*.json'],
        {
          baseDir: tmpDir,
        }
      );

      expect(result.paths).toEqual([specificFile]);
      expect(result.matchedPattern).toBe('settings.cursor.json');
    });

    it('should handle single-element array same as string', async () => {
      const testFile = path.join(tmpDir, 'config.json');
      await fs.writeFile(testFile, '{}');

      const stringResult = await resolver.resolve('config.json', {
        baseDir: tmpDir,
      });

      const arrayResult = await resolver.resolve(['config.json'], {
        baseDir: tmpDir,
      });

      expect(arrayResult.paths).toEqual(stringResult.paths);
    });
  });
});
