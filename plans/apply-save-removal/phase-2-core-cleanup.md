# Phase 2: Core Infrastructure Cleanup

## Status: ✅ COMPLETED

## Objective
Remove save infrastructure and apply-specific context builders, then clean up --apply flags from add/remove commands.

## Steps

### 2.1 Delete Save Core Infrastructure

**Directory to Delete:**
```
src/core/save/
```

**Contains 23 files:**
- `save-to-source-pipeline.ts` - Main save orchestrator
- `save-pipeline.ts` - Alternative pipeline with versioning
- `save-candidate-builder.ts`
- `save-candidate-loader.ts`
- `save-conflict-analyzer.ts`
- `save-conflict-resolution.ts`
- `save-conflict-resolver.ts`
- `save-group-builder.ts`
- `save-interactive-resolver.ts`
- `save-platform-handler.ts`
- `save-resolution-executor.ts`
- `save-result-reporter.ts`
- `save-versioning.ts`
- `save-write-coordinator.ts`
- `save-yml-resolution.ts`
- `flow-based-saver.ts`
- `package-saver.ts`
- `package-yml-generator.ts`
- `name-resolution.ts`
- `root-save-candidates.ts`
- `workspace-rename.ts`
- `workspace-wip-cleanup.ts`
- `save-types.ts`
- `constants.ts`

**Rationale:** This is dead code after removing save command. ~3,000 LOC removed.

---

### 2.2 Remove Apply-Specific Context Builders

**File to Modify:** `src/core/install/unified/context-builders.ts`

**Functions to Delete:**

1. **`buildApplyContext()` - Both Overloads:**
   ```typescript
   // DELETE: Single package overload
   export async function buildApplyContext(
     cwd: string,
     packageName: string,
     options: InstallOptions
   ): Promise<InstallationContext>;

   // DELETE: Bulk apply overload
   export async function buildApplyContext(
     cwd: string,
     packageName: undefined,
     options: InstallOptions
   ): Promise<InstallationContext[]>;

   // DELETE: Implementation
   export async function buildApplyContext(
     cwd: string,
     packageName: string | undefined,
     options: InstallOptions
   ): Promise<InstallationContext | InstallationContext[]> {
     // ... entire function body
   }
   ```

2. **`buildBulkApplyContexts()` - Helper Function:**
   ```typescript
   // DELETE entire function
   async function buildBulkApplyContexts(
     cwd: string,
     options: InstallOptions
   ): Promise<InstallationContext[]> {
     // ... entire function body
   }
   ```

**IMPORTANT - Do NOT Delete:**
- ✅ Keep `buildWorkspaceRootInstallContext()` - Used by bulk install
- ✅ Keep `buildInstallContext()` - Used by install command
- ✅ Keep `buildRegistryInstallContext()` - Used by install
- ✅ Keep `buildPathInstallContext()` - Used by install
- ✅ Keep `buildGitInstallContext()` - Used by install
- ✅ Keep `buildBulkInstallContexts()` - Helper for install

**Update Exports in `src/core/install/unified/index.ts`:**
```typescript
// REMOVE this export:
export { buildApplyContext } from './context-builders.js';
```

---

### 2.3 Clean Up Add Pipeline

**File to Modify:** `src/core/add/add-to-source-pipeline.ts`

**Changes:**

1. **Remove imports:**
   ```typescript
   // DELETE these lines:
   import { buildApplyContext } from '../install/unified/context-builders.js';
   import { runUnifiedInstallPipeline } from '../install/unified/pipeline.js';
   ```

2. **Update interface:**
   ```typescript
   export interface AddToSourceOptions {
     // DELETE: apply?: boolean;
     platformSpecific?: boolean;
   }
   ```

3. **Remove apply logic block:**
   ```typescript
   // DELETE entire block (approximately lines 100-130):
   if (options.apply) {
     logger.info('Applying changes to workspace (--apply flag)', { packageName: packageContext.name });
     
     try {
       await resolvePackageSource(cwd, packageContext.name);
       const applyCtx = await buildApplyContext(cwd, packageContext.name, {});
       const applyResult = await runUnifiedInstallPipeline(applyCtx);
       
       if (!applyResult.success) {
         return {
           success: false,
           error: `Files added to package source, but apply failed:\n${applyResult.error}`
         };
       }
       
       logger.info('Changes applied to workspace', { packageName: packageContext.name });
     } catch (error) {
       return {
         success: false,
         error: 
           `Files added to package source at: ${packageContext.packageRootDir}\n\n` +
           `However, --apply failed because package '${packageContext.name}' is not installed in this workspace.\n\n` +
           `To sync changes to your workspace:\n` +
           `  1. Install the package: opkg install ${packageContext.name}\n` +
           `  2. Apply the changes: opkg apply ${packageContext.name}\n\n` +
           `Or run 'opkg add' without --apply flag to skip workspace sync.`
       };
     }
   }
   ```

