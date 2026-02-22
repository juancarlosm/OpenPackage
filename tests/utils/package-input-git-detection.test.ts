/**
 * Integration tests for package input classification with new git detection.
 * Tests that classifyPackageInput correctly uses the new git-url-detection module.
 */

import assert from 'node:assert/strict';
import { classifyPackageInput } from '../../src/core/install/package-input.js';

console.log('Testing package input classification with git detection...');

// Test: GitHub shorthand
{
  const result = await classifyPackageInput('gh@user/repo', process.cwd());
  assert.equal(result.type, 'git');
  assert.equal(result.gitUrl, 'https://github.com/user/repo.git');
  assert.equal(result.gitRef, undefined);
  assert.equal(result.gitPath, undefined);
}

// Test: GitHub shorthand with path
{
  const result = await classifyPackageInput('gh@user/repo/plugins/x', process.cwd());
  assert.equal(result.type, 'git');
  assert.equal(result.gitUrl, 'https://github.com/user/repo.git');
  assert.equal(result.gitRef, undefined);
  assert.equal(result.gitPath, 'plugins/x');
}

// Test: GitHub web URL
{
  const result = await classifyPackageInput('https://github.com/user/repo', process.cwd());
  assert.equal(result.type, 'git');
  assert.equal(result.gitUrl, 'https://github.com/user/repo.git');
  assert.equal(result.gitRef, undefined);
  assert.equal(result.gitPath, undefined);
}

// Test: GitHub web URL with ref
{
  const result = await classifyPackageInput('https://github.com/user/repo/tree/main', process.cwd());
  assert.equal(result.type, 'git');
  assert.equal(result.gitUrl, 'https://github.com/user/repo.git');
  assert.equal(result.gitRef, 'main');
  assert.equal(result.gitPath, undefined);
}

// Test: GitHub web URL with ref and path
{
  const result = await classifyPackageInput('https://github.com/user/repo/tree/main/plugins/x', process.cwd());
  assert.equal(result.type, 'git');
  assert.equal(result.gitUrl, 'https://github.com/user/repo.git');
  assert.equal(result.gitRef, 'main');
  assert.equal(result.gitPath, 'plugins/x');
}

// Test: Generic git URL
{
  const result = await classifyPackageInput('https://gitlab.com/user/repo.git', process.cwd());
  assert.equal(result.type, 'git');
  assert.equal(result.gitUrl, 'https://gitlab.com/user/repo.git');
  assert.equal(result.gitRef, undefined);
  assert.equal(result.gitPath, undefined);
}

// Test: Generic git URL with hash ref
{
  const result = await classifyPackageInput('https://gitlab.com/user/repo.git#main', process.cwd());
  assert.equal(result.type, 'git');
  assert.equal(result.gitUrl, 'https://gitlab.com/user/repo.git');
  assert.equal(result.gitRef, 'main');
  assert.equal(result.gitPath, undefined);
}

// Test: Generic git URL with ref and path
{
  const result = await classifyPackageInput('https://gitlab.com/user/repo.git#main&path=packages/x', process.cwd());
  assert.equal(result.type, 'git');
  assert.equal(result.gitUrl, 'https://gitlab.com/user/repo.git');
  assert.equal(result.gitRef, 'main');
  assert.equal(result.gitPath, 'packages/x');
}

// Test: Legacy github: prefix (with deprecation warning)
{
  const result = await classifyPackageInput('github:user/repo', process.cwd());
  assert.equal(result.type, 'git');
  assert.equal(result.gitUrl, 'https://github.com/user/repo.git');
  assert.equal(result.gitRef, undefined);
  assert.equal(result.gitPath, undefined);
}

// Test: Legacy github: prefix with ref and subdirectory
{
  const result = await classifyPackageInput('github:user/repo#main&subdirectory=plugins/x', process.cwd());
  assert.equal(result.type, 'git');
  assert.equal(result.gitUrl, 'https://github.com/user/repo.git');
  assert.equal(result.gitRef, 'main');
  assert.equal(result.gitPath, 'plugins/x');
}

// Test: Legacy git: prefix (with deprecation warning)
{
  const result = await classifyPackageInput('git:https://gitlab.com/user/repo.git', process.cwd());
  assert.equal(result.type, 'git');
  assert.equal(result.gitUrl, 'https://gitlab.com/user/repo.git');
  assert.equal(result.gitRef, undefined);
  assert.equal(result.gitPath, undefined);
}

// Test: Legacy git: prefix with ref and subdirectory
{
  const result = await classifyPackageInput('git:https://gitlab.com/repo.git#main&subdirectory=x', process.cwd());
  assert.equal(result.type, 'git');
  assert.equal(result.gitUrl, 'https://gitlab.com/repo.git');
  assert.equal(result.gitRef, 'main');
  assert.equal(result.gitPath, 'x');
}

// Test: Non-git input (registry)
{
  const result = await classifyPackageInput('my-package', process.cwd());
  assert.equal(result.type, 'registry');
  assert.equal(result.name, 'my-package');
}

// Test: Non-git input (local path) - not tested here as it would require filesystem setup

console.log('✅ All package input git detection tests passed!');
console.log('(Deprecation warnings above are expected for legacy prefix tests)');
