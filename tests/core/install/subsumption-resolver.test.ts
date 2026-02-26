/**
 * Tests for subsumption-resolver: detects and resolves overlapping
 * resource-scoped and full-package installations from the same source.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  checkSubsumption,
  resolveSubsumption,
  extractSourceIdentity
} from '../../../packages/core/src/core/install/orchestrator/subsumption-resolver.js';
import type { PackageSource } from '../../../packages/core/src/core/install/unified/context.js';
import type { InstallationContext } from '../../../packages/core/src/core/install/unified/context.js';
import {
  getWorkspaceIndexPath,
  readWorkspaceIndex,
  writeWorkspaceIndex
} from '../../../packages/core/src/utils/workspace-index-yml.js';
import { createWorkspacePackageYml } from '../../../packages/core/src/core/package-management.js';
import { getLocalPackageYmlPath } from '../../../packages/core/src/utils/paths.js';
import { createExecutionContext } from '../../../packages/core/src/core/execution-context.js';
import { subsumptionPhase } from '../../../packages/core/src/core/install/unified/pipeline.js';
import { filterSubsumedContexts } from '../../../packages/core/src/core/install/unified/multi-context-pipeline.js';

let testDir: string;

async function setup() {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opkg-subsumption-'));
  await createWorkspacePackageYml(testDir);
}

async function cleanup() {
  if (testDir) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
}

// ============================================================================
// extractSourceIdentity tests
// ============================================================================

function testExtractSourceIdentity() {
  // Git source - full package
  const gitFull = extractSourceIdentity({
    type: 'git',
    packageName: 'gh@user/repo',
    gitUrl: 'https://github.com/user/repo'
  } as PackageSource);
  assert.ok(gitFull);
  assert.equal(gitFull.basePackageName, 'gh@user/repo');
  assert.equal(gitFull.isResourceScoped, false);

  // Git source - resource scoped (name includes path)
  const gitResource = extractSourceIdentity({
    type: 'git',
    packageName: 'gh@user/repo/agents/agent1',
    gitUrl: 'https://github.com/user/repo',
    resourcePath: 'agents/agent1'
  } as PackageSource);
  assert.ok(gitResource);
  assert.equal(gitResource.basePackageName, 'gh@user/repo');
  assert.equal(gitResource.isResourceScoped, true);

  // Git source - resource scoped via name only (no resourcePath)
  const gitResourceByName = extractSourceIdentity({
    type: 'git',
    packageName: 'gh@user/repo/agents/agent1',
    gitUrl: 'https://github.com/user/repo'
  } as PackageSource);
  assert.ok(gitResourceByName);
  assert.equal(gitResourceByName.basePackageName, 'gh@user/repo');
  assert.equal(gitResourceByName.isResourceScoped, true);

  // Path source - not resource scoped
  const pathFull = extractSourceIdentity({
    type: 'path',
    packageName: 'my-local-pkg',
    localPath: '/tmp/my-local-pkg'
  } as PackageSource);
  assert.ok(pathFull);
  assert.equal(pathFull.isResourceScoped, false);

  // Registry source
  const regFull = extractSourceIdentity({
    type: 'registry',
    packageName: 'some-package'
  } as PackageSource);
  assert.ok(regFull);
  assert.equal(regFull.isResourceScoped, false);

  // Workspace source (unsupported)
  const workspace = extractSourceIdentity({
    type: 'workspace',
    packageName: 'self'
  } as PackageSource);
  assert.equal(workspace, null);

  console.log('  extractSourceIdentity tests passed');
}

// ============================================================================
// checkSubsumption: Scenario 1 — resource first, then full package
// ============================================================================

async function testScenario1_ResourceThenFullPackage() {
  await setup();
  try {
    // Simulate a resource-scoped install already in the workspace index
    const indexPath = getWorkspaceIndexPath(testDir);
    await writeWorkspaceIndex({
      path: indexPath,
      index: {
        packages: {
          'gh@user/repo/agents/agent1': {
            path: '.openpackage/cache/git/abc123/def456/agents/agent1',
            version: '1.0.0',
            files: {
              'agents/agent1.md': ['.claude/agents/agent1.md']
            }
          }
        }
      }
    });

    // Now check subsumption for a full package install from the same source
    const source: PackageSource = {
      type: 'git',
      packageName: 'gh@user/repo',
      gitUrl: 'https://github.com/user/repo'
    };

    const result = await checkSubsumption(source, testDir);
    assert.equal(result.type, 'upgrade');
    assert.ok('entriesToRemove' in result);
    assert.equal(result.entriesToRemove.length, 1);
    assert.equal(result.entriesToRemove[0].packageName, 'gh@user/repo/agents/agent1');

    console.log('  Scenario 1 (resource -> full package) detection passed');
  } finally {
    await cleanup();
  }
}

// ============================================================================
// checkSubsumption: Scenario 1 with multiple resources
// ============================================================================

async function testScenario1_MultipleResources() {
  await setup();
  try {
    const indexPath = getWorkspaceIndexPath(testDir);
    await writeWorkspaceIndex({
      path: indexPath,
      index: {
        packages: {
          'gh@user/repo/agents/agent1': {
            path: '.openpackage/cache/git/abc/def/agents/agent1',
            files: { 'agents/agent1.md': ['.claude/agents/agent1.md'] }
          },
          'gh@user/repo/skills/react': {
            path: '.openpackage/cache/git/abc/def/skills/react',
            files: { 'skills/react/SKILL.md': ['.claude/skills/react/SKILL.md'] }
          },
          'gh@other/unrelated': {
            path: '.openpackage/cache/git/xyz/123',
            version: '2.0.0',
            files: { 'agents/helper.md': ['.claude/agents/helper.md'] }
          }
        }
      }
    });

    const source: PackageSource = {
      type: 'git',
      packageName: 'gh@user/repo',
      gitUrl: 'https://github.com/user/repo'
    };

    const result = await checkSubsumption(source, testDir);
    assert.equal(result.type, 'upgrade');
    assert.ok('entriesToRemove' in result);
    assert.equal(result.entriesToRemove.length, 2);

    const names = result.entriesToRemove.map(e => e.packageName).sort();
    assert.deepEqual(names, [
      'gh@user/repo/agents/agent1',
      'gh@user/repo/skills/react'
    ]);

    console.log('  Scenario 1 (multiple resources -> full package) detection passed');
  } finally {
    await cleanup();
  }
}

// ============================================================================
// checkSubsumption: Scenario 2 — full package first, then resource
// ============================================================================

async function testScenario2_FullPackageThenResource() {
  await setup();
  try {
    const indexPath = getWorkspaceIndexPath(testDir);
    await writeWorkspaceIndex({
      path: indexPath,
      index: {
        packages: {
          'gh@user/repo': {
            path: '.openpackage/cache/git/abc123/def456',
            version: '1.0.0',
            files: {
              'agents/agent1.md': ['.claude/agents/agent1.md'],
              'skills/react/SKILL.md': ['.claude/skills/react/SKILL.md']
            }
          }
        }
      }
    });

    // Now try to install a single resource from the same source
    const source: PackageSource = {
      type: 'git',
      packageName: 'gh@user/repo/agents/agent1',
      gitUrl: 'https://github.com/user/repo',
      resourcePath: 'agents/agent1'
    };

    const result = await checkSubsumption(source, testDir);
    assert.equal(result.type, 'already-covered');
    assert.ok('coveringPackage' in result);
    assert.equal(result.coveringPackage, 'gh@user/repo');

    console.log('  Scenario 2 (full package -> resource) detection passed');
  } finally {
    await cleanup();
  }
}

// ============================================================================
// checkSubsumption: No overlap (different sources)
// ============================================================================

async function testNoOverlap_DifferentSources() {
  await setup();
  try {
    const indexPath = getWorkspaceIndexPath(testDir);
    await writeWorkspaceIndex({
      path: indexPath,
      index: {
        packages: {
          'gh@other/package/agents/helper': {
            path: '.openpackage/cache/git/xyz/123/agents/helper',
            files: { 'agents/helper.md': ['.claude/agents/helper.md'] }
          }
        }
      }
    });

    const source: PackageSource = {
      type: 'git',
      packageName: 'gh@user/repo',
      gitUrl: 'https://github.com/user/repo'
    };

    const result = await checkSubsumption(source, testDir);
    assert.equal(result.type, 'none');

    console.log('  No overlap (different sources) passed');
  } finally {
    await cleanup();
  }
}

// ============================================================================
// checkSubsumption: No overlap (same package reinstall)
// ============================================================================

async function testNoOverlap_SamePackageReinstall() {
  await setup();
  try {
    const indexPath = getWorkspaceIndexPath(testDir);
    await writeWorkspaceIndex({
      path: indexPath,
      index: {
        packages: {
          'gh@user/repo': {
            path: '.openpackage/cache/git/abc/def',
            version: '1.0.0',
            files: { 'agents/agent1.md': ['.claude/agents/agent1.md'] }
          }
        }
      }
    });

    // Reinstalling the same full package should not trigger subsumption
    const source: PackageSource = {
      type: 'git',
      packageName: 'gh@user/repo',
      gitUrl: 'https://github.com/user/repo'
    };

    const result = await checkSubsumption(source, testDir);
    assert.equal(result.type, 'none');

    console.log('  No overlap (same package reinstall) passed');
  } finally {
    await cleanup();
  }
}

// ============================================================================
// checkSubsumption: No overlap (resource A then resource B from same source)
// ============================================================================

async function testNoOverlap_ResourceAToResourceB() {
  await setup();
  try {
    const indexPath = getWorkspaceIndexPath(testDir);
    await writeWorkspaceIndex({
      path: indexPath,
      index: {
        packages: {
          'gh@user/repo/agents/agent1': {
            path: '.openpackage/cache/git/abc/def/agents/agent1',
            files: { 'agents/agent1.md': ['.claude/agents/agent1.md'] }
          }
        }
      }
    });

    // Installing resource B from the same package should NOT be subsumed
    // (resource A doesn't cover resource B)
    const source: PackageSource = {
      type: 'git',
      packageName: 'gh@user/repo/skills/react',
      gitUrl: 'https://github.com/user/repo',
      resourcePath: 'skills/react'
    };

    const result = await checkSubsumption(source, testDir);
    assert.equal(result.type, 'none');

    console.log('  No overlap (resource A then resource B) passed');
  } finally {
    await cleanup();
  }
}

// ============================================================================
// checkSubsumption: Empty workspace index
// ============================================================================

async function testEmptyIndex() {
  await setup();
  try {
    const source: PackageSource = {
      type: 'git',
      packageName: 'gh@user/repo',
      gitUrl: 'https://github.com/user/repo'
    };

    const result = await checkSubsumption(source, testDir);
    assert.equal(result.type, 'none');

    console.log('  Empty workspace index passed');
  } finally {
    await cleanup();
  }
}

// ============================================================================
// resolveSubsumption: Actually removes entries
// ============================================================================

async function testResolveSubsumption() {
  await setup();
  try {
    const indexPath = getWorkspaceIndexPath(testDir);

    // Set up workspace index with a resource entry
    await writeWorkspaceIndex({
      path: indexPath,
      index: {
        packages: {
          'gh@user/repo/agents/agent1': {
            path: '.openpackage/cache/git/abc/def/agents/agent1',
            version: '1.0.0',
            files: { 'agents/agent1.md': ['.claude/agents/agent1.md'] }
          },
          'gh@other/package': {
            path: '.openpackage/cache/git/xyz/123',
            version: '2.0.0',
            files: { 'agents/helper.md': ['.claude/agents/helper.md'] }
          }
        }
      }
    });

    // Also set up workspace manifest with the resource dependency
    const manifestPath = getLocalPackageYmlPath(testDir);
    fs.writeFileSync(manifestPath, `name: test-workspace
dependencies:
  - name: gh@user/repo/agents/agent1
    url: https://github.com/user/repo
    path: agents/agent1
  - name: gh@other/package
    url: https://github.com/other/package
dev-dependencies: []
`, 'utf-8');

    // Resolve subsumption: remove the resource entry via uninstall pipeline
    const execContext = await createExecutionContext({ cwd: testDir });
    await resolveSubsumption(
      {
        type: 'upgrade',
        entriesToRemove: [{ packageName: 'gh@user/repo/agents/agent1' }]
      },
      execContext
    );

    // Verify workspace index no longer has the resource entry
    const wsRecord = await readWorkspaceIndex(testDir);
    assert.ok(!wsRecord.index.packages['gh@user/repo/agents/agent1'],
      'Resource entry should be removed from workspace index');
    assert.ok(wsRecord.index.packages['gh@other/package'],
      'Unrelated entry should remain in workspace index');

    // Verify workspace manifest no longer has the resource dependency
    const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
    assert.ok(!manifestContent.includes('gh@user/repo/agents/agent1'),
      'Resource dependency should be removed from manifest');
    assert.ok(manifestContent.includes('gh@other/package'),
      'Unrelated dependency should remain in manifest');

    console.log('  resolveSubsumption removes entries passed');
  } finally {
    await cleanup();
  }
}

// ============================================================================
// checkSubsumption: Case-insensitive matching
// ============================================================================

async function testCaseInsensitiveMatching() {
  await setup();
  try {
    const indexPath = getWorkspaceIndexPath(testDir);
    await writeWorkspaceIndex({
      path: indexPath,
      index: {
        packages: {
          'gh@User/Repo/agents/agent1': {
            path: '.openpackage/cache/git/abc/def/agents/agent1',
            files: { 'agents/agent1.md': ['.claude/agents/agent1.md'] }
          }
        }
      }
    });

    // Full package install with lowercase name
    const source: PackageSource = {
      type: 'git',
      packageName: 'gh@user/repo',
      gitUrl: 'https://github.com/user/repo'
    };

    const result = await checkSubsumption(source, testDir);
    // After normalization (migration), the key should match
    assert.equal(result.type, 'upgrade');
    assert.ok('entriesToRemove' in result);
    assert.equal(result.entriesToRemove.length, 1);

    console.log('  Case-insensitive matching passed');
  } finally {
    await cleanup();
  }
}

// ============================================================================
// checkSubsumption: Marketplace subpath — resources installed first, then
// full plugin at a subpath (e.g., gh@owner/repo/plugins/feature-dev)
// This is the bug scenario where subsumption previously failed because
// extractSourceIdentity treated the plugin install as resource-scoped.
// ============================================================================

async function testMarketplaceSubpath_ResourcesThenPlugin() {
  await setup();
  try {
    const indexPath = getWorkspaceIndexPath(testDir);
    // Simulate individual resources installed via interactive mode (-i)
    await writeWorkspaceIndex({
      path: indexPath,
      index: {
        packages: {
          'gh@anthropics/claude-plugins-official/plugins/feature-dev/agents/code-architect.md': {
            path: '.openpackage/cache/git/abc/def/plugins/feature-dev/agents/code-architect.md',
            files: { 'agents/code-architect.md': ['.opencode/agents/code-architect.md'] }
          },
          'gh@anthropics/claude-plugins-official/plugins/feature-dev/agents/code-explorer.md': {
            path: '.openpackage/cache/git/abc/def/plugins/feature-dev/agents/code-explorer.md',
            files: { 'agents/code-explorer.md': ['.opencode/agents/code-explorer.md'] }
          }
        }
      }
    });

    // Now install the full plugin at the subpath
    const source: PackageSource = {
      type: 'git',
      packageName: 'gh@anthropics/claude-plugins-official/plugins/feature-dev',
      gitUrl: 'https://github.com/anthropics/claude-plugins-official',
      resourcePath: 'plugins/feature-dev'
    };

    const result = await checkSubsumption(source, testDir);
    assert.equal(result.type, 'upgrade',
      'Full plugin install should subsume individual resource entries');
    assert.ok('entriesToRemove' in result);
    assert.equal(result.entriesToRemove.length, 2);

    const names = result.entriesToRemove.map(e => e.packageName).sort();
    assert.deepEqual(names, [
      'gh@anthropics/claude-plugins-official/plugins/feature-dev/agents/code-architect.md',
      'gh@anthropics/claude-plugins-official/plugins/feature-dev/agents/code-explorer.md'
    ]);

    console.log('  Marketplace subpath (resources -> full plugin) detection passed');
  } finally {
    await cleanup();
  }
}

// ============================================================================
// checkSubsumption: Marketplace subpath — full plugin installed first, then
// individual resource from the same plugin
// ============================================================================

async function testMarketplaceSubpath_PluginThenResource() {
  await setup();
  try {
    const indexPath = getWorkspaceIndexPath(testDir);
    // Simulate a full plugin already installed at a subpath
    await writeWorkspaceIndex({
      path: indexPath,
      index: {
        packages: {
          'gh@anthropics/claude-plugins-official/plugins/feature-dev': {
            path: '.openpackage/cache/git/abc/def/plugins/feature-dev',
            version: '0.0.0',
            files: {
              'agents/code-architect.md': ['.opencode/agents/code-architect.md'],
              'agents/code-explorer.md': ['.opencode/agents/code-explorer.md'],
              'agents/code-reviewer.md': ['.opencode/agents/code-reviewer.md'],
              'commands/feature-dev.md': ['.opencode/commands/feature-dev.md']
            }
          }
        }
      }
    });

    // Now try to install a single resource from the same plugin
    const source: PackageSource = {
      type: 'git',
      packageName: 'gh@anthropics/claude-plugins-official/plugins/feature-dev/agents/code-architect.md',
      gitUrl: 'https://github.com/anthropics/claude-plugins-official',
      resourcePath: 'plugins/feature-dev/agents/code-architect.md'
    };

    const result = await checkSubsumption(source, testDir);
    assert.equal(result.type, 'already-covered',
      'Resource should be detected as already covered by the full plugin');
    assert.ok('coveringPackage' in result);
    assert.equal(result.coveringPackage,
      'gh@anthropics/claude-plugins-official/plugins/feature-dev');

    console.log('  Marketplace subpath (full plugin -> resource) detection passed');
  } finally {
    await cleanup();
  }
}

// ============================================================================
// checkSubsumption: Marketplace subpath — reinstall same plugin (no subsumption)
// ============================================================================

async function testMarketplaceSubpath_SamePluginReinstall() {
  await setup();
  try {
    const indexPath = getWorkspaceIndexPath(testDir);
    await writeWorkspaceIndex({
      path: indexPath,
      index: {
        packages: {
          'gh@anthropics/claude-plugins-official/plugins/feature-dev': {
            path: '.openpackage/cache/git/abc/def/plugins/feature-dev',
            version: '0.0.0',
            files: {
              'agents/code-architect.md': ['.opencode/agents/code-architect.md']
            }
          }
        }
      }
    });

    // Reinstalling the same plugin should not trigger subsumption
    const source: PackageSource = {
      type: 'git',
      packageName: 'gh@anthropics/claude-plugins-official/plugins/feature-dev',
      gitUrl: 'https://github.com/anthropics/claude-plugins-official',
      resourcePath: 'plugins/feature-dev'
    };

    const result = await checkSubsumption(source, testDir);
    assert.equal(result.type, 'none',
      'Reinstalling the same plugin should not trigger subsumption');

    console.log('  Marketplace subpath (same plugin reinstall) passed');
  } finally {
    await cleanup();
  }
}

// ============================================================================
// Centralized subsumption: pipeline phase tests
// ============================================================================

/**
 * Helper to create a minimal InstallationContext for subsumption testing.
 * Only the fields used by subsumptionPhase are populated.
 */
