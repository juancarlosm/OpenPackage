# Phase 1: Foundation & Core Architecture

## Overview

Establish the foundational architecture for the new execution context model. This phase creates the core abstractions and updates the command layer to use them.

**Duration**: 1-2 days

## Goals

1. Create ExecutionContext module as single source of truth for directory resolution
2. Remove program-level `--global` option
3. Add command-specific `--global` flags to install, uninstall, and list
4. Update preAction hook to remove all CWD mutations
5. Create home directory utilities module

## Modules to Create

### 1. ExecutionContext Module

**Location**: `src/core/execution-context.ts`

**Purpose**: Central module for all directory resolution logic

**Responsibilities**:
- Create ExecutionContext from command options
- Validate directories (exist, writable, accessible)
- Determine if target is global (home directory)
- Generate context variables for platform flows

**Key Functions**:
- `createExecutionContext(options)` → ExecutionContext
  - Computes sourceCwd (original process.cwd())
  - Computes targetDir based on global/cwd flags
  - Validates both directories
  - Sets isGlobal flag
  
- `getContextVariables(context)` → Map<string, any>
  - Generates `$$targetRoot` for flow conditions
  - Generates `$$sourceCwd` for debugging
  - Generates `$$isGlobal` for conditional logic

**Priority Logic**:
```
if (options.global) {
  targetDir = homeDirectory
} else if (options.cwd) {
  targetDir = resolve(options.cwd)
} else {
  targetDir = process.cwd()
}
sourceCwd = process.cwd()  // Always original
```

**Validation**:
- targetDir must exist and be a directory
- targetDir must be writable
- sourceCwd must exist
- Return helpful error messages on validation failure

---

### 2. ExecutionContext Types

**Location**: `src/types/execution-context.ts`

**Purpose**: Type definitions for execution context

**Types to Define**:

```typescript
interface ExecutionContext {
  sourceCwd: string;      // Absolute path to original working directory
  targetDir: string;      // Absolute path to target directory
  isGlobal: boolean;      // True if targetDir is home directory
}

interface ExecutionOptions {
  global?: boolean;       // --global flag
  cwd?: string;          // --cwd flag value
}

interface ContextVariables {
  $$targetRoot: string;  // Normalized target path (with ~/ if home)
  $$sourceCwd: string;   // Original working directory
  $$isGlobal: boolean;   // Global flag for convenience
}
```

---

### 3. Home Directory Utilities

**Location**: `src/utils/home-directory.ts`

**Purpose**: All home directory operations in one place

**Functions**:
- `getHomeDirectory()` → string
  - Returns home directory path
  - Uses `os.homedir()`
  
- `isHomeDirectory(path)` → boolean
  - Checks if path equals home directory
  - Handles path normalization
  
- `normalizePathWithTilde(path)` → string
  - Converts home directory to `~/` for display
  - Leaves other paths unchanged
  
- `expandTilde(path)` → string
  - Converts `~/` to actual home directory
  - Used for path comparison in flow conditions

---

## Command Layer Changes

### 1. Program Configuration

**File**: `src/index.ts`

**Changes**:
- **Remove** `.option('-g, --global', ...)` from program
- Keep `--cwd` as program-level option for ergonomics
- Simplify preAction hook

**New preAction Hook Behavior**:
- Only validate `--cwd` if provided (directory exists and is accessible)
- Log the working directory for debugging
- **NO** `process.chdir()` calls
- **NO** directory mutations
- Just validation and logging

---

### 2. Install Command

**File**: `src/commands/install.ts`

**Changes**:
- Add `.option('-g, --global', 'install to home directory (~/) instead of current workspace')`
- Create ExecutionContext from options
- Pass context to orchestrator

**New Action Pattern**:
1. Get program options (for --cwd if present)
2. Get command options (for --global)
3. Create ExecutionContext with both
4. Pass context to orchestrator
5. Handle results

**No special logic** - just plumbing options to context creation

---

### 3. Uninstall Command

**File**: `src/commands/uninstall.ts`

**Changes**:
- Add `.option('-g, --global', 'uninstall from home directory (~/) instead of current workspace')`
- Create ExecutionContext from options
- Pass context to pipeline

