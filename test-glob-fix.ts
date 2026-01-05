/**
 * Test to verify glob pattern resolution fix
 * This tests that mapUniversalToPlatform correctly resolves glob patterns
 * to concrete file paths instead of returning the glob pattern itself
 */

import { mapUniversalToPlatform } from './src/utils/platform-mapper.js';

console.log('Testing glob pattern resolution fix...\n');

try {
  // Test 1: rules/**/*.md -> .cursor/rules/**/*.mdc
  console.log('Test 1: rules/tech-rules.md with cursor platform');
  const result1 = mapUniversalToPlatform('cursor', 'rules', 'tech-rules.md', process.cwd());
  console.log('  Result:', result1.absFile);
  console.log('  Expected to contain: .cursor/rules/tech-rules.mdc');
  
  if (result1.absFile.includes('.cursor/rules/tech-rules.mdc')) {
    console.log('  ✅ PASS: Correctly resolved to concrete path\n');
  } else if (result1.absFile.includes('**')) {
    console.log('  ❌ FAIL: Still contains glob pattern **\n');
  } else {
    console.log('  ❌ FAIL: Unexpected result\n');
  }
  
  // Test 2: commands/**/*.md -> .cursor/commands/**/*.md (no extension change)
  console.log('Test 2: commands/hello.md with cursor platform');
  const result2 = mapUniversalToPlatform('cursor', 'commands', 'hello.md', process.cwd());
  console.log('  Result:', result2.absFile);
  console.log('  Expected to contain: .cursor/commands/hello.md');
  
  if (result2.absFile.includes('.cursor/commands/hello.md')) {
    console.log('  ✅ PASS: Correctly resolved to concrete path\n');
  } else if (result2.absFile.includes('**')) {
    console.log('  ❌ FAIL: Still contains glob pattern **\n');
  } else {
    console.log('  ❌ FAIL: Unexpected result\n');
  }
  
  // Test 3: rules/**/*.md -> .claude/rules/**/*.md
  console.log('Test 3: rules/tech-rules.md with claude platform');
  const result3 = mapUniversalToPlatform('claude', 'rules', 'tech-rules.md', process.cwd());
  console.log('  Result:', result3.absFile);
  console.log('  Expected to contain: .claude/rules/tech-rules.md');
  
  if (result3.absFile.includes('.claude/rules/tech-rules.md')) {
    console.log('  ✅ PASS: Correctly resolved to concrete path\n');
  } else if (result3.absFile.includes('**')) {
    console.log('  ❌ FAIL: Still contains glob pattern **\n');
  } else {
    console.log('  ❌ FAIL: Unexpected result\n');
  }
  
  console.log('All tests completed successfully! ✅');
  
} catch (error) {
  console.error('Test failed with error:', error);
  process.exit(1);
}
