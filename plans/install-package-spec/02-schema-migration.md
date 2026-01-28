# Phase 2: Schema & Auto-Migration

## Overview

Update the openpackage.yml manifest schema to use the new `url:` field format with embedded refs, and implement transparent auto-migration to maintain full backward compatibility.

---

## 1. New Manifest Schema

### Current Format (v0.8.x)

```yaml
packages:
  - name: my-plugin
    git: https://github.com/user/repo.git
    ref: main
    path: plugins/my-plugin
```

### New Format (v0.8.x+)

```yaml
packages:
  - name: my-plugin
    url: https://github.com/user/repo.git#main
    path: plugins/my-plugin
```

### Key Changes

- **`git:` field** → **`url:` field**
- **`ref:` field** → **embedded in `url` as `#ref`**
- **`path:` field** → unchanged (dual meaning based on context)

### URL Field Format

```
<git-url>[#<ref>]
```

**Examples:**
```yaml
# No ref (default branch)
url: https://github.com/user/repo.git

# With branch ref
url: https://github.com/user/repo.git#main

# With tag ref
url: https://github.com/user/repo.git#v1.0.0

# With commit SHA
url: https://github.com/user/repo.git#abc123def456

# GitLab
url: https://gitlab.com/user/repo.git#develop

# SSH URL
url: git@github.com:user/repo.git#main
```

### Path Field Semantics

The `path` field has **dual meaning** based on presence of `url`:

| Scenario | `url` field | `path` meaning |
|----------|-------------|----------------|
| Local source | absent | Local filesystem path |
| Git source | present | Subdirectory within git repo |

**Examples:**
```yaml
# Local source - path is filesystem path
packages:
  - name: local-pkg
    path: ./packages/local-pkg

# Git source - path is subdirectory within repo
packages:
  - name: git-plugin
    url: https://github.com/user/repo.git#main
    path: plugins/my-plugin
```

---

## 2. Auto-Migration on Read

### Purpose

Load old format manifests transparently without errors or warnings.

### Algorithm

When reading `openpackage.yml`:

1. Load and parse YAML
2. For each dependency:
   - If `git:` field exists and no `url:` field → migrate `git:` to `url:`
   - If `ref:` field exists with git/url source → embed `ref` in `url` as `#ref`
   - If `subdirectory:` field exists → migrate to `path:` (existing v0.8.x behavior)
3. Create in-memory representation with new format
4. NO console warnings (silent migration)
5. NO file writes (in-memory only)

### Migration Logic

```typescript
// Pseudo-code for migration on read
function migratePackageDependency(dep: PackageDependency): PackageDependency {
  const migrated = { ...dep };
  
  // Migrate git → url
  if (dep.git && !dep.url) {
    migrated.url = dep.git;
    delete migrated.git;
  }
  
  // Migrate ref → embed in url
  if (dep.ref && migrated.url) {
    if (!migrated.url.includes('#')) {
      migrated.url = `${migrated.url}#${dep.ref}`;
    }
    delete migrated.ref;
  }
  
  // Migrate subdirectory → path (existing v0.8.x)
  if (dep.subdirectory && !dep.path) {
    migrated.path = dep.subdirectory.startsWith('./')
      ? dep.subdirectory.substring(2)
      : dep.subdirectory;
    delete migrated.subdirectory;
  }
  
  return migrated;
}
```

### Examples

**Old Format → In-Memory:**
```yaml
# On disk
packages:
  - name: old-plugin
    git: https://github.com/user/repo.git
    ref: main
    path: plugins/x

# In-memory after migration
packages:
  - name: old-plugin
    url: https://github.com/user/repo.git#main
    path: plugins/x
```

**Mixed Format → In-Memory:**
```yaml
# On disk (mixed old and new)
packages:
  - name: old-plugin
    git: https://github.com/user/repo.git
    ref: main
  - name: new-plugin
    url: https://github.com/another/repo.git#v1.0.0

# In-memory (all migrated)
packages:
  - name: old-plugin
    url: https://github.com/user/repo.git#main
  - name: new-plugin
    url: https://github.com/another/repo.git#v1.0.0
```

### Validation

After migration, validate that each dependency has exactly one source:

```typescript
// Mutually exclusive sources
const hasRegistrySource = !!dep.version;
const hasLocalSource = !!dep.path && !dep.url;
const hasGitSource = !!dep.url;

