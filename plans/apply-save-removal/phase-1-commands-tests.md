# Phase 1: Command & Test Removal

**Status: ✅ COMPLETED**

## Objective
Remove user-facing command files and their associated test suites to prevent build errors in subsequent phases.

## Steps

### 1.1 Delete Command Files

**Files to Delete:**
```
src/commands/save.ts
src/commands/apply.ts
```

**Rationale:** These are the entry points for the removed commands. Deleting first prevents accidental usage during refactor.

---

### 1.2 Remove Command Registration

**File to Modify:** `src/index.ts`

**Changes:**
1. Remove imports:
   ```typescript
   // DELETE these lines:
   import { setupApplyCommand } from './commands/apply.js';
   import { setupSaveCommand } from './commands/save.js';
   ```

2. Remove command setup calls:
   ```typescript
   // DELETE these lines from command setup section:
   setupApplyCommand(program);
   setupSaveCommand(program);
   ```

3. Update help text in `formatHelp` customization:
   - Remove `save` from usage examples
   - Remove `apply` from command list
   - Update "All commands" section to exclude save and apply

---

### 1.3 Delete Test Suites

**Directories to Delete:**
```
tests/core/save/              (2 test files)
tests/core/apply/             (2 test files)
```

**Individual Test Files to Delete:**
```
tests/integration/save-and-add-mutable-source.test.ts
tests/integration/save-apply-flows.test.ts
tests/integration/apply-mutable-source.test.ts
tests/integration/immutable-save-add-errors.test.ts
```

**Rationale:** Removing tests early prevents false failures when we delete the underlying implementations.

---

### 1.4 Update Test Files Referencing --apply

**Files to Modify:**

**`tests/core/add/add-without-installation.test.ts`:**
- Remove test cases that use `--apply` flag
- Remove assertions about apply behavior

**`tests/core/remove/remove-from-source.test.ts`:**
- Remove test cases that use `--apply` flag
- Remove assertions about apply behavior

**`tests/core/flows/integration/flow-save-apply-pipeline.test.ts`:**
- Delete entire file (if it exists and references save/apply)

---

## Verification

After completing Phase 1:

```bash
# Verify files are deleted
ls src/commands/save.ts        # Should error: file not found
ls src/commands/apply.ts       # Should error: file not found
ls -d tests/core/save/         # Should error: directory not found
ls -d tests/core/apply/        # Should error: directory not found

# Verify help text
npm run build
./bin/openpackage --help       # Should not list save or apply

# Verify no references
grep -r "setupSaveCommand" src/
grep -r "setupApplyCommand" src/
# Both should return no results
```

---

## Completion Status

Phase 1 Completed Successfully:
- ✅ Command files deleted (save.ts, apply.ts)
- ✅ CLI registration removed from src/index.ts
- ✅ Test suites deleted (6 files total)
  - tests/core/save/ (2 files)
  - tests/core/apply/ (2 files)
  - tests/integration/ (4 files)
  - tests/core/flows/integration/flow-save-apply-pipeline.test.ts
- ✅ Help text clean (verified with ./bin/openpackage --help)
- ✅ Test files updated (removed --apply test cases)
  - tests/core/add/add-without-installation.test.ts
  - tests/core/remove/remove-from-source.test.ts
- ✅ Build successful (npm run build)
- ✅ No references to setupSaveCommand or setupApplyCommand

## Next Steps

Phase 2 will address:
- ⚠️ --apply flags still present in add/remove commands (to be removed)
- ⚠️ Apply-related code in pipelines (to be cleaned up)
- ⚠️ Dead code in utilities (to be identified and removed)

---

## Files Modified
- `src/index.ts`
- `tests/core/add/add-without-installation.test.ts`
- `tests/core/remove/remove-from-source.test.ts`

## Files Deleted
- `src/commands/save.ts`
- `src/commands/apply.ts`
- `tests/core/save/` (directory)
- `tests/core/apply/` (directory)
- 4 integration test files

## Estimated Time
30-45 minutes
