# Phase 4: Testing & Verification

## Overview

Comprehensive testing and verification of the refactored `--global` implementation. This phase ensures all functionality works correctly, updates existing tests, and performs final cleanup.

**Duration**: 1-2 days

## Goals

1. Write comprehensive unit tests for all new modules
2. Update all existing tests to use new architecture
3. Write integration tests for all --global scenarios
4. Perform end-to-end verification
5. Update documentation
6. Final code cleanup and audit

## Unit Testing

### ExecutionContext Tests

**File**: `tests/core/execution-context.test.ts`

**Test Suites**:

1. **Context Creation - Default Behavior**
   - No flags provided
   - sourceCwd equals process.cwd()
   - targetDir equals process.cwd()
   - isGlobal is false

2. **Context Creation - Global Flag**
   - --global provided
   - sourceCwd equals process.cwd()
   - targetDir equals home directory
   - isGlobal is true

3. **Context Creation - CWD Flag**
   - --cwd provided with valid directory
   - sourceCwd equals process.cwd()
   - targetDir equals specified directory
   - isGlobal is false

4. **Context Creation - Global + CWD**
   - Both flags provided
   - Global takes precedence
   - sourceCwd equals process.cwd()
   - targetDir equals home directory
   - isGlobal is true

5. **Validation - Nonexistent Directory**
   - --cwd points to nonexistent directory
   - Throws validation error
   - Error message is helpful

6. **Validation - File Instead of Directory**
   - --cwd points to file
   - Throws validation error
   - Error message specifies "not a directory"

7. **Validation - Unwritable Directory**
   - --cwd points to read-only directory
   - Throws validation error
   - Error message mentions permissions

8. **Context Variables Generation**
   - Home directory normalized to ~/
   - Other directories shown as absolute paths
   - All variables present ($$targetRoot, $$sourceCwd, $$isGlobal)

---

### Home Directory Tests

**File**: `tests/utils/home-directory.test.ts`

**Test Suites**:

1. **getHomeDirectory()**
   - Returns valid path
   - Path exists
   - Path is directory

2. **isHomeDirectory()**
   - Correctly identifies home directory
   - Returns false for other directories
   - Handles path normalization (trailing slashes)

3. **normalizePathWithTilde()**
   - Converts home directory to ~/
   - Leaves other paths unchanged
   - Handles subdirectories of home correctly

4. **expandTilde()**
   - Converts ~/ to home directory
   - Leaves other paths unchanged
   - Handles ~/subdir correctly

---

### Pipeline Tests

**Files**:
- `tests/core/install/orchestrator.test.ts`
- `tests/core/uninstall/uninstall-pipeline.test.ts`
- `tests/core/list/list-pipeline.test.ts`

**Test Patterns**:

1. **Orchestrator with ExecutionContext**
   - Context passed to strategies
   - Context preserved through pipeline
   - Multiple executions with different contexts

2. **Strategy Tests**
   - Each strategy receives ExecutionContext
   - sourceCwd used for input resolution
   - targetDir embedded in InstallationContext

3. **Uninstall Pipeline**
   - Uses targetDir for all operations
   - Global flag targets home directory
   - Workspace flag targets specified directory

4. **List Pipeline**
   - Reads from correct directory
   - Displays correct header
   - Global flag lists home packages

---

## Integration Testing

### Global Install Scenarios

**File**: `tests/integration/cwd-global.test.ts`

**Test Scenarios**:

1. **Install Relative Path Globally**
   ```bash
   cd /Users/john/packages
   opkg install ./my-package --global
   ```
   - Verify: ./my-package resolved from /Users/john/packages
   - Verify: Files installed to ~/
   - Verify: Manifest updated in ~/
   - Verify: Index updated in ~/

2. **Install Absolute Path Globally**
   ```bash
   opkg install /Users/john/packages/my-package --global
   ```
   - Verify: Path resolved correctly
   - Verify: Files installed to ~/
   - Verify: No dependency on cwd

3. **Install Parent Directory Path Globally**
   ```bash
   cd /Users/john/packages/my-package
   opkg install .. --global
   ```
   - Verify: .. resolved from /Users/john/packages/my-package
   - Verify: Parent directory package installed to ~/

4. **Install Git URL Globally**
   ```bash
   opkg install gh@user/repo --global
   ```
   - Verify: Git clone succeeds
   - Verify: Files installed to ~/
   - Verify: No impact from cwd

