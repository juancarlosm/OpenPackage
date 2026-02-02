# Implementation Plan: Resource-Centric Installation Refactor

## Overview

This refactor transforms the installation system from a **package-centric model with filters** to a **resource-centric model with multiple independent installations**. The key insight is that convenience options (`--agents`, `--skills`) should produce multiple installation contexts, not filter a single installation.

---

## Phase 1: Remove Include Field Infrastructure

**Goal:** Eliminate all traces of the `include` field from the codebase.

### 1.1 Type Definitions & Interfaces
**Files:** `src/types/api.ts`, `src/utils/package-yml.ts`

- Remove `include` field from `PackageDependency` interface
- Remove any type definitions that reference include arrays
- Update YAML parsing/serialization to ignore include field if present in old files

### 1.2 Manifest Writing
**Files:** `src/utils/package-management.ts`

- Remove `include` parameter from `addPackageToYml()` signature
- Remove all logic that handles include merging, deduplication, or writing
- Remove the `includeToWrite` variable and all related conditional logic
- Simplify dependency object construction to never add include field

### 1.3 Manifest Reading & Context Building
**Files:** `src/core/install/unified/context-builders.ts`

- Remove any code that reads include field from manifest dependencies
- Remove logic that applies include filters during bulk installation
- Ensure bulk install treats each manifest entry independently

### 1.4 Pipeline & Execution
**Files:** `src/core/install/unified/phases/manifest.ts`, `src/core/install/unified/phases/execute.ts`

- Remove `include` parameter passing from manifest phase
- Verify no include-related logic remains in execution phase

**Impact:** This is a clean removal with no replacement needed. The include field was a filtering mechanism that's incompatible with the resource model.

---

## Phase 2: Refactor Convenience Matchers to Return Installation Specs

**Goal:** Transform convenience matchers from filter producers to installation spec generators.

### 2.1 New Resource Installation Spec Type
**Files:** `src/core/install/convenience-matchers.ts` (or new `src/core/install/resource-specs.ts`)

Create a new type that represents a specific resource to install:
- Package name (full path including resource)
- Source information (git URL, ref, base path)
- Resource type (agent, skill)
- Installation metadata (matched by frontmatter/filename, etc.)

This is different from the current `ResourceMatchResult` which is filter-oriented. The new type should contain everything needed to create an `InstallationContext`.

### 2.2 Refactor Convenience Filter Output
**Files:** `src/core/install/convenience-matchers.ts`

Transform `applyConvenienceFilters()` to:
- Return an array of resource installation specs (not filters)
- Each spec contains the complete resource path relative to repo root
- Each spec includes the detected base path
- Keep error reporting structure (resources not found)

The function should return something like:
- `resources: ResourceInstallationSpec[]` - Complete specs for installation
- `errors: string[]` - Resources that weren't found
- Remove `available` field (no longer needed for filters)

### 2.3 Update Agent/Skill Matchers
**Files:** `src/core/install/convenience-matchers.ts`

Modify `matchAgents()` and `matchSkills()` to:
- Return full resource paths relative to repo root (not just agent file paths)
- Include the base directory context in results
- Return structured specs instead of just paths

**Impact:** This changes convenience matchers from a filtering subsystem to a resource discovery subsystem that produces installation specifications.

---

## Phase 3: Multi-Context Installation Architecture

**Goal:** Enable a single install command to create and execute multiple installation contexts.

### 3.1 New Pipeline Orchestration Layer
**Files:** New file `src/core/install/unified/multi-context-pipeline.ts`

Create a new orchestration layer that:
- Accepts an array of installation contexts
- Executes them sequentially (or with appropriate error handling)
- Aggregates results across all installations
- Provides unified reporting

This is distinct from bulk install (which reads from manifest) - this is for a single command that discovers multiple resources.

### 3.2 Resource-to-Context Converter
**Files:** New file `src/core/install/resource-to-context.ts` or add to `context-builders.ts`

Create a function that converts a `ResourceInstallationSpec` to a full `InstallationContext`:
- Takes the resource spec from convenience matchers
- Constructs complete package name (base + resource path)
- Sets up source with appropriate git/path information
- Configures base detection results
- Returns a complete context ready for pipeline execution

This replaces the current approach where filtered resources are stored in a single context.