function createMinimalContext(
  source: PackageSource,
  targetDir: string,
  overrides?: Partial<InstallationContext>
): InstallationContext {
  const execCtx = {
    targetDir,
    sourceCwd: targetDir,
    isGlobal: false,
    output: { info: () => {}, warn: () => {}, error: () => {}, success: () => {}, message: () => {}, spinner: () => ({ start: () => {}, stop: () => {} }) },
    prompt: { select: async () => '', confirm: async () => false, multiselect: async () => [] }
  } as any;
  return {
    execution: execCtx,
    targetDir,
    source,
    mode: 'install',
    options: {},
    platforms: [],
    resolvedPackages: [],
    warnings: [],
    errors: [],
    ...overrides
  } as InstallationContext;
}

async function testPipelinePhase_NoneSubsumption() {
  await setup();
  try {
    // Empty workspace index — no overlap
    const source: PackageSource = {
      type: 'git',
      packageName: 'gh@user/repo',
      gitUrl: 'https://github.com/user/repo'
    };
    const ctx = createMinimalContext(source, testDir);
    const result = await subsumptionPhase(ctx);
    assert.equal(result, 'proceed', 'Should proceed when no overlap exists');
    assert.equal(ctx._replacedResources, undefined, 'No resources should be replaced');
    console.log('  Pipeline phase: none subsumption passed');
  } finally {
    await cleanup();
  }
}

