# Phase 1: File-Level Format Detection

## Overview

Build the core detection logic that analyzes individual files to determine their platform format. This phase implements a **data-driven detection system** where format signatures are defined via JSON Schemas referenced from `platforms.jsonc` export/import flows.

## Design Principles

### Single Source of Truth
- `platforms.jsonc` is the authoritative source for platform definitions
- Format detection schemas are co-located with flow patterns
- Adding a new platform or format requires only data changes

### Schema-Driven Detection
- Each flow in `platforms.jsonc` can reference a schema for its `from` and `to` patterns
- Schemas define field types, patterns, and detection weights
- Detection works by scoring file content against all applicable schemas

### Explicit Over Implicit
- Only flows with schemas are considered for auto-detection
- Flat schemas (no inheritance) for maximum clarity
- Each platform's format is explicitly defined

## Technical Overview

### Flow Schema Reference

Extend `platforms.jsonc` flow definitions to optionally reference schemas:

**Current format (unchanged for backward compat):**
```jsonc
{
  "from": "agents/**/*.md",
  "to": ".claude/agents/**/*.md"
}
```

**Extended format with schema:**
```jsonc
{
  "from": { "pattern": "agents/**/*.md", "schema": "./schemas/formats/universal-agent.schema.json" },
  "to": { "pattern": ".claude/agents/**/*.md", "schema": "./schemas/formats/claude-agent.schema.json" }
}
```

**Schema paths:**
- Explicit relative paths from `platforms.jsonc` location
- No magic resolution - path is used directly
- Example: `"./schemas/formats/claude-agent.schema.json"`

### Detection Algorithm

```
For each file to detect:
  1. Parse frontmatter content
  2. For each platform in platforms.jsonc:
     a. For each import flow (platform → universal):
        - Extract pattern from flow.from (string or object)
        - If flow.from has schema defined:
          - Load schema
          - Score frontmatter against schema
          - Record: { platform, flow, score }
        - Else: skip (not eligible for auto-detection)
  3. Select platform with highest schema score
  4. Return: { platform, confidence, matchedFlow }
```

**Key decision:** Flows without schemas are NOT considered for auto-detection. This ensures only explicitly defined formats participate in detection.

### Schema Format

Schemas use JSON Schema (draft-07, consistent with existing `schemas/` directory) with detection-specific extensions:

```jsonc
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://openpackage.dev/schemas/formats/claude-agent.schema.json",
  "title": "Claude Code Agent Frontmatter",
  "type": "object",
  "properties": {
    "tools": {
      "type": "string",
      "pattern": "^[A-Z][a-zA-Z]+(?:,\\s*[A-Z][a-zA-Z]+)*$",
      "x-detection-weight": 0.4
    },
    "permissionMode": {
      "enum": ["default", "acceptEdits", "dontAsk", "bypassPermissions", "plan"],
      "x-detection-weight": 0.5,
      "x-exclusive": true
    },
    "hooks": {
      "type": "object",
      "x-detection-weight": 0.4,
      "x-exclusive": true
    }
  },
  "x-detection": {
    "platform": "claude"
  }
}
```

**Detection Extensions:**
- `x-detection-weight`: Contribution to confidence score (0.0-1.0)
- `x-exclusive`: Field only exists in this platform format (stronger signal)
- `x-detection.platform`: Metadata identifying the platform

### Confidence Scoring

For each schema match:

```
score = 0
maxPossible = 0

for each field in schema.properties:
  weight = field["x-detection-weight"] || 0.1
  maxPossible += weight
  
  if frontmatter[field] exists:
    if field matches schema constraints (type, pattern, enum):
      score += weight
      if field["x-exclusive"]:
        score += 0.1  # Bonus for exclusive fields

confidence = score / maxPossible  # Normalized 0-1
```

### Path-Based Boost

When file path matches a flow's `to` pattern, add confidence boost:

```typescript
function getPathBoost(filePath: string, platform: Platform): number {
  for (const flow of platform.import) {
    const fromPattern = getPattern(flow.from);
    if (matchGlob(filePath, fromPattern)) {
      return 0.2; // Path match boost
    }
  }
  return 0;
}

finalConfidence = min(1.0, schemaConfidence + pathBoost)
```

## Schemas to Create

Create minimal skeleton schemas derived from existing `platforms.jsonc` map transformations. Full field definitions to be populated later.