### 3.3 Update Install Command Flow
**Files:** `src/commands/install.ts`

Refactor `installResourceCommand()` to:
1. Parse resource argument (unchanged)
2. Load source to get base content (unchanged)
3. Apply convenience filters (returns resource specs, not filters)
4. **NEW:** Create multiple installation contexts (one per resource spec)
5. **NEW:** Execute multi-context pipeline instead of single pipeline
6. Aggregate and display results

The key change: Instead of storing `filteredResources` in a single context, create N contexts for N resources.

### 3.4 Remove File Filter Infrastructure
**Files:** `src/core/install/unified/phases/execute.ts`, `src/core/install/install-flow.ts`

- Remove `fileFilters` parameter from execution phase
- Remove `buildFileFilters()` function
- Remove `fileFilters` from `InstallationPhasesParams`
- Remove `filtersForPackage` passing to index-based installer

**Impact:** This fundamentally changes the architecture from "one context with filters" to "multiple contexts without filters", which aligns with the resource-centric model.

---

## Phase 4: Package Naming for Resource Installations

**Goal:** Ensure package names include the complete resource path.

### 4.1 Update Package Name Generation
**Files:** `src/utils/plugin-naming.ts`

Add a new function or parameter to `generateGitHubPackageName()`:
- Accept an optional `resourcePath` parameter (distinct from `path` which is the base)
- When resourcePath is provided, append it to the name
- Format: `gh@username/repo/base/resource/path`

Or create a new specialized function like `generateResourcePackageName()` that:
- Takes base path and resource path separately
- Constructs the full hierarchical name
- Handles normalization consistently

### 4.2 Update Context Builders
**Files:** `src/core/install/unified/context-builders.ts`

When building contexts from resource specs:
- Pass the complete resource path to name generation
- Ensure the source's `packageName` reflects the full path
- Maintain base detection results separately for installation mechanics

### 4.3 Update Package Loaders
**Files:** `src/core/install/path-package-loader.ts`, `src/core/install/plugin-transformer.ts`

Modify loaders to accept and use the full resource path when generating names:
- Add optional `resourcePath` to `PackageLoadContext`
- Pass through to name generation functions
- Ensure consistent naming across all loader types

**Impact:** Every resource installation will have a unique, complete name that includes its full path from the repository root.

---

## Phase 5: Manifest and Index Recording

**Goal:** Ensure each resource gets its own manifest and index entry.

### 5.1 Multi-Entry Manifest Recording
**Files:** `src/core/install/unified/phases/manifest.ts`

The manifest phase should work unchanged because:
- Each context has its own unique package name (from Phase 4)
- Each context runs through the pipeline independently (from Phase 3)
- No special handling needed - just call `addPackageToYml()` per context

Verify that concurrent installations to the same manifest work correctly (array operations are atomic).

### 5.2 Multi-Entry Index Recording
**Files:** `src/utils/flow-index-installer.ts`, `src/utils/index-based-installer.ts`

Similar to manifest - should work unchanged because:
- Each resource has a unique name
- Each runs through installation independently
- Workspace index supports multiple entries naturally

Verify that file mappings are correctly scoped per resource (no cross-contamination).

### 5.3 Consolidated Reporting
**Files:** New or updated in `src/core/install/unified/multi-context-pipeline.ts`

Create reporting logic that:
- Aggregates installed files across all resource installations
- Groups output by resource for clarity
- Shows errors per-resource
- Provides summary statistics (X resources, Y files total)

**Impact:** Each resource becomes a first-class installation entity with its own records, enabling proper tracking, uninstallation, and updates.

---

## Phase 6: Marketplace Integration

**Goal:** Ensure marketplace + convenience options work correctly.

### 6.1 Marketplace Plugin Filtering
**Files:** `src/core/install/marketplace-handler.ts`

Current marketplace flow installs entire plugins. With convenience options, it should:
1. Load marketplace manifest
2. Select plugin(s) based on `--plugins` flag
3. For each selected plugin, get its base path
4. **NEW:** If `--agents` or `--skills` specified, apply convenience matchers to that plugin's base
5. **NEW:** Create multiple contexts for filtered resources within the plugin
6. Execute installations

### 6.2 Plugin Scoping for Convenience Options
**Files:** `src/commands/install.ts`, marketplace integration section

