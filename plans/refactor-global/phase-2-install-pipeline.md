# Phase 2: Install Pipeline Refactor

## Overview

Refactor the entire install pipeline to use ExecutionContext. This phase updates orchestrator, strategies, source loaders, and the unified pipeline to correctly separate source and target directories.

**Duration**: 2-3 days

## Goals

1. Update orchestrator to accept and pass ExecutionContext
2. Refactor all strategies to use ExecutionContext
3. Update InstallationContext to embed ExecutionContext
4. Refactor source loaders to use sourceCwd for input resolution
5. Update unified pipeline to use targetDir for output operations
6. Update platform flow execution to support context variables

## Orchestrator Changes

### Orchestrator Interface

**File**: `src/core/install/orchestrator/orchestrator.ts`

**Interface Update**:
- Change `execute(input, options, cwd)` 
- To: `execute(input, options, execContext)`

**Responsibilities**:
- Receive ExecutionContext from command
- Pass ExecutionContext to strategies
- Pass ExecutionContext to preprocessing
- Pass ExecutionContext to pipeline
- No directory resolution logic (already done in ExecutionContext)

**Pattern**:
- ExecutionContext is opaque data structure
- Just pass through to all consumers
- Access via `execContext.sourceCwd` or `execContext.targetDir` as needed

---

## Strategy Changes

### Base Strategy Interface

**File**: `src/core/install/orchestrator/strategies/base.ts`

**Interface Update**:
- Change `buildContext(classification, options, cwd)`
- To: `buildContext(classification, options, execContext)`

**Pattern**:
- Use `execContext.sourceCwd` for resolving input paths
- Store `execContext` in InstallationContext
- Pass through to preprocessing

---

### All Strategy Implementations

**Files**:
- `src/core/install/orchestrator/strategies/path-strategy.ts`
- `src/core/install/orchestrator/strategies/git-strategy.ts`
- `src/core/install/orchestrator/strategies/registry-strategy.ts`
- `src/core/install/orchestrator/strategies/bulk-strategy.ts`

**Changes**:
- Update `buildContext()` signature to accept `execContext`
- Use `execContext.sourceCwd` when resolving inputs
- Store `execContext` in context
- Pass `execContext` to source loaders

**Example Pattern for Path Strategy**:
1. Receive `execContext` parameter
2. Resolve local path using `execContext.sourceCwd`
3. Create PackageSource with resolved path
4. Build InstallationContext with `execContext` embedded

---

## InstallationContext Changes

### Context Structure

**File**: `src/core/install/unified/context.ts`

**New Structure**:
```typescript
interface InstallationContext {
  // NEW: Execution context
  execution: ExecutionContext;
  
  // Convenience aliases (point to execution context values)
  targetDir: string;  // Alias to execution.targetDir
  
  // Existing fields
  source: PackageSource;
  mode: 'install' | 'apply';
  options: NormalizedInstallOptions;
  platforms: string[];
  resolvedPackages: ResolvedPackage[];
  warnings: string[];
  errors: string[];
  
  // Flow execution fields
  detectedBase?: string;
  matchedPattern?: string;
  baseSource?: string;
  baseRelative?: string;
}
```

**Key Decisions**:
- `execution` is the single source of truth
- `targetDir` is convenience alias (avoid `context.execution.targetDir` everywhere)
- Remove all ambiguous `cwd` fields
- Context is created with ExecutionContext, never without it

---

## Source Loader Changes

### Loader Interface

**File**: `src/core/install/sources/base.ts`

**Interface Update**:
- Change `load(source, options, cwd)`
- To: `load(source, options, execContext)`

**Pattern**:
- Use `execContext.sourceCwd` for all path resolution
- Return absolute paths for contentRoot
- No assumptions about target directory

---

### Path Source Loader

**File**: `src/core/install/sources/path-source.ts`

**Changes**:
- Accept `execContext` parameter
- Resolve local paths using `execContext.sourceCwd`
- Use `resolve(execContext.sourceCwd, source.localPath)`

**Key Operations**:
1. Resolve path relative to sourceCwd
2. Validate path exists
3. Detect base/plugin type
4. Return loaded package with absolute contentRoot

---

### Git Source Loader

**File**: `src/core/install/sources/git-source.ts`

**Changes**:
- Accept `execContext` parameter
- Clone to temporary directory (no impact from sourceCwd)
- Use `execContext.sourceCwd` if resolving any local fallbacks

---

### Registry Source Loader

**File**: `src/core/install/sources/registry-source.ts`

**Changes**:
- Accept `execContext` parameter
- Resolve from registry (no path resolution needed)
- Use absolute paths for contentRoot

---

### Workspace Source Loader

**File**: `src/core/install/sources/workspace-source.ts`

**Changes**:
- Accept `execContext` parameter
- Use `execContext.targetDir` to find workspace packages
- Resolve workspace package paths relative to targetDir

---

## Input Classification Changes

### Input Classifier

**File**: `src/core/install/preprocessing/input-classifier.ts`

**Interface Update**:
- Change `classifyInput(input, options, cwd)`
- To: `classifyInput(input, options, execContext)`

**Changes**:
- Use `execContext.sourceCwd` for all path resolution
- Return classifications with absolute paths
- No assumptions about target directory

---

### Path Resolution Utilities

**File**: `src/utils/resource-arg-parser.ts`

**Interface Update**:
- Change `parseResourceArg(input, cwd)`
- To: `parseResourceArg(input, sourceCwd)`

**Changes**:
- Rename parameter from `cwd` to `sourceCwd` for clarity
- Resolve relative paths using `sourceCwd`
- Return absolute paths in ResourceSpec

**File**: `src/utils/package-input.ts`

