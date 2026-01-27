import assert from 'node:assert/strict';
import type { InstallOptions } from '../../src/types/index.js';

// Test: InstallOptions accepts withPrefix boolean
{
  const options: InstallOptions = {
    withPrefix: true
  };
  assert.equal(options.withPrefix, true);
}

// Test: withPrefix is optional and defaults to undefined
{
  const options: InstallOptions = {};
  assert.equal(options.withPrefix, undefined);
}

// Test: withPrefix can be false
{
  const options: InstallOptions = {
    withPrefix: false
  };
  assert.equal(options.withPrefix, false);
}

console.log('install-with-prefix type tests passed');

// Test: CLI option parsing
import { Command } from 'commander';
import { setupInstallCommand } from '../../src/commands/install.js';

// Test: --with-prefix flag is parsed
{
  const program = new Command();
  setupInstallCommand(program);

  const installCmd = program.commands.find(c => c.name() === 'install');
  assert.ok(installCmd, 'install command should exist');

  const options = installCmd!.options;
  const withPrefixOpt = options.find((o: any) => o.long === '--with-prefix');
  assert.ok(withPrefixOpt, '--with-prefix option should be defined');
}

console.log('CLI option tests passed');