async function testPipelinePhase_AlreadyCovered() {
  await setup();
  try {
    // Full package already installed
    const indexPath = getWorkspaceIndexPath(testDir);
    await writeWorkspaceIndex({
      path: indexPath,
      index: {
        packages: {
          'gh@user/repo': {
            path: '.openpackage/cache/git/abc/def',
            version: '1.0.0',
            files: { 'agents/a.md': ['.claude/agents/a.md'] }
          }
        }
      }
    });

    // Incoming resource-scoped install should be skipped
    const source: PackageSource = {
      type: 'git',
      packageName: 'gh@user/repo/agents/a',
      gitUrl: 'https://github.com/user/repo',
      resourcePath: 'agents/a'
    };
    const ctx = createMinimalContext(source, testDir);
    const result = await subsumptionPhase(ctx);
    assert.equal(result, 'skip', 'Should skip when already covered');
    console.log('  Pipeline phase: already-covered passed');
  } finally {
    await cleanup();
  }
}

async function testPipelinePhase_Upgrade() {
  await setup();
  try {
    // Resource-scoped entry exists
    const indexPath = getWorkspaceIndexPath(testDir);
    await writeWorkspaceIndex({
      path: indexPath,
      index: {
        packages: {
          'gh@user/repo/agents/agent1': {
            path: '.openpackage/cache/git/abc/def/agents/agent1',
            version: '1.0.0',
            files: { 'agents/agent1.md': ['.claude/agents/agent1.md'] }
          }
        }
      }
    });

    // Also set up workspace manifest so uninstall can remove the dependency
    const manifestPath = getLocalPackageYmlPath(testDir);
    fs.writeFileSync(manifestPath, `name: test-workspace
dependencies:
  - name: gh@user/repo/agents/agent1
    url: https://github.com/user/repo
    path: agents/agent1
dev-dependencies: []
`, 'utf-8');

    // Full package install should upgrade (remove resource, proceed)
    const source: PackageSource = {
      type: 'git',
      packageName: 'gh@user/repo',
      gitUrl: 'https://github.com/user/repo'
    };
    const execContext = await createExecutionContext({ cwd: testDir });
    const ctx = createMinimalContext(source, testDir, { execution: execContext });
    const result = await subsumptionPhase(ctx);
    assert.equal(result, 'proceed', 'Should proceed after upgrade');
    assert.ok(ctx._replacedResources, 'Should have replaced resources');
    assert.ok(ctx._replacedResources!.includes('gh@user/repo/agents/agent1'),
      'Should track the replaced resource name');

    // Verify the resource entry was removed from workspace index
    const wsRecord = await readWorkspaceIndex(testDir);
    assert.ok(!wsRecord.index.packages['gh@user/repo/agents/agent1'],
      'Resource entry should be removed after upgrade');

    console.log('  Pipeline phase: upgrade passed');
  } finally {
    await cleanup();
  }
}