**Interface Update**:
- Change `classifyPackageInput(raw, cwd)`
- To: `classifyPackageInput(raw, sourceCwd)`

**Changes**:
- Rename parameter from `cwd` to `sourceCwd`
- Resolve paths using `sourceCwd`
- Return absolute paths in classification

---

## Unified Pipeline Changes

### Pipeline Interface

**File**: `src/core/install/unified/pipeline.ts`

**Changes**:
- Access target via `context.execution.targetDir` or `context.targetDir` (alias)
- Use targetDir for all output operations
- Never use sourceCwd for output

**Operations Using targetDir**:
1. Platform detection: `getPlatformsState(context.targetDir)`
2. File discovery: search in `context.targetDir`
3. File copying: copy to `context.targetDir`
4. Manifest updates: `${context.targetDir}/openpackage.yml`
5. Index updates: `${context.targetDir}/.openpackage/openpackage.index.yml`

---

### Multi-Context Pipeline

**File**: `src/core/install/unified/multi-context-pipeline.ts`

**Changes**:
- Each context has own ExecutionContext
- Use appropriate targetDir for each context
- Bulk install shares same ExecutionContext for all packages

---

## Platform Flow Execution Changes

### Flow Converter

**File**: `src/core/flows/platform-converter.ts`

**Changes**:
- Accept ExecutionContext in flow conversion
- Generate context variables from ExecutionContext
- Pass variables to flow execution

---

### Flow Executor

**File**: `src/core/flows/flow-executor.ts`

**Changes**:
- Receive context variables in execution context
- Make available to conditional evaluators
- Pass through to map pipeline

---

### Conditional Flow Evaluation

**File**: `src/core/flows/map-pipeline/operations/switch.ts`

**Changes**:
- Access context variables during `when` clause evaluation
- Support variable references like `$$targetRoot`
- Implement path comparison with tilde expansion

**Context Variables Available**:
- `$$targetRoot`: Normalized target path (e.g., `~/` or `/Users/john/project`)
- `$$sourceCwd`: Original working directory
- `$$isGlobal`: Boolean flag

**Example Conditions**:
```jsonc
{ "$eq": ["$$targetRoot", "~/"] }        // True for global installs
{ "$ne": ["$$targetRoot", "~/"] }        // True for workspace installs
{ "$eq": ["$$isGlobal", true] }          // True for global installs
```

---

## Context Variable Generation

### Implementation

**Location**: `src/core/execution-context.ts` (part of getContextVariables)

**Logic**:
1. Get targetDir from ExecutionContext
2. Normalize for display:
   - If targetDir equals home directory → use `~/`
   - Otherwise use absolute path
3. Generate map with all variables

**Normalization**:
- Use home directory utilities to check if path is home
- Use path normalization for consistent comparison
- Handle trailing slashes consistently

---

## Dependency Resolution Changes

### Resolution Executor

**File**: `src/core/install/resolution/executor.ts`

**Changes**:
- Accept ExecutionContext in constructor or execute method
- Use `execution.targetDir` for reading manifests
- Use `execution.sourceCwd` if resolving any local dependencies
- Pass ExecutionContext to package loaders

---

### Package Loader

**File**: `src/core/install/resolution/package-loader.ts`

**Changes**:
- Accept ExecutionContext
- Use appropriate directory based on operation
- Pass ExecutionContext to source loaders

---

## Testing Requirements

### Unit Tests

**New Tests**:

1. **Orchestrator with ExecutionContext**
   - Test context passed through correctly
   - Test multiple strategies receive same context
   - Test context preserved through pipeline

2. **Strategies with ExecutionContext**
   - Test path resolution uses sourceCwd
   - Test context embedded in InstallationContext
   - Test each strategy type

3. **Source Loaders with ExecutionContext**
   - Test path loader uses sourceCwd
   - Test absolute paths returned
   - Test git loader works correctly

4. **Platform Flow Context Variables**
   - Test $$targetRoot generation
   - Test conditional evaluation
   - Test global vs workspace conditions

---

### Integration Tests

**Update**: `tests/integration/cwd-global.test.ts`

**New Scenarios**:

1. **Relative Path with Global**
   ```bash
   # From /Users/john/project
   opkg install ./package --global
   # Should resolve ./package from /Users/john/project
   # Should install to ~/
   ```

2. **Absolute Path with Global**
   ```bash
   opkg install /path/to/package --global
   # Should resolve absolute path
   # Should install to ~/
   ```

3. **CWD with Relative Path**
   ```bash
   # From /Users/john
   opkg install ../other/package --cwd ./project
   # Should resolve ../other/package from /Users/john
   # Should install to /Users/john/project
   ```

---

## Deliverables

### Code
- ✅ Orchestrator updated for ExecutionContext
- ✅ All strategies updated for ExecutionContext
- ✅ InstallationContext refactored with execution field
- ✅ All source loaders updated for sourceCwd
- ✅ Unified pipeline uses targetDir for outputs
- ✅ Platform flow execution supports context variables
- ✅ Input classifiers use sourceCwd

### Tests
- ✅ Unit tests for updated modules
- ✅ Integration tests for path resolution
- ✅ All tests passing

---

## Success Criteria

✅ Orchestrator accepts and passes ExecutionContext  
✅ All strategies use execContext.sourceCwd for input resolution  
✅ InstallationContext embeds ExecutionContext  
✅ Source loaders resolve paths using sourceCwd  
✅ Unified pipeline writes to targetDir  
✅ Platform flows can use $$targetRoot in conditions  
✅ Relative paths work correctly with --global  
✅ All integration tests pass

---

## Next Phase

Phase 3 will update remaining pipelines and utilities:
- Uninstall pipeline
- List pipeline
- Workspace index utilities
- Manifest path utilities
- Platform detection utilities
