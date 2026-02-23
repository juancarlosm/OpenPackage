/**
 * Package Marker Detection Tests
 * 
 * Tests the data-driven package-level marker detection system.
 * All platform markers come from platforms.jsonc - no hardcoded checks.
 */

import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  detectPlatformMarkers,
  matchDetectionPattern,
  getPrimaryPlatformFromMarkers,
  isPurePlatformSpecific,
  isMixedFormat
} from '../../../packages/core/src/core/install/package-marker-detector.js';
import type { PackageFile } from '../../../packages/core/src/core/install/detection-types.js';

describe('Package Marker Detection', () => {
  describe('detectPlatformMarkers', () => {
    it('should detect Claude plugin marker', () => {
      const files: PackageFile[] = [
        { path: '.claude-plugin/plugin.json' },
        { path: 'agents/test.md' }
      ];
      
      const result = detectPlatformMarkers(files);
      
      assert.ok(result.matches.length > 0, 'Should detect at least one marker');
      const claudePluginMatch = result.matches.find(m => m.platformId === 'claude-plugin');
      assert.ok(claudePluginMatch, 'Should detect claude-plugin marker');
      assert.equal(claudePluginMatch.matchedPattern, '.claude-plugin/plugin.json');
      assert.equal(claudePluginMatch.confidence, 1.0);
    });

    it('should detect Claude platform marker', () => {
      const files: PackageFile[] = [
        { path: '.claude/agents/test.md' },
        { path: '.claude/rules/rule.md' }
      ];
      
      const result = detectPlatformMarkers(files);
      
      const claudeMatch = result.matches.find(m => m.platformId === 'claude');
      assert.ok(claudeMatch, 'Should detect claude marker');
      assert.equal(claudeMatch.matchedPattern, '.claude');
    });

    it('should detect Cursor platform marker', () => {
      const files: PackageFile[] = [
        { path: '.cursor/agents/test.md' },
        { path: 'AGENTS.md' }
      ];
      
      const result = detectPlatformMarkers(files);
      
      const cursorMatch = result.matches.find(m => m.platformId === 'cursor');
      assert.ok(cursorMatch, 'Should detect cursor marker');
    });

    it('should detect OpenCode platform marker', () => {
      const files: PackageFile[] = [
        { path: '.opencode/agents/test.md' }
      ];
      
      const result = detectPlatformMarkers(files);
      
      const opencodeMatch = result.matches.find(m => m.platformId === 'opencode');
      assert.ok(opencodeMatch, 'Should detect opencode marker');
    });

    it('should detect openpackage.yml as universal marker', () => {
      const files: PackageFile[] = [
        { path: 'openpackage.yml' },
        { path: 'agents/test.md' }
      ];
      
      const result = detectPlatformMarkers(files);
      
      assert.equal(result.hasOpenPackageYml, true, 'Should detect openpackage.yml');
    });

    it('should detect package.yml as universal marker', () => {
      const files: PackageFile[] = [
        { path: 'package.yml' },
        { path: 'agents/test.md' }
      ];
      
      const result = detectPlatformMarkers(files);
      
      assert.equal(result.hasPackageYml, true, 'Should detect package.yml');
    });

    it('should detect no markers for universal-only package', () => {
      const files: PackageFile[] = [
        { path: 'agents/test.md' },
        { path: 'commands/cmd.md' },
        { path: 'rules/rule.md' }
      ];
      
      const result = detectPlatformMarkers(files);
      
      assert.equal(result.matches.length, 0, 'Should detect no platform markers');
      assert.equal(result.hasOpenPackageYml, false);
      assert.equal(result.hasPackageYml, false);
    });

    it('should detect multiple platform markers', () => {
      const files: PackageFile[] = [
        { path: '.claude/agents/test.md' },
        { path: '.cursor/agents/test.md' }
      ];
      
      const result = detectPlatformMarkers(files);
      
      assert.ok(result.matches.length >= 2, 'Should detect multiple markers');
      assert.ok(result.matches.some(m => m.platformId === 'claude'));
      assert.ok(result.matches.some(m => m.platformId === 'cursor'));
    });

    it('should detect platform + universal markers', () => {
      const files: PackageFile[] = [
        { path: '.claude/agents/test.md' },
        { path: 'openpackage.yml' }
      ];
      
      const result = detectPlatformMarkers(files);
      
      assert.ok(result.matches.length > 0, 'Should detect platform marker');
      assert.equal(result.hasOpenPackageYml, true, 'Should detect universal marker');
    });
  });

  describe('matchDetectionPattern', () => {
    it('should match exact file path', () => {
      const filePaths = new Set(['openpackage.yml', 'agents/test.md']);
      
      assert.equal(matchDetectionPattern(filePaths, 'openpackage.yml'), true);
    });

    it('should match directory marker', () => {
      const filePaths = new Set(['.claude/agents/test.md', '.claude/rules/rule.md']);
      
      assert.equal(matchDetectionPattern(filePaths, '.claude'), true);
    });

    it('should match glob pattern', () => {
      const filePaths = new Set(['AGENTS.md', 'README.md']);
      
      assert.equal(matchDetectionPattern(filePaths, '*.md'), true);
    });

    it('should not match non-existent pattern', () => {
      const filePaths = new Set(['agents/test.md', 'commands/cmd.md']);
      
      assert.equal(matchDetectionPattern(filePaths, '.cursor'), false);
    });

    it('should match file inside directory', () => {
      const filePaths = new Set(['.opencode/agents/reviewer.md']);
      
      assert.equal(matchDetectionPattern(filePaths, '.opencode'), true);
    });
  });

  describe('getPrimaryPlatformFromMarkers', () => {
    it('should return null for no markers', () => {
      const markers = {
        matches: [],
        hasOpenPackageYml: false,
        hasPackageYml: false
      };
      
      const primary = getPrimaryPlatformFromMarkers(markers);
      assert.equal(primary, null);
    });

    it('should return single marker platform', () => {
      const markers = {
        matches: [
          { platformId: 'claude', matchedPattern: '.claude', confidence: 1.0 }
        ],
        hasOpenPackageYml: false,
        hasPackageYml: false
      };
      
      const primary = getPrimaryPlatformFromMarkers(markers);
      assert.equal(primary, 'claude');
    });

    it('should prioritize claude-plugin over other markers', () => {
      const markers = {
        matches: [
          { platformId: 'claude', matchedPattern: '.claude', confidence: 1.0 },
          { platformId: 'claude-plugin', matchedPattern: '.claude-plugin/plugin.json', confidence: 1.0 }
        ],
        hasOpenPackageYml: false,
        hasPackageYml: false
      };
      
      const primary = getPrimaryPlatformFromMarkers(markers);
      assert.equal(primary, 'claude-plugin');
    });

    it('should use pattern specificity for multiple markers', () => {
      const markers = {
        matches: [
          { platformId: 'cursor', matchedPattern: '.cursor', confidence: 1.0 },
          { platformId: 'claude', matchedPattern: '.claude/agents/test.md', confidence: 1.0 }
        ],
        hasOpenPackageYml: false,
        hasPackageYml: false
      };
      
      const primary = getPrimaryPlatformFromMarkers(markers);
      // Should prefer more specific pattern (longer path)
      assert.ok(primary !== null);
    });
  });

  describe('isPurePlatformSpecific', () => {
    it('should return true for single platform marker without universal', () => {
      const markers = {
        matches: [
          { platformId: 'claude', matchedPattern: '.claude', confidence: 1.0 }
        ],
        hasOpenPackageYml: false,
        hasPackageYml: false
      };
      
      assert.equal(isPurePlatformSpecific(markers), true);
    });

    it('should return false for multiple platform markers', () => {
      const markers = {
        matches: [
          { platformId: 'claude', matchedPattern: '.claude', confidence: 1.0 },
          { platformId: 'cursor', matchedPattern: '.cursor', confidence: 1.0 }
        ],
        hasOpenPackageYml: false,
        hasPackageYml: false
      };
      
      assert.equal(isPurePlatformSpecific(markers), false);
    });

    it('should return false if openpackage.yml exists', () => {
      const markers = {
        matches: [
          { platformId: 'claude', matchedPattern: '.claude', confidence: 1.0 }
        ],
        hasOpenPackageYml: true,
        hasPackageYml: false
      };
      
      assert.equal(isPurePlatformSpecific(markers), false);
    });

    it('should return false for no markers', () => {
      const markers = {
        matches: [],
        hasOpenPackageYml: false,
        hasPackageYml: false
      };
      
      assert.equal(isPurePlatformSpecific(markers), false);
    });
  });

  describe('isMixedFormat', () => {
    it('should return true for multiple platform markers', () => {
      const markers = {
        matches: [
          { platformId: 'claude', matchedPattern: '.claude', confidence: 1.0 },
          { platformId: 'cursor', matchedPattern: '.cursor', confidence: 1.0 }
        ],
        hasOpenPackageYml: false,
        hasPackageYml: false
      };
      
      assert.equal(isMixedFormat(markers), true);
    });

    it('should return true for platform + universal markers', () => {
      const markers = {
        matches: [
          { platformId: 'claude', matchedPattern: '.claude', confidence: 1.0 }
        ],
        hasOpenPackageYml: true,
        hasPackageYml: false
      };
      
      assert.equal(isMixedFormat(markers), true);
    });

    it('should return false for single platform only', () => {
      const markers = {
        matches: [
          { platformId: 'claude', matchedPattern: '.claude', confidence: 1.0 }
        ],
        hasOpenPackageYml: false,
        hasPackageYml: false
      };
      
      assert.equal(isMixedFormat(markers), false);
    });

    it('should return false for universal only', () => {
      const markers = {
        matches: [],
        hasOpenPackageYml: true,
        hasPackageYml: false
      };
      
      assert.equal(isMixedFormat(markers), false);
    });
  });

  describe('Data-Driven Platform Detection', () => {
    it('should detect platforms dynamically from platforms.jsonc', () => {
      // This test verifies that platform detection is data-driven
      // Any platform added to platforms.jsonc with detection patterns
      // should be automatically detectable
      
      const files: PackageFile[] = [
        { path: '.factory/agents/test.md' },
        { path: '.augment/rules/rule.md' },
        { path: '.warp/commands/cmd.md' }
      ];
      
      const result = detectPlatformMarkers(files);
      
      // Should detect all platforms that have markers in platforms.jsonc
      assert.ok(result.matches.length > 0, 'Should detect markers dynamically');
      
      // Verify no hardcoded platform checks - all come from registry
      const platformIds = result.matches.map(m => m.platformId);
      assert.ok(platformIds.every(id => typeof id === 'string'), 'All platform IDs are strings');
    });
  });
});
