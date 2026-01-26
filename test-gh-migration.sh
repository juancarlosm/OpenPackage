#!/bin/bash
set -e

echo "=== Testing GitHub Name Migration ==="
echo ""

# Create test directory
TESTDIR=$(mktemp -d)
echo "Test directory: $TESTDIR"

# Setup test package.yml with old format
cat > "$TESTDIR/openpackage.yml" << 'EOF'
name: test-workspace
version: 1.0.0
dependencies:
  - name: "@anthropics/claude-code"
    git: https://github.com/anthropics/claude-code.git
  - name: "@user/repo/plugin"
    git: https://github.com/user/repo.git
    subdirectory: plugins/plugin
  - name: "@mycompany/local-package"
    path: ./local
EOF

echo "Created test openpackage.yml with old format:"
cat "$TESTDIR/openpackage.yml"
echo ""

# Test parsePackageYml migration
echo "=== Testing parsePackageYml migration ==="
node -e "
import { parsePackageYml } from './dist/utils/package-yml.js';

(async () => {
  const parsed = await parsePackageYml('$TESTDIR/openpackage.yml');
  console.log('Dependencies after parsing:');
  parsed.dependencies.forEach(dep => {
    console.log('  -', dep.name, ':', dep.git || dep.path);
  });
  
  // Check if GitHub names were migrated
  const ghNames = parsed.dependencies.filter(d => d.name.startsWith('gh@'));
  const oldNames = parsed.dependencies.filter(d => d.name.startsWith('@') && !d.name.startsWith('gh@') && d.git);
  
  console.log('');
  console.log('✓ GitHub names (gh@):', ghNames.length);
  console.log('✓ Non-GitHub scoped names (@):', parsed.dependencies.filter(d => d.name.startsWith('@') && !d.git).length);
  console.log('✓ Old format GitHub names remaining:', oldNames.length);
  
  if (oldNames.length > 0) {
    console.error('ERROR: Found old format GitHub names:', oldNames.map(d => d.name));
    process.exit(1);
  }
  
  // Verify specific migrations
  const names = parsed.dependencies.map(d => d.name);
  if (!names.includes('gh@anthropics/claude-code')) {
    console.error('ERROR: Expected gh@anthropics/claude-code, got:', names);
    process.exit(1);
  }
  if (!names.includes('gh@user/repo/plugin')) {
    console.error('ERROR: Expected gh@user/repo/plugin, got:', names);
    process.exit(1);
  }
  if (!names.includes('@mycompany/local-package')) {
    console.error('ERROR: Non-GitHub scoped name should not be migrated');
    process.exit(1);
  }
  
  console.log('');
  console.log('✅ Migration successful!');
})();
"

echo ""
echo "=== Testing workspace index migration ==="

# Setup test workspace index with old format
mkdir -p "$TESTDIR/.openpackage"
cat > "$TESTDIR/.openpackage/openpackage.index.yml" << 'EOF'
packages:
  "@anthropics/claude-code":
    path: ~/.openpackage/cache/git/abc123/def456/
    files:
      README.md:
        - .cursor/README.md
  "@user/repo":
    path: ~/.openpackage/cache/git/xyz789/uvw012/
    files:
      commands/test.md:
        - .cursor/commands/test.md
  "@mycompany/local-package":
    path: ./local
    version: 1.0.0
    files:
      file.md:
        - .cursor/file.md
EOF

echo "Created test openpackage.index.yml with old format:"
cat "$TESTDIR/.openpackage/openpackage.index.yml"
echo ""

# Test readWorkspaceIndex migration
node -e "
import { readWorkspaceIndex } from './dist/utils/workspace-index-yml.js';

(async () => {
  const { index } = await readWorkspaceIndex('$TESTDIR');
  const packageNames = Object.keys(index.packages);
  
  console.log('Package names after reading index:');
  packageNames.forEach(name => {
    const pkg = index.packages[name];
    console.log('  -', name, ':', pkg.path);
  });
  
  console.log('');
  
  // Check migration
  const ghNames = packageNames.filter(n => n.startsWith('gh@'));
  const oldGhNames = packageNames.filter(n => n.startsWith('@') && !n.startsWith('gh@') && !index.packages[n].version);
  
  console.log('✓ GitHub names (gh@):', ghNames.length);
  console.log('✓ Non-GitHub scoped names (@):', packageNames.filter(n => n.startsWith('@') && index.packages[n].version).length);
  console.log('✓ Old format GitHub names remaining:', oldGhNames.length);
  
  if (oldGhNames.length > 0) {
    console.error('ERROR: Found old format GitHub names:', oldGhNames);
    process.exit(1);
  }
  
  // Verify specific migrations
  if (!packageNames.includes('gh@anthropics/claude-code')) {
    console.error('ERROR: Expected gh@anthropics/claude-code, got:', packageNames);
    process.exit(1);
  }
  if (!packageNames.includes('gh@user/repo')) {
    console.error('ERROR: Expected gh@user/repo, got:', packageNames);
    process.exit(1);
  }
  if (!packageNames.includes('@mycompany/local-package')) {
    console.error('ERROR: Non-GitHub scoped name should not be migrated');
    process.exit(1);
  }
  
  console.log('');
  console.log('✅ Workspace index migration successful!');
})();
"

echo ""
echo "=== Testing package name parsing ==="

node -e "
import { parsePackageInput, normalizePackageNameForLookup } from './dist/utils/package-name.js';

// Test parsing gh@ format
const result1 = parsePackageInput('gh@user/repo@1.0.0');
console.log('parsePackageInput(gh@user/repo@1.0.0):', result1);
if (result1.name !== 'gh@user/repo' || result1.version !== '1.0.0') {
  console.error('ERROR: Parsing failed');
  process.exit(1);
}

const result2 = parsePackageInput('gh@user/repo');
console.log('parsePackageInput(gh@user/repo):', result2);
if (result2.name !== 'gh@user/repo' || result2.version !== undefined) {
  console.error('ERROR: Parsing failed');
  process.exit(1);
}

// Test lookup normalization
const lookup1 = normalizePackageNameForLookup('@user/repo');
console.log('normalizePackageNameForLookup(@user/repo):', lookup1);
if (lookup1 !== 'gh@user/repo') {
  console.error('ERROR: Lookup normalization failed');
  process.exit(1);
}

const lookup2 = normalizePackageNameForLookup('gh@user/repo');
console.log('normalizePackageNameForLookup(gh@user/repo):', lookup2);
if (lookup2 !== 'gh@user/repo') {
  console.error('ERROR: Lookup normalization failed');
  process.exit(1);
}

console.log('');
console.log('✅ Package name parsing successful!');
"

echo ""
echo "=== Cleanup ==="
rm -rf "$TESTDIR"
echo "Removed test directory"

echo ""
echo "=== All migration tests passed! ==="
