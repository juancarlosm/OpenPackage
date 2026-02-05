# Refactor Plan: `--global` Option - Clean Implementation

## Problem Statement

The current `--global` implementation changes `process.cwd()` globally before command execution, causing relative paths to be resolved incorrectly. When users run `opkg install ./package --global`, the CLI changes to the home directory first, then tries to resolve `./package` from there instead of from the original working directory.

## Solution Overview

Complete rewrite of target directory handling with zero legacy code. The new model strictly separates:
- **Source CWD**: Where we resolve input arguments (local paths, relative paths)
- **Target Directory**: Where we write output files (installation destination)

## Core Principle

**Single Source of Truth**: ExecutionContext

Every command creates exactly one `ExecutionContext` that contains:
- `sourceCwd`: Original directory for resolving inputs
- `targetDir`: Destination directory for outputs
- `isGlobal`: Convenience flag

This context flows through the entire pipeline with no mutations.

## Command Scope

The `--global` flag will only be available on three commands:
1. **install** - Install packages to home directory
2. **uninstall** - Remove packages from home directory  
3. **list** - List packages installed in home directory

All other commands do NOT support `--global`:
- `new` has its own `--scope global` system (different semantics)
- `add`, `remove`, `set` operate on package sources (not installation targets)
- `pack` always writes to local registry (inherently global)
- `publish` operates on remote registry (not filesystem-scoped)
- `configure`, `login`, `logout` are inherently global

## Architecture

```
Command (with --global option)
  ↓
createExecutionContext({ global, cwd })
  ↓
ExecutionContext { sourceCwd, targetDir, isGlobal }
  ↓
Orchestrator(input, options, execContext)
  ↓
Strategy.buildContext(classification, options, execContext)
  ↓
InstallationContext { execution: ExecutionContext, ... }
  ↓
Pipeline operations:
  - Use execContext.sourceCwd for resolving inputs
  - Use execContext.targetDir for writing outputs
  - Use execContext.isGlobal for conditional logic
```

## Key Principles

### 1. Zero Legacy Code
- No compatibility layers
- No deprecated fields
- No fallback logic
- Single implementation only

### 2. Explicit Parameters
- `sourceCwd` for input resolution
- `targetDir` for output operations
- Never overload `cwd` for both purposes

### 3. Single Responsibility
- ExecutionContext module: directory resolution only
- Commands: option parsing + context creation only
- Pipelines: business logic with provided context

### 4. Immutable Context
- ExecutionContext created once per command
- Passed through entire pipeline
- Never modified after creation

### 5. Minimal Surface Area
- Only 3 commands support --global
- Only 1 module creates ExecutionContext
- Only 1 module handles home directory logic

## What Gets Deleted

### Remove Entirely
- All `process.chdir()` calls
- Program-level `--global` option definition
- Any code that treats `cwd` as both source and target
- Any fallback/compatibility logic

### Rename/Replace
- All ambiguous `cwd` parameters → explicit `sourceCwd` or `targetDir`
- All ambiguous directory references → ExecutionContext

## Implementation Phases

This refactor is divided into 4 phases:

### Phase 1: Foundation & Core Architecture
- Create ExecutionContext module and types
- Update command layer (remove program-level --global, add command-specific)
- Create home directory utilities

### Phase 2: Install Pipeline Refactor
- Update orchestrator, strategies, and source loaders
- Refactor InstallationContext to use ExecutionContext
- Update platform flow execution for context variables

### Phase 3: Other Pipelines & Utilities
- Update uninstall and list pipelines
- Refactor all supporting utilities (workspace index, manifest paths, etc.)
- Update path resolution and input classifiers

### Phase 4: Testing & Verification
- Write comprehensive unit tests
- Update integration tests
- End-to-end verification
- Clean up any remaining legacy code

## Success Criteria

✅ Zero references to `process.chdir()`  
✅ Zero ambiguous `cwd` parameters  
✅ Every function explicitly uses `sourceCwd` or `targetDir`  
✅ `--global` only on 3 commands: install, uninstall, list  
✅ Relative paths work correctly with --global  
✅ All tests pass  
✅ Clean, minimal codebase

## Timeline

- Phase 1: 1-2 days
- Phase 2: 2-3 days
- Phase 3: 1-2 days
- Phase 4: 1-2 days

**Total: 5-9 days**

## Phase Details

See individual phase documents for detailed technical overviews:
- [Phase 1: Foundation & Core Architecture](./phase-1-foundation.md)
- [Phase 2: Install Pipeline Refactor](./phase-2-install-pipeline.md)
- [Phase 3: Other Pipelines & Utilities](./phase-3-other-pipelines.md)
- [Phase 4: Testing & Verification](./phase-4-testing.md)
