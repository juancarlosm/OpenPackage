/**
 * Integration tests for priority-based pattern arrays in flows
 * 
 * Tests that array patterns work correctly in real flow execution scenarios.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { DefaultFlowExecutor } from '../../../src/core/flows/flow-executor.js';
import type { Flow, FlowContext } from '../../../src/types/flows.js';

describe('Priority Patterns in Flow Execution', () => {
  let tmpDir: string;
  let packageRoot: string;
  let workspaceRoot: string;
  let executor: DefaultFlowExecutor;

  beforeEach(async () => {
    // Create temp directories for test
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'opkg-priority-test-'));
    packageRoot = path.join(tmpDir, 'package');
    workspaceRoot = path.join(tmpDir, 'workspace');
    
    await fs.mkdir(packageRoot, { recursive: true });
    await fs.mkdir(workspaceRoot, { recursive: true });
    
    executor = new DefaultFlowExecutor();
  });

  afterEach(async () => {
    // Clean up temp directory
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should use first matching pattern when both files exist', async () => {
    // Create both files
    await fs.writeFile(path.join(packageRoot, 'config.jsonc'), '{"priority": 1}');
    await fs.writeFile(path.join(packageRoot, 'config.json'), '{"priority": 2}');

    const flow: Flow = {
      from: ['config.jsonc', 'config.json'],
      to: 'settings.json',
    };

    const context: FlowContext = {
      workspaceRoot,
      packageRoot,
      platform: 'test',
      packageName: 'test-pkg',
      variables: {},
      direction: 'install',
      dryRun: false,
    };

    const result = await executor.executeFlow(flow, context);

    expect(result.success).toBe(true);
    expect(result.warnings).toBeDefined();
    
    // Check that the higher priority file was used
    const written = await fs.readFile(path.join(workspaceRoot, 'settings.json'), 'utf-8');
    const data = JSON.parse(written);
    expect(data.priority).toBe(1);
    
    // Check warning about skipped pattern
    const warningFound = result.warnings?.some(w => 
      w.includes('config.jsonc') && 
      w.includes('config.json') &&
      w.includes('priority')
    );
    expect(warningFound).toBe(true);
  });

  it('should fallback to second pattern when first does not exist', async () => {
    // Create only second file
    await fs.writeFile(path.join(packageRoot, 'config.json'), '{"source": "json"}');

    const flow: Flow = {
      from: ['config.jsonc', 'config.json'],
      to: 'settings.json',
    };

    const context: FlowContext = {
      workspaceRoot,
      packageRoot,
      platform: 'test',
      packageName: 'test-pkg',
      variables: {},
      direction: 'install',
      dryRun: false,
    };

    const result = await executor.executeFlow(flow, context);

    expect(result.success).toBe(true);
    
    // Check that the second file was used
    const written = await fs.readFile(path.join(workspaceRoot, 'settings.json'), 'utf-8');
    const data = JSON.parse(written);
    expect(data.source).toBe('json');
    
    // Should not have priority warnings since only one file exists
    const warningFound = result.warnings?.some(w => w.includes('priority'));
    expect(warningFound).toBe(false);
  });

  it('should return no matches warning when no patterns match', async () => {
    const flow: Flow = {
      from: ['config.jsonc', 'config.json', 'config.yaml'],
      to: 'settings.json',
    };

    const context: FlowContext = {
      workspaceRoot,
      packageRoot,
      platform: 'test',
      packageName: 'test-pkg',
      variables: {},
      direction: 'install',
      dryRun: false,
    };

    const result = await executor.executeFlow(flow, context);

    expect(result.success).toBe(true);
    expect(result.transformed).toBe(false);
    expect(result.warnings).toBeDefined();
    
    const warningFound = result.warnings?.some(w => 
      w.includes('No files matched')
    );
    expect(warningFound).toBe(true);
  });

  it('should work with glob patterns in array', async () => {
    // Create test files
    await fs.mkdir(path.join(packageRoot, 'configs'), { recursive: true });
    await fs.writeFile(path.join(packageRoot, 'configs', 'specific.json'), '{"type": "specific"}');
    await fs.writeFile(path.join(packageRoot, 'configs', 'general.json'), '{"type": "general"}');

    const flow: Flow = {
      from: ['configs/specific.json', 'configs/*.json'],
      to: 'output.json',
    };

    const context: FlowContext = {
      workspaceRoot,
      packageRoot,
      platform: 'test',
      packageName: 'test-pkg',
      variables: {},
      direction: 'install',
      dryRun: false,
    };

    const result = await executor.executeFlow(flow, context);

    expect(result.success).toBe(true);
    
    // Should have used specific.json (higher priority)
    const written = await fs.readFile(path.join(workspaceRoot, 'output.json'), 'utf-8');
    const data = JSON.parse(written);
    expect(data.type).toBe('specific');
  });

  it('should work with transforms on priority patterns', async () => {
    // Create jsonc file with comments
    const jsoncContent = `{
  // This is a comment
  "key": "value"
}`;
    await fs.writeFile(path.join(packageRoot, 'config.jsonc'), jsoncContent);

    const flow: Flow = {
      from: ['config.jsonc', 'config.json'],
      to: 'output.json',
      pipe: ['filter-comments'],
    };

    const context: FlowContext = {
      workspaceRoot,
      packageRoot,
      platform: 'test',
      packageName: 'test-pkg',
      variables: {},
      direction: 'install',
      dryRun: false,
    };

    const result = await executor.executeFlow(flow, context);

    expect(result.success).toBe(true);
    expect(result.transformed).toBe(true);
    
    // Should have processed jsonc file and stripped comments
    const written = await fs.readFile(path.join(workspaceRoot, 'output.json'), 'utf-8');
    const data = JSON.parse(written);
    expect(data.key).toBe('value');
    expect(written).not.toContain('//');
  });
});