---

### 2.4 Clean Up Remove Pipeline

**File to Modify:** `src/core/remove/remove-from-source-pipeline.ts`

**Changes:**

1. **Remove imports:**
   ```typescript
   // DELETE these lines:
   import { buildApplyContext } from '../install/unified/context-builders.js';
   import { runUnifiedInstallPipeline } from '../install/unified/pipeline.js';
   ```

2. **Update interface:**
   ```typescript
   export interface RemoveFromSourceOptions {
     // DELETE: apply?: boolean;
     force?: boolean;
     dryRun?: boolean;
   }
   ```

3. **Remove apply logic block:**
   ```typescript
   // DELETE entire block (similar to add pipeline):
   if (options.apply) {
     // ... entire apply logic block
   }
   ```

---

### 2.5 Update Add Command

**File to Modify:** `src/commands/add.ts`

**Changes:**

1. **Remove option:**
   ```typescript
   // DELETE this line from command options:
   .option('--apply', 'Apply changes to workspace immediately (requires package to be installed)')
   ```

2. **Simplify success messages:**
   - Remove apply-related hints in `displayAddResults()`
   - Remove the conditional logic that checks `options.apply`
   - Keep install suggestion but remove apply suggestion

**Updated hint section:**
```typescript
// REPLACE the entire hint section with:
if (!isWorkspaceRoot) {
  readWorkspaceIndex(cwd).then(workspaceIndexRecord => {
    const isInstalled = !!workspaceIndexRecord.index.packages[resolvedName];
    
    if (isInstalled) {
      console.log(`\n💡 Changes not synced to workspace.`);
      console.log(`   To sync changes, run:`);
      console.log(`     opkg install ${resolvedName}`);
    } else {
      console.log(`\n💡 Package not installed in workspace.`);
      console.log(`   To install and sync, run:`);
      console.log(`     opkg install ${resolvedName}`);
    }
  }).catch(() => {
    // Ignore errors reading workspace index
  });
}
```

---

### 2.6 Update Remove Command

**File to Modify:** `src/commands/remove.ts`

**Changes:**

1. **Remove option:**
   ```typescript
   // DELETE this line from command options:
   .option('--apply', 'Apply changes to workspace immediately (requires package to be installed)')
   ```

2. **Simplify success messages:**
   - Replace apply suggestions with install suggestions
   - Update hint text

**Updated hint section:**
```typescript
// REPLACE the hint section with:
if (!options.dryRun && !isWorkspaceRoot) {
  const workspaceIndexRecord = await readWorkspaceIndex(cwd);
  const isInstalled = !!workspaceIndexRecord.index.packages[resolvedName];
  
  if (isInstalled) {
    console.log(`\n💡 Deletions not synced to workspace.`);
    console.log(`   To sync deletions, run:`);
    console.log(`     opkg install ${resolvedName}`);
  } else {
    console.log(`\n💡 Package not installed in workspace.`);
    console.log(`   If you install this package later, the removed files won't be included.`);
  }
}
```

---

## Verification

After completing Phase 2:

```bash
# Verify save/ directory deleted
ls -d src/core/save/           # Should error: directory not found

# Verify no imports to deleted modules
grep -r "buildApplyContext" src/
grep -r "save-to-source-pipeline" src/
grep -r "save-pipeline" src/
# All should return no results

# Build should succeed (with possible warnings)
npm run build

