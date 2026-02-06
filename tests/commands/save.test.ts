/**
 * Tests for the minimal save command
 */

import { describe, it, beforeEach } from 'node:test';
import * as assert from 'node:assert/strict';
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdtemp, rm, readFile } from 'fs/promises';
import { runSavePipeline } from '../../src/core/save/save-pipeline.js';
import { writeWorkspaceIndex, getWorkspaceIndexPath, type WorkspaceIndexRecord } from '../../src/utils/workspace-index-yml.js';
import { ensureDir, writeTextFile } from '../../src/utils/fs.js';

describe('Save Command - MVP', () => {
  let testDir: string;
  let packagesDir: string;
  let packageRoot: string;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    testDir = await mkdtemp(join(tmpdir(), 'opkg-save-test-'));
    packagesDir = join(testDir, '.openpackage', 'packages');
    packageRoot = join(packagesDir, 'test-pkg');

    await ensureDir(packageRoot);
    await ensureDir(join(testDir, '.cursor', 'commands'));
    await ensureDir(join(testDir, '.openpackage'));
  });

  async function cleanup() {
    try {
      process.chdir(originalCwd);
      await rm(testDir, { recursive: true, force: true });
    } catch (e) {
      // Ignore
    }
  }

  it('should save changed workspace files back to source', async () => {
    try {
      const originalContent = '# Original Command\nThis is the original content.';
      await writeTextFile(join(packageRoot, 'commands', 'deploy.md'), originalContent);

      const workspaceFilePath = join(testDir, '.cursor', 'commands', 'deploy.md');
      await writeTextFile(workspaceFilePath, originalContent);

      const indexPath = getWorkspaceIndexPath(testDir);
      await writeWorkspaceIndex({
        path: indexPath,
        index: {
          packages: {
            'test-pkg': {
              path: packageRoot,
              files: {
                'commands/deploy.md': ['.cursor/commands/deploy.md']
              }
            }
          }
        }
      });

      const newContent = '# Updated Command\nThis is the updated content.';
      await writeTextFile(workspaceFilePath, newContent);

      process.chdir(testDir);
      const result = await runSavePipeline('test-pkg', {});

      assert.equal(result.success, true);
      assert.equal(result.data?.filesSaved, 1);
      assert.deepEqual(result.data?.savedFiles, ['.cursor/commands/deploy.md']);

      const savedContent = await readFile(join(packageRoot, 'commands', 'deploy.md'), 'utf-8');
      assert.equal(savedContent, newContent);
    } finally {
      await cleanup();
    }
  });

  it('should report no changes when workspace matches source', async () => {
    try {
      const content = '# Command\nSame content everywhere.';
      await writeTextFile(join(packageRoot, 'commands', 'deploy.md'), content);

      const workspaceFilePath = join(testDir, '.cursor', 'commands', 'deploy.md');
      await writeTextFile(workspaceFilePath, content);

      const indexPath = getWorkspaceIndexPath(testDir);
      await writeWorkspaceIndex({
        path: indexPath,
        index: {
          packages: {
            'test-pkg': {
              path: packageRoot,
              files: {
                'commands/deploy.md': ['.cursor/commands/deploy.md']
              }
            }
          }
        }
      });

      process.chdir(testDir);
      const result = await runSavePipeline('test-pkg', {});

      if (result.data?.filesSaved !== 0) {
        console.log('Expected 0 files saved but got:', result.data?.filesSaved);
        console.log('Saved files:', result.data?.savedFiles);
      }
      assert.equal(result.success, true);
      assert.equal(result.data?.filesSaved, 0);
      assert.deepEqual(result.data?.savedFiles, []);
    } finally {
      await cleanup();
    }
  });

  it('should reject save to uninstalled package', async () => {
    try {
      const indexPath = getWorkspaceIndexPath(testDir);
      await writeWorkspaceIndex({
        path: indexPath,
        index: {
          packages: {}
        }
      });

      process.chdir(testDir);
      const result = await runSavePipeline('unknown-pkg', {});

      assert.equal(result.success, false);
      assert.match(result.error || '', /not installed in this workspace/i);
    } finally {
      await cleanup();
    }
  });

  it('should handle multiple changed files', async () => {
    try {
      await writeTextFile(join(packageRoot, 'commands', 'deploy.md'), 'Original deploy');
      await writeTextFile(join(packageRoot, 'commands', 'build.md'), 'Original build');
      await writeTextFile(join(packageRoot, 'rules', 'style.md'), 'Original style');

      await writeTextFile(join(testDir, '.cursor', 'commands', 'deploy.md'), 'Original deploy');
      await writeTextFile(join(testDir, '.cursor', 'commands', 'build.md'), 'Original build');
      await ensureDir(join(testDir, '.cursor', 'rules'));
      await writeTextFile(join(testDir, '.cursor', 'rules', 'style.md'), 'Original style');

      const indexPath = getWorkspaceIndexPath(testDir);
      await writeWorkspaceIndex({
        path: indexPath,
        index: {
          packages: {
            'test-pkg': {
              path: packageRoot,
              files: {
                'commands/deploy.md': ['.cursor/commands/deploy.md'],
                'commands/build.md': ['.cursor/commands/build.md'],
                'rules/style.md': ['.cursor/rules/style.md']
              }
            }
          }
        }
      });

      await writeTextFile(join(testDir, '.cursor', 'commands', 'deploy.md'), 'Updated deploy');
      await writeTextFile(join(testDir, '.cursor', 'rules', 'style.md'), 'Updated style');

      process.chdir(testDir);
      const result = await runSavePipeline('test-pkg', {});

      assert.equal(result.success, true);
      assert.equal(result.data?.filesSaved, 2);
      
      const savedFiles = result.data?.savedFiles.sort();
      assert.deepEqual(savedFiles, [
        '.cursor/commands/deploy.md',
        '.cursor/rules/style.md'
      ].sort());

      const deployContent = await readFile(join(packageRoot, 'commands', 'deploy.md'), 'utf-8');
      const styleContent = await readFile(join(packageRoot, 'rules', 'style.md'), 'utf-8');
      const buildContent = await readFile(join(packageRoot, 'commands', 'build.md'), 'utf-8');

      assert.equal(deployContent, 'Updated deploy');
      assert.equal(styleContent, 'Updated style');
      assert.equal(buildContent, 'Original build');
    } finally {
      await cleanup();
    }
  });

  it('should create new files in source if they do not exist yet', async () => {
    try {
      await ensureDir(join(packageRoot, 'commands'));

      const newContent = '# New Command\nThis is new.';
      await writeTextFile(join(testDir, '.cursor', 'commands', 'new.md'), newContent);

      const indexPath = getWorkspaceIndexPath(testDir);
      await writeWorkspaceIndex({
        path: indexPath,
        index: {
          packages: {
            'test-pkg': {
              path: packageRoot,
              files: {
                'commands/new.md': ['.cursor/commands/new.md']
              }
            }
          }
        }
      });

      process.chdir(testDir);
      const result = await runSavePipeline('test-pkg', {});

      assert.equal(result.success, true);
      assert.equal(result.data?.filesSaved, 1);

      const savedContent = await readFile(join(packageRoot, 'commands', 'new.md'), 'utf-8');
      assert.equal(savedContent, newContent);
    } finally {
      await cleanup();
    }
  });

  it('should skip workspace files that do not exist', async () => {
    try {
      await writeTextFile(join(packageRoot, 'commands', 'deploy.md'), 'Original');

      const indexPath = getWorkspaceIndexPath(testDir);
      await writeWorkspaceIndex({
        path: indexPath,
        index: {
          packages: {
            'test-pkg': {
              path: packageRoot,
              files: {
                'commands/deploy.md': ['.cursor/commands/deploy.md']
              }
            }
          }
        }
      });

      process.chdir(testDir);
      const result = await runSavePipeline('test-pkg', {});

      assert.equal(result.success, true);
      assert.equal(result.data?.filesSaved, 0);
    } finally {
      await cleanup();
    }
  });
});
