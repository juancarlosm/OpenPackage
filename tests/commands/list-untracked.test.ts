/**
 * Integration tests for opkg list --untracked command
 */

import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runListPipeline } from '../../src/core/list/list-pipeline.js';
import { writeWorkspaceIndex } from '../../src/utils/workspace-index-yml.js';
import { getWorkspaceIndexPath } from '../../src/utils/workspace-index-yml.js';
import type { WorkspaceIndex } from '../../src/types/workspace-index.js';
import type { ExecutionContext } from '../../src/types/index.js';

// Helper function
async function createWorkspaceIndex(dir: string, index: WorkspaceIndex): Promise<void> {
  const indexPath = getWorkspaceIndexPath(dir);
  await fs.mkdir(join(dir, '.openpackage'), { recursive: true });
  await writeWorkspaceIndex({ path: indexPath, index });
}

// Test: Fail when no workspace index exists
{
  const testDir = join(tmpdir(), `opkg-test-list-untracked-${Date.now()}-1`);
  await fs.mkdir(testDir, { recursive: true });
  
  try {
    const execContext: ExecutionContext = {
      targetDir: testDir,
      homeDir: testDir,
      isGlobalScope: false
    };
    
    let errorThrown = false;
    try {
      await runListPipeline(undefined, execContext, { untracked: true });
    } catch (error) {
      errorThrown = true;
      assert.ok(String(error).includes('No workspace index found'));
    }
    
    assert.ok(errorThrown, 'Should throw when no workspace index');
    
    console.log('✓ Fail when no workspace index exists');
  } finally {
    await fs.rm(testDir, { recursive: true, force: true });
  }
}

// Test: Return untracked files when workspace has untracked content
{
  const testDir = join(tmpdir(), `opkg-test-list-untracked-${Date.now()}-2`);
  await fs.mkdir(testDir, { recursive: true });
  
  try {
    await fs.mkdir(join(testDir, '.claude', 'rules'), { recursive: true });
    await fs.writeFile(join(testDir, '.claude', 'rules', 'untracked.md'), 'Untracked content');
    
    await createWorkspaceIndex(testDir, { packages: {} });
    
    const execContext: ExecutionContext = {
      targetDir: testDir,
      homeDir: testDir,
      isGlobalScope: false
    };
    
    const result = await runListPipeline(undefined, execContext, { untracked: true });
    
    assert.ok(result.success, 'Should succeed');
    assert.ok(result.data?.untrackedFiles, 'Should have untrackedFiles');
    assert.ok(result.data!.untrackedFiles!.totalFiles > 0, 'Should have files');
    
    const hasUntrackedFile = result.data!.untrackedFiles!.files.some(
      f => f.workspacePath.includes('untracked.md')
    );
    assert.ok(hasUntrackedFile, 'Should include untracked.md');
    
    console.log('✓ Return untracked files when workspace has untracked content');
  } finally {
    await fs.rm(testDir, { recursive: true, force: true });
  }
}

// Test: Work with --global scope (home directory)
{
  const testDir = join(tmpdir(), `opkg-test-list-untracked-${Date.now()}-3`);
  await fs.mkdir(testDir, { recursive: true });
  
  try {
    await fs.mkdir(join(testDir, '.claude', 'rules'), { recursive: true });
    await fs.writeFile(join(testDir, '.claude', 'rules', 'global-rule.md'), 'Global rule');
    
    await createWorkspaceIndex(testDir, { packages: {} });
    
    const execContext: ExecutionContext = {
      targetDir: testDir,
      homeDir: testDir,
      isGlobalScope: true
    };
    
    const result = await runListPipeline(undefined, execContext, { untracked: true });
    
    assert.ok(result.success, 'Should succeed');
    assert.ok(result.data?.untrackedFiles, 'Should have untrackedFiles');
    assert.ok(result.data!.untrackedFiles!.totalFiles > 0, 'Should have files');
    
    console.log('✓ Work with --global scope (home directory)');
  } finally {
    await fs.rm(testDir, { recursive: true, force: true });
  }
}