**Pattern**: Same as install command

---

### 4. List Command

**File**: `src/commands/list.ts`

**Changes**:
- Add `.option('-g, --global', 'list packages installed in home directory (~/) instead of current workspace')`
- Create ExecutionContext from options
- Pass context to pipeline

**New Behavior**:
- `opkg list` → lists packages in current workspace
- `opkg list --global` → lists packages in home directory
- Display appropriate header based on `isGlobal` flag

---

## Integration Points

### Commands → ExecutionContext

All three commands follow the same pattern:

1. Parse options (both program-level and command-level)
2. Call `createExecutionContext({ global, cwd })`
3. Validate context (errors if validation fails)
4. Pass context to their respective pipeline/orchestrator

### ExecutionContext → Pipelines

Pipelines receive ExecutionContext as a parameter:
- Install: `orchestrator.execute(input, options, execContext)`
- Uninstall: `runUninstallPipeline(packageName, options, execContext)`
- List: `runListPipeline(packageName, execContext)`

---

## Validation Strategy

### Directory Validation

**Target Directory**:
- Must exist
- Must be a directory (not a file)
- Must be writable
- Error message: "Invalid target directory: {path}"

**Source CWD**:
- Must exist
- Must be a directory
- Readable (not necessarily writable)
- Error message: "Invalid source directory: {path}"

### Option Validation

**Conflicting Options**:
- `--global` and `--cwd` both present: `--global` takes precedence, log warning
- No error, just informative message

---

## Error Handling

### Validation Errors

All validation errors should:
1. Log detailed error with context
2. Display user-friendly error message
3. Exit with code 1
4. Never proceed with invalid context

### Error Messages

**Format**:
```
❌ Invalid target directory: /nonexistent
   Directory does not exist or is not writable
   
   Hint: Verify the directory exists and you have write permissions
```

---

## Testing Requirements

### Unit Tests

**File**: `tests/core/execution-context.test.ts`

**Test Cases**:
1. Default context (no flags)
   - sourceCwd = process.cwd()
   - targetDir = process.cwd()
   - isGlobal = false

2. Global flag
   - sourceCwd = process.cwd()
   - targetDir = home directory
   - isGlobal = true

3. CWD flag
   - sourceCwd = process.cwd()
   - targetDir = specified directory
   - isGlobal = false

4. Global + CWD (global wins)
   - sourceCwd = process.cwd()
   - targetDir = home directory
   - isGlobal = true

5. Validation failures
   - Nonexistent target directory
   - Unwritable target directory
   - Target is a file, not directory

6. Context variables generation
   - $$targetRoot normalized correctly
   - Home directory shows as ~/
   - Other paths show as absolute

**File**: `tests/utils/home-directory.test.ts`

**Test Cases**:
1. getHomeDirectory() returns valid path
2. isHomeDirectory() correctly identifies home
3. normalizePathWithTilde() converts home to ~/
4. expandTilde() converts ~/ to home path

---

## Deliverables

### Code
- ✅ ExecutionContext module implemented
- ✅ ExecutionContext types defined
- ✅ Home directory utilities implemented
- ✅ Program-level --global removed
- ✅ Command-specific --global added to 3 commands
- ✅ preAction hook simplified (no chdir)

### Tests
- ✅ Unit tests for ExecutionContext
- ✅ Unit tests for home directory utilities
- ✅ All tests passing

### Documentation
- ✅ Module documentation (JSDoc comments)
- ✅ Type documentation
- ✅ Function signatures documented

---

## Success Criteria

✅ ExecutionContext module correctly computes directories for all option combinations  
✅ Home directory utilities work correctly on all platforms  
✅ Program-level --global option removed  
✅ Command-specific --global added to exactly 3 commands  
✅ preAction hook contains no `process.chdir()` calls  
✅ All unit tests pass  
✅ Clean, minimal implementation with zero legacy code

---

## Next Phase

Phase 2 will refactor the install pipeline to use ExecutionContext throughout:
- Update orchestrator interface
- Update all strategies
- Refactor InstallationContext structure
- Update source loaders
- Update platform flow execution