# Verify add/remove commands work
./bin/openpackage add --help    # Should not show --apply
./bin/openpackage remove --help # Should not show --apply
```

---

## Expected State

After Phase 2:
- ✅ Save infrastructure deleted (~23 files)
- ✅ Apply context builders removed
- ✅ Add/remove commands cleaned up
- ✅ No --apply flags in commands
- ⚠️ Orphaned utility functions may exist (cleaned in Phase 3)
- ✅ Build should pass

---

## Files Modified
- `src/core/install/unified/context-builders.ts` (delete 2 functions)
- `src/core/install/unified/index.ts` (remove export)
- `src/core/add/add-to-source-pipeline.ts` (remove apply logic)
- `src/core/remove/remove-from-source-pipeline.ts` (remove apply logic)
- `src/commands/add.ts` (remove --apply option, update hints)
- `src/commands/remove.ts` (remove --apply option, update hints)

## Files Deleted
- `src/core/save/` (entire directory with 23 files)

## Estimated Time
1-1.5 hours

---

## Completion Summary

**Completed:** January 24, 2026

### What Was Accomplished

✅ **Step 2.1 - Delete Save Core Infrastructure**
- Deleted entire `src/core/save/` directory (23 files)
- Removed ~3,000 LOC of save-specific code

✅ **Step 2.2 - Remove Apply-Specific Context Builders**
- Removed `buildApplyContext()` function (both overloads)
- Removed `buildBulkApplyContexts()` helper function
- Updated exports in `src/core/install/unified/index.ts`
- Preserved `buildWorkspaceRootInstallContext()` (still used by install)

✅ **Step 2.3 - Clean Up Add Pipeline**
- Removed imports: `buildApplyContext`, `runUnifiedInstallPipeline`, `resolvePackageSource`
- Removed `apply?: boolean` from `AddToSourceOptions` interface
- Removed entire apply logic block (~30 lines)
- Updated hints to suggest `opkg install` instead of `opkg apply`

✅ **Step 2.4 - Clean Up Remove Pipeline**
- Removed imports: `buildApplyContext`, `runUnifiedInstallPipeline`, `resolvePackageSource`
- Removed `apply?: boolean` from `RemoveFromSourceOptions` interface
- Removed entire apply logic block (~30 lines)
- Updated hints to suggest `opkg install` instead of `opkg apply`

✅ **Step 2.5 - Update Add Command**
- Removed `--apply` option from command definition
- Updated hint messages to show `opkg install` instead of `opkg apply`
- Simplified conditional logic by removing `options.apply` checks

✅ **Step 2.6 - Update Remove Command**
- Removed `--apply` option from command definition
- Updated hint messages to show `opkg install` instead of `opkg apply`
- Simplified conditional logic by removing `options.apply` checks

✅ **Bonus - Fixed Test Runner**
- Updated `tests/run-tests.ts` to remove references to deleted test files:
  - `tests/core/save/versioning.test.ts`
  - `tests/core/save/package-index-root-save.test.ts`
  - `tests/core/flows/integration/flow-save-apply-pipeline.test.ts`
  - `tests/integration/apply-mutable-source.test.ts`
  - `tests/integration/save-and-add-mutable-source.test.ts`
  - `tests/integration/immutable-save-add-errors.test.ts`
  - `tests/integration/save-apply-flows.test.ts`
  - `tests/commands/status.test.ts` (file doesn't exist)

### Verification Results

✅ **Build Status:** PASSING
```bash
npm run build
# Successfully compiled with no errors
```

✅ **Import Verification:** CLEAN
```bash
grep -r "buildApplyContext" src/          # No matches
grep -r "save-to-source-pipeline" src/    # No matches
grep -r "save-pipeline" src/              # No matches
grep -r "\.option.*--apply" src/commands/ # No matches
```

✅ **Directory Deletion:** CONFIRMED
```bash
ls -d src/core/save/  # Directory not found
```

✅ **Command Help Text:** UPDATED
```bash
./bin/openpackage add --help    # No --apply flag shown
./bin/openpackage remove --help # No --apply flag shown
./bin/openpackage --help        # No save/apply commands shown
```

### Notes

- **Preserved Internal Apply Mode:** The internal 'apply' mode in `buildWorkspaceRootInstallContext()` was intentionally preserved as specified in the plan. This is used internally by the install pipeline for workspace files.

- **Test Suite Status:** One pre-existing test failure in `workspace-paths.test.ts` (CLAUDE.md not in platforms.jsonc). This is unrelated to Phase 2 changes.

- **Migration Path:** All user-facing references to `--apply` flag now suggest using `opkg install` instead, providing a clear migration path.

### Files Changed

**Modified (6 files):**
1. `src/core/install/unified/context-builders.ts`
2. `src/core/install/unified/index.ts`
3. `src/core/add/add-to-source-pipeline.ts`
4. `src/core/remove/remove-from-source-pipeline.ts`
5. `src/commands/add.ts`
6. `src/commands/remove.ts`
7. `tests/run-tests.ts`

**Deleted (1 directory, 23 files):**
- `src/core/save/` (entire directory)

### LOC Impact

- **Removed:** ~3,100 lines of code
- **Modified:** ~50 lines of code
- **Net Change:** -3,050 LOC

### Ready for Phase 3

All Phase 2 objectives completed successfully. The codebase is now ready for Phase 3 (Utility Audit & Dead Code Removal).
