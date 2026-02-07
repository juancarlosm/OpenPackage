# Phase 3: Per-File Import Flow Application

## Status: ✅ COMPLETE (February 5, 2026)

See [phase-3-summary.md](./phase-3-summary.md) for completion details.

## Overview

Build the conversion pipeline that applies import flows to files based on their detected format. This phase transforms platform-specific files to universal format in-memory, preparing them for standard export flow processing.

**Planned Duration:** 2-3 days  
**Actual Duration:** ~3 hours

## Goals

1. Apply import flows per file or per format group
2. Transform platform-specific formats to universal format
3. Handle all file operations in-memory (no disk I/O)
4. Preserve file metadata through transformation
5. Support all platform formats defined in `platforms.jsonc`
6. Merge converted files into unified package structure

## Technical Overview

### Conversion Pipeline Architecture

```
Format Groups (from Phase 2)
  ↓
Per-Group Conversion
  ├─ Load import flows for group's format
  ├─ Apply flow transformations to each file
  └─ Convert to universal format
  ↓
Merge All Groups
  ↓
Unified Universal Format Package
```

### Import Flow Application Strategy

#### Group-Based Conversion

Files are converted in format groups to optimize flow loading:

**Conversion Process per Group:**

1. **Load Import Flows**
   - Read platform definition from `platforms.jsonc`
   - Extract import flows for detected format
   - Validate flow definitions

2. **Apply Flow Transformations**
   - For each file in group:
     - Match file path against flow patterns
     - Apply matched flow transformations
     - Transform frontmatter using map operations
     - Convert to universal format structure

3. **Validate Conversion**
   - Ensure file is now in universal format
   - Verify frontmatter schema is universal
   - Check for conversion errors

4. **Collect Converted Files**
   - Add to unified package file array
   - Preserve original file metadata
   - Mark as converted

#### Flow Matching

Use existing flow matching logic from flow execution coordinator:

**Pattern Matching:**
- Match file path against flow's `from` pattern
- Support glob patterns (`agents/**/*.md`)
- Handle multiple flows per file
- Apply flows in order defined

**Map Operation Execution:**
- Execute map operations on frontmatter
- Support all map operation types (rename, pipeline, switch, etc.)
- Handle bidirectional transformations

#### Transformation Types

**Frontmatter Transformations:**

1. **Tools Field Conversion**
   - String format → Array format
   - Object format → Array format
   - Example: `"Read, Write"` → `[read, write]`

2. **Model Field Conversion**
   - Shorthand → Prefixed format
   - Provider format → Standard format
   - Example: `sonnet` → `anthropic/claude-3-5-sonnet-20241022`

3. **Permission Field Conversion**
   - permissionMode → permissions object
   - Platform-specific → Universal structure
   - Example: `"default"` → `{ edit: "ask", bash: "ask" }`

4. **Platform-Specific Field Handling**
   - Preserve fields not in universal spec
   - Mark as platform-specific metadata
   - Enable round-trip conversion

**Path Transformations:**

- Platform-specific paths → Universal paths
- Example: `.claude/agents/agent.md` → `agents/agent.md`
- Example: `.cursor/commands/cmd.md` → `commands/cmd.md`

### In-Memory Transformation

All operations on PackageFile array in-memory:

**No Disk I/O:**
- Read files once during package loading
- All transformations on file content strings
- No temporary files created
- No disk writes until final installation

**Transformation Flow:**

```
PackageFile[] (original format)
  ↓
Parse frontmatter (in-memory)
  ↓
Apply map transformations (in-memory)
  ↓
Serialize frontmatter (in-memory)
  ↓
PackageFile[] (universal format)
```

### Merge Strategy

After all groups converted, merge into single package:

**Merge Process:**

1. **Collect All Converted Files**
   - Combine files from all format groups
   - Maintain file path uniqueness
   - Preserve file order where possible

2. **Deduplicate Paths**
   - If same path from multiple groups, use priority:
     - Universal format (highest)
     - Most specific platform format
     - Most recent conversion