Add logic to:
- When `--plugins` is used with `--agents`/`--skills`, limit resource discovery to selected plugin directories
- Error if a requested agent/skill is found outside the plugin scope
- Pass plugin base paths to convenience matchers for scoped discovery

### 6.3 Update Marketplace Context Passing
**Files:** `src/core/install/marketplace-handler.ts`

Ensure marketplace metadata is correctly passed through:
- When creating resource contexts from filtered agents/skills
- So that workspace index contains marketplace source information
- For proper tracking and updates

**Impact:** Marketplace plugins can be partially installed using convenience options, with each resource as an independent entry.

---

## Phase 7: Cleanup and Optimization

**Goal:** Remove dead code and optimize the refactored system.

### 7.1 Remove Dead Code
**Files:** Multiple

Search and remove:
- Any functions that only supported include field filtering
- Unused filter-related parameters in utility functions
- Old comments referencing include-based partial installation
- Test fixtures that use include field

### 7.2 Update File Discovery Logic
**Files:** `src/core/install/helpers/file-discovery.ts`

Simplify file discovery since filters are removed:
- Remove filter-based file skipping logic
- Rely purely on base detection and pattern matching
- Ensure each context only sees files within its resource scope

### 7.3 Optimize Multi-Context Execution
**Files:** `src/core/install/unified/multi-context-pipeline.ts`

Add optimizations:
- Batch workspace index writes (multiple entries in one file write)
- Cache loaded packages when same base is used for multiple resources
- Share platform resolution across contexts from same command
- Deduplicate file operations (same file installed by multiple resources)

### 7.4 Error Handling Improvements
**Files:** `src/commands/install.ts`, pipeline files

Improve error handling for multi-resource installations:
- Partial success handling (some resources succeed, some fail)
- Clear error attribution (which resource failed)
- Rollback considerations (should probably not rollback on partial failure)
- User-friendly error messages for multi-resource scenarios

**Impact:** Cleaner, more efficient codebase with better user experience for multi-resource installations.

---

## Phase 8: Testing Strategy

**Goal:** Ensure correctness of refactored system.

### 8.1 Unit Tests
**Areas to Cover:**

- **Convenience matchers**: Verify they return correct resource specs
- **Resource-to-context conversion**: Ensure contexts are correctly constructed
- **Package naming**: Test full path name generation with various inputs
- **Multi-context pipeline**: Test aggregation and error handling

### 8.2 Integration Tests
**Scenarios to Cover:**

- Single agent installation via `--agents`
- Multiple agents installation via `--agents agent1 agent2`
- Single skill installation via `--skills`
- Multiple skills installation via `--skills skill1 skill2`
- Mixed `--agents` and `--skills` in one command
- Marketplace + `--plugins` + `--agents` combination
- Non-existent resource error handling
- Ambiguous base resolution with convenience options

### 8.3 End-to-End Tests
**Real-World Scenarios:**

