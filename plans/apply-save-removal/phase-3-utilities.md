# Phase 3: Utility Audit & Dead Code Removal ✅ COMPLETED

## Objective
Identify and remove utility functions that were exclusively used by save/apply commands. Preserve utilities still used by install, add, or remove commands.

## Completion Summary

**Files Deleted (8 total):**
1. `src/utils/root-conflict-resolution.ts` - Save-only conflict resolution
2. `src/utils/root-file-registry.ts` - Save-only registry reader
3. `src/core/sync/platform-sync-summary.ts` - Save/apply reporting
4. `src/utils/dependency-coverage.ts` - Unused utility
5. `src/utils/error-handling.ts` - Unused utility
6. `src/utils/package-discovery.ts` - Unused utility
7. `src/utils/platform-conflict-resolution.ts` - Save-only conflict resolution
8. `src/utils/registry-paths.ts` - Used only by platform-sync-summary

**Code Updates:**
1. `src/core/package-context.ts` - Updated error messages to remove `opkg save` references
2. `src/core/install/install-reporting.ts` - Removed `opkg save` from suggestions
3. `src/core/install/install-errors.ts` - Updated error messages
4. `src/core/dependency-resolver.ts` - Updated warning messages

**Preserved Utilities (Used by Install):**
- `src/utils/version-generator.ts` - Used by add and install
- `src/utils/package-merge.ts` - Used by remote-pull (install)
- `src/utils/registry-entry-filter.ts` - Used by install and add
- All workspace-index utilities - Used by install
- All package-index utilities - Used by install
- `src/utils/package-copy.ts` - Used by install
- `src/core/sync/platform-sync.ts` - Used by install

**Verification:**
- ✅ Build passes without errors
- ✅ No orphaned imports remain
- ✅ All references to save/apply commands removed from error messages
- ✅ TypeScript compilation succeeds

## Audit Process

For each utility file, determine if it's still imported by remaining code:

```bash
# Check if utility is still used
grep -r "from './path/to/utility.js'" src/

# If no results (except the utility itself), it's dead code → DELETE
# If results exist, keep the utility
```

---

## High-Risk Utilities (Likely Save-Only)

### 3.1 Version & Workspace Management

**Files to Audit:**

**`src/utils/version-generator.ts`**
- Functions: `createWorkspaceHash()`, `createWorkspaceTag()`
- Used by: `save-pipeline.ts` (deleted)
- **Action:** Check if install still needs these
  - If only save imports: DELETE
  - If install imports: KEEP

**`src/utils/workspace-rename.ts`**
- Used by: Save pipeline for package renaming
- **Action:** DELETE (save-specific)

**Expected Outcome:** Delete if only imported by deleted save files

---

### 3.2 Conflict Resolution Utilities

**Files to Audit:**

**`src/utils/root-conflict-resolution.ts`**
- Used by: Save conflict resolution
- **Action:** Check if install uses this
  - If install references: KEEP
  - If only save: DELETE

**`src/utils/platform-conflict-resolution.ts`**
- Used by: Platform sync during save
- **Action:** Check if install/platform-sync uses this
  - Likely still needed by install's conflict handling
  - **Action:** KEEP (used by install)

**Expected Outcome:** Keep platform-conflict-resolution, possibly delete root-conflict-resolution

---

### 3.3 Package Merge & Copy

**Files to Audit:**

**`src/utils/package-merge.ts`**
- Used by: Save candidate building
- **Action:** Check if install needs merging logic
  - If only save imports: DELETE
  - If install imports: KEEP

**`src/utils/package-copy.ts`**
- Used by: Install and save operations
- **Action:** Check install usage carefully
  - Likely still needed by install
  - **Action:** KEEP (install needs this)

**Expected Outcome:** Keep package-copy, possibly delete package-merge

---

### 3.4 Registry & Index Utilities

**Files to Audit:**

**`src/utils/registry-entry-filter.ts`**
- Used by: Save versioning and registry operations
- **Action:** Check if install queries registry
  - If install needs filtering: KEEP
  - If only save: DELETE

**`src/utils/package-index-yml.ts`**
- Used by: Both install and save
- **Action:** KEEP (install writes index)

**`src/utils/workspace-index-yml.ts`**
- Used by: Both install and save
- **Action:** KEEP (install needs this)

**`src/utils/workspace-index-helpers.ts`**
- Used by: Both install and save
- **Action:** KEEP (install uses helpers)