const sourceCount = [hasRegistrySource, hasLocalSource, hasGitSource]
  .filter(Boolean).length;

if (sourceCount !== 1) {
  throw new Error(
    `Package '${dep.name}' must specify exactly one source: ` +
    `version (registry), path (local), or url (git)`
  );
}
```

---

## 3. Auto-Migration on Write

### Purpose

Always write manifests in new format, converting old format entries automatically.

### Algorithm

When writing `openpackage.yml`:

1. Process all dependencies
2. For each dependency:
   - Always use `url:` field (never `git:`)
   - Ref is always embedded in `url` as `#ref`
   - Never write separate `ref:` field
   - Never write `git:` field
   - Never write `subdirectory:` field
3. Write YAML to disk

### Serialization Logic

```typescript
// Pseudo-code for serialization
function serializePackageDependency(dep: InternalDep): PackageDependency {
  const serialized: PackageDependency = {
    name: dep.name
  };
  
  // Registry source
  if (dep.version) {
    serialized.version = dep.version;
  }
  
  // Local path source
  else if (dep.path && !dep.url) {
    serialized.path = dep.path;
  }
  
  // Git source
  else if (dep.url) {
    serialized.url = dep.url; // Already has #ref embedded
    if (dep.path) {
      serialized.path = dep.path;
    }
  }
  
  // Partial install
  if (dep.include && dep.include.length > 0) {
    serialized.include = dep.include;
  }
  
  return serialized;
  // Never include: git, ref, subdirectory
}
```

### Examples

**Internal → Written:**
```yaml
# Internal representation (after CLI parsing)
{
  name: "my-plugin",
  url: "https://github.com/user/repo.git#main",
  path: "plugins/x"
}

# Written to disk
packages:
  - name: my-plugin
    url: https://github.com/user/repo.git#main
    path: plugins/x
```

**Old Format File → Modified → Written:**
```yaml
# Original file on disk
packages:
  - name: old-plugin
    git: https://github.com/user/repo.git
    ref: main

# User runs: opkg install gh@user/new-repo

# File rewritten (both migrated to new format)
packages:
  - name: old-plugin
    url: https://github.com/user/repo.git#main
  - name: new-repo
    url: https://github.com/user/new-repo.git
```

### Gradual File Conversion

- Old format files load fine (auto-migrated in-memory)
- First write operation converts entire file to new format
- Natural migration over time
- No forced migration events
- No user action required

---

## 4. Type System Updates

### PackageDependency Type

```typescript
interface PackageDependency {
  name: string;
  
  // === Source fields (mutually exclusive) ===
  
  /**
   * Registry source: semver version or range
   * Mutually exclusive with path (local) and url
   */
  version?: string;
  
  /**
   * Dual meaning based on context:
   * - When url is absent: Local filesystem path
   * - When url is present: Subdirectory within git repository
   */
  path?: string;
  
  /**
   * Git/HTTP source URL with optional embedded ref (#ref)
   * Mutually exclusive with version
   */
  url?: string;
  
  // === Deprecated fields (backward compat) ===
  
  /**
   * @deprecated Use url instead
   * Still read for backward compatibility, never written
   */
  git?: string;
  
  /**
   * @deprecated Embed in url as #ref
   * Still read for backward compatibility, never written
   */
  ref?: string;
  
  /**
   * @deprecated Use path instead
   * Already migrated in v0.8.x, kept for older files
   */
  subdirectory?: string;
  
  // === Other fields ===
  
  /**
   * Optional list of registry-relative paths (partial installs)
   */
  include?: string[];
}
```

### Internal Types

**ParsedGitSource (from Phase 1):**
```typescript
interface GitSpec {
  url: string;       // Normalized git URL
  ref?: string;      // Branch/tag/commit
  path?: string;     // Subdirectory within repo
}
```

**PackageSource (Context):**
```typescript
interface PackageSource {
  type: 'git' | 'registry' | 'path' | 'workspace';
  packageName: string;
  
  // Git source fields
  gitUrl?: string;      // Base URL (without #ref)
  gitRef?: string;      // Branch/tag/commit
  gitPath?: string;     // Subdirectory
  
  // ... other fields unchanged
}
```

---

## 5. Module Updates

### Update: `package-yml.ts`

