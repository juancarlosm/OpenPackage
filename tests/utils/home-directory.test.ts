/**
 * Tests for home directory utilities
 */

import { describe, it, expect } from 'vitest';
import { 
  getHomeDirectory, 
  isHomeDirectory, 
  normalizePathWithTilde, 
  expandTilde 
} from '../../src/utils/home-directory.js';
import { homedir } from 'os';
import { join, resolve } from 'path';

describe('Home Directory Utilities', () => {
  describe('getHomeDirectory', () => {
    it('should return the home directory path', () => {
      const home = getHomeDirectory();
      expect(home).toBe(homedir());
      expect(home).toBeTruthy();
    });
  });

  describe('isHomeDirectory', () => {
    it('should return true for home directory', () => {
      const home = getHomeDirectory();
      expect(isHomeDirectory(home)).toBe(true);
    });

    it('should return true for home directory with trailing slash', () => {
      const home = getHomeDirectory();
      expect(isHomeDirectory(home + '/')).toBe(true);
    });

    it('should return false for non-home directory', () => {
      expect(isHomeDirectory('/tmp')).toBe(false);
      expect(isHomeDirectory('/usr/local')).toBe(false);
    });

    it('should return false for subdirectory of home', () => {
      const home = getHomeDirectory();
      const subdir = join(home, 'Documents');
      expect(isHomeDirectory(subdir)).toBe(false);
    });
  });

  describe('normalizePathWithTilde', () => {
    it('should convert home directory to ~/', () => {
      const home = getHomeDirectory();
      expect(normalizePathWithTilde(home)).toBe('~/');
    });

    it('should convert home subdirectory to ~/subdir', () => {
      const home = getHomeDirectory();
      const subdir = join(home, 'Documents');
      expect(normalizePathWithTilde(subdir)).toBe('~/Documents');
    });

    it('should convert nested home subdirectory to ~/path/to/dir', () => {
      const home = getHomeDirectory();
      const nested = join(home, 'Documents', 'Projects', 'myapp');
      expect(normalizePathWithTilde(nested)).toBe('~/Documents/Projects/myapp');
    });

    it('should leave non-home paths unchanged', () => {
      const tmpPath = resolve('/tmp/test');
      expect(normalizePathWithTilde(tmpPath)).toBe(tmpPath);
    });
  });

  describe('expandTilde', () => {
    it('should expand ~ to home directory', () => {
      const home = getHomeDirectory();
      expect(expandTilde('~')).toBe(home);
    });

    it('should expand ~/ to home directory', () => {
      const home = getHomeDirectory();
      expect(expandTilde('~/')).toBe(home);
    });

    it('should expand ~/subdir to home/subdir', () => {
      const home = getHomeDirectory();
      const expected = resolve(home, 'Documents');
      expect(expandTilde('~/Documents')).toBe(expected);
    });

    it('should expand nested ~/path/to/dir correctly', () => {
      const home = getHomeDirectory();
      const expected = resolve(home, 'Documents/Projects/myapp');
      expect(expandTilde('~/Documents/Projects/myapp')).toBe(expected);
    });

    it('should leave non-tilde paths unchanged', () => {
      expect(expandTilde('/tmp/test')).toBe('/tmp/test');
      expect(expandTilde('./relative')).toBe('./relative');
    });
  });

  describe('round-trip conversion', () => {
    it('should correctly round-trip home directory', () => {
      const home = getHomeDirectory();
      const withTilde = normalizePathWithTilde(home);
      const expanded = expandTilde(withTilde);
      expect(expanded).toBe(home);
    });

    it('should correctly round-trip home subdirectory', () => {
      const home = getHomeDirectory();
      const subdir = join(home, 'Documents', 'test');
      const withTilde = normalizePathWithTilde(subdir);
      const expanded = expandTilde(withTilde);
      expect(expanded).toBe(subdir);
    });
  });
});