async function testPipelinePhase_ForceBypass() {
  await setup();
  try {
    // Full package already installed
    const indexPath = getWorkspaceIndexPath(testDir);
    await writeWorkspaceIndex({
      path: indexPath,
      index: {
        packages: {
          'gh@user/repo': {
            path: '.openpackage/cache/git/abc/def',
            version: '1.0.0',
            files: {}
          }
        }
      }
    });

    // With force, should proceed even if already covered
    const source: PackageSource = {
      type: 'git',
      packageName: 'gh@user/repo/agents/a',
      gitUrl: 'https://github.com/user/repo',
      resourcePath: 'agents/a'
    };
    const ctx = createMinimalContext(source, testDir, { options: { force: true } } as any);
    const result = await subsumptionPhase(ctx);
    assert.equal(result, 'proceed', 'Should proceed when force is set');
    console.log('  Pipeline phase: force bypass passed');
  } finally {
    await cleanup();
  }
}

async function testPipelinePhase_SubsumptionCheckedBypass() {
  await setup();
  try {
    // Full package already installed
    const indexPath = getWorkspaceIndexPath(testDir);
    await writeWorkspaceIndex({
      path: indexPath,
      index: {
        packages: {
          'gh@user/repo': {
            path: '.openpackage/cache/git/abc/def',
            version: '1.0.0',
            files: {}
          }
        }
      }
    });

    // With _subsumptionChecked = true, should skip the check
    const source: PackageSource = {
      type: 'git',
      packageName: 'gh@user/repo/agents/a',
      gitUrl: 'https://github.com/user/repo',
      resourcePath: 'agents/a'
    };
    const ctx = createMinimalContext(source, testDir, { _subsumptionChecked: true } as any);
    const result = await subsumptionPhase(ctx);
    assert.equal(result, 'proceed', 'Should proceed when _subsumptionChecked is true');
    console.log('  Pipeline phase: _subsumptionChecked bypass passed');
  } finally {
    await cleanup();
  }
}

