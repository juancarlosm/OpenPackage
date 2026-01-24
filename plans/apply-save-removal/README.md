# Apply & Save Command Removal Plan

## Overview

This plan outlines the removal of `opkg save` and `opkg apply` commands to simplify the CLI and improve UX. These commands are rarely used and their removal will reduce codebase complexity by ~5,000 LOC.

## Rationale

- **Rarely Used:** Save/apply workflows are infrequently used compared to core install/uninstall
- **Complexity:** Maintain significant infrastructure (23 files in save/, complex apply integration)
- **User Confusion:** The save → apply workflow adds cognitive overhead
- **Better Alternatives:** `opkg install` can serve as re-sync mechanism; direct source editing is clearer

## Scope

### Commands Removed
- `opkg save` (alias: `s`) - Sync workspace edits back to package source
- `opkg apply` - Sync package files across platforms

### Flags Removed
- `--apply` flag from `opkg add` command
- `--apply` flag from `opkg remove` command
- `--apply` flag from save-related operations

### Infrastructure Removed
- **~45 files deleted** (save core, tests, specs)
- **~10 files modified** (commands, context builders, docs)
- **~5,000 LOC removed**

## What Gets Preserved

### Critical Systems (No Changes)
- **Unified Install Pipeline** - Core installation logic remains intact
- **Apply Mode** - Internal 'apply' mode in install pipeline preserved (used for workspace files)
- **Platform Flows** - Flow-based conversion system untouched
- **Workspace Index** - Index management still needed by install
- **Source Resolution** - Mutable/immutable source detection preserved

### Shared by Install
- `buildWorkspaceRootInstallContext()` - Still used by bulk install
- Platform sync utilities - Install uses these
- Conflict resolution - Install needs this
- All unified pipeline phases

## Implementation Phases

See individual phase documents for detailed steps:

1. **[Phase 1: Command & Test Removal](./phase-1-commands-tests.md)** ✅ COMPLETED
   - Remove command files and CLI registration
   - Delete test suites

2. **[Phase 2: Core Infrastructure Cleanup](./phase-2-core-cleanup.md)** ✅ COMPLETED
   - Delete save/ directory
   - Remove apply-specific context builders
   - Clean up add/remove --apply flags

3. **[Phase 3: Utility Audit & Dead Code Removal](./phase-3-utilities.md)** ✅ COMPLETED
   - Audit utility functions
   - Remove orphaned helpers

4. **[Phase 4: Documentation Update](./phase-4-documentation.md)** ✅ COMPLETED
   - Update README.md
   - Remove spec docs
   - Update help text

5. **[Phase 5: Validation & Testing](./phase-5-validation.md)**
   - Build verification
   - Remaining test validation
   - Command smoke tests

## Migration Guide for Users

### Previous Workflow → New Workflow

**Editing Package Sources:**
```bash
# OLD: Edit workspace, save back to source
opkg add mypackage path/to/file.md
opkg save mypackage
opkg apply mypackage

# NEW: Edit source directly
cd ~/.openpackage/packages/mypackage/
# Edit files directly
opkg install mypackage  # Re-install to sync
```

**Platform Re-sync:**
```bash
# OLD: Standalone apply
opkg apply mypackage

# NEW: Re-install
opkg install mypackage
```

**Add Files with Sync:**
```bash
# OLD: Add with immediate sync
opkg add mypackage file.md --apply

# NEW: Add then install
opkg add mypackage file.md
opkg install mypackage
```

## Estimated Impact

- **Reduction:** ~5,000 LOC removed
- **Files:** 45 deleted, 10 modified
- **Build Time:** Potentially faster compilation
- **Test Suite:** Faster test runs (8 test files removed)
- **Maintenance:** Significantly reduced complexity

## Risks & Mitigations

### Risk: Users depend on save/apply workflow
**Mitigation:** Document migration path, provide clear error messages if users try old commands

### Risk: Breaking changes for existing scripts
**Mitigation:** This is a major version change; document in CHANGELOG

### Risk: Hidden dependencies on apply mode
**Mitigation:** Preserve internal apply mode in pipeline; only remove user-facing commands

## Success Criteria

- [x] Phase 1 complete successfully
- [x] Phase 2 complete successfully
- [x] Phase 3 complete successfully
- [x] Phase 4 complete successfully
- [x] Build passes without errors
- [ ] All phases complete successfully
- [ ] Remaining tests pass
- [ ] `opkg install`, `opkg add`, `opkg remove` work correctly
- [x] No references to save/apply in help text or --apply flags
- [x] Documentation updated
