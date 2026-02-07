# Phase 2: Package-Level Detection Enhancement

## Overview

Enhance the existing package format detector to implement two-tier detection logic: fast path for packages with explicit format markers, and detailed path using per-file detection for mixed or ambiguous packages.

**Duration:** 1 day

## Goals

1. Implement two-tier detection strategy (package-level and per-file)
2. Add package-level marker detection (fast path)
3. Integrate per-file detection as fallback (detailed path)
4. Group files by detected format
5. Return comprehensive format analysis for entire package
6. Maintain backwards compatibility with existing system

## Technical Overview

### Two-Tier Detection Architecture

#### Tier 1: Package-Level Detection (Fast Path)

Check for explicit format markers that indicate the entire package's format. **All markers are derived from `platforms.jsonc`** - no hardcoded platform IDs.

**Marker Detection Algorithm:**

```
For each platform in platforms.jsonc:
  For each pattern in platform.detection[]:
    If file matching pattern exists in package:
      Record: { platformId, matchedPattern, confidence: 1.0 }
      
Special case: openpackage.yml
  If exists → Mark as 'universal' but continue to per-file (may contain mixed content)
```

**Data-Driven Markers (from platforms.jsonc):**

| Platform ID | Detection Patterns (from `detection` array) |
|-------------|---------------------------------------------|
| `claude` | `.claude`, `CLAUDE.md` |
| `claude-plugin` | `.claude-plugin/plugin.json` |
| `cursor` | `.cursor`, `AGENTS.md` |
| `opencode` | `.opencode`, `AGENTS.md` |
| `factory` | `.factory`, `AGENTS.md` |
| ... | (all platforms from platforms.jsonc) |

**Note:** The table above is illustrative. The algorithm reads `detection` arrays dynamically from `platforms.jsonc` at runtime.

**Fast Path Logic:**

```
markers = detectMarkersFromPlatformsJsonc(files, platformRegistry)

If markers.length > 0:
  ├─ Single platform matched → Return that platform ID
  ├─ Multiple platforms matched → Use priority or per-file detection
  └─ 'universal' marker (openpackage.yml) → Continue to per-file
Else:
  └─ No markers → Continue to per-file detection (Tier 2)
```

#### Tier 2: Per-File Detection (Detailed Path)

When no clear package-level markers exist, analyze each file individually using the schema-driven detector from Phase 1.

**Per-File Detection Process:**

1. Load schema registry with all platform schemas
2. For each file with frontmatter:
   - Score frontmatter against all platform schemas with `x-detection-weight`
   - Select platform with highest confidence score
   - Record: { file, platform, confidence, matchedFlow }
3. Group files by detected platform
4. Determine overall package format from distribution

**Key Integration with Phase 1:**

- Uses `SchemaRegistry` to load platform schemas
- Uses `detectFileFormat()` for per-file scoring
- Only flows with schemas participate (explicit detection)

**Grouping Strategy:**

```typescript
// Platform IDs are dynamic strings from platforms.jsonc
Map<PlatformId, PackageFile[]>

Example:
{
  'claude': [           // Platform ID from platforms.jsonc
    { path: 'agents/reviewer.md', ... },
    { path: 'agents/debugger.md', ... }
  ],
  'opencode': [         // Platform ID from platforms.jsonc
    { path: 'agents/analyzer.md', ... }
  ],
  'universal': [        // Special: no platform-specific schema matched
    { path: 'commands/build.md', ... },
    { path: 'skills/typescript/SKILL.md', ... }
  ]
}
```

**Package Format Determination:**

- If all files same platform → Package format is that platform ID
- If mixed platforms → Package format is `'mixed'`
- If majority one platform (>70%) → Package format is dominant platform ID
- If no schemas matched → Package format is `'universal'` (safest default)
- If ambiguous (no clear winner) → Package format is `'unknown'`

### Enhanced Package Format Result

```typescript
// Platform ID is a dynamic string from platforms.jsonc keys
// Examples: 'claude', 'cursor', 'opencode', 'factory', 'kilo', etc.
type PlatformId = string;

// Special format values
type SpecialFormat = 'universal' | 'mixed' | 'unknown';

interface EnhancedPackageFormat {
  // Overall package format - dynamic platform ID or special value
  // NOT a hardcoded union - any platform ID from platforms.jsonc is valid
  packageFormat: PlatformId | SpecialFormat;
  
  // Detection method used
  detectionMethod: 'package-marker' | 'per-file' | 'directory-structure';
  
  // Overall confidence (0-1)
  confidence: number;
  
  // Per-file format breakdown (for mixed packages)
  fileFormats?: Map<string, FileFormat>;
  
  // Files grouped by platform ID
  formatGroups?: Map<PlatformId, PackageFile[]>;
  
  // Package-level markers found (derived from platforms.jsonc detection arrays)
  markers?: {
    matchedPatterns: Array<{ platformId: PlatformId; pattern: string }>;
    hasOpenPackageYml?: boolean;
  };
  
  // Analysis metadata
  analysis: {
    totalFiles: number;
    analyzedFiles: number;
    skippedFiles: number;
    // Distribution by platform ID
    formatDistribution: Map<PlatformId, number>;
  };
}
```