// ============================================================================
// Centralized subsumption: multi-context filtering tests
// ============================================================================

/** Noop output adapter for tests */
const noopOutput = {
  info: () => {},
  warn: () => {},
  error: () => {},
  success: () => {},
  message: () => {},
  spinner: () => ({ start: () => {}, stop: () => {} })
} as any;

async function testFilterSubsumedContexts_FiltersCovered() {
  await setup();
  try {
    // Full package already installed
    const indexPath = getWorkspaceIndexPath(testDir);
    await writeWorkspaceIndex({
      path: indexPath,
      index: {
        packages: {
          'gh@user/repo': {
            path: '.openpackage/cache/git/abc/def',
            version: '1.0.0',
            files: {}
          }
        }
      }
    });

    const contexts = [
      createMinimalContext({
        type: 'git',
        packageName: 'gh@user/repo/agents/a',
        gitUrl: 'https://github.com/user/repo',
        resourcePath: 'agents/a'
      }, testDir),
      createMinimalContext({
        type: 'git',
        packageName: 'gh@other/repo/skills/s1',
        gitUrl: 'https://github.com/other/repo',
        resourcePath: 'skills/s1'
      }, testDir)
    ];

    const { active, skippedCount } = await filterSubsumedContexts(contexts, noopOutput);
    assert.equal(skippedCount, 1, 'One context should be skipped (covered by gh@user/repo)');
    assert.equal(active.length, 1, 'One context should remain active');
    assert.equal(active[0].source.packageName, 'gh@other/repo/skills/s1',
      'The non-covered context should survive');
    assert.equal(active[0]._subsumptionChecked, true,
      'Surviving context should have _subsumptionChecked set');
    console.log('  filterSubsumedContexts: filters covered passed');
  } finally {
    await cleanup();
  }
}