3. **Create Unified Package**
   - All files in universal format
   - Ready for standard export flows
   - Metadata preserved

## Modules to Create

### 1. Import Flow Converter

**Location:** `src/core/install/import-flow-converter.ts`

**Purpose:** Convert files using import flows from platforms.jsonc

**Key Functions:**

- `convertFormatGroup(group: FormatGroup, platform: Platform)` → PackageFile[]
  - Converts all files in a format group
  - Loads import flows for platform
  - Returns converted files in universal format

- `applyImportFlows(files: PackageFile[], flows: Flow[])` → PackageFile[]
  - Applies import flows to file array
  - Matches files to flows
  - Returns transformed files

- `convertSingleFile(file: PackageFile, flow: Flow)` → PackageFile
  - Converts single file using flow
  - Applies map transformations
  - Returns universal format file

### 2. Flow Transformer

**Location:** `src/core/install/flow-transformer.ts`

**Purpose:** Execute flow transformations on files

**Key Functions:**

- `transformFrontmatter(frontmatter: any, mapOps: MapOperation[])` → any
  - Applies map operations to frontmatter
  - Executes all transformation types
  - Returns transformed frontmatter

- `transformPath(path: string, fromPattern: string, toPattern: string)` → string
  - Transforms file path using patterns
  - Handles glob pattern matching
  - Returns universal path

- `validateUniversalFormat(file: PackageFile)` → boolean
  - Validates file is in universal format
  - Checks frontmatter schema
  - Returns validation result

### 3. Format Group Merger

**Location:** `src/core/install/format-group-merger.ts`

**Purpose:** Merge converted format groups into unified package

**Key Functions:**

- `mergeFormatGroups(groups: Map<PlatformId, PackageFile[]>)` → PackageFile[]
  - Merges all format groups (keyed by dynamic platform ID)
  - Handles path conflicts
  - Returns unified file array

- `deduplicatePaths(files: PackageFile[])` → PackageFile[]
  - Removes duplicate paths
  - Uses priority ordering
  - Returns deduplicated files

- `validateMergedPackage(files: PackageFile[])` → ValidationResult
  - Validates merged package structure
  - Checks for conflicts
  - Returns validation result

### 4. Conversion Context

**Location:** `src/core/install/conversion-context.ts`

**Purpose:** Track conversion state and metadata

**Context Structure:**

```typescript
// Dynamic platform ID from platforms.jsonc keys
type PlatformId = string;

interface ConversionContext {
  // Original format groups (keyed by dynamic platform ID)
  formatGroups: Map<PlatformId, PackageFile[]>;
  
  // Conversion results per group
  convertedGroups: Map<PlatformId, PackageFile[]>;
  
  // Conversion errors per file
  errors: Map<string, Error>;
  
  // Conversion metadata
  metadata: {
    totalFiles: number;
    convertedFiles: number;
    skippedFiles: number;
    failedFiles: number;
  };
  
  // Platform import flows cache (keyed by dynamic platform ID)
  importFlowsCache: Map<PlatformId, Flow[]>;
}
```

## Integration Points

### Phase 2 Integration

- Receive format groups from enhanced package detector
- Use EnhancedPackageFormat as input
- Process each format group independently

### Flow System Integration

- Reuse flow execution coordinator logic
- Use existing flow matching algorithms
- Leverage map operation executors from flow system

### Platform Configuration

- Load import flows from `platforms.jsonc`
- Parse flow definitions per platform (including schema references)
- Use matched flow from Phase 1/2 detection for conversion
- Cache flows for repeated use

### Schema Integration

- Detection result includes `matchedFlow` from schema scoring
- Use the same flow for conversion (consistent detection → conversion)
- Flow's `from.schema` validated source format
- Flow's `to.schema` defines target format (universal)

## Testing Strategy

### Unit Tests

**Location:** `tests/core/install/import-flow-converter.test.ts`

**Test Categories:**

1. **Single File Conversion**
   - Claude format agent → Universal format
   - OpenCode format agent → Universal format
   - Cursor format rule → Universal format
   - No conversion needed (already universal)