5. **Install with --cwd and Relative Path**
   ```bash
   cd /Users/john
   opkg install ../other/package --cwd ./project
   ```
   - Verify: ../other/package resolved from /Users/john
   - Verify: Files installed to /Users/john/project
   - Verify: sourceCwd and targetDir different

6. **Install with --global and --cwd (global wins)**
   ```bash
   opkg install ./package --global --cwd ./workspace
   ```
   - Verify: Global takes precedence
   - Verify: Files installed to ~/
   - Verify: ./package resolved from original cwd

---

### Global Uninstall Scenarios

**Test Scenarios**:

1. **Uninstall from Global**
   ```bash
   opkg install package --global
   opkg uninstall package --global
   ```
   - Verify: Package removed from ~/
   - Verify: Manifest updated in ~/
   - Verify: No changes to current workspace

2. **Uninstall from Workspace**
   ```bash
   opkg install package
   opkg uninstall package
   ```
   - Verify: Package removed from workspace
   - Verify: Global packages untouched

3. **Separate Global and Workspace Installs**
   ```bash
   opkg install package --global
   opkg install package
   opkg uninstall package
   ```
   - Verify: Only workspace installation removed
   - Verify: Global installation intact

---

### Global List Scenarios

**Test Scenarios**:

1. **List Workspace Packages**
   ```bash
   opkg install pkg1
   opkg list
   ```
   - Verify: Shows pkg1
   - Verify: Shows workspace header

2. **List Global Packages**
   ```bash
   opkg install pkg2 --global
   opkg list --global
   ```
   - Verify: Shows pkg2
   - Verify: Shows global header (~/)

3. **List Separate Installations**
   ```bash
   opkg install pkg1
   opkg install pkg2 --global
   opkg list          # Shows pkg1 only
   opkg list --global # Shows pkg2 only
   ```
   - Verify: Correct packages shown for each context

---

### Conditional Flow Scenarios

**Test Scenarios**:

1. **Conditional Flow - Workspace Install**
   ```bash
   # Package has conditional flows based on $$targetRoot
   opkg install conditional-package
   ```
   - Verify: Workspace-specific files installed
   - Verify: Global-specific files NOT installed

2. **Conditional Flow - Global Install**
   ```bash
   opkg install conditional-package --global
   ```
   - Verify: Global-specific files installed
   - Verify: Workspace-specific files NOT installed

3. **Platform-Specific Conditional**
   - Create package with flows using `$$targetRoot`
   - Install to workspace: verify correct files
   - Install to global: verify different files
   - Verify flow conditions evaluated correctly

---

## End-to-End Testing

### Complete Workflows

**Workflow 1: Global Package Lifecycle**
```bash
# Create package
cd /tmp/my-package
opkg new --scope local

# Install globally from current directory
opkg install . --global

# Verify installation
opkg list --global

# Use in different workspace
cd ~/project1
# Global package available

cd ~/project2
# Global package available

# Uninstall globally
opkg uninstall my-package --global

# Verify removal
opkg list --global
```

**Workflow 2: Mixed Global and Workspace**
```bash
# Install version 1 globally
opkg install tool@1.0.0 --global

# Install version 2 in workspace
cd ~/project
opkg install tool@2.0.0

# List shows both contexts separately
opkg list          # Shows tool@2.0.0
opkg list --global # Shows tool@1.0.0

# Uninstall workspace version
opkg uninstall tool

# Global version still intact
opkg list --global # Shows tool@1.0.0
```

**Workflow 3: Path Resolution Edge Cases**
```bash
# Complex path resolution
cd /Users/john/projects/web
opkg install ../../shared/utils --global

# Verify: utils resolved from /Users/shared/utils
# Verify: Installed to ~/
```

---

## Existing Test Updates

### Tests to Update

**All existing tests must be audited for**:
1. Removal of any `process.cwd()` mocking
2. Explicit ExecutionContext creation where needed
3. Updated assertions for new architecture
4. Proper use of sourceCwd vs targetDir

**Key Test Files**:
- `tests/commands/*.test.ts`
- `tests/core/install/*.test.ts`
- `tests/core/uninstall/*.test.ts`
- `tests/utils/*.test.ts`