**Changes:**
- Add migration logic for `git:` → `url:`
- Add migration logic for `ref:` → embed in `url`
- Keep existing `subdirectory:` → `path:` migration
- Update serialization to always write `url:` format
- No warnings during migration (silent)

**Migration Flow:**

```
Read from disk:
  parsePackageYml()
    ↓
  Apply migrations (git→url, ref→embed, subdirectory→path)
    ↓
  Validate sources
    ↓
  Return normalized PackageYml

Write to disk:
  serializePackageYml()
    ↓
  Serialize using new format only
    ↓
  Write YAML
```

### Update: `context-builders.ts`

**Changes:**
- Update `buildGitInstallContext()` to handle `url:` field
- Extract ref from URL if present (split by `#`)
- Map to `PackageSource` structure

**URL to PackageSource Mapping:**

```typescript
// Pseudo-code
function buildGitInstallContext(dep: PackageDependency): PackageSource {
  // Parse url field (may contain #ref)
  const [baseUrl, ref] = dep.url.split('#', 2);
  
  return {
    type: 'git',
    packageName: dep.name,
    gitUrl: baseUrl,
    gitRef: ref || undefined,
    gitPath: dep.path
  };
}
```

### Update: CLI Input to Manifest

**Flow for new installations:**

```
CLI Input → GitSpec (Phase 1) → PackageSource (Context) → PackageDependency (Manifest)

gh@user/repo/path
  ↓
{ url: "https://github.com/user/repo.git", path: "path" }
  ↓
{ type: 'git', gitUrl: "...", gitPath: "path" }
  ↓
{ name: "repo", url: "https://github.com/user/repo.git", path: "path" }
  ↓
Written to openpackage.yml
```

---

## 6. Edge Cases & Validation

### Multiple Refs in URL

**Scenario:** URL already has `#ref`, and separate `ref:` field exists

**Handling:**
```typescript
// During migration
if (dep.ref && dep.url?.includes('#')) {
  // URL already has ref, ignore separate ref field
  // Could log warning in dev mode
}
```

**Example:**
```yaml
# Edge case (shouldn't happen but handle it)
url: https://github.com/user/repo.git#main
ref: develop

# Migrated to (URL ref takes priority)
url: https://github.com/user/repo.git#main
```

### Path Embedded in URL

**Scenario:** URL has `&path=` in hash fragment

**Handling:**
```typescript
// During read
if (url.includes('&path=')) {
  // Extract path from URL, prefer separate path field
  const [urlPart, hashPart] = url.split('#', 2);
  const params = parseHashFragment(hashPart);
  
  const path = dep.path || params.path;
  const cleanUrl = `${urlPart}${params.ref ? '#' + params.ref : ''}`;
  
  return { url: cleanUrl, path };
}
```

**Example:**
```yaml
# Edge case (from CLI parsing, not typical in manifest)
url: https://github.com/user/repo.git#main&path=plugins/x

# Normalized to
url: https://github.com/user/repo.git#main
path: plugins/x
```

### Missing URL for Git Source

**Scenario:** Old file with `git:` field, but file corrupted or manually edited

**Handling:**
```typescript
// Validation after migration
if (dep.git && !dep.url) {
  throw new Error(
    `Package '${dep.name}' has 'git' field but migration failed. ` +
    `This may indicate a corrupted manifest.`
  );
}
```

---

## 7. Testing Strategy

### Unit Tests - Migration

**Read Migration:**
- `git:` + `ref:` → `url:` with `#ref`
- `git:` only → `url:` with no ref
- `ref:` without git/url → validation error
- `subdirectory:` → `path:` (existing behavior)
- Mixed old/new format → all migrated consistently

**Write Serialization:**
- Internal `url` with ref → written with `#ref`
- Internal `url` without ref → written as-is
- Never write `git:`, `ref:`, `subdirectory:` fields
- All sources serialize correctly

**Round-Trip:**
- Read old format → write → read → same result
- Read new format → write → read → same result
- Mixed format → write → all converted to new format

### Integration Tests

**File Conversion:**
- Old format file + new install → entire file converted
- Old format file + modify existing → entire file converted
- New format file → stays new format
- Empty file → new format used

**Backward Compatibility:**
- Load v0.7.x manifest → works without errors
- Load v0.8.0 manifest → works without errors
- Load mixed format → works without errors

**Edge Cases:**
- URL with embedded ref + separate ref field → handled
- URL with `&path=` in hash → normalized
- Corrupted manifest → clear error message

