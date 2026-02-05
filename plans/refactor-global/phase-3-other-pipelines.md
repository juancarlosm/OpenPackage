# Phase 3: Other Pipelines & Utilities

## Overview

Update uninstall and list pipelines to use ExecutionContext, and refactor all supporting utilities to use explicit `sourceCwd` and `targetDir` parameters.

**Duration**: 1-2 days

## Goals

1. Refactor uninstall pipeline to use ExecutionContext
2. Refactor list pipeline to use ExecutionContext
3. Update all workspace index utilities
4. Update all manifest path utilities
5. Update platform detection to use targetDir
6. Ensure zero ambiguous `cwd` parameters remain

## Uninstall Pipeline

### Pipeline Interface

**File**: `src/core/uninstall/uninstall-pipeline.ts`

**Interface Update**:
- Change `runUninstallPipeline(packageName, options, cwd)`
- To: `runUninstallPipeline(packageName, options, execContext)`

**Changes**:
- Use `execContext.targetDir` for all operations
- Read index from `execContext.targetDir`
- Find installed files in `execContext.targetDir`
- Delete files from `execContext.targetDir`
- Update manifest in `execContext.targetDir`

**Operations Using targetDir**:
1. Read workspace index: `readWorkspaceIndex(execContext.targetDir)`
2. Find package files in target directory
3. Delete files from target directory
4. Update index in target directory
5. Update manifest in target directory

---

### File Discovery

**File**: `src/core/uninstall/uninstall-file-discovery.ts`

**Interface Update**:
- Accept `targetDir` parameter explicitly (not `cwd`)
- Search for files in `targetDir`
- Read index from `targetDir`

**Changes**:
- Replace all `cwd` parameters with `targetDir`
- Use `targetDir` for all path resolution
- Return absolute paths

---

### Flow-Aware Uninstaller

**File**: `src/core/uninstall/flow-aware-uninstaller.ts`

**Changes**:
- Accept `targetDir` parameter
- Use `targetDir` for finding platform files
- Use `targetDir` for reading flow configurations

---

## List Pipeline

### Pipeline Interface

**File**: `src/core/list/list-pipeline.ts`

**Interface Update**:
- Change `runListPipeline(packageName, cwd)`
- To: `runListPipeline(packageName, execContext)`

**Changes**:
- Use `execContext.targetDir` for all read operations
- Read manifest from `execContext.targetDir`
- Read index from `execContext.targetDir`
- Display appropriate header based on `execContext.isGlobal`

**Display Logic**:
```
If isGlobal:
  Header: "Global Packages (~)"
  Manifest: ~/openpackage.yml
  
If not isGlobal:
  Header: "Workspace: <name> <path>"
  Manifest: <targetDir>/openpackage.yml
```

---

### Package State Resolution

**Changes**:
- Use `targetDir` for checking file existence
- Use `targetDir` for reading package metadata
- Compare source paths against `targetDir`

---

## Supporting Utilities

### Workspace Index Utilities

**File**: `src/utils/workspace-index-yml.ts`

**Interface Updates**:
- All functions accept `targetDir` parameter (not `cwd`)
- `readWorkspaceIndex(targetDir)` 
- `updateWorkspaceIndex(targetDir, updates)`
- `writeWorkspaceIndex(targetDir, index)`
- `getWorkspaceIndexPath(targetDir)`

**Changes**:
- Replace all `cwd` parameters with `targetDir`
- Compute index path: `${targetDir}/.openpackage/openpackage.index.yml`
- Read/write relative to `targetDir`

**Affected Functions**:
- `readWorkspaceIndex` → uses targetDir
- `updateWorkspaceIndex` → uses targetDir
- `writeWorkspaceIndex` → uses targetDir
- `getWorkspaceIndexPath` → uses targetDir
- `ensureWorkspaceIndexDir` → uses targetDir

---

### Manifest Path Utilities

**File**: `src/utils/paths.ts` or `src/utils/manifest-paths.ts`

**Interface Updates**:
- Accept `targetDir` parameter (not `cwd`)
- `getLocalPackageYmlPath(targetDir)`
- `getWorkspaceManifestPath(targetDir)`

**Changes**:
- Replace `cwd` with `targetDir`
- Compute paths: `${targetDir}/openpackage.yml`
- Remove any references to `process.cwd()`

---

### Platform Detection

**File**: `src/core/platforms.ts`

**Interface Updates**:
- Change `getPlatformsState(cwd)`
- To: `getPlatformsState(targetDir)`

**Changes**:
- Detect platforms in `targetDir`
- Look for `.cursor/`, `.claude/`, `.opencode/` in `targetDir`
- Return platform configuration for `targetDir`

**Affected Functions**:
- `getPlatformsState` → uses targetDir
- `detectPlatformRoots` → uses targetDir
- `loadPlatformsConfig` → uses targetDir

---

### Platform Resolution

**File**: `src/core/install/platform-resolution.ts`

**Interface Updates**:
- Change `resolvePlatforms(cwd, ...)`
- To: `resolvePlatforms(targetDir, ...)`

**Changes**:
- Use `targetDir` for platform detection
- Prompt in context of `targetDir`

---

### Package Context

**File**: `src/core/package-context.ts`

