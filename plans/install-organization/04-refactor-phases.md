# Refactor Phases

## Phase 1: Type Foundation

**Goal**: Establish proper types for options and preprocessing results.

**Tasks**:
1. Add `agents`, `skills`, `plugins` to `InstallOptions` interface in `types/index.ts`
2. Create `NormalizedInstallOptions` interface
3. Create `PreprocessResult` interface
4. Create `InputClassification` interface (extend existing if present)

**Files affected**:
- `src/types/index.ts`
- `src/core/install/types.ts` (new interfaces)

**Outcome**: Remove all `(options as any)` casts from codebase.

---

## Phase 2: Extract Validators

**Goal**: Move validation logic to dedicated modules.

**Tasks**:
1. Create `validators/target-validator.ts` with `assertTargetDirOutsideMetadata()`
2. Create `validators/options-validator.ts` with `validateResolutionFlags()`
3. Create `preprocessing/options-normalizer.ts` with:
   - `normalizePluginsOption()`
   - `normalizeConflictStrategy()`
   - `normalizePlatforms()` (re-export)
   - `normalizeInstallOptions()` (orchestrating function)

**Files affected**:
- Create `src/core/install/validators/` directory
- Create `src/core/install/preprocessing/options-normalizer.ts`
- Update `src/commands/install.ts` to import from new locations

---

## Phase 3: Create Orchestrator Shell

**Goal**: Introduce orchestrator with existing logic moved, no behavior change.

**Tasks**:
1. Create `orchestrator.ts` with `InstallOrchestrator` class
2. Move `installCommand()` body into `orchestrator.execute()`
3. Keep existing branching logic temporarily
4. Update command to instantiate and call orchestrator

**Files affected**:
- Create `src/core/install/orchestrator.ts`
- Update `src/commands/install.ts` (~80 lines after)

---

## Phase 4: Implement Input Classification

**Goal**: Unify input classification at orchestrator entry.

**Tasks**:
1. Create `preprocessing/input-classifier.ts`
2. Consolidate logic from `classifyPackageInput()` and `parseResourceArg()`
3. Return unified `InputClassification` with:
   - `type`: 'bulk' | 'git' | 'path' | 'registry'
   - `resourceSpec?`: Parsed details
   - `features`: { hasResourcePath, hasConvenienceFilters }

**Files affected**:
- Create `src/core/install/preprocessing/input-classifier.ts`
- Update `orchestrator.ts` to use classifier

---

## Phase 5: Implement Strategies

**Goal**: Create strategy pattern for source-specific handling.

**Tasks**:
1. Create `strategies/base-strategy.ts` with interface
2. Create `strategies/git-strategy.ts`:
   - `buildContext()`: Create git context
   - `preprocess()`: Load, detect base, check marketplace
3. Create `strategies/path-strategy.ts`
4. Create `strategies/registry-strategy.ts`
5. Create `strategies/bulk-strategy.ts`
6. Create `strategies/index.ts` factory

**Files affected**:
- Create `src/core/install/strategies/` with all files
- Update `orchestrator.ts` to use strategy factory

---

## Phase 6: Consolidate Preprocessing

**Goal**: Move base resolution and convenience filtering to preprocessing layer.

**Tasks**:
1. Create `preprocessing/base-resolver.ts`:
   - `applyBaseDetection()`: Process baseDetection results
   - `computePathScoping()`: Handle resourceSpec.path scoping
2. Move `applyConvenienceFilters()` call into preprocessing
3. Strategy.preprocess() returns fully resolved context + specialHandling flag

**Files affected**:
- Create `src/core/install/preprocessing/base-resolver.ts`
- Update strategies to use preprocessing
- Update existing `convenience-matchers.ts` if needed

---

## Phase 7: Create Ambiguity Handler

**Goal**: Extract user prompting for ambiguous bases.

**Tasks**:
1. Create `handlers/ambiguity-handler.ts`:
   - `resolveAmbiguity(matches, context, options)`: Prompt or auto-select
   - Returns resolved context with selected base
2. Move `handleAmbiguousBase()` logic to handler
3. Orchestrator routes to handler when `specialHandling === 'ambiguous'`

**Files affected**:
- Create `src/core/install/handlers/ambiguity-handler.ts`
- Update `orchestrator.ts` routing
- Delete `handleAmbiguousBase()` from command

---

## Phase 8: Enhance Marketplace Handler

**Goal**: Marketplace handler receives context directly from orchestrator.

**Tasks**:
1. Update `marketplace-handler.ts` to accept `InstallationContext`
2. Move spinner/UI logic inside handler
3. Orchestrator routes to handler when `specialHandling === 'marketplace'`
4. Remove marketplace checks from pipeline

**Files affected**:
- Update `src/core/install/marketplace-handler.ts`
- Update `orchestrator.ts`
- Update `unified/pipeline.ts` (remove marketplace error)

---

## Phase 9: Remove Legacy Path

**Goal**: Delete `installLegacyCommand()` and related branching.

**Tasks**:
1. Verify all legacy scenarios work through new strategies
2. Delete `installLegacyCommand()` function
3. Remove try/catch fallback in orchestrator
4. Simplify orchestrator flow

**Prerequisite**: All tests passing with strategies.

---

## Phase 10: Pipeline Cleanup

**Goal**: Simplify pipeline now that context is complete.

**Tasks**:
1. Remove or make `loadPackagePhase()` conditional (skip if already loaded)
2. Ensure pipeline doesn't mutate source
3. Add assertion that context is complete at pipeline entry

**Files affected**:
- Update `unified/pipeline.ts`
- Update `unified/phases/load-package.ts`

---

## Phase 11: Final Cleanup

**Goal**: Code quality and consistency.

**Tasks**:
1. Remove inline dynamic imports; move to module level
2. Remove unused imports from `install.ts`
3. Update README documentation
4. Add JSDoc to new modules
5. Ensure consistent error handling (throw vs return)

---

## Success Criteria

- `install.ts` is ≤100 lines (CLI definition only)
- No `(any)` casts for options
- Marketplace detection in one location
- Package loading happens once per install
- Each source type has dedicated strategy
- All existing tests pass
- No behavior changes for users