- Install specific agent from GitHub shorthand: `opkg i gh@user/repo --agents typescript-pro`
- Install multiple resources from subdirectory: `opkg i gh@user/repo/plugins/abc --agents a1 a2`
- Verify manifest has N entries for N resources (no include field)
- Verify workspace index has N entries with correct file mappings
- Verify uninstall works correctly (remove one resource doesn't affect others)
- Verify bulk install reads multiple resource entries correctly

### 8.4 Regression Tests
**Ensure Compatibility:**

- Regular package installation (no convenience options) still works
- Bulk install from manifest still works
- Path-based installation still works
- Marketplace installation without convenience options still works

**Impact:** Comprehensive test coverage ensures the refactor doesn't break existing functionality while correctly implementing new behavior.

---

## Phase 9: Documentation Updates

**Goal:** Update documentation to reflect resource-centric model.

### 9.1 Spec Documents
**Files:** `specs/install/*.md`

Update specifications to:
- Remove any references to include field
- Document multi-resource installation behavior
- Clarify that convenience options produce multiple installations
- Update examples to show expected manifest/index output

### 9.2 Code Comments
**Files:** Throughout codebase

Update comments to:
- Explain resource-centric architecture
- Document multi-context pipeline flow
- Clarify distinction between base detection and resource path
- Remove outdated include-related comments

### 9.3 User-Facing Documentation
**Files:** `README.md`, plan documents

Update to reflect:
- Correct behavior of `--agents` and `--skills` flags
- Multiple manifest entries as expected behavior
- Examples showing resource-specific installation

**Impact:** Clear documentation helps future developers understand the resource-centric model.

---

## Implementation Order & Dependencies

### Recommended Sequence:

1. **Phase 1** (Remove Include) - No dependencies, clean removal
2. **Phase 2** (Refactor Convenience Matchers) - Depends on Phase 1 conceptually
3. **Phase 4** (Package Naming) - Can be done in parallel with Phase 2
4. **Phase 3** (Multi-Context Architecture) - Depends on Phase 2 and 4
5. **Phase 5** (Manifest/Index Recording) - Depends on Phase 3, may need validation
6. **Phase 6** (Marketplace Integration) - Depends on Phase 3
7. **Phase 7** (Cleanup) - Depends on all previous phases
8. **Phase 8** (Testing) - Throughout, but comprehensive suite after Phase 7
9. **Phase 9** (Documentation) - Final step after everything works

### Parallel Work Opportunities:

- Phase 1 and Phase 4 can be worked on simultaneously (independent)
- Phase 2 and Phase 4 can be worked on simultaneously (different domains)
- Testing can be written alongside implementation phases

---

## Key Architectural Decisions

### 1. Multiple Contexts vs. Single Context with Metadata
**Decision:** Multiple independent contexts

**Rationale:** 
- Each resource is a distinct installation unit
- Simplifies manifest/index recording (one-to-one mapping)
- Enables independent lifecycle (update/uninstall per resource)
- Aligns with resource-centric philosophy

### 2. Sequential vs. Parallel Context Execution
**Decision:** Sequential execution (with optimization opportunities)

**Rationale:**
- Simpler error handling and reporting
- Avoids file system race conditions
- Easier to debug and understand execution flow
- Performance optimizations can be added later (batched writes, shared caches)

### 3. Filter Removal vs. Filter Transformation
**Decision:** Complete filter removal

**Rationale:**
- Filters imply single package with subsets
- Resource model has no concept of filtering (each resource is atomic)
- Simpler code without filter plumbing
- File operations are naturally scoped by base detection

### 4. Name Generation Strategy
**Decision:** Hierarchical path-based names

**Rationale:**
- Unambiguous (full path from repo root)
- Self-documenting (name tells you exactly what's installed)
- Supports fine-grained uninstall
- Compatible with existing GitHub scoping

---

## Risk Mitigation

### High-Risk Areas:

1. **Multi-context pipeline execution**
   - Risk: File system conflicts between contexts
   - Mitigation: Sequential execution, validate file ownership in index

2. **Package name uniqueness**
   - Risk: Name collisions or ambiguities
   - Mitigation: Always use full path, validate uniqueness in manifest

3. **Workspace index integrity**
   - Risk: Corrupted index from concurrent writes
   - Mitigation: Batch writes, validate after multi-context execution

4. **Error handling complexity**
   - Risk: Partial failures leave system in inconsistent state
   - Mitigation: Per-resource atomicity, clear reporting, no cross-resource rollback

### Testing Coverage:

- Unit tests for each phase
- Integration tests for multi-resource scenarios
- Edge case testing (empty results, all failures, mixed success/failure)
- Regression tests for existing functionality

---

## Success Criteria

### Functional Requirements:

- ✅ `opkg i gh@user/repo --agents agent1 agent2` creates 2 manifest entries
- ✅ Each manifest entry has complete resource path in name
- ✅ No `include` field in any manifest entry
- ✅ Each resource has independent workspace index entry
- ✅ File mappings are correctly scoped per resource
- ✅ Marketplace + convenience options work correctly
- ✅ Existing installation flows (no convenience options) unchanged

### Code Quality Requirements:

- ✅ No include-related code remains in codebase
- ✅ Clear separation between convenience matchers and installation pipeline
- ✅ Modular multi-context execution
- ✅ Reusable name generation logic
- ✅ Comprehensive test coverage (>80% for new code)
- ✅ Updated documentation

### Performance Requirements:

- ✅ Multi-resource installation completes in reasonable time (sequential acceptable)
- ✅ No unnecessary file system operations
- ✅ Efficient workspace index updates (batched writes)
