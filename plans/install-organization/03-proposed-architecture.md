# Proposed Architecture

## Design Principles

1. **Single Entry Point**: One command handler delegates to orchestrator
2. **Separation of Concerns**: CLI parsing, orchestration, execution are distinct
3. **Immutable Context Creation**: Build complete context before pipeline
4. **Strategy Pattern for Sources**: Source-specific logic in dedicated handlers
5. **Centralized Marketplace Detection**: One place decides if marketplace

## New Module Structure

```
src/commands/
├── install.ts                    # CLI definition only (~80 lines)
│
src/core/install/
├── orchestrator.ts               # NEW: Main entry orchestrator
├── strategies/                   # Source-type strategies
│   ├── index.ts
│   ├── base-strategy.ts          # Abstract base
│   ├── registry-strategy.ts
│   ├── git-strategy.ts
│   ├── path-strategy.ts
│   └── bulk-strategy.ts
├── handlers/                     # NEW: Special case handlers
│   ├── marketplace-handler.ts    # (existing, enhanced)
│   └── ambiguity-handler.ts      # NEW: User prompts for ambiguous bases
├── preprocessing/                # NEW: Context preparation
│   ├── options-normalizer.ts
│   ├── input-classifier.ts
│   ├── base-resolver.ts          # Base detection result processing
│   └── convenience-filter.ts     # --agents/--skills processing
├── unified/                      # (existing pipeline)
└── validators/                   # NEW: Input validation
    ├── target-validator.ts
    └── options-validator.ts
```

## Core Abstractions

### 1. InstallOrchestrator

Central coordinator that:
- Classifies input → selects strategy
- Builds complete context via strategy
- Handles special cases (marketplace, ambiguity)
- Delegates to pipeline

```
interface InstallOrchestrator {
  execute(input: string | undefined, options: NormalizedInstallOptions): Promise<CommandResult>
}
```

### 2. InstallStrategy

Source-type-specific context building:

```
interface InstallStrategy {
  canHandle(classification: InputClassification): boolean
  buildContext(classification: InputClassification, options: NormalizedInstallOptions): Promise<InstallationContext>
  preprocess(context: InstallationContext): Promise<PreprocessResult>
}
```

### 3. PreprocessResult

Captures what the strategy discovered:

```
interface PreprocessResult {
  context: InstallationContext    // Fully prepared, immutable
  specialHandling?: 'marketplace' | 'ambiguous' | 'multi-resource'
  marketplaceManifest?: MarketplaceManifest
  ambiguousMatches?: BaseMatch[]
  resourceSpecs?: ResourceInstallationSpec[]
}
```

### 4. NormalizedInstallOptions

Properly typed options including all CLI flags:

```
interface NormalizedInstallOptions extends InstallOptions {
  agents?: string[]
  skills?: string[]
  plugins?: string[]
  resolutionMode: 'local' | 'remote' | 'auto'
  conflictStrategy: ConflictStrategy
}
```

## Control Flow

```
┌────────────────────────────────────────────────────────────────┐
│                     setupInstallCommand()                       │
│  - Define CLI options                                           │
│  - Parse/normalize options via options-normalizer               │
│  - Validate via validators                                      │
│  - Call orchestrator.execute()                                  │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│                     InstallOrchestrator                         │
│  1. Classify input (bulk | git | path | registry)              │
│  2. Select strategy based on classification                    │
│  3. strategy.buildContext() → base context                     │
│  4. strategy.preprocess() → load, detect base, check special   │
│  5. Route based on PreprocessResult:                           │
│     - marketplace → marketplaceHandler.install()               │
│     - ambiguous → ambiguityHandler.resolve() → pipeline        │
│     - multi-resource → multiContextPipeline()                  │
│     - normal → unifiedPipeline()                               │
└────────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
   Marketplace          Ambiguity           Pipeline
     Handler             Handler           (unified)
```

## Key Changes

### Remove Legacy Path
Eliminate `installLegacyCommand()` entirely. All inputs flow through the same orchestrator; source strategies handle differences.

### Consolidate Loading
Loading happens once, in `strategy.preprocess()`. The pipeline's `loadPackagePhase()` becomes a no-op if context already has loaded data, or is removed.

### Centralize Marketplace Detection
`strategy.preprocess()` returns `specialHandling: 'marketplace'`. Orchestrator routes to marketplace handler. No marketplace checks in pipeline.

### Immutable Context After Preprocess
After `preprocess()` returns, context is frozen. Pipeline phases read but don't mutate source.

### Proper Option Types
Define `NormalizedInstallOptions` with all flags. Normalize once at CLI boundary.