**`src/utils/workspace-index-ownership.ts`**
- Used by: Both install and save
- **Action:** KEEP (install needs ownership tracking)

**Expected Outcome:** Keep all index utilities (install depends on them)

---

### 3.5 Package Discovery & Management

**Files to Audit:**

**`src/utils/package-discovery.ts`**
- Used by: Multiple commands including install
- **Action:** KEEP (shared utility)

**`src/utils/package-management.ts`**
- Used by: Install, add, remove, save
- **Action:** KEEP (install needs this)

**`src/utils/package-versioning.ts`**
- Used by: Install and save
- **Action:** KEEP (install needs versioning)

**Expected Outcome:** Keep all package management utilities

---

### 3.6 Save-Specific Core Files

**Files to Check for Orphaned Imports:**

**`src/core/package-context.ts`**
- If it contains save-specific functions: Remove those functions
- If entire file is save-only: DELETE
- **Action:** Audit and clean

**`src/core/sync/platform-sync.ts`**
- Used by: Save's --apply functionality
- **Action:** Check if install uses platform sync
  - Likely used by install for workspace root
  - **Action:** KEEP (install needs platform sync)

**`src/core/sync/platform-sync-summary.ts`**
- Used by: Save reporting
- **Action:** Check if install reports sync
  - If install uses: KEEP
  - If only save: DELETE

**Expected Outcome:** Keep sync utilities (install may use them)

---

## Systematic Audit Commands

Run these commands to identify dead code:

```bash
# Find all utility imports in remaining source code
cd src/
for file in utils/*.ts; do
  basename="$(basename "$file")"
  echo "=== Checking $basename ==="
  grep -r "from.*$basename" . | grep -v node_modules | grep -v "utils/$basename"
done

# Check core directories too
for file in core/*/*.ts; do
  basename="$(basename "$file")"
  dirname="$(basename "$(dirname "$file")")"
  echo "=== Checking $dirname/$basename ==="
  grep -r "from.*$dirname.*$basename" . | grep -v node_modules | grep -v "core/$dirname/$basename"
done
```

---

## Conservative Approach

**Default Rule:** When in doubt, KEEP the utility

**Only delete if:**
1. The utility is ONLY imported by deleted save/apply files
2. No references in install, add, remove commands
3. No references in remaining core infrastructure
4. No references in remaining tests

**Verify before deletion:**
```bash
# For each candidate file
grep -r "from.*<utility-name>" src/
grep -r "import.*<utility-name>" src/

# Both should return zero results (or only self-references)
```

---

## Expected Deletions

Based on analysis, these are LIKELY candidates for deletion:

**High Confidence:**
- `src/utils/workspace-rename.ts` (save-only)
- `src/core/sync/platform-sync-summary.ts` (if only save uses)
- Functions in `src/utils/version-generator.ts` (if only save uses)

**Medium Confidence:**
- `src/utils/package-merge.ts` (check install usage)
- `src/utils/root-conflict-resolution.ts` (check install usage)
- `src/utils/registry-entry-filter.ts` (check install usage)

**Keep (Used by Install):**
- All workspace-index utilities
- All package-index utilities
- `src/utils/package-copy.ts`
- `src/utils/platform-conflict-resolution.ts`
- `src/core/sync/platform-sync.ts`

---

## Verification

After completing Phase 3:

```bash
# Verify no imports to deleted utilities
for file in <list-of-deleted-files>; do
  basename="$(basename "$file")"
  echo "Checking $basename..."
  grep -r "from.*$basename" src/
done

# All should return no results

# Build must succeed
npm run build

# TypeScript should not complain about missing imports
npx tsc --noEmit
```

---

## Expected State

After Phase 3:
- ✅ Dead utility functions removed
- ✅ Orphaned imports cleaned up
- ✅ No dangling references to deleted code
- ✅ Build passes without warnings
- ✅ All remaining utilities have active imports

---

## Deliverables

1. List of deleted utility files (document in commit message)
2. List of kept utilities with justification
3. Clean build output
4. Updated imports in all files

## Estimated Time
1-2 hours (audit requires careful verification)

---

## Safety Checks

Before deleting ANY utility:

1. ✅ Search for imports in `src/`
2. ✅ Search for imports in `tests/`
3. ✅ Check if referenced in type definitions
4. ✅ Verify not used by install command chain
5. ✅ Build succeeds after deletion