**Key Design:** `packageFormat` accepts any string that is a valid key in `platforms.jsonc`. This makes the system fully extensible - adding a new platform to `platforms.jsonc` automatically makes it a valid format without code changes.

## Modules to Enhance

### 1. Package Format Detector

**Location:** `src/core/install/format-detector.ts`

**Enhancements:**

- Add `detectEnhancedPackageFormat(files: PackageFile[])` → EnhancedPackageFormat
  - Main entry point for enhanced detection
  - Implements two-tier detection logic
  - Returns comprehensive format analysis

- Add `detectPackageLevelMarkers(files: PackageFile[])` → PackageMarkers
  - Checks for explicit package format markers
  - Returns found markers and implied format

- Add `analyzeDirectoryStructure(files: PackageFile[])` → DirectoryAnalysis
  - Analyzes file path patterns
  - Detects platform-specific directory dominance
  - Returns structural insights

- Add `detectFormatPerFile(files: PackageFile[])` → Map<string, FileFormat>
  - Applies file format detector to each file
  - Returns format per file path
  - Uses Phase 1's file format detector

- Add `groupFilesByFormat(fileFormats: Map<string, FileFormat>)` → Map<Format, PackageFile[]>
  - Groups files by detected format
  - Returns format groups for conversion

- Add `determinePackageFormat(formatGroups: Map<Format, PackageFile[]>)` → Format
  - Determines overall package format from groups
  - Handles mixed format resolution
  - Returns final package format

### 2. Package Marker Detector

**Location:** `src/core/install/package-marker-detector.ts`

**Purpose:** Detect package-level format markers using patterns from `platforms.jsonc`

**Key Functions:**

- `detectPlatformMarkers(files: PackageFile[], registry: PlatformRegistry)` → MarkerMatch[]
  - Iterates all platforms in registry
  - Checks each platform's `detection` array patterns against files
  - Returns array of `{ platformId, matchedPattern }` for all matches

- `hasOpenPackageMarker(files: PackageFile[])` → boolean
  - Checks for `openpackage.yml` or `package.yml`
  - Universal format declaration (special case)

- `matchDetectionPattern(files: PackageFile[], pattern: string)` → boolean
  - Matches a single detection pattern against file list
  - Handles both file patterns and directory patterns

**Data-Driven Design:**

```typescript
interface MarkerMatch {
  platformId: string;      // Key from platforms.jsonc (e.g., 'claude', 'cursor')
  matchedPattern: string;  // Pattern from detection[] that matched
}

function detectPlatformMarkers(files: PackageFile[], registry: PlatformRegistry): MarkerMatch[] {
  const matches: MarkerMatch[] = [];
  
  for (const [platformId, platform] of registry.platforms) {
    for (const pattern of platform.detection || []) {
      if (matchDetectionPattern(files, pattern)) {
        matches.push({ platformId, matchedPattern: pattern });
      }
    }
  }
  
  return matches;
}
```

**Note:** No hardcoded platform checks. All detection patterns come from `platforms.jsonc`.

### 3. Format Distribution Analyzer

**Location:** `src/core/install/format-distribution-analyzer.ts`

**Purpose:** Analyze format distribution across files using dynamic platform IDs

**Key Functions:**

- `analyzeFormatDistribution(fileFormats: Map<string, FileFormat>)` → FormatDistribution
  - Counts files per platform ID
  - Calculates percentages
  - Identifies dominant platform

- `calculatePackageConfidence(distribution: FormatDistribution)` → number
  - Calculates overall package confidence
  - Based on format consistency
  - Returns confidence score (0-1)

- `getDominantPlatform(distribution: FormatDistribution, threshold: number = 0.7)` → PlatformId | null
  - Determines if one platform is dominant (default >70%)
  - Returns platform ID or null

**Types:**

```typescript
interface FormatDistribution {
  // Counts by platform ID (dynamic keys from platforms.jsonc)
  counts: Map<PlatformId, number>;
  
  // Percentages by platform ID
  percentages: Map<PlatformId, number>;
  
  // Total files analyzed
  total: number;
  
  // Platform with highest count (if any)
  dominant?: PlatformId;
}
```

## Integration Points

### Phase 1 Integration

- Use `SchemaRegistry` from Phase 1 to load platform schemas
- Use `detectFileFormat()` from Phase 1 for schema-based scoring
- Reuse `FileFormat` types and interfaces
- Schemas are sourced from `schemas/formats/` directory

