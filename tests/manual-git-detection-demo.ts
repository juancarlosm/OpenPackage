/**
 * Manual demonstration of new git source detection.
 * Run this to see how different input formats are parsed.
 */

import { detectGitSource } from '../packages/core/src/utils/git-url-detection.js';

console.log('='.repeat(80));
console.log('Git Source Detection Demo');
console.log('='.repeat(80));
console.log();

const testCases = [
  // GitHub shorthand
  {
    label: 'GitHub Shorthand (basic)',
    input: 'gh@anthropics/claude-code'
  },
  {
    label: 'GitHub Shorthand (with path)',
    input: 'gh@user/repo/plugins/my-plugin'
  },
  
  // GitHub web URLs
  {
    label: 'GitHub Web URL (basic)',
    input: 'https://github.com/user/repo'
  },
  {
    label: 'GitHub Web URL (with ref)',
    input: 'https://github.com/user/repo/tree/main'
  },
  {
    label: 'GitHub Web URL (with ref and path)',
    input: 'https://github.com/user/repo/tree/v1.0.0/plugins/x'
  },
  
  // Generic git URLs
  {
    label: 'GitLab URL',
    input: 'https://gitlab.com/user/repo.git'
  },
  {
    label: 'GitLab URL (with ref)',
    input: 'https://gitlab.com/user/repo.git#main'
  },
  {
    label: 'Generic git URL (with ref and path)',
    input: 'https://example.com/repo.git#v1.0.0&path=packages/a'
  },
  {
    label: 'SSH git URL',
    input: 'git@github.com:user/repo.git'
  },
  
  // Legacy prefixes (will show deprecation warnings)
  {
    label: 'Legacy github: prefix',
    input: 'github:user/repo'
  },
  {
    label: 'Legacy github: prefix (with ref and subdirectory)',
    input: 'github:user/repo#main&subdirectory=plugins/x'
  },
  {
    label: 'Legacy git: prefix',
    input: 'git:https://gitlab.com/user/repo.git'
  },
  {
    label: 'Legacy git: prefix (with ref and subdirectory)',
    input: 'git:https://gitlab.com/repo.git#main&subdirectory=x'
  },
  
  // Non-git inputs (should return null)
  {
    label: 'Registry package name',
    input: 'my-package'
  },
  {
    label: 'Local path',
    input: './local/path'
  }
];

for (const { label, input } of testCases) {
  console.log(`\n${label}`);
  console.log(`Input: ${input}`);
  
  const result = detectGitSource(input);
  
  if (result) {
    console.log(`✓ Detected as git source:`);
    console.log(`  url:  ${result.url}`);
    if (result.ref) console.log(`  ref:  ${result.ref}`);
    if (result.path) console.log(`  path: ${result.path}`);
  } else {
    console.log(`✗ Not a git source (will be handled as ${input.startsWith('./') ? 'path' : 'registry name'})`);
  }
  console.log('-'.repeat(80));
}

console.log();
console.log('='.repeat(80));
console.log('Demo Complete');
console.log('='.repeat(80));