**Changes**:
- Functions that accept `cwd` should clarify intent
- If checking workspace: use `targetDir`
- If resolving package paths: use explicit parameter names

---

### Directory Utilities

**File**: `src/utils/directory-preservation.ts`

**Changes**:
- If operating on installation target: use `targetDir`
- If preserving directories: use explicit base path parameter

---

## Path Resolution Updates

### Custom Path Resolution

**File**: `src/utils/custom-path-resolution.ts`

**Changes**:
- Accept explicit base directory parameter
- No assumptions about `process.cwd()`

---

### Path Comparison

**File**: `src/utils/path-comparison.ts`

**Changes**:
- Accept explicit base paths for comparison
- Use provided paths, not `process.cwd()`

---

### Path Normalization

**File**: `src/utils/path-normalization.ts`

**Changes**:
- Accept base directory parameter where needed
- No implicit `process.cwd()` usage

---

## File Operations

### File Walker

**File**: `src/utils/file-walker.ts`

**Changes**:
- Accept explicit base directory
- Walk from provided base, not `process.cwd()`

---

### File Processing

**File**: `src/utils/file-processing.ts`

**Changes**:
- Accept source and target directories explicitly
- No ambiguous `cwd` parameters

---

## Package Management

### Package Name Resolution

**File**: `src/utils/package-name-resolution.ts`

**Changes**:
- Accept `searchBase` parameter instead of `cwd`
- When searching workspace: use `targetDir`
- When resolving paths: use explicit base

---

### Package Installation

**File**: `src/utils/package-installation.ts`

**Changes**:
- Accept `targetDir` for installation destination
- Use `targetDir` for writing files

---

## Root File Operations

### Root File Extractor

**File**: `src/utils/root-file-extractor.ts`

**Changes**:
- Accept `targetDir` parameter
- Extract to `targetDir`

---

### Root File Merger

**File**: `src/utils/root-file-merger.ts`

**Changes**:
- Accept `targetDir` parameter
- Merge files in `targetDir`

---

### Root File Uninstaller

**File**: `src/utils/root-file-uninstaller.ts`

**Changes**:
- Accept `targetDir` parameter
- Remove sections from files in `targetDir`

---

## Testing Requirements

### Unit Tests

**New Test Files**:

1. **Uninstall with ExecutionContext**
   - Test uninstall from workspace
   - Test uninstall from global (home)
   - Test file discovery in targetDir
   - Test manifest updates in targetDir

2. **List with ExecutionContext**
   - Test list workspace packages
   - Test list global packages
   - Test header display for global vs workspace

3. **Workspace Index with targetDir**
   - Test read from targetDir
   - Test write to targetDir
   - Test update operations

4. **Platform Detection with targetDir**
   - Test detection in workspace
   - Test detection in home directory
   - Test platform configuration loading

---

### Integration Tests

**Update**: `tests/integration/cwd-global.test.ts`

**New Scenarios**:

1. **Global Uninstall**
   ```bash
   opkg install package --global
   opkg uninstall package --global
   # Verify: removed from ~/, not from cwd
   ```

2. **Global List**
   ```bash
   opkg install pkg1 --global
   opkg install pkg2
   opkg list --global    # Shows only pkg1
   opkg list             # Shows only pkg2
   ```

3. **CWD List**
   ```bash
   opkg list --cwd ./workspace
   # Verify: lists packages in ./workspace
   ```

---

## Code Cleanup

### Remove Ambiguous Parameters

**Search and Replace**:
- Find all functions with `cwd` parameter
- Determine if it's for source or target
- Rename to `sourceCwd` or `targetDir` appropriately

**Files to Audit**:
- All files in `src/core/`
- All files in `src/utils/`
- All pipeline files
- All operation files

---

### Remove process.cwd() Calls

**Search Pattern**: `process.cwd()`

**Rules**:
- If used for getting original directory: use `execContext.sourceCwd`
- If used for target operations: use `execContext.targetDir`
- If used in utility: accept parameter instead

**Allowed Usage**:
- Only in ExecutionContext creation (to get original cwd)
- Nowhere else in codebase

---

## Deliverables

### Code
- ✅ Uninstall pipeline uses ExecutionContext
- ✅ List pipeline uses ExecutionContext
- ✅ All workspace index utilities use targetDir
- ✅ All manifest utilities use targetDir
- ✅ Platform detection uses targetDir
- ✅ All file operations use explicit directories
- ✅ Zero ambiguous `cwd` parameters
- ✅ Zero `process.cwd()` calls outside ExecutionContext creation

### Tests
- ✅ Unit tests for uninstall pipeline
- ✅ Unit tests for list pipeline
- ✅ Unit tests for utilities
- ✅ Integration tests for global operations
- ✅ All tests passing

---

## Success Criteria

✅ Uninstall pipeline correctly targets directory based on --global  
✅ List pipeline shows correct packages based on --global  
✅ All utilities accept explicit directory parameters  
✅ No ambiguous `cwd` parameters remain in codebase  
✅ No `process.cwd()` calls outside ExecutionContext creation  
✅ All integration tests pass  
✅ Global and workspace operations work correctly

---

## Next Phase

Phase 4 will focus on comprehensive testing and verification:
- Write full test coverage
- Update all existing tests
- End-to-end verification
- Documentation updates
- Final cleanup
