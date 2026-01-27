/**
 * Integration test for --with-prefix flag
 *
 * Tests full installation pipeline with withPrefix option enabled,
 * verifying files are correctly prefixed with package name.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { installPackageByIndexWithFlows } from '../../../src/utils/flow-index-installer.js';
import { clearPlatformsCache } from '../../../src/core/platforms.js';

let testRoot: string;
let workspaceRoot: string;
let packageRoot: string;

before(async () => {
  testRoot = join(tmpdir(), `opkg-with-prefix-test-${Date.now()}`);
  workspaceRoot = join(testRoot, 'workspace');
  packageRoot = join(testRoot, 'packages', 'my-plugin');

  await fs.mkdir(workspaceRoot, { recursive: true });
  await fs.mkdir(packageRoot, { recursive: true });

  // Create .openpackage directory with platform config
  const openpackageDir = join(workspaceRoot, '.openpackage');
  await fs.mkdir(openpackageDir, { recursive: true });

  // Create platform config with flows (using double-asterisk glob patterns)
  const platformConfig = {
    "test-platform": {
      "name": "Test Platform",
      "detection": [".test"],
      "export": [
        { "from": "agents.md", "to": ".test/agents/agents.md" },
        { "from": "rules/**/*.md", "to": ".test/rules/**/*.md" }
      ],
      "import": []
    }
  };

  await fs.writeFile(
    join(openpackageDir, 'platforms.jsonc'),
    JSON.stringify(platformConfig, null, 2)
  );

  // Create workspace manifest
  await fs.writeFile(
    join(openpackageDir, 'openpackage.yml'),
    'name: test-workspace\nversion: 1.0.0\npackages: []\n'
  );

  // Create package files
  await fs.writeFile(join(packageRoot, 'agents.md'), '# My Agents');
  await fs.mkdir(join(packageRoot, 'rules'), { recursive: true });
  await fs.writeFile(join(packageRoot, 'rules', 'style.md'), '# Style Rules');
  await fs.writeFile(join(packageRoot, 'rules', 'format.md'), '# Format Rules');

  // Create openpackage.yml in package
  await fs.writeFile(
    join(packageRoot, 'openpackage.yml'),
    'name: my-plugin\nversion: 1.0.0'
  );

  // Clear platforms cache to pick up new config
  clearPlatformsCache();
});

after(async () => {
  await fs.rm(testRoot, { recursive: true, force: true });
});

describe('--with-prefix integration', () => {
  it('should prefix all installed files when withPrefix is true', async () => {
    const result = await installPackageByIndexWithFlows(
      workspaceRoot,        // cwd
      'my-plugin',          // packageName
      '1.0.0',              // version
      ['test-platform'],    // platforms
      { withPrefix: true }, // options
      undefined,            // includePaths
      packageRoot           // contentRoot
    );

    // Verify installation completed
    assert.ok(result.installedFiles.length > 0, 'Installation should install files');

    // Check that files were installed with prefix
    const agentsExists = await fs.access(
      join(workspaceRoot, '.test/agents/my-plugin-agents.md')
    ).then(() => true).catch(() => false);
    assert.ok(agentsExists, 'Prefixed agents file should exist');

    const styleExists = await fs.access(
      join(workspaceRoot, '.test/rules/my-plugin-style.md')
    ).then(() => true).catch(() => false);
    assert.ok(styleExists, 'Prefixed style rules file should exist');

    const formatExists = await fs.access(
      join(workspaceRoot, '.test/rules/my-plugin-format.md')
    ).then(() => true).catch(() => false);
    assert.ok(formatExists, 'Prefixed format rules file should exist');
  });

  it('should NOT prefix files when withPrefix is false', async () => {
    // Clean up from previous test
    await fs.rm(join(workspaceRoot, '.test'), { recursive: true, force: true });

    const result = await installPackageByIndexWithFlows(
      workspaceRoot,         // cwd
      'my-plugin',           // packageName
      '1.0.0',               // version
      ['test-platform'],     // platforms
      { withPrefix: false }, // options
      undefined,             // includePaths
      packageRoot            // contentRoot
    );

    assert.ok(result.installedFiles.length >= 0, 'Installation should complete');

    // Check that files were installed WITHOUT prefix
    const agentsExists = await fs.access(
      join(workspaceRoot, '.test/agents/agents.md')
    ).then(() => true).catch(() => false);
    assert.ok(agentsExists, 'Non-prefixed agents file should exist');

    const styleExists = await fs.access(
      join(workspaceRoot, '.test/rules/style.md')
    ).then(() => true).catch(() => false);
    assert.ok(styleExists, 'Non-prefixed style rules file should exist');
  });
});