### Validation Tests

**Source Exclusivity:**
- `version` + `url` → error
- `path` (local) + `url` → valid (path is subdirectory)
- `path` (local) + `version` → error
- No source fields → error

**Path Semantics:**
- `path` without `url` → local filesystem path
- `path` with `url` → git subdirectory
- Both validate correctly

---

## 8. User Impact

### Seamless Transition

**For Users with Old Format Files:**
1. Files continue to work without any changes
2. No warnings or errors during reads
3. First write operation converts to new format
4. Conversion is automatic and transparent

**For Users Creating New Packages:**
1. CLI always generates new format
2. Documentation shows new format
3. Examples use new format

### No Action Required

- ✅ Old files work immediately
- ✅ No manual migration needed
- ✅ No migration command needed
- ✅ No warnings during normal usage
- ✅ Natural conversion over time

### What Users See

**Loading old format:**
```bash
$ opkg install
# No output about migration - just works
```

**After first write:**
```yaml
# File automatically converted to new format
packages:
  - name: my-plugin
    url: https://github.com/user/repo.git#main
    path: plugins/x
```

---

## Summary

### What Gets Implemented

✅ New `url:` field format with embedded `#ref`
✅ Auto-migration on read (silent, in-memory)
✅ Auto-migration on write (always new format)
✅ Dual semantics for `path` field
✅ Updated type definitions with deprecated fields
✅ Validation for source exclusivity
✅ Comprehensive test coverage

### Key Behaviors

- Old format files load without errors
- No warnings during migration
- First write converts entire file
- `path` meaning depends on `url` presence
- Deprecated fields never written
- Backward compatibility maintained

### Next Phase

Phase 3 will implement comprehensive testing and update all user-facing documentation.

---

## Implementation Notes (Completed)

### Files Modified

**Type Definitions:**
- `src/types/index.ts` - Updated `PackageDependency` interface with `url` field and deprecated `git`/`ref` fields

**Migration Logic:**
- `src/utils/package-yml.ts` - Implemented git→url and ref embedding on read; cleanup of deprecated fields on write
- `src/core/source-resolution/dependency-graph.ts` - Added local interface with `url` field
- `src/utils/plugin-naming.ts` - Updated to handle both `git` and `url` fields

**Context Building:**
- `src/core/install/unified/context-builders.ts` - Parse `url` field to extract base URL and ref
- `src/core/dependency-resolver.ts` - Updated both dependency resolution functions to handle `url` field

**Manifest Writing:**
- `src/utils/package-management.ts` - Build `url` field with embedded ref when writing
- `src/utils/install-helpers.ts` - Updated helper functions to handle `url` field

**Tests:**
- `tests/core/install/manifest-git-url-migration.test.ts` - New comprehensive test suite for Phase 2
- `tests/core/install/manifest-subdirectory-migration.test.ts` - Updated for Phase 2 compatibility
- `tests/core/install/plugin-sources.test.ts` - Fixed field name references (gitSubdirectory → gitPath)

### Migration Behavior

**Read (Parse):**
1. If `git` field exists and no `url` field → migrate `git` to `url`
2. If `ref` field exists with git/url source → embed `ref` in `url` as `#ref`
3. If `subdirectory` field exists → migrate to `path` (existing v0.8.x behavior)
4. All migrations are silent (no console warnings)

**Write (Serialize):**
1. Always write `url` field (never `git`)
2. Ref always embedded in `url` as `#ref` (never separate `ref` field)
3. Never write `git`, `ref`, or `subdirectory` fields

**Context Building:**
1. Parse `url` field by splitting on `#` to extract base URL and ref
2. Use embedded ref if present, otherwise fall back to separate `ref` field
3. Map to internal `PackageSource` structure with `gitUrl` and `gitRef`

### Test Coverage

✅ 11 tests for git→url migration
✅ 7 tests for subdirectory migration (updated for Phase 2)
✅ All tests passing
✅ Round-trip validation (read → write → read)
✅ Edge case handling (multiple refs, mixed formats, etc.)

### Backward Compatibility

✅ Old format files (git + ref) load correctly
✅ Mixed format files (some old, some new) handled correctly
✅ No breaking changes
✅ No user action required
✅ Natural migration through normal workflow

### Known Limitations

None. All planned functionality implemented and tested.