2. **Format Group Conversion**
   - Convert entire Claude format group
   - Convert entire OpenCode format group
   - Handle empty groups
   - Handle conversion errors

3. **Frontmatter Transformation**
   - Tools field transformation (all formats)
   - Model field transformation (all formats)
   - Permission field transformation (all formats)
   - Platform-specific field preservation

4. **Path Transformation**
   - Platform-specific → Universal paths
   - Glob pattern matching
   - Nested directory structures

5. **Group Merging**
   - Merge multiple format groups
   - Handle path conflicts
   - Deduplicate correctly
   - Preserve file order

### Integration Tests

**Location:** `tests/core/install/format-conversion-integration.test.ts`

**Test Scenarios:**

1. **End-to-End Conversion**
   - Detect format → Convert → Validate result
   - Mixed format package conversion
   - Real-world platform formats

2. **Round-Trip Conversion**
   - Platform → Universal → Platform
   - Verify semantic preservation
   - Check for data loss

3. **Error Recovery**
   - Malformed frontmatter handling
   - Invalid flow definitions
   - Partial conversion success

### Test Fixtures

```
tests/fixtures/format-conversion/
  input/
    claude-format/
      agents/
        agent1.md              # Claude format
        agent2.md              # Claude format
    opencode-format/
      agents/
        agent1.md              # OpenCode format
    mixed-format/
      agents/
        claude-agent.md        # Claude
        opencode-agent.md      # OpenCode
  
  expected/
    universal/
      agents/
        agent1.md              # Universal format
        agent2.md              # Universal format
```

## Validation Requirements

### Conversion Accuracy

- Frontmatter transformations preserve semantics
- Tools arrays contain correct tools
- Model fields map correctly
- Permissions structures equivalent
- No data loss during conversion

### Format Validation

- Converted files pass universal format validation
- Frontmatter schema matches universal spec
- File paths follow universal conventions
- All required fields present

### Performance

- Single file conversion: <10ms
- Format group (10 files): <100ms
- Large package (100 files): <1000ms
- In-memory operations only

### Error Handling

- Graceful handling of conversion errors
- Partial conversion success (skip failed files)
- Clear error messages with context
- Recovery strategies for common errors

## Deliverables

### Code

- ✅ Import flow converter module (`src/core/install/import-flow-converter.ts`)
- ✅ Flow transformer module (integrated via map pipeline)
- ✅ Format group merger module (`src/core/install/format-group-merger.ts`)
- ✅ Conversion context module (`src/core/install/conversion-context.ts`)
- ✅ Validation utilities (included in merger)

### Tests

- ✅ Unit tests for import flow converter (`tests/core/install/import-flow-converter.test.ts`)
- ✅ Unit tests for format group merger (`tests/core/install/format-group-merger.test.ts`)
- ✅ Unit tests for conversion context (`tests/core/install/conversion-context.test.ts`)
- ⏳ Integration tests for end-to-end conversion (Phase 4)
- ⏳ Round-trip conversion tests (Phase 5)
- ⏳ Performance benchmarks (Phase 5)

### Documentation

- ✅ Module documentation (JSDoc in all modules)
- ✅ Conversion algorithm documentation (in module comments)
- ⏳ Platform support matrix (Phase 6)
- ⏳ Error handling guide (Phase 6)

## Success Criteria

✅ Import flows applied correctly per format  
✅ Frontmatter transformations preserve semantics (map pipeline reused)  
✅ All platform formats convert to universal (converter supports dynamic platform IDs)  
✅ Format groups merge without conflicts (deduplication with priority rules)  
✅ In-memory operations only (no disk I/O - all operations on PackageFile[])  
⏳ Performance targets met (<1s for 100 files) - will verify in Phase 5  
⏳ All tests pass - Phase 3 unit tests created, integration tests in Phase 4  
⏳ Test coverage >90% - will measure after Phase 4  
⏳ Round-trip conversions preserve data - Phase 5 validation

## Next Phase

Phase 4 will integrate the conversion pipeline with existing installation orchestrator, loaders, and strategies.
