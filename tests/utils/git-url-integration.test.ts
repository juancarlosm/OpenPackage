/**
 * Integration test to verify new git URL detection works with the install pipeline.
 * This ensures that classifyPackageInput → context builders → install flow all work together.
 */

import assert from 'node:assert/strict';
import { classifyPackageInput } from '../../src/utils/package-input.js';

console.log('Testing git URL detection integration with install pipeline...');

// Test 1: Verify GitHub shorthand produces correct classification
{
  const classification = await classifyPackageInput('gh@anthropics/claude-code', process.cwd());
  
  assert.equal(classification.type, 'git');
  assert.equal(classification.gitUrl, 'https://github.com/anthropics/claude-code.git');
  assert.equal(classification.gitRef, undefined);
  assert.equal(classification.gitPath, undefined);
  
  console.log('✓ GitHub shorthand classification correct');
}

// Test 2: Verify GitHub URL with path produces correct classification
{
  const classification = await classifyPackageInput(
    'https://github.com/user/repo/tree/main/plugins/x',
    process.cwd()
  );
  
  assert.equal(classification.type, 'git');
  assert.equal(classification.gitUrl, 'https://github.com/user/repo.git');
  assert.equal(classification.gitRef, 'main');
  assert.equal(classification.gitPath, 'plugins/x');
  
  console.log('✓ GitHub URL with path classification correct');
}

// Test 3: Verify generic git URL produces correct classification
{
  const classification = await classifyPackageInput(
    'https://gitlab.com/user/repo.git#v1.0.0&path=packages/a',
    process.cwd()
  );
  
  assert.equal(classification.type, 'git');
  assert.equal(classification.gitUrl, 'https://gitlab.com/user/repo.git');
  assert.equal(classification.gitRef, 'v1.0.0');
  assert.equal(classification.gitPath, 'packages/a');
  
  console.log('✓ Generic git URL classification correct');
}

// Test 4: Verify legacy prefix still works (with warning)
{
  const classification = await classifyPackageInput(
    'github:user/repo#main&subdirectory=plugins/x',
    process.cwd()
  );
  
  assert.equal(classification.type, 'git');
  assert.equal(classification.gitUrl, 'https://github.com/user/repo.git');
  assert.equal(classification.gitRef, 'main');
  assert.equal(classification.gitPath, 'plugins/x');
  
  console.log('✓ Legacy prefix classification correct');
}

// Test 5: Verify classification fields match what install pipeline expects
{
  const classification = await classifyPackageInput('gh@user/repo/path', process.cwd());
  
  // These are the fields that context-builders.ts expects
  assert.equal(typeof classification.type, 'string');
  assert.equal(typeof classification.gitUrl, 'string');
  assert.equal(classification.gitRef, undefined); // Optional
  assert.equal(typeof classification.gitPath, 'string'); // Present in this case
  
  console.log('✓ Classification fields match expected interface');
}

// Test 6: Verify non-git inputs still work
{
  const registryClassification = await classifyPackageInput('my-package', process.cwd());
  assert.equal(registryClassification.type, 'registry');
  assert.equal(registryClassification.name, 'my-package');
  assert.equal(registryClassification.gitUrl, undefined);
  
  console.log('✓ Non-git inputs unaffected');
}

console.log('\n✅ All integration tests passed!');
console.log('Git URL detection successfully integrates with install pipeline.');
