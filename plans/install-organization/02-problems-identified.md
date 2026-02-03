# Problems Identified

## Architectural Issues

### P1: Responsibility Confusion
The `install.ts` command file (~588 lines) mixes:
- CLI option parsing and validation
- Source type routing logic  
- Package loading orchestration
- Base detection result processing
- Ambiguity resolution prompting
- Marketplace orchestration
- Convenience filter application
- Multi-context dispatch

**Impact**: Hard to test individual concerns; changes ripple unpredictably.

### P2: Duplicate Loading Paths
Git packages are loaded in the command layer (`loader.load()`), then the pipeline's `loadPackagePhase()` may re-load. This wastes I/O and creates inconsistent state.

**Current flow**:
```
installResourceCommand() → loader.load() → updates context.source
                     ↓
runUnifiedInstallPipeline() → loadPackagePhase() → loads again?
```

### P3: Legacy/Resource Model Bifurcation
Two code paths (`installResourceCommand` vs `installLegacyCommand`) exist with overlapping logic:
- Both load git packages
- Both check for marketplaces
- Both create resolved packages
- Both call the same pipeline

The try/catch fallback pattern (lines 105-120) is brittle.

### P4: Marketplace Handling is Scattered
`handleMarketplaceInstallation()` is invoked from 3 locations with duplicate detection logic. The pipeline itself returns an error if marketplace is detected—indicating the caller should have intercepted earlier.

### P5: Mutable Context Anti-Pattern
`InstallationContext` is mutated throughout command execution:
- `source.packageName`, `source.contentRoot`, etc. are updated post-creation
- `detectedBase`, `matchedPattern`, `baseSource` are added conditionally
- `_commitSha` is stored as `any` property

This makes it hard to reason about context state at any given point.

### P6: Option Type Leakage
`(options as any).agents` and `(options as any).skills` appear because `InstallOptions` doesn't include these fields. The workaround propagates through multiple functions.

### P7: Inline Imports
Dynamic imports (`await import(...)`) are used mid-function:
- Line 199: `import('fs/promises')`
- Lines 299-304: marketplace handler imports
- Line 304: spinner import

This obscures dependencies and complicates testing.

## Structural Issues

### S1: File Too Large
At ~588 lines with 10+ functions, `install.ts` violates single-responsibility.

### S2: Helper Functions Mixed with Business Logic
Validation functions (`assertTargetDirOutsideMetadata`, `validateResolutionFlags`, `normalizePluginsOption`) are defined in the command file rather than dedicated validators.

### S3: No Clear Strategy Pattern
Different source types (git, path, registry) have different preprocessing needs but share much logic. No abstraction captures this.

### S4: Console Output in Business Logic
`console.log` and `console.error` calls are embedded throughout, making output behavior hard to customize or test.

## Flow Issues

### F1: Branching Complexity
`installCommand()` has nested conditionals:
```
if (!packageInput) → bulk
else if (shouldTryResourceParsing) → try/catch resource vs legacy
else → legacy
```

### F2: Path Scoping Logic is Inline
Lines 189-210 contain intricate path manipulation that should be a separate utility.

### F3: Ambiguity Prompting Breaks Flow
`handleAmbiguousBase()` returns a modified context, mixing data transformation with user interaction.

### F4: Error Aggregation is Inconsistent
Some errors throw, some return `{ success: false }`, some add to `context.errors[]`.
