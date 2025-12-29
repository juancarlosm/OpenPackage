import assert from 'node:assert/strict';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const cliPath = path.resolve(__dirname, '../bin/openpackage');

function runCli(args: string[], cwd: string, env?: Record<string, string | undefined>) {
  const result = spawnSync('node', [cliPath, ...args], {
    cwd,
    encoding: 'utf8',
    stdio: 'pipe',
    env: { ...process.env, ...(env ?? {}), TS_NODE_TRANSPILE_ONLY: '1' }
  });
  return { code: result.status ?? 1, stdout: result.stdout.trim(), stderr: result.stderr.trim() };
}

async function setupWorkspace(): Promise<{ cwd: string; home: string }> {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'opkg-status-home-'));
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'opkg-status-ws-'));

  const openpkgDir = path.join(workspace, '.openpackage');
  const pkgDir = path.join(openpkgDir, 'packages', 'my-pkg');
  await fs.mkdir(pkgDir, { recursive: true });
  await fs.mkdir(path.join(workspace, '.cursor', 'rules'), { recursive: true });

  // workspace manifest
  await fs.writeFile(
    path.join(openpkgDir, 'openpackage.yml'),
    [
      'name: workspace',
      'packages:',
      '  - name: my-pkg',
      '    path: ./.openpackage/packages/my-pkg/',
      ''
    ].join('\n'),
    'utf8'
  );

  // package source + content
  await fs.writeFile(
    path.join(pkgDir, 'openpackage.yml'),
    ['name: my-pkg', 'version: 1.0.0', ''].join('\n'),
    'utf8'
  );
  await fs.mkdir(path.join(pkgDir, 'rules'), { recursive: true });
  await fs.writeFile(path.join(pkgDir, 'rules', 'hello.md'), '# hi\n', 'utf8');

  // workspace installed copy
  await fs.writeFile(path.join(workspace, '.cursor', 'rules', 'hello.md'), '# hi\n', 'utf8');

  // workspace index mapping
  await fs.writeFile(
    path.join(openpkgDir, 'openpackage.index.yml'),
    [
      '# This file is managed by OpenPackage. Do not edit manually.',
      '',
      'packages:',
      '  my-pkg:',
      '    path: ./.openpackage/packages/my-pkg/',
      '    version: 1.0.0',
      '    files:',
      '      rules/:',
      '        - .cursor/rules/',
      ''
    ].join('\n'),
    'utf8'
  );

  return { cwd: workspace, home };
}

async function cleanup(paths: string[]) {
  await Promise.all(paths.map(p => fs.rm(p, { recursive: true, force: true })));
}

// Synced state
{
  const { cwd, home } = await setupWorkspace();
  try {
    const res = runCli(['status'], cwd, { HOME: home });
    assert.equal(res.code, 0, `status should succeed: ${res.stderr}`);
    assert.ok(res.stdout.includes('synced'), 'should report synced');
  } finally {
    await cleanup([cwd, home]);
  }
}

// Modified state when workspace differs
{
  const { cwd, home } = await setupWorkspace();
  try {
    await fs.writeFile(path.join(cwd, '.cursor', 'rules', 'hello.md'), '# hi edited\n', 'utf8');
    const res = runCli(['status'], cwd, { HOME: home });
    assert.equal(res.code, 0, `status should succeed: ${res.stderr}`);
    assert.ok(res.stdout.includes('modified'), 'should report modified when hashes differ');
  } finally {
    await cleanup([cwd, home]);
  }
}

console.log('phase9-status tests passed');