// Test: Distinguish between tracked and untracked files
{
  const testDir = join(tmpdir(), `opkg-test-list-untracked-${Date.now()}-4`);
  await fs.mkdir(testDir, { recursive: true });
  
  try {
    await fs.mkdir(join(testDir, '.claude', 'rules'), { recursive: true });
    await fs.writeFile(join(testDir, '.claude', 'rules', 'tracked.md'), 'Tracked');
    await fs.writeFile(join(testDir, '.claude', 'rules', 'untracked.md'), 'Untracked');
    
    await createWorkspaceIndex(testDir, {
      packages: {
        'test-package': {
          path: './packages/test',
          files: {
            'rules/tracked.md': ['.claude/rules/tracked.md']
          }
        }
      }
    });
    
    const execContext: ExecutionContext = {
      targetDir: testDir,
      homeDir: testDir,
      isGlobalScope: false
    };
    
    const result = await runListPipeline(undefined, execContext, { untracked: true });
    
    assert.ok(result.success);
    const untrackedFiles = result.data!.untrackedFiles!;
    
    assert.equal(untrackedFiles.totalFiles, 1, 'Should only show untracked file');
    assert.ok(untrackedFiles.files[0].workspacePath.includes('untracked.md'));
    
    const hasExactTrackedFile = untrackedFiles.files.some(f => f.workspacePath === '.claude/rules/tracked.md');
    assert.ok(!hasExactTrackedFile, 'Should not include tracked file');
    
    console.log('✓ Distinguish between tracked and untracked files');
  } finally {
    await fs.rm(testDir, { recursive: true, force: true });
  }
}

// Test: Handle multiple platforms with different file types
{
  const testDir = join(tmpdir(), `opkg-test-list-untracked-${Date.now()}-5`);
  await fs.mkdir(testDir, { recursive: true });
  
  try {
    await fs.mkdir(join(testDir, '.claude', 'rules'), { recursive: true });
    await fs.writeFile(join(testDir, '.claude', 'rules', 'claude.md'), 'Claude rule');
    
    await fs.mkdir(join(testDir, '.cursor', 'rules'), { recursive: true });
    await fs.writeFile(join(testDir, '.cursor', 'rules', 'cursor.mdc'), 'Cursor rule');
    
    await createWorkspaceIndex(testDir, { packages: {} });
    
    const execContext: ExecutionContext = {
      targetDir: testDir,
      homeDir: testDir,
      isGlobalScope: false
    };
    
    const result = await runListPipeline(undefined, execContext, { untracked: true });
    
    assert.ok(result.success);
    const untrackedFiles = result.data!.untrackedFiles!;
    
    assert.equal(untrackedFiles.totalFiles, 2, 'Should detect both files');
    assert.ok(untrackedFiles.platformGroups.has('claude'), 'Should have Claude');
    assert.ok(untrackedFiles.platformGroups.has('cursor'), 'Should have Cursor');
    
    console.log('✓ Handle multiple platforms with different file types');
  } finally {
    await fs.rm(testDir, { recursive: true, force: true });
  }
}

// Test: Handle empty workspace with no untracked files
{
  const testDir = join(tmpdir(), `opkg-test-list-untracked-${Date.now()}-6`);
  await fs.mkdir(testDir, { recursive: true });
  
  try {
    await fs.mkdir(join(testDir, '.claude'), { recursive: true });
    await createWorkspaceIndex(testDir, { packages: {} });
    
    const execContext: ExecutionContext = {
      targetDir: testDir,
      homeDir: testDir,
      isGlobalScope: false
    };
    
    const result = await runListPipeline(undefined, execContext, { untracked: true });
    
    assert.ok(result.success);
    assert.equal(result.data?.untrackedFiles?.totalFiles, 0);
    
    console.log('✓ Handle empty workspace with no untracked files');
  } finally {
    await fs.rm(testDir, { recursive: true, force: true });
  }
}

// Test: Return empty packages/tree when --untracked is used
{
  const testDir = join(tmpdir(), `opkg-test-list-untracked-${Date.now()}-7`);
  await fs.mkdir(testDir, { recursive: true });
  
  try {
    await fs.mkdir(join(testDir, '.claude', 'rules'), { recursive: true });
    await fs.writeFile(join(testDir, '.claude', 'rules', 'test.md'), 'Test');
    await createWorkspaceIndex(testDir, { packages: {} });
    
    const execContext: ExecutionContext = {
      targetDir: testDir,
      homeDir: testDir,
      isGlobalScope: false
    };
    
    const result = await runListPipeline(undefined, execContext, { untracked: true });
    
    assert.ok(result.success);
    assert.deepEqual(result.data?.packages, [], 'Packages should be empty');
    assert.deepEqual(result.data?.tree, [], 'Tree should be empty');
    assert.ok(result.data?.untrackedFiles, 'Should have untrackedFiles');
    
    console.log('✓ Return empty packages/tree when --untracked is used');
  } finally {
    await fs.rm(testDir, { recursive: true, force: true });
  }
}

console.log('\n✅ All list --untracked integration tests passed');
