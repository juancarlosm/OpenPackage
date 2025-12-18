import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const cliPath = path.resolve(__dirname, '../bin/openpackage');

// Helper to run CLI with args, capture output/exit
function runCli(args: string[], cwd?: string): { stdout: string; stderr: string; code: number } {
  const result = spawnSync('node', [cliPath, ...args], {
    cwd,
    encoding: 'utf8',
    stdio: 'pipe',
    env: { ...process.env, TS_NODE_TRANSPILE_ONLY: '1' } // Mimic test env if needed
  });
  return {
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
    code: result.status ?? 1
  };
}

// Test 1: --help shows --cwd option
{
  const result = runCli(['--help']);
  assert.ok(result.stdout.includes('--cwd <dir>'), 'Global --cwd should appear in --help');
  assert.strictEqual(result.code, 0);
}

// Test 2: Invalid --cwd errors with validation message (no chdir)
{
  const result = runCli(['status', '--cwd', '/nonexistent']);
  assert.ok(result.stderr.includes('Invalid --cwd'), 'Should error on invalid dir');
  assert.ok(result.stderr.includes('must exist'), 'Should mention existence check');
  assert.strictEqual(result.code, 1);
}

// Test 3: Valid --cwd chdirs and runs command (use status on empty dir - expects error on no pkg, but chdir succeeds)
{
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'opkg-cwd-test-'));
  try {
    const result = runCli(['status', '--cwd', tempDir]);
    // Status should fail (no package), but stderr should *not* have cwd error (valid dir)
    assert.ok(!result.stderr.includes('Invalid --cwd'), 'Valid dir should not error on validation');
    assert.ok(result.stderr.includes('No .openpackage'), 'Should detect no pkg at target cwd'); // Expected status error
    assert.strictEqual(result.code, 1); // Fails as expected, but chdir worked
  } finally {
    await fs.rm(tempDir, { recursive: true });
  }
}

// Test 4: Global commands handle --cwd (e.g., login --help - just verify no crash)
{
  const result = runCli(['login', '--help', '--cwd', '/tmp']); // /tmp exists
  assert.ok(!result.stderr.includes('Invalid --cwd'), 'Valid dir on global cmd ok');
  assert.ok(result.stdout.includes('--profile'), 'Help still shows'); // Verify ran
  assert.strictEqual(result.code, 0);
}

// Test 5: Relative --cwd resolves correctly (from test cwd)
{
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'opkg-cwd-rel-'));
  try {
    const result = runCli(['status', '--cwd', path.relative(process.cwd(), tempDir)], process.cwd());
    assert.ok(!result.stderr.includes('Invalid --cwd'), 'Relative valid dir ok');
    assert.strictEqual(result.code, 1); // Status fails, but chdir ok
  } finally {
    await fs.rm(tempDir, { recursive: true });
  }
}

console.log('All --cwd tests passed!');