**Update Pattern**:
- Replace `cwd` with explicit `sourceCwd` or `targetDir`
- Add ExecutionContext creation where needed
- Update mocks to use new architecture
- Verify no assumptions about process.cwd()

---

## Documentation Updates

### Specification Updates

**Files to Update**:

1. **specs/cli-options.md**
   - Document --global on specific commands only
   - Remove program-level --global references
   - Update --cwd behavior (no longer overridden)
   - Add ExecutionContext explanation

2. **specs/install/README.md**
   - Document --global flag
   - Show examples with relative paths
   - Explain sourceCwd vs targetDir
   - Add troubleshooting section

3. **specs/uninstall/README.md**
   - Document --global flag
   - Show examples
   - Explain directory targeting

4. **specs/list/README.md**
   - Document new --global flag
   - Show examples
   - Explain output differences

5. **specs/platforms/flow-reference.md**
   - Document $$targetRoot variable
   - Show conditional flow examples
   - Explain path comparison with ~/

---

### README Updates

**File**: `README.md`

**Sections to Add/Update**:

1. **Global Packages Section**
   - What are global packages
   - When to use --global
   - Examples

2. **Installation Examples**
   - Add --global examples
   - Show relative path resolution
   - Show mixed global/workspace usage

3. **Command Reference**
   - Update install, uninstall, list with --global
   - Remove --global from other commands

---

## Code Cleanup

### Final Audit

**Checklist**:

1. **Search: `process.cwd()`**
   - Verify only used in ExecutionContext creation
   - No other usages allowed

2. **Search: `cwd:`**
   - Verify all renamed to sourceCwd or targetDir
   - No ambiguous parameters

3. **Search: `--global`**
   - Verify only on 3 commands
   - No program-level definition

4. **Search: `chdir`**
   - Verify zero occurrences
   - No directory mutations

5. **Type Audit**
   - All interfaces use ExecutionContext
   - No legacy cwd fields
   - Clean type definitions

---

### Remove Dead Code

**Items to Remove**:
- Old context creation logic
- Compatibility shims
- Fallback logic
- Deprecated fields
- Unused utilities

---

## Performance Testing

### Benchmarks

**Scenarios**:

1. **Install Performance**
   - Compare workspace vs global install time
   - Should be similar (no significant overhead)

2. **Path Resolution**
   - Verify no performance degradation
   - Absolute path resolution is fast

3. **Multiple Installs**
   - Test bulk install performance
   - Verify ExecutionContext reuse

---

## Success Criteria

### Functionality
✅ All global install scenarios work correctly  
✅ All global uninstall scenarios work correctly  
✅ Global list command shows correct packages  
✅ Relative paths resolve correctly with --global  
✅ Conditional flows work with $$targetRoot  
✅ Mixed global/workspace installations work

### Code Quality
✅ Zero process.chdir() calls  
✅ Zero ambiguous cwd parameters  
✅ All functions use explicit directory parameters  
✅ Clean, minimal implementation  
✅ No legacy/compatibility code

### Testing
✅ All unit tests pass  
✅ All integration tests pass  
✅ End-to-end workflows verified  
✅ Edge cases covered  
✅ 100% of new code covered

### Documentation
✅ All specs updated  
✅ README updated  
✅ JSDoc comments complete  
✅ Examples working and tested

---

## Deliverables

### Code
- ✅ All unit tests written and passing
- ✅ All integration tests written and passing
- ✅ Existing tests updated
- ✅ Code audit complete
- ✅ Dead code removed

### Documentation
- ✅ Specifications updated
- ✅ README updated
- ✅ Command help text updated
- ✅ Code comments complete

### Verification
- ✅ End-to-end workflows tested
- ✅ Edge cases verified
- ✅ Performance acceptable
- ✅ No regressions

---

## Final Checklist

Before completing Phase 4:

- [ ] Run full test suite: `npm test`
- [ ] Manual testing of all --global scenarios
- [ ] Code review for ExecutionContext usage
- [ ] Documentation review
- [ ] Search for any remaining legacy code
- [ ] Verify zero process.cwd() outside ExecutionContext
- [ ] Verify zero process.chdir() anywhere
- [ ] Performance testing passed
- [ ] All edge cases covered
- [ ] Clean git history with clear commits

---

## Completion

Upon successful completion of Phase 4:
- Refactor is complete
- All functionality verified
- Documentation up to date
- Ready for production use