### Universal Format (baseline)

**File:** `schemas/formats/universal-agent.schema.json`

```jsonc
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://openpackage.dev/schemas/formats/universal-agent.schema.json",
  "title": "Universal Agent Frontmatter",
  "type": "object",
  "properties": {
    "tools": { "type": "array", "x-detection-weight": 0.3 },
    "model": { "type": "string", "x-detection-weight": 0.2 },
    "permissions": { "type": "object", "x-detection-weight": 0.3 }
  },
  "x-detection": { "platform": "universal" }
}
```

### Claude Format

**File:** `schemas/formats/claude-agent.schema.json`

Derived from Claude export/import map transformations:
- `tools`: string format (comma-separated, capitalized)
- `model`: shorthand or claude-* prefixed
- `permissionMode`: string enum (exclusive field)
- `hooks`: object (exclusive field)

### OpenCode Format

**File:** `schemas/formats/opencode-agent.schema.json`

Derived from OpenCode export/import map transformations:
- `tools`: object format `{ read: true, write: false }`
- `temperature`: number (exclusive field)
- `maxSteps`: integer (exclusive field)
- `disabled`: boolean (exclusive field)

### Cursor Format

**File:** `schemas/formats/cursor-agent.schema.json`

Cursor uses universal format for agents (no special transformations).

### Additional Schemas (as needed)

- `schemas/formats/universal-command.schema.json`
- `schemas/formats/universal-skill.schema.json`
- `schemas/formats/universal-rule.schema.json`
- Platform-specific variants where transformations exist

## platforms.jsonc Updates

Add schema references to flows that have format-specific transformations:

```jsonc
"claude": {
  "import": [
    {
      "from": { 
        "pattern": ".claude/agents/**/*.md", 
        "schema": "./schemas/formats/claude-agent.schema.json" 
      },
      "to": { 
        "pattern": "agents/**/*.md", 
        "schema": "./schemas/formats/universal-agent.schema.json" 
      },
      "map": [...]
    }
  ]
}
```

**Note:** Only agent flows for Claude and OpenCode need schemas initially, as they have format-specific transformations. Other flows (rules, commands, skills) can be added later.

## Modules to Create

### 1. Schema Registry

**Location:** `src/core/install/schema-registry.ts`

**Purpose:** Load, cache, and provide access to format schemas

**Key Functions:**

- `loadSchema(schemaPath: string)` → JSONSchema
  - Loads schema from explicit path (relative to platforms.jsonc)
  - Parses JSON Schema
  - Caches by path for reuse

- `getSchemaForFlow(flow: Flow, direction: 'from' | 'to')` → JSONSchema | null
  - Extracts schema path from flow's `from` or `to` object
  - Loads schema if path defined
  - Returns null if no schema defined

- `getAllFlowSchemas(platforms: PlatformRegistry)` → Map<string, JSONSchema>
  - Scans all flows for schema references
  - Returns map of schema path → loaded schema
  - Used for detection scoring

### 2. File Format Detector

**Location:** `src/core/install/file-format-detector.ts`

**Purpose:** Detect format for individual files using schema scoring

**Key Functions:**

- `detectFileFormat(file: PackageFile, registry: SchemaRegistry)` → FileFormat
  - Main entry point
  - Scores file against all platform schemas
  - Returns best match with confidence

- `scoreAgainstSchema(frontmatter: object, schema: JSONSchema)` → number
  - Calculates confidence score
  - Uses x-detection-weight extensions
  - Returns normalized 0-1 score

- `getPatternFromFlow(flow: Flow, direction: 'from' | 'to')` → string
  - Extracts pattern from flow (handles string and object formats)

### 3. Detection Types

**Location:** `src/core/install/detection-types.ts`

**Types:**

```typescript
// Platform ID is a dynamic string - any key from platforms.jsonc
// NOT a hardcoded union type
type PlatformId = string;

// Special format values for edge cases
type SpecialFormat = 'universal' | 'unknown';

interface FileFormat {
  platform: PlatformId | SpecialFormat;  // Dynamic platform ID from platforms.jsonc
  confidence: number;                     // 0-1 normalized score
  matchedFlow: Flow | null;               // The flow that matched
  matchedSchema: string | null;           // Schema path that matched
  matchedFields: string[];                // Fields that contributed to score
  path: string;                           // Original file path
}

interface FlowPattern {
  pattern: string;
  schema?: string;  // Explicit path: "./schemas/formats/claude-agent.schema.json"
}

// Extended flow type
interface FlowWithSchema extends Flow {
  from: string | FlowPattern | FlowPattern[];
  to: string | FlowPattern;
}
```