async function testFilterSubsumedContexts_AllCovered() {
  await setup();
  try {
    const indexPath = getWorkspaceIndexPath(testDir);
    await writeWorkspaceIndex({
      path: indexPath,
      index: {
        packages: {
          'gh@user/repo': {
            path: '.openpackage/cache/git/abc/def',
            version: '1.0.0',
            files: {}
          }
        }
      }
    });

    const contexts = [
      createMinimalContext({
        type: 'git',
        packageName: 'gh@user/repo/agents/a',
        gitUrl: 'https://github.com/user/repo',
        resourcePath: 'agents/a'
      }, testDir),
      createMinimalContext({
        type: 'git',
        packageName: 'gh@user/repo/skills/s1',
        gitUrl: 'https://github.com/user/repo',
        resourcePath: 'skills/s1'
      }, testDir)
    ];

    const { active, skippedCount } = await filterSubsumedContexts(contexts, noopOutput);
    assert.equal(skippedCount, 2, 'Both contexts should be skipped');
    assert.equal(active.length, 0, 'No active contexts should remain');
    console.log('  filterSubsumedContexts: all covered passed');
  } finally {
    await cleanup();
  }
}

async function testFilterSubsumedContexts_ForceBypass() {
  await setup();
  try {
    const indexPath = getWorkspaceIndexPath(testDir);
    await writeWorkspaceIndex({
      path: indexPath,
      index: {
        packages: {
          'gh@user/repo': {
            path: '.openpackage/cache/git/abc/def',
            version: '1.0.0',
            files: {}
          }
        }
      }
    });

    // Context with force: true should not be filtered
    const contexts = [
      createMinimalContext({
        type: 'git',
        packageName: 'gh@user/repo/agents/a',
        gitUrl: 'https://github.com/user/repo',
        resourcePath: 'agents/a'
      }, testDir, { options: { force: true } } as any)
    ];

    const { active, skippedCount } = await filterSubsumedContexts(contexts, noopOutput);
    assert.equal(skippedCount, 0, 'No contexts should be skipped when force is set');
    assert.equal(active.length, 1, 'Forced context should remain active');
    assert.equal(active[0]._subsumptionChecked, true,
      'Forced context should have _subsumptionChecked set');
    console.log('  filterSubsumedContexts: force bypass passed');
  } finally {
    await cleanup();
  }
}

