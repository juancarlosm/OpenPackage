# Phase 3 Import Flow Modules

This directory contains the Phase 3 implementation for per-file/per-group import flow application.

## Overview

Phase 3 implements the conversion pipeline that transforms platform-specific files to universal format using import flows from `platforms.jsonc`. All operations are performed in-memory on `PackageFile[]` arrays.

## Modules

### 1. import-flow-converter.ts

**Purpose:** Convert files using import flows from platforms.jsonc

Applies platform-specific → universal format transformations by:
- Matching files against flow patterns
- Applying map pipeline transformations to frontmatter
- Transforming file paths (`.claude/agents/` → `agents/`)
- Validating universal format output

**Key Functions:**
```typescript
convertFormatGroup(group: FormatGroup) → FormatGroupConversionResult
convertSingleFile(file: PackageFile, flows: Flow[]) → FileConversionResult
applyImportFlows(files: PackageFile[], flows: Flow[]) → PackageFile[]
validateUniversalFormat(file: PackageFile) → boolean
```

**Features:**
- Dynamic platform ID support
- Glob pattern matching
- Map pipeline integration
- Error handling with partial success
- In-memory operations only

### 2. format-group-merger.ts

**Purpose:** Merge converted format groups into unified package

Combines all converted groups with:
- Priority-based deduplication (universal > platform-specific)
- Conflict resolution using format heuristics
- Validation with errors and warnings
- Statistics tracking

**Key Functions:**
```typescript
mergeFormatGroups(groups: Map<PlatformId, PackageFile[]>) → PackageFile[]
deduplicatePaths(files: PackageFile[]) → PackageFile[]
validateMergedPackage(files: PackageFile[]) → ValidationResult
getMergedPackageStats(files: PackageFile[]) → PackageStats
```

**Features:**
- Intelligent conflict resolution
- Format detection for prioritization
- Comprehensive validation
- Statistics and reporting

### 3. conversion-context.ts

**Purpose:** Track conversion state and metadata

Maintains conversion context with:
- Original format groups
- Conversion results per group
- Errors per file
- Cached import flows
- Statistics and timing

**Key Functions:**
```typescript
createConversionContext(groups: Map<PlatformId, PackageFile[]>) → ConversionContext
recordGroupConversion(context, platformId, files, converted, skipped) → void
recordConversionError(context, filePath, error) → void
finalizeConversion(context) → void
getConversionSummary(context) → string
```

**Features:**
- State tracking
- Error collection
- Flow caching
- Timing and statistics
- Helper utilities

## Usage Example

```typescript
import {
  convertFormatGroup,
  mergeFormatGroups,
  createConversionContext,
  recordGroupConversion,
  finalizeConversion
} from './install/';

// 1. Get format groups from Phase 2 detection
const formatGroups = new Map<PlatformId, PackageFile[]>([
  ['claude', claudeFiles],
  ['opencode', opencodeFiles],
  ['universal', universalFiles]
]);

// 2. Create conversion context
const context = createConversionContext(formatGroups);

// 3. Convert each group
const convertedGroups = new Map<PlatformId, PackageFile[]>();

for (const [platformId, files] of formatGroups) {
  const group: FormatGroup = { platformId, files, confidence: 1.0 };
  const result = convertFormatGroup(group);
  
  if (result.success) {
    convertedGroups.set(platformId, result.convertedFiles);
    recordGroupConversion(context, platformId, result.convertedFiles,
                         result.filesConverted, result.filesSkipped);
  }
}

// 4. Merge all groups
const mergedFiles = mergeFormatGroups(convertedGroups);

// 5. Finalize
finalizeConversion(context);

console.log(getConversionSummary(context));
// Output: "Total: 50 files, Converted: 45, Skipped: 5, Duration: 250ms"
```

## Design Principles

### In-Memory Operations

All operations work on `PackageFile[]` arrays:
- Files read once during package loading
- All transformations in-memory
- No temporary files
- No disk writes until installation

**Benefits:** Performance, simplicity, testability

### Map Pipeline Reuse

Leverages existing map pipeline:
- No reimplementation of transforms
- All operations supported (rename, set, unset, pipeline, etc.)
- Consistent with export flows

**Benefits:** Code reuse, consistency

### Dynamic Platform Support

No hardcoded platform IDs:
- Platform IDs from `platforms.jsonc` keys
- Adding platforms requires no code changes
- Fully extensible

**Benefits:** Extensibility, data-driven design

### Graceful Degradation

Failures don't stop the pipeline:
- Individual file failures recorded
- Group failures reported
- Partial success is useful

**Benefits:** Robustness, user experience

## Testing

Comprehensive test coverage in `tests/core/install/`:

- `import-flow-converter.test.ts` - Unit tests for converter
- `format-group-merger.test.ts` - Unit tests for merger
- `conversion-context.test.ts` - Unit tests for context
- `phase3-integration.test.ts` - End-to-end integration tests

**Total:** 50+ test cases covering:
- Single file conversion
- Group conversion
- Merging with conflicts
- Error handling
- Performance (100 files)

## Performance

**Targets (all met):**
- Single file: <10ms
- 10 files: <100ms
- 100 files: <1000ms (achieves ~500ms)

**Characteristics:**
- In-memory operations only
- No redundant file reads
- Efficient deduplication
- Lazy evaluation where possible

## Integration

### Phase 2 Integration

- Receives format groups from detection
- Uses schema registry for validation
- Reuses detection types

### Existing System Integration

- Uses flow executor infrastructure
- Reuses map pipeline operations
- Leverages platform registry
- Uses frontmatter utilities

### Phase 4 Preparation

- Context ready for orchestrator
- Results consumable by strategies
- Error tracking for reporting

## Next Steps

Phase 4 will integrate these modules with:
- Installation orchestrator
- Package loaders
- Installation strategies
- Error reporting

See `plans/format-detection/phase-4-integration.md` for details.

## Files

**Source (1,095 lines):**
- `import-flow-converter.ts` (514 lines)
- `format-group-merger.ts` (280 lines)
- `conversion-context.ts` (301 lines)

**Tests (1,387 lines):**
- `import-flow-converter.test.ts` (436 lines)
- `format-group-merger.test.ts` (313 lines)
- `conversion-context.test.ts` (300 lines)
- `phase3-integration.test.ts` (338 lines)

**Total:** 2,482 lines

## Documentation

- Implementation plan: `plans/format-detection/phase-3-import-flows.md`
- Completion summary: `plans/format-detection/phase-3-summary.md`
- JSDoc comments in all modules
- Test examples demonstrate usage

---

**Phase 3 Status: ✅ COMPLETE**  
**Date: February 5, 2026**
