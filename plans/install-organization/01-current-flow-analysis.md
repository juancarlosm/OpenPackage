# Current Install Command Flow Analysis

## Entry Point: `setupInstallCommand()`

```
setupInstallCommand()
└── .action() handler
    ├── Normalize options (platforms, plugins, conflicts)
    └── installCommand(packageInput, options)
```

## Main Handler: `installCommand()`

```
installCommand(packageInput, options)
├── Validate inputs
│   ├── assertTargetDirOutsideMetadata()
│   └── validateResolutionFlags()
├── Set resolution mode
│   └── determineResolutionMode()
│
├── BRANCH: No input (bulk install)
│   ├── buildInstallContext(cwd, undefined, options)
│   │   └── buildBulkInstallContexts()
│   └── runBulkInstall(contexts)
│
├── BRANCH: Has convenience options OR git-style input
│   └── TRY installResourceCommand()
│       ├── parseResourceArg()
│       ├── buildResourceInstallContext()
│       ├── loader.load()
│       ├── Update context with loaded info
│       ├── IF marketplace → handleMarketplaceInstallation()
│       ├── IF baseDetection.ambiguous → handleAmbiguousBase()
│       ├── IF resourceSpec.path → Scope pattern
│       ├── IF agents/skills options → applyConvenienceFilters()
│       │   └── runMultiContextPipeline()
│       └── ELSE → runUnifiedInstallPipeline()
│   └── CATCH: fallback to legacy if no convenience options
│
└── FALLBACK: installLegacyCommand()
    ├── buildInstallContext()
    ├── IF git → loader.load() + marketplace check
    └── runUnifiedInstallPipeline()
```

## Pipeline: `runUnifiedInstallPipeline()`

```
runUnifiedInstallPipeline(context)
├── Phase 0: createWorkspacePackageYml() (install mode only)
├── Phase 1: loadPackagePhase()
├── Phase 2: resolveDependenciesPhase() (conditional)
├── Phase 3: processConflictsPhase()
├── Phase 4: executeInstallationPhase()
├── Phase 5: updateManifestPhase() (conditional)
└── Phase 6: reportResultsPhase()
```

## Key Observations

### 1. Dual Pathway Problem
The command maintains two parallel flows:
- **Resource Model** (`installResourceCommand`) - newer, supports `--agents`/`--skills`
- **Legacy Model** (`installLegacyCommand`) - older, simpler path

Both ultimately call the same pipeline but with different context preparation.

### 2. Loading Happens Twice
For git sources, package loading occurs:
1. In `installResourceCommand()` via `loader.load()`
2. Again in `loadPackagePhase()` within the pipeline

### 3. Marketplace Detection is Scattered
Marketplace handling appears in multiple locations:
- `installResourceCommand()` lines 156-158 (early check)
- `installResourceCommand()` lines 169-171 (baseDetection check)
- `installLegacyCommand()` lines 302-304
- `runUnifiedInstallPipeline()` lines 42-47 (error case)

### 4. Base Detection Logic is Split
Base detection happens in:
- `GitSourceLoader.load()` (source layer)
- `installResourceCommand()` (command layer) - processes results
- `handleAmbiguousBase()` (command layer) - user prompts

### 5. Context Mutation During Command
The context object is mutated extensively in `installResourceCommand()`:
- Lines 144-147: Update source with loaded info
- Lines 149-152: Store commitSha
- Lines 163-184: Apply base detection results
- Lines 189-210: Apply path scoping
- Lines 239: Build resource contexts

### 6. Type Casting to `any`
Multiple `(options as any).agents` patterns suggest type definitions are incomplete.