async function testFilterSubsumedContexts_NoCoverage() {
  await setup();
  try {
    // Empty workspace index — no coverage
    const contexts = [
      createMinimalContext({
        type: 'git',
        packageName: 'gh@user/repo/agents/a',
        gitUrl: 'https://github.com/user/repo',
        resourcePath: 'agents/a'
      }, testDir),
      createMinimalContext({
        type: 'git',
        packageName: 'gh@other/repo/skills/s1',
        gitUrl: 'https://github.com/other/repo',
        resourcePath: 'skills/s1'
      }, testDir)
    ];

    const { active, skippedCount } = await filterSubsumedContexts(contexts, noopOutput);
    assert.equal(skippedCount, 0, 'No contexts should be skipped');
    assert.equal(active.length, 2, 'All contexts should remain active');
    assert.ok(active.every(c => c._subsumptionChecked === true),
      'All contexts should have _subsumptionChecked set');
    console.log('  filterSubsumedContexts: no coverage passed');
  } finally {
    await cleanup();
  }
}

// ============================================================================
// Run all tests
// ============================================================================

try {
  testExtractSourceIdentity();

  await testScenario1_ResourceThenFullPackage();
  await testScenario1_MultipleResources();
  await testScenario2_FullPackageThenResource();
  await testNoOverlap_DifferentSources();
  await testNoOverlap_SamePackageReinstall();
  await testNoOverlap_ResourceAToResourceB();
  await testEmptyIndex();
  await testResolveSubsumption();
  await testCaseInsensitiveMatching();
  await testMarketplaceSubpath_ResourcesThenPlugin();
  await testMarketplaceSubpath_PluginThenResource();
  await testMarketplaceSubpath_SamePluginReinstall();

  // Centralized subsumption: pipeline phase tests
  await testPipelinePhase_NoneSubsumption();
  await testPipelinePhase_AlreadyCovered();
  await testPipelinePhase_Upgrade();
  await testPipelinePhase_ForceBypass();
  await testPipelinePhase_SubsumptionCheckedBypass();

  // Centralized subsumption: multi-context filtering tests
  await testFilterSubsumedContexts_FiltersCovered();
  await testFilterSubsumedContexts_AllCovered();
  await testFilterSubsumedContexts_ForceBypass();
  await testFilterSubsumedContexts_NoCoverage();

  console.log('\nsubsumption-resolver tests passed');
} catch (error) {
  console.error('Test failed:', error);
  process.exitCode = 1;
}
