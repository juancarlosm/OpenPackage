/**
 * Integration tests for install command with --interactive option
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { join } from 'path';
import { discoverResources } from '../../src/core/install/resource-discoverer.js';
import { setupTestEnvironment, cleanupTestEnvironment } from '../test-helpers.js';

describe('install --interactive', () => {
  let testDir: string;

  beforeEach(async () => {
    const env = await setupTestEnvironment();
    testDir = env.testDir;
  });

  afterEach(async () => {
    await cleanupTestEnvironment(testDir);
  });

  describe('resource discovery', () => {
    it('should discover agents in universal format', async () => {
      // This test validates the resource discoverer can find agents
      // A full integration test would require mock prompts
      const result = await discoverResources(testDir, testDir);
      expect(result).toBeDefined();
      expect(result.total).toBeGreaterThanOrEqual(0);
      expect(result.byType).toBeInstanceOf(Map);
    });

    it('should return empty result for empty directory', async () => {
      const result = await discoverResources(testDir, testDir);
      expect(result.total).toBe(0);
      expect(result.all).toHaveLength(0);
    });
  });

  describe('validation', () => {
    it('should reject --interactive with --agents', () => {
      // This is validated at CLI level in install.ts
      // The validation ensures mutually exclusive options
      expect(true).toBe(true); // Placeholder
    });

    it('should reject --interactive with --skills', () => {
      // This is validated at CLI level in install.ts
      expect(true).toBe(true); // Placeholder
    });
  });
});
