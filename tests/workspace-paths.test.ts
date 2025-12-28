import assert from 'node:assert/strict';
import { join } from 'path';

import { isAllowedRegistryPath } from '../src/utils/registry-entry-filter.js';
import { resolveTargetDirectory, resolveTargetFilePath } from '../src/utils/platform-mapper.js';

// isAllowedRegistryPath should only accept universal subdir paths (v2)
assert.equal(isAllowedRegistryPath('commands/foo.md'), true);
assert.equal(isAllowedRegistryPath('rules/bar.md'), true);

// Non-universal paths are rejected
assert.equal(isAllowedRegistryPath('docs/getting-started.md'), false);
assert.equal(isAllowedRegistryPath('src/features/foo/bar.md'), false);
assert.equal(isAllowedRegistryPath('README.md'), false);
assert.equal(isAllowedRegistryPath('root/tools/helper.sh'), false);

// Root and YAML override paths remain blocked
assert.equal(isAllowedRegistryPath('AGENTS.md'), false);
// Legacy .openpackage prefix is blocked
assert.equal(isAllowedRegistryPath('.openpackage/rules/agent.cursor.yml'), false);
// YAML override paths under universal subdirs are blocked
assert.equal(isAllowedRegistryPath('rules/agent.cursor.yml'), false);

// Resolve target directory/file for generic workspace paths should preserve structure
const packageDir = '/tmp/package-example';
const genericDir = resolveTargetDirectory(packageDir, 'guides/intro.md');
assert.equal(genericDir, join(packageDir, 'guides'));
const genericPath = resolveTargetFilePath(genericDir, 'guides/intro.md');
assert.equal(genericPath, join(packageDir, 'guides', 'intro.md'));

// Universal subdir paths (v2, no .openpackage prefix) preserve the structure
const universalDir = resolveTargetDirectory(packageDir, 'rules/example.md');
assert.equal(universalDir, join(packageDir, 'rules'));
const universalPath = resolveTargetFilePath(universalDir, 'rules/example.md');
assert.equal(universalPath, join(universalDir, 'example.md'));

console.log('workspace path handling tests passed');


