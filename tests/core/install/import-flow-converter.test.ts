/**
 * Import Flow Converter Tests
 * 
 * Tests for Phase 3: Per-File Import Flow Application
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  convertFormatGroup,
  convertSingleFile,
  applyImportFlows,
  validateUniversalFormat
} from '../../../src/core/install/import-flow-converter.js';
import type { PackageFile, FormatGroup } from '../../../src/core/install/detection-types.js';
import type { Flow } from '../../../src/types/flows.js';

describe('Import Flow Converter', () => {
  describe('convertSingleFile', () => {
    it('should convert Claude format agent to universal format', () => {
      const file: PackageFile = {
        path: '.claude/agents/reviewer.md',
        content: `---
tools: Read, Write
permissionMode: default
model: sonnet
---

# Code Reviewer Agent
Review code for best practices.`,
        frontmatter: {
          tools: 'Read, Write',
          permissionMode: 'default',
          model: 'sonnet'
        }
      };

      const flows: Flow[] = [
        {
          from: '.claude/agents/**/*.md',
          to: 'agents/**/*.md',
          map: [
            // Convert tools from string to array
            {
              $pipeline: {
                field: 'tools',
                operations: [
                  { $reduce: { type: 'split', separator: ', ' } },
                  { $map: { each: 'lowercase' } }
                ]
              }
            },
            // Convert model from shorthand to prefixed
            {
              $pipeline: {
                field: 'model',
                operations: [
                  { $replace: { pattern: '^sonnet$', with: 'anthropic/claude-3-5-sonnet-20241022' } }
                ]
              }
            },
            // Convert permissionMode to permissions object
            {
              $set: {
                permissions: {
                  edit: 'ask',
                  bash: 'ask',
                  read: 'ask'
                }
              }
            },
            { $unset: 'permissionMode' }
          ]
        }
      ];

      const result = convertSingleFile(file, flows, 'claude');

      expect(result.success).toBe(true);
      expect(result.transformed).toBe(true);
      expect(result.converted).toBeDefined();
      expect(result.converted?.path).toBe('agents/reviewer.md');
      expect(result.converted?.frontmatter?.tools).toEqual(['read', 'write']);
      expect(result.converted?.frontmatter?.model).toBe('anthropic/claude-3-5-sonnet-20241022');
      expect(result.converted?.frontmatter?.permissions).toEqual({
        edit: 'ask',
        bash: 'ask',
        read: 'ask'
      });
      expect(result.converted?.frontmatter?.permissionMode).toBeUndefined();
    });

    it('should handle files with no matching flow', () => {
      const file: PackageFile = {
        path: 'skills/typescript/SKILL.md',
        content: '# TypeScript Skill\n\nProvides TypeScript support.'
      };

      const flows: Flow[] = [
        {
          from: '.claude/agents/**/*.md',
          to: 'agents/**/*.md'
        }
      ];

      const result = convertSingleFile(file, flows, 'claude');

      expect(result.success).toBe(true);
      expect(result.transformed).toBe(false);
      expect(result.converted).toEqual(file);
    });

    it('should handle conversion errors gracefully', () => {
      const file: PackageFile = {
        path: '.claude/agents/bad.md',
        content: '---\ntools: Read\n---\nContent',
        frontmatter: {
          tools: 'Read'
        }
      };

      const flows: Flow[] = [
        {
          from: '.claude/agents/**/*.md',
          to: 'agents/**/*.md',
          map: [
            // Invalid operation that will throw
            { $invalidOp: {} } as any
          ]
        }
      ];

      const result = convertSingleFile(file, flows, 'claude');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.transformed).toBe(false);
    });
  });

  describe('convertFormatGroup', () => {
    it('should skip conversion for universal format group', () => {
      const group: FormatGroup = {
        platformId: 'universal',
        files: [
          {
            path: 'agents/agent1.md',
            content: '---\ntools: [read, write]\n---\nContent',
            frontmatter: { tools: ['read', 'write'] }
          },
          {
            path: 'agents/agent2.md',
            content: '---\ntools: [bash]\n---\nContent',
            frontmatter: { tools: ['bash'] }
          }
        ],
        confidence: 1.0
      };

      const result = convertFormatGroup(group);

      expect(result.success).toBe(true);
      expect(result.filesProcessed).toBe(2);
      expect(result.filesConverted).toBe(2);
      expect(result.filesFailed).toBe(0);
      expect(result.convertedFiles).toEqual(group.files);
    });

    it('should fail gracefully for unknown format group', () => {
      const group: FormatGroup = {
        platformId: 'unknown',
        files: [
          {
            path: 'agents/agent1.md',
            content: '# Agent'
          }
        ],
        confidence: 0
      };

      const result = convertFormatGroup(group);

      expect(result.success).toBe(false);
      expect(result.filesProcessed).toBe(1);
      expect(result.filesConverted).toBe(0);
      expect(result.filesFailed).toBe(1);
    });

    it('should convert entire Claude format group', () => {
      const group: FormatGroup = {
        platformId: 'claude',
        files: [
          {
            path: '.claude/agents/agent1.md',
            content: '---\ntools: Read\n---\nContent',
            frontmatter: { tools: 'Read' }
          },
          {
            path: '.claude/agents/agent2.md',
            content: '---\ntools: Write, Bash\n---\nContent',
            frontmatter: { tools: 'Write, Bash' }
          }
        ],
        confidence: 0.95
      };

      const result = convertFormatGroup(group);

      expect(result.success).toBe(true);
      expect(result.platformId).toBe('claude');
      expect(result.filesProcessed).toBe(2);
      
      // Check converted files
      expect(result.convertedFiles.length).toBeGreaterThan(0);
      
      // Files should have transformed paths
      const paths = result.convertedFiles.map(f => f.path);
      expect(paths.some(p => p.startsWith('agents/'))).toBe(true);
    });

    it('should handle platform with no import flows', () => {
      const group: FormatGroup = {
        platformId: 'cursor',
        files: [
          {
            path: '.cursor/agents/agent1.md',
            content: '---\ntools: [read]\n---\nContent',
            frontmatter: { tools: ['read'] }
          }
        ],
        confidence: 1.0
      };

      const result = convertFormatGroup(group);

      // Cursor might not have import flows with transformations
      // Should return files unchanged or with minimal transformation
      expect(result.success).toBe(true);
      expect(result.filesProcessed).toBe(1);
    });
  });

  describe('applyImportFlows', () => {
    it('should apply flows to multiple files', () => {
      const files: PackageFile[] = [
        {
          path: '.claude/agents/agent1.md',
          content: '---\ntools: Read\n---\nContent',
          frontmatter: { tools: 'Read' }
        },
        {
          path: '.claude/agents/agent2.md',
          content: '---\ntools: Write\n---\nContent',
          frontmatter: { tools: 'Write' }
        }
      ];

      const flows: Flow[] = [
        {
          from: '.claude/agents/**/*.md',
          to: 'agents/**/*.md',
          map: [
            {
              $pipeline: {
                field: 'tools',
                operations: [
                  { $reduce: { type: 'split', separator: ', ' } },
                  { $map: { each: 'lowercase' } }
                ]
              }
            }
          ]
        }
      ];

      const result = applyImportFlows(files, flows, 'claude');

      expect(result.length).toBe(2);
      expect(result[0].frontmatter?.tools).toEqual(['read']);
      expect(result[1].frontmatter?.tools).toEqual(['write']);
    });

    it('should include original file if conversion fails', () => {
      const files: PackageFile[] = [
        {
          path: '.claude/agents/good.md',
          content: '---\ntools: Read\n---\nContent',
          frontmatter: { tools: 'Read' }
        },
        {
          path: '.claude/agents/bad.md',
          content: '---\ntools: Write\n---\nContent',
          frontmatter: { tools: 'Write' }
        }
      ];

      const flows: Flow[] = [
        {
          from: '.claude/agents/**/*.md',
          to: 'agents/**/*.md',
          map: [
            { $invalidOperation: {} } as any
          ]
        }
      ];

      const result = applyImportFlows(files, flows, 'claude');

      // Should return original files when conversion fails
      expect(result.length).toBe(2);
      expect(result.some(f => f.path === '.claude/agents/good.md')).toBe(true);
    });
  });

  describe('validateUniversalFormat', () => {
    it('should validate universal format with array tools', () => {
      const file: PackageFile = {
        path: 'agents/agent.md',
        frontmatter: {
          tools: ['read', 'write', 'bash']
        }
      };

      expect(validateUniversalFormat(file)).toBe(true);
    });

    it('should reject non-array tools', () => {
      const file: PackageFile = {
        path: 'agents/agent.md',
        frontmatter: {
          tools: 'Read, Write'  // String format (Claude)
        }
      };

      expect(validateUniversalFormat(file)).toBe(false);
    });

    it('should reject platform-specific exclusive fields', () => {
      const claudeFile: PackageFile = {
        path: 'agents/agent.md',
        frontmatter: {
          tools: ['read'],
          permissionMode: 'default'  // Claude exclusive
        }
      };

      expect(validateUniversalFormat(claudeFile)).toBe(false);

      const opencodeFile: PackageFile = {
        path: 'agents/agent.md',
        frontmatter: {
          tools: { read: true },  // OpenCode format
          temperature: 0.7  // OpenCode exclusive
        }
      };

      expect(validateUniversalFormat(opencodeFile)).toBe(false);
    });

    it('should accept files with no frontmatter', () => {
      const file: PackageFile = {
        path: 'skills/typescript/SKILL.md',
        content: '# TypeScript Skill'
      };

      expect(validateUniversalFormat(file)).toBe(true);
    });

    it('should validate file with permissions object', () => {
      const file: PackageFile = {
        path: 'agents/agent.md',
        frontmatter: {
          tools: ['read', 'write'],
          permissions: {
            edit: 'ask',
            bash: 'ask'
          }
        }
      };

      expect(validateUniversalFormat(file)).toBe(true);
    });
  });

  describe('Path transformation', () => {
    it('should transform Claude paths to universal', () => {
      const file: PackageFile = {
        path: '.claude/agents/subfolder/agent.md',
        content: '---\ntools: Read\n---\nContent',
        frontmatter: { tools: 'Read' }
      };

      const flows: Flow[] = [
        {
          from: '.claude/agents/**/*.md',
          to: 'agents/**/*.md',
          map: [
            {
              $pipeline: {
                field: 'tools',
                operations: [
                  { $reduce: { type: 'split', separator: ', ' } },
                  { $map: { each: 'lowercase' } }
                ]
              }
            }
          ]
        }
      ];

      const result = convertSingleFile(file, flows, 'claude');

      expect(result.success).toBe(true);
      expect(result.converted?.path).toBe('agents/subfolder/agent.md');
    });

    it('should transform Cursor paths to universal', () => {
      const file: PackageFile = {
        path: '.cursor/rules/rule.md',
        content: '# Rule',
        frontmatter: {}
      };

      const flows: Flow[] = [
        {
          from: '.cursor/rules/**/*.md',
          to: 'rules/**/*.md'
        }
      ];

      const result = convertSingleFile(file, flows, 'cursor');

      expect(result.success).toBe(true);
      expect(result.converted?.path).toBe('rules/rule.md');
    });
  });
});