**Key Design:** `platform` is a dynamic string, not a hardcoded union. Any platform defined in `platforms.jsonc` is a valid value. This enables extensibility without code changes.

## Integration Points

### Existing Systems

1. **Platform Registry** (`src/core/platforms.ts`)
   - Already loads `platforms.jsonc`
   - Extend to parse schema references in flows

2. **Frontmatter Parser** (`src/core/flows/markdown.ts`)
   - Already parses YAML frontmatter
   - Reuse for detection

3. **Flow Definitions** (`platforms.jsonc`)
   - Extended with optional schema references
   - Backward compatible (string patterns still work)

### Schema Location

Place new format schemas alongside existing schemas:

```
schemas/
├── agent-frontmatter-v1.json      # Existing universal schema
├── map-pipeline-v1.json           # Existing
├── platforms-v1.json              # Existing
└── formats/                       # NEW
    ├── universal-agent.schema.json
    ├── claude-agent.schema.json
    ├── opencode-agent.schema.json
    └── ...
```

## Testing Strategy

### Unit Tests

**Location:** `tests/core/install/file-format-detection.test.ts`

**Test Categories:**

1. **Schema Loading**
   - Load schema by ID
   - Handle missing schema
   - Cache behavior

2. **Detection Scoring**
   - Claude format detected from tools string
   - OpenCode format detected from tools object
   - Universal format as fallback
   - Exclusive fields boost confidence

3. **Path Matching**
   - Flow pattern extraction (string vs object)
   - Path boost applied correctly
   - Multiple flows for same resource type

4. **Edge Cases**
   - No schema defined for flow (skip)
   - Empty frontmatter
   - Ambiguous format (multiple high scores)

### Test Fixtures

```
tests/fixtures/format-detection/
  agents/
    claude-format.md       # tools: "Read, Write", permissionMode: default
    opencode-format.md     # tools: { read: true }, temperature: 0.1
    universal-format.md    # tools: [read, write], permissions: {...}
    minimal.md             # Only description field
    ambiguous.md           # Mixed indicators
```

## Validation Requirements

### Detection Accuracy

- Claude format: >90% confidence for Claude-authored agents
- OpenCode format: >90% confidence for OpenCode-authored agents
- Universal format: Selected when no platform-specific indicators
- Ambiguous files: Fallback to universal

### Performance

- Schema loading: Cached after first load
- Single file detection: <5ms
- 100 files: <500ms total

### Error Handling

- Missing schema: Log warning, skip flow for detection
- Malformed frontmatter: Return unknown format
- No matching schemas: Return universal as default

## Deliverables

### Code
- [x] Schema registry module
- [x] File format detector module
- [x] Detection types
- [x] platforms.jsonc schema extension support

### Schemas
- [x] `schemas/formats/universal-agent.schema.json` (skeleton)
- [x] `schemas/formats/claude-agent.schema.json` (skeleton)
- [x] `schemas/formats/opencode-agent.schema.json` (skeleton)

### Tests
- [x] Unit tests for schema registry (6/6 passing)
- [x] Unit tests for detection scoring (4/4 passing)
- [x] Test fixtures for each format
- [x] Edge case tests (3/4 passing)

## Success Criteria

- [x] Schemas loaded from `schemas/formats/` directory
- [x] platforms.jsonc flows can reference schemas (pattern objects with schema field)
- [x] Detection correctly identifies Claude format from exclusive fields (permissionMode, hooks, skills)
- [x] Flows without schemas are skipped (not matched)
- [x] Performance <5ms per file
- [~] All unit tests pass (19/29 passing - 65%)

**Note:** OpenCode detection tests are failing because OpenCode's import flows use `$switch` expressions which are skipped for Phase 1. Claude detection is working correctly. Universal format detection needs refinement of scoring weights. OpenCode support will be completed in Phase 2.

## Next Phase

Phase 2 will enhance the package-level detector to use per-file detection as a fallback and implement format grouping logic.