### Existing System Integration

- Extend existing `detectPackageFormat()` function
- Maintain backwards compatibility
- Add new enhanced detection as separate function
- Deprecate old function gradually

### Platform Configuration

- **All platform IDs derived from `platforms.jsonc` keys** - no hardcoded platform strings
- Use `detection` arrays for marker matching
- Use flow `schema` references for per-file detection
- Platform registry provides iteration over all defined platforms

**Extensibility:** Adding a new platform to `platforms.jsonc` with `detection` patterns and flow schemas automatically enables detection for that platform without any code changes.

## Testing Strategy

### Unit Tests

**Location:** `tests/core/install/package-format-detection.test.ts`

**Test Categories:**

1. **Package-Level Marker Detection (Data-Driven)**
   - Markers detected from platforms.jsonc `detection` arrays
   - Multiple platform markers in same package
   - OpenPackage with openpackage.yml (universal)
   - No markers (fallback to per-file)
   - New platform added to platforms.jsonc is automatically detected

2. **Per-File Detection Fallback**
   - All files same platform
   - Mixed platform files
   - Majority one platform
   - Ambiguous platform distribution

3. **Format Grouping**
   - Group files correctly by platform ID
   - Handle empty groups
   - Preserve file metadata
   - Dynamic platform IDs (not hardcoded)

4. **Package Format Determination**
   - Uniform platform (all same) → returns platform ID
   - Mixed platforms → returns 'mixed'
   - Dominant platform (>70%) → returns dominant platform ID
   - Ambiguous (no clear winner) → returns 'unknown'
   - No schemas matched → returns 'universal'

5. **Backwards Compatibility**
   - Old detectPackageFormat() still works
   - Returns same results for simple cases
   - New enhanced version adds detail

### Integration Tests

**Location:** `tests/core/install/package-detection-integration.test.ts`

**Test Scenarios:**

1. **Real-world Package Structures**
   - Package with single platform marker → returns that platform ID
   - Package with multiple platform markers → uses priority/per-file
   - Mixed platform files (detected via schemas)
   - Universal OpenPackage format (openpackage.yml)
   - Legacy package with no markers → per-file detection

2. **Format Conversion Preparation**
   - Grouped files ready for conversion by platform ID
   - Format groups isolated correctly
   - Metadata preserved through grouping

3. **Extensibility Verification**
   - Add new platform to platforms.jsonc
   - Verify detection works without code changes
   - Verify grouping includes new platform ID

### Test Fixtures

```
tests/fixtures/package-detection/
  claude-plugin/              # Pure Claude plugin
    .claude-plugin/
      plugin.json
    agents/
      agent1.md
  
  mixed-format/               # Mixed formats
    agents/
      claude-agent.md         # Claude format
      opencode-agent.md       # OpenCode format
      universal-agent.md      # Universal format
  
  openpackage/                # OpenPackage universal
    openpackage.yml
    agents/
      agent1.md
    commands/
      cmd1.md
  
  legacy/                     # No markers
    agents/
      agent1.md
```

## Validation Requirements

### Detection Accuracy

- Package markers detected with 100% accuracy
- Per-file detection triggers correctly when no markers
- Format groups contain correct files
- Package format determination matches expectations

### Performance

- Package marker detection: <10ms (fast path)
- Per-file detection: <500ms for 100 files (detailed path)
- Grouping operation: <50ms for 100 files
- No redundant file reads

### Backwards Compatibility

- Existing code using `detectPackageFormat()` continues to work
- Simple packages return same results
- No breaking changes to return types (add fields, don't remove)

## Deliverables

### Code

- ✅ Enhanced package format detector
- ✅ Package marker detector module
- ✅ Format distribution analyzer module
- ✅ Enhanced PackageFormat types
- ✅ Format grouping utilities

### Tests

- ✅ Unit tests for package detection
- ✅ Unit tests for marker detection
- ✅ Integration tests with real package structures
- ✅ Backwards compatibility tests
- ✅ Performance benchmarks

### Documentation

- ✅ Module documentation (JSDoc)
- ✅ Detection algorithm documentation
- ✅ Type documentation
- ✅ Migration guide for existing code

## Success Criteria

✅ Package-level markers detected correctly (fast path)  
✅ Per-file detection triggers as fallback (detailed path)  
✅ Files grouped correctly by detected format  
✅ Package format determined accurately  
✅ Backwards compatibility maintained  
✅ Performance targets met (fast path <10ms, detailed path <500ms)  
✅ All tests pass  
✅ Test coverage >90%

## Next Phase

Phase 3 will implement the per-file/per-group conversion pipeline that applies appropriate import flows to convert detected formats to universal format.
