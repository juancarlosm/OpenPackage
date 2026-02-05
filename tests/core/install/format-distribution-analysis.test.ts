/**
 * Format Distribution Analysis Tests
 * 
 * Tests the format distribution analyzer for determining
 * package-level format from per-file detections.
 */

import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  analyzeFormatDistribution,
  calculatePackageConfidence,
  getDominantPlatform,
  isMixedFormatDistribution,
  determinePackageFormat,
  groupFilesByPlatform
} from '../../../src/core/install/format-distribution-analyzer.js';
import type { FileFormat } from '../../../src/core/install/detection-types.js';

describe('Format Distribution Analysis', () => {
  describe('analyzeFormatDistribution', () => {
    it('should analyze uniform format distribution', () => {
      const fileFormats = new Map<string, FileFormat>([
        ['agents/a.md', { platform: 'claude', confidence: 0.9, matchedFlow: null, matchedSchema: null, matchedFields: [], path: 'agents/a.md' }],
        ['agents/b.md', { platform: 'claude', confidence: 0.85, matchedFlow: null, matchedSchema: null, matchedFields: [], path: 'agents/b.md' }],
        ['agents/c.md', { platform: 'claude', confidence: 0.95, matchedFlow: null, matchedSchema: null, matchedFields: [], path: 'agents/c.md' }]
      ]);
      
      const distribution = analyzeFormatDistribution(fileFormats);
      
      assert.equal(distribution.total, 3);
      assert.equal(distribution.counts.get('claude'), 3);
      assert.equal(distribution.percentages.get('claude'), 1.0);
      assert.equal(distribution.dominant, 'claude');
      assert.equal(distribution.dominantPercentage, 1.0);
    });

    it('should analyze mixed format distribution', () => {
      const fileFormats = new Map<string, FileFormat>([
        ['agents/a.md', { platform: 'claude', confidence: 0.9, matchedFlow: null, matchedSchema: null, matchedFields: [], path: 'agents/a.md' }],
        ['agents/b.md', { platform: 'opencode', confidence: 0.85, matchedFlow: null, matchedSchema: null, matchedFields: [], path: 'agents/b.md' }],
        ['agents/c.md', { platform: 'universal', confidence: 0.6, matchedFlow: null, matchedSchema: null, matchedFields: [], path: 'agents/c.md' }]
      ]);
      
      const distribution = analyzeFormatDistribution(fileFormats);
      
      assert.equal(distribution.total, 3);
      assert.equal(distribution.counts.get('claude'), 1);
      assert.equal(distribution.counts.get('opencode'), 1);
      assert.equal(distribution.counts.get('universal'), 1);
      assert.ok(distribution.dominant !== undefined);
    });

    it('should analyze dominant platform (>70%)', () => {
      const fileFormats = new Map<string, FileFormat>([
        ['agents/a.md', { platform: 'claude', confidence: 0.9, matchedFlow: null, matchedSchema: null, matchedFields: [], path: 'agents/a.md' }],
        ['agents/b.md', { platform: 'claude', confidence: 0.85, matchedFlow: null, matchedSchema: null, matchedFields: [], path: 'agents/b.md' }],
        ['agents/c.md', { platform: 'claude', confidence: 0.95, matchedFlow: null, matchedSchema: null, matchedFields: [], path: 'agents/c.md' }],
        ['agents/d.md', { platform: 'claude', confidence: 0.88, matchedFlow: null, matchedSchema: null, matchedFields: [], path: 'agents/d.md' }],
        ['agents/e.md', { platform: 'opencode', confidence: 0.75, matchedFlow: null, matchedSchema: null, matchedFields: [], path: 'agents/e.md' }]
      ]);
      
      const distribution = analyzeFormatDistribution(fileFormats);
      
      assert.equal(distribution.total, 5);
      assert.equal(distribution.counts.get('claude'), 4);
      assert.equal(distribution.counts.get('opencode'), 1);
      assert.equal(distribution.dominant, 'claude');
      assert.equal(distribution.dominantPercentage, 0.8); // 4/5
    });

    it('should handle empty file formats', () => {
      const fileFormats = new Map<string, FileFormat>();
      
      const distribution = analyzeFormatDistribution(fileFormats);
      
      assert.equal(distribution.total, 0);
      assert.equal(distribution.counts.size, 0);
      assert.equal(distribution.dominant, undefined);
    });
  });

  describe('calculatePackageConfidence', () => {
    it('should have high confidence for uniform format', () => {
      const fileFormats = new Map<string, FileFormat>([
        ['a.md', { platform: 'claude', confidence: 0.9, matchedFlow: null, matchedSchema: null, matchedFields: [], path: 'a.md' }],
        ['b.md', { platform: 'claude', confidence: 0.95, matchedFlow: null, matchedSchema: null, matchedFields: [], path: 'b.md' }]
      ]);
      
      const distribution = analyzeFormatDistribution(fileFormats);
      const confidence = calculatePackageConfidence(distribution, fileFormats);
      
      // Uniform format gets boost
      assert.ok(confidence > 0.9, `Expected confidence > 0.9, got ${confidence}`);
    });

    it('should have moderate confidence for dominant format', () => {
      const fileFormats = new Map<string, FileFormat>([
        ['a.md', { platform: 'claude', confidence: 0.9, matchedFlow: null, matchedSchema: null, matchedFields: [], path: 'a.md' }],
        ['b.md', { platform: 'claude', confidence: 0.85, matchedFlow: null, matchedSchema: null, matchedFields: [], path: 'b.md' }],
        ['c.md', { platform: 'claude', confidence: 0.95, matchedFlow: null, matchedSchema: null, matchedFields: [], path: 'c.md' }],
        ['d.md', { platform: 'opencode', confidence: 0.75, matchedFlow: null, matchedSchema: null, matchedFields: [], path: 'd.md' }]
      ]);
      
      const distribution = analyzeFormatDistribution(fileFormats);
      const confidence = calculatePackageConfidence(distribution, fileFormats);
      
      // Dominant format (75%) gets penalty
      assert.ok(confidence > 0.6 && confidence < 0.9);
    });

    it('should have low confidence for mixed formats', () => {
      const fileFormats = new Map<string, FileFormat>([
        ['a.md', { platform: 'claude', confidence: 0.8, matchedFlow: null, matchedSchema: null, matchedFields: [], path: 'a.md' }],
        ['b.md', { platform: 'opencode', confidence: 0.75, matchedFlow: null, matchedSchema: null, matchedFields: [], path: 'b.md' }],
        ['c.md', { platform: 'cursor', confidence: 0.7, matchedFlow: null, matchedSchema: null, matchedFields: [], path: 'c.md' }]
      ]);
      
      const distribution = analyzeFormatDistribution(fileFormats);
      const confidence = calculatePackageConfidence(distribution, fileFormats);
      
      // Mixed formats get higher penalty
      assert.ok(confidence < 0.7, `Expected confidence < 0.7, got ${confidence}`);
    });

    it('should return 0 for empty formats', () => {
      const fileFormats = new Map<string, FileFormat>();
      const distribution = analyzeFormatDistribution(fileFormats);
      const confidence = calculatePackageConfidence(distribution, fileFormats);
      
      assert.equal(confidence, 0);
    });
  });

  describe('getDominantPlatform', () => {
    it('should return dominant platform above threshold', () => {
      const distribution = {
        counts: new Map([['claude', 8], ['opencode', 2]]),
        percentages: new Map([['claude', 0.8], ['opencode', 0.2]]),
        total: 10,
        dominant: 'claude' as const,
        dominantPercentage: 0.8
      };
      
      const dominant = getDominantPlatform(distribution, 0.7);
      assert.equal(dominant, 'claude');
    });

    it('should return null if below threshold', () => {
      const distribution = {
        counts: new Map([['claude', 6], ['opencode', 4]]),
        percentages: new Map([['claude', 0.6], ['opencode', 0.4]]),
        total: 10,
        dominant: 'claude' as const,
        dominantPercentage: 0.6
      };
      
      const dominant = getDominantPlatform(distribution, 0.7);
      assert.equal(dominant, null);
    });

    it('should return null if no dominant platform', () => {
      const distribution = {
        counts: new Map([['claude', 5], ['opencode', 5]]),
        percentages: new Map([['claude', 0.5], ['opencode', 0.5]]),
        total: 10,
        dominant: undefined,
        dominantPercentage: undefined
      };
      
      const dominant = getDominantPlatform(distribution);
      assert.equal(dominant, null);
    });

    it('should use custom threshold', () => {
      const distribution = {
        counts: new Map([['claude', 6], ['opencode', 4]]),
        percentages: new Map([['claude', 0.6], ['opencode', 0.4]]),
        total: 10,
        dominant: 'claude' as const,
        dominantPercentage: 0.6
      };
      
      const dominant = getDominantPlatform(distribution, 0.5);
      assert.equal(dominant, 'claude');
    });
  });

  describe('isMixedFormatDistribution', () => {
    it('should return false for single format', () => {
      const distribution = {
        counts: new Map([['claude', 10]]),
        percentages: new Map([['claude', 1.0]]),
        total: 10,
        dominant: 'claude' as const,
        dominantPercentage: 1.0
      };
      
      assert.equal(isMixedFormatDistribution(distribution), false);
    });

    it('should return true for no dominant format', () => {
      const distribution = {
        counts: new Map([['claude', 5], ['opencode', 5]]),
        percentages: new Map([['claude', 0.5], ['opencode', 0.5]]),
        total: 10,
        dominant: 'claude' as const,
        dominantPercentage: 0.5
      };
      
      assert.equal(isMixedFormatDistribution(distribution), true);
    });

    it('should return true for significant secondary format', () => {
      const distribution = {
        counts: new Map([['claude', 7], ['opencode', 3]]),
        percentages: new Map([['claude', 0.7], ['opencode', 0.3]]),
        total: 10,
        dominant: 'claude' as const,
        dominantPercentage: 0.7
      };
      
      // Secondary format (30%) is above 20% threshold
      assert.equal(isMixedFormatDistribution(distribution), true);
    });

    it('should return false for insignificant secondary format', () => {
      const distribution = {
        counts: new Map([['claude', 9], ['opencode', 1]]),
        percentages: new Map([['claude', 0.9], ['opencode', 0.1]]),
        total: 10,
        dominant: 'claude' as const,
        dominantPercentage: 0.9
      };
      
      // Secondary format (10%) is below 20% threshold
      assert.equal(isMixedFormatDistribution(distribution), false);
    });
  });

  describe('determinePackageFormat', () => {
    it('should return single format', () => {
      const distribution = {
        counts: new Map([['claude', 10]]),
        percentages: new Map([['claude', 1.0]]),
        total: 10,
        dominant: 'claude' as const,
        dominantPercentage: 1.0
      };
      
      const format = determinePackageFormat(distribution);
      assert.equal(format, 'claude');
    });

    it('should return dominant format', () => {
      const distribution = {
        counts: new Map([['claude', 8], ['opencode', 2]]),
        percentages: new Map([['claude', 0.8], ['opencode', 0.2]]),
        total: 10,
        dominant: 'claude' as const,
        dominantPercentage: 0.8
      };
      
      const format = determinePackageFormat(distribution);
      assert.equal(format, 'claude');
    });

    it('should return mixed for no dominant', () => {
      const distribution = {
        counts: new Map([['claude', 5], ['opencode', 5]]),
        percentages: new Map([['claude', 0.5], ['opencode', 0.5]]),
        total: 10,
        dominant: 'claude' as const,
        dominantPercentage: 0.5
      };
      
      const format = determinePackageFormat(distribution);
      assert.equal(format, 'mixed');
    });

    it('should return unknown for empty', () => {
      const distribution = {
        counts: new Map(),
        percentages: new Map(),
        total: 0,
        dominant: undefined,
        dominantPercentage: undefined
      };
      
      const format = determinePackageFormat(distribution);
      assert.equal(format, 'unknown');
    });
  });

  describe('groupFilesByPlatform', () => {
    it('should group files by platform', () => {
      const fileFormats = new Map<string, FileFormat>([
        ['a.md', { platform: 'claude', confidence: 0.9, matchedFlow: null, matchedSchema: null, matchedFields: [], path: 'a.md' }],
        ['b.md', { platform: 'claude', confidence: 0.85, matchedFlow: null, matchedSchema: null, matchedFields: [], path: 'b.md' }],
        ['c.md', { platform: 'opencode', confidence: 0.75, matchedFlow: null, matchedSchema: null, matchedFields: [], path: 'c.md' }]
      ]);
      
      const groups = groupFilesByPlatform(fileFormats);
      
      assert.equal(groups.size, 2);
      assert.deepEqual(groups.get('claude'), ['a.md', 'b.md']);
      assert.deepEqual(groups.get('opencode'), ['c.md']);
    });

    it('should handle empty formats', () => {
      const fileFormats = new Map<string, FileFormat>();
      const groups = groupFilesByPlatform(fileFormats);
      
      assert.equal(groups.size, 0);
    });

    it('should handle universal and unknown formats', () => {
      const fileFormats = new Map<string, FileFormat>([
        ['a.md', { platform: 'universal', confidence: 0.5, matchedFlow: null, matchedSchema: null, matchedFields: [], path: 'a.md' }],
        ['b.md', { platform: 'unknown', confidence: 0.2, matchedFlow: null, matchedSchema: null, matchedFields: [], path: 'b.md' }]
      ]);
      
      const groups = groupFilesByPlatform(fileFormats);
      
      assert.equal(groups.size, 2);
      assert.deepEqual(groups.get('universal'), ['a.md']);
      assert.deepEqual(groups.get('unknown'), ['b.md']);
    });
  });
});
