# File Mapping: Current → Proposed

## Functions Moving Out of install.ts

| Current Function | New Location | Notes |
|------------------|--------------|-------|
| `assertTargetDirOutsideMetadata()` | `validators/target-validator.ts` | Pure validation |
| `validateResolutionFlags()` | `validators/options-validator.ts` | Pure validation |
| `normalizePluginsOption()` | `preprocessing/options-normalizer.ts` | Option normalization |
| `installCommand()` | `orchestrator.ts` | Becomes `execute()` |
| `installResourceCommand()` | Split across strategies | Git strategy gets bulk of logic |
| `installLegacyCommand()` | **Deleted** | Unified into strategies |
| `handleAmbiguousBase()` | `handlers/ambiguity-handler.ts` | User interaction |
| `handleMarketplaceInstallation()` | `handlers/marketplace-handler.ts` | Enhanced existing |
| `runBulkInstall()` | `strategies/bulk-strategy.ts` | Or `orchestrator.ts` |

## New Files to Create

```
src/core/install/
├── orchestrator.ts                           # Main orchestrator class
├── preprocessing/
│   ├── input-classifier.ts                   # Unified input classification
│   ├── options-normalizer.ts                 # Option normalization
│   └── base-resolver.ts                      # Base detection processing
├── strategies/
│   ├── index.ts                              # Strategy factory
│   ├── base-strategy.ts                      # Interface + abstract base
│   ├── git-strategy.ts                       # Git source handling
│   ├── path-strategy.ts                      # Local path handling
│   ├── registry-strategy.ts                  # Registry source handling
│   └── bulk-strategy.ts                      # Bulk install handling
├── validators/
│   ├── index.ts                              # Re-exports
│   ├── target-validator.ts                   # Target dir validation
│   └── options-validator.ts                  # Options validation
└── handlers/
    └── ambiguity-handler.ts                  # Ambiguous base prompts

src/types/
└── install-options.ts                        # Extended option types (or in index.ts)
```

## Existing Files to Modify

| File | Changes |
|------|---------|
| `src/commands/install.ts` | Reduce to CLI definition, call orchestrator |
| `src/core/install/marketplace-handler.ts` | Accept context, own spinner |
| `src/core/install/unified/pipeline.ts` | Remove marketplace check, simplify |
| `src/core/install/unified/phases/load-package.ts` | Skip if pre-loaded |
| `src/core/install/unified/context.ts` | Document immutability contract |
| `src/types/index.ts` | Add agents/skills/plugins to InstallOptions |

## Existing Files to Consider Moving

These files are related and might benefit from reorganization:

| Current Location | Consideration |
|------------------|---------------|
| `src/utils/resource-arg-parser.ts` | Move to `preprocessing/` or keep |
| `src/core/install/ambiguity-prompts.ts` | Merge into `handlers/ambiguity-handler.ts` |
| `src/core/install/convenience-matchers.ts` | Move to `preprocessing/convenience-filter.ts` |
| `src/core/install/base-detector.ts` | Keep, used by strategies |

## Import Dependency Changes

### install.ts (After Refactor)

```typescript
// FROM: 18 imports
// TO: ~5 imports
import { Command } from 'commander';
import type { InstallOptions } from '../types/index.js';
import { withErrorHandling } from '../utils/errors.js';
import { InstallOrchestrator } from '../core/install/orchestrator.js';
import { normalizeInstallOptions } from '../core/install/preprocessing/options-normalizer.js';
```

### orchestrator.ts (New)

```typescript
import type { NormalizedInstallOptions, PreprocessResult } from './types.js';
import type { InstallationContext } from './unified/context.js';
import { classifyInput } from './preprocessing/input-classifier.js';
import { validateTarget, validateOptions } from './validators/index.js';
import { getStrategy } from './strategies/index.js';
import { handleMarketplace } from './handlers/marketplace-handler.js';
import { handleAmbiguity } from './handlers/ambiguity-handler.js';
import { runUnifiedInstallPipeline } from './unified/pipeline.js';
import { runMultiContextPipeline } from './unified/multi-context-pipeline.js';
```

## Deleted Code

The following will be removed entirely:
- `installLegacyCommand()` function (~50 lines)
- Duplicate marketplace detection blocks
- Inline path scoping logic (moved to base-resolver)
- `(options as any)` casts
