import assert from 'node:assert/strict';
import type { InstallOptions } from '../../src/types/index.js';

// Test: InstallOptions accepts plugins array
{
  const options: InstallOptions = {
    plugins: ['plugin-1', 'plugin-2']
  };
  assert.deepEqual(options.plugins, ['plugin-1', 'plugin-2']);
}

// Test: plugins is optional
{
  const options: InstallOptions = {};
  assert.equal(options.plugins, undefined);
}

console.log('install-plugins-flag type tests passed');
