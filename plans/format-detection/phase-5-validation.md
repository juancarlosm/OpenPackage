# Phase 5: Validation & Edge Cases

## Overview

Handle edge cases, validate conversions, optimize performance, and ensure robust error handling throughout the format detection and conversion system.

**Duration:** 1-2 days

## Goals

1. Handle ambiguous format detection scenarios
2. Validate conversion correctness and semantic preservation
3. Optimize performance with caching and lazy evaluation
4. Implement comprehensive error handling
5. Handle malformed and edge case packages
6. Provide clear error messages and recovery strategies
7. Performance benchmarking and optimization

## Technical Overview

### Edge Case Categories

#### 1. Ambiguous Format Detection

**Scenarios:**

**Conflicting Format Indicators:**
```yaml
# File has both Claude and OpenCode format indicators
---
name: hybrid-agent
tools: "Read, Write"           # Claude format (string)
permissions: {edit: "ask"}     # OpenCode format (object)
model: anthropic/claude-*      # Universal format (prefixed)
temperature: 0.5               # OpenCode-specific field
---
```

**Resolution Strategy:**
- Use weighted scoring system
- Priority order: Platform-specific fields > Format structure > Common fields
- Default to format with highest confidence score
- Log ambiguity warnings

**Minimal Frontmatter:**
```yaml
# Not enough information to determine format
---
name: minimal-agent
description: Simple agent
---
```

**Resolution Strategy:**
- Default to universal format (safest)
- No conversion needed
- Treat as already universal

**Empty or Missing Frontmatter:**
```yaml
---
---

# Agent content with no frontmatter metadata
```

**Resolution Strategy:**
- Skip format detection
- Treat as opaque markdown file
- Copy as-is without transformation

#### 2. Malformed Content

**Scenarios:**

**Invalid YAML Frontmatter:**
```yaml
---
name: broken-agent
tools: [read, write, bash  # Missing closing bracket
model: sonnet
---
```

**Resolution Strategy:**
- Catch parsing errors gracefully
- Skip format detection for this file
- Copy file as-is without transformation
- Log warning with file path and error

**Corrupted File Content:**
```
Binary content or encoding issues
```

**Resolution Strategy:**
- Detect non-text files
- Skip conversion
- Copy binary content as-is
- No frontmatter parsing

**Mixed Format in Same Field:**
```yaml
---
name: weird-agent
tools: ["Read", {write: true}, "Bash"]  # Array with mixed types
---
```

**Resolution Strategy:**
- Best-effort conversion
- Normalize to most common format
- Log conversion warnings
- Fallback to skipping conversion

#### 3. Platform-Specific Features

**Scenarios:**

**Unsupported Fields in Target Platform:**
```yaml
# Claude-specific hooks field
---
name: hooked-agent
hooks:
  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: "./validate.sh"
---
```

**Resolution Strategy:**
- Preserve unsupported fields in metadata
- Document as platform-specific
- Enable round-trip conversion
- Warn if installing to incompatible platform

**Platform-Specific Tool Names:**
```yaml
# Claude-specific tool names
---
tools: "AskUserQuestion, NotebookEdit, ExitPlanMode"
---
```

**Resolution Strategy:**
- Map known tool names during conversion
- Preserve unmappable tools with warning
- Document tool compatibility matrix

#### 4. File Structure Edge Cases

**Scenarios:**

**Deeply Nested Directories:**
```
agents/
  category1/
    subcategory/
      deeply/
        nested/
          agent.md
```

**Resolution Strategy:**
- Handle arbitrary nesting depth
- Preserve directory structure
- Convert paths correctly

**Special Characters in Filenames:**
```
agents/
  agent with spaces.md
  agent-with-émojis-🎉.md
  agent.special@chars.md
```

**Resolution Strategy:**
- Handle Unicode filenames
- Preserve special characters
- Sanitize only when necessary for platform compatibility

**Conflicting File Names:**
```
# After conversion, two files map to same path
.claude/agents/agent.md  → agents/agent.md
.cursor/agents/agent.md  → agents/agent.md
```

**Resolution Strategy:**
- Detect path conflicts during conversion
- Use priority ordering (most specific platform)
- Warn about conflicts
- Option to keep both with suffixes

#### 5. Large Package Handling

**Scenarios:**

**Large Number of Files:**
```
Package with 1000+ agent files
```

**Resolution Strategy:**
- Lazy evaluation (only process needed files)
- Parallel processing where safe
- Progress indicators for long operations
- Streaming processing to avoid memory issues

**Large File Sizes:**
```
Individual files >10MB (unlikely but possible)
```

**Resolution Strategy:**
- Stream large files
- Avoid loading entire content in memory
- Process in chunks if needed

## Validation Strategy

### Conversion Validation

#### Semantic Preservation

Verify conversion preserves meaning:

**Tools Field Validation:**
```
Before: tools: "Read, Write, Bash"
After:  tools: [read, write, bash]

Validation:
- Same tools present (case-insensitive)
- Same tool count
- Order doesn't matter
```

**Model Field Validation:**
```
Before: model: sonnet
After:  model: anthropic/claude-3-5-sonnet-20241022

Validation:
- Maps to correct full model ID
- Version inference correct
- Compatible with target platform
```

**Permissions Validation:**
```
Before: permissionMode: default
After:  permissions: {edit: "ask", bash: "ask"}

Validation:
- Permission level equivalent
- Access controls preserved
- Behavior equivalent
```

#### Round-Trip Validation

Test bidirectional conversion:

```
Platform Format → Universal → Platform Format
  └─ Should produce equivalent result
```

**Validation Criteria:**
- Frontmatter semantically equivalent
- Field values map back correctly
- No data loss in round trip
- Formatting may differ (acceptable)

#### Schema Validation

Validate converted files against format schemas from `schemas/formats/`:

**Uses Schema Registry:**
- Load `universal-agent.schema.json` for universal format validation
- Validate frontmatter against JSON Schema `properties`
- Report validation errors with field paths

**Required Fields Present:**
- description field (required)
- Other fields per schema definition

**Field Types Correct:**
- tools is array of strings (universal format)
- model is string with provider prefix
- permissions is object

**No Invalid Fields:**
- No platform-specific fields in universal (except preserved metadata)
- Unknown fields preserved but flagged

**Note:** Full validation is a future enhancement. Phase 1-4 focus on detection only.

### Performance Validation

#### Benchmarking

**Target Metrics:**
- Single file detection: <5ms
- Single file conversion: <10ms
- Package detection (100 files): <500ms
- Package conversion (100 files): <1000ms

**Benchmark Suite:**
- Small packages (1-10 files)
- Medium packages (10-50 files)
- Large packages (50-100 files)
- Extra large packages (100-500 files)

#### Performance Optimization

**Caching Strategies:**

1. **Detection Result Cache**
   - Cache file format detection results
   - Key: File content hash
   - Invalidate on content change

2. **Conversion Result Cache**
   - Cache converted file results
   - Key: Format + content hash
   - Invalidate on flow changes

3. **Import Flow Cache**
   - Cache loaded import flows per platform
   - Key: Platform ID
   - Invalidate on platforms.jsonc change

**Lazy Evaluation:**

- Only detect format for files that will be installed
- Skip detection for filtered-out files
- Defer conversion until needed

**Parallel Processing:**

- Process independent files in parallel
- Use worker threads for large packages
- Maintain order where necessary

### Error Handling Strategy

#### Error Categories

**Fatal Errors (Stop Installation):**
- Entire package unreadable
- All files fail conversion
- Critical system errors

**Recoverable Errors (Partial Success):**
- Individual file conversion failures
- Some files skip conversion
- Non-critical validation failures

**Warnings (Continue with Notice):**
- Ambiguous format detection
- Unsupported field preservation
- Minor conversion issues

#### Error Messages

**Format:**
```
[LEVEL] Context: Specific issue
   File: path/to/file.md
   Reason: Detailed explanation
   
   Suggestion: How to fix or what was done
```

**Examples:**

```
⚠️  Ambiguous format detection: agents/hybrid-agent.md
   File: agents/hybrid-agent.md
   Detected: Mixed Claude and OpenCode indicators
   Confidence: Claude 0.6, OpenCode 0.5
   
   Action: Defaulted to Claude format (highest confidence)
   Suggestion: Add openpackage.yml to declare format explicitly
```

```
❌ Conversion failed: agents/broken-agent.md
   File: agents/broken-agent.md
   Reason: Invalid YAML frontmatter (unclosed bracket)
   
   Action: File copied as-is without conversion
   Suggestion: Fix YAML syntax in frontmatter
```

```
ℹ️  Preserved platform-specific field: hooks
   File: agents/hooked-agent.md
   Field: hooks (Claude-specific)
   
   Action: Preserved in metadata for round-trip conversion
   Note: Field will be ignored on non-Claude platforms
```

## Modules to Create/Enhance

### 1. Validation Module

**Location:** `src/core/install/conversion-validator.ts`

**Purpose:** Validate conversion correctness

**Key Functions:**

- `validateConversion(original: PackageFile, converted: PackageFile)` → ValidationResult
  - Validates single file conversion
  - Checks semantic preservation
  - Returns validation result

- `validateSemanticPreservation(before: any, after: any, format: Format)` → boolean
  - Validates frontmatter equivalence
  - Checks field-by-field
  - Returns true if equivalent

- `validateUniversalSchema(file: PackageFile)` → SchemaValidationResult
  - Validates against universal schema
  - Checks required fields
  - Checks field types

- `performRoundTripValidation(file: PackageFile, format: Format)` → boolean
  - Tests bidirectional conversion
  - Platform → Universal → Platform
  - Returns true if equivalent

### 2. Error Handler Module

**Location:** `src/core/install/conversion-error-handler.ts`

**Purpose:** Handle conversion errors gracefully

**Key Functions:**

- `handleConversionError(error: Error, context: ConversionContext)` → ErrorHandlingResult
  - Determines error severity
  - Chooses recovery strategy
  - Returns handling result

- `formatErrorMessage(error: ConversionError)` → string
  - Formats user-friendly error message
  - Includes context and suggestions
  - Returns formatted message

- `suggestRecovery(error: ConversionError)` → string[]
  - Suggests recovery actions
  - Provides troubleshooting steps
  - Returns suggestion array

### 3. Performance Monitor

**Location:** `src/core/install/conversion-performance-monitor.ts`

**Purpose:** Monitor and optimize performance

**Key Functions:**

- `measureDetectionPerformance()` → PerformanceMetrics
  - Measures detection time per file
  - Tracks aggregate statistics
  - Returns performance data

- `measureConversionPerformance()` → PerformanceMetrics
  - Measures conversion time per file
  - Tracks aggregate statistics
  - Returns performance data

- `optimizeConversionPipeline(metrics: PerformanceMetrics)` → OptimizationSuggestions
  - Analyzes bottlenecks
  - Suggests optimizations
  - Returns suggestions

### 4. Edge Case Handler

**Location:** `src/core/install/conversion-edge-case-handler.ts`

**Purpose:** Handle edge cases gracefully

**Key Functions:**

- `handleAmbiguousFormat(patterns: DetectedPatterns)` → Format
  - Resolves format ambiguity
  - Uses weighted scoring
  - Returns best format choice

- `handleMalformedContent(file: PackageFile, error: Error)` → HandlingStrategy
  - Determines handling for malformed content
  - Skip, retry, or copy as-is
  - Returns strategy

- `handlePathConflict(path1: string, path2: string)` → ConflictResolution
  - Resolves path conflicts
  - Priority ordering or rename
  - Returns resolution

## Testing Strategy

### Edge Case Tests

**Location:** `tests/core/install/edge-cases.test.ts`

**Test Categories:**

1. **Ambiguous Format Detection**
   - Conflicting indicators
   - Minimal frontmatter
   - Empty frontmatter
   - Resolution correctness

2. **Malformed Content**
   - Invalid YAML
   - Corrupted files
   - Mixed format fields
   - Graceful handling

3. **Platform-Specific Features**
   - Unsupported fields preserved
   - Tool name mapping
   - Round-trip conversion

4. **File Structure Edge Cases**
   - Deep nesting
   - Special characters
   - Path conflicts
   - Large packages

### Validation Tests

**Location:** `tests/core/install/conversion-validation.test.ts`

**Test Categories:**

1. **Semantic Preservation**
   - Tools field equivalence
   - Model field mapping
   - Permission equivalence

2. **Round-Trip Validation**
   - Claude → Universal → Claude
   - OpenCode → Universal → OpenCode
   - Data preservation

3. **Schema Validation**
   - Required fields present
   - Field types correct
   - No invalid fields

### Performance Tests

**Location:** `tests/core/install/performance.test.ts`

**Test Categories:**

1. **Benchmark Tests**
   - Small, medium, large packages
   - Detection performance
   - Conversion performance

2. **Optimization Tests**
   - Caching effectiveness
   - Lazy evaluation
   - Parallel processing

3. **Regression Tests**
   - Performance no worse than baseline
   - Memory usage reasonable
   - No memory leaks

### Error Handling Tests

**Location:** `tests/core/install/error-handling.test.ts`

**Test Categories:**

1. **Fatal Errors**
   - Unreadable packages
   - Complete conversion failure
   - Proper error propagation

2. **Recoverable Errors**
   - Partial conversion success
   - Individual file failures
   - Graceful degradation

3. **Warning Scenarios**
   - Ambiguous detection warnings
   - Unsupported field warnings
   - Clear warning messages

## Deliverables

### Code

- ✅ Validation module with semantic checks
- ✅ Error handler with recovery strategies
- ✅ Performance monitor and optimization
- ✅ Edge case handler module
- ✅ Comprehensive error messages

### Tests

- ✅ Edge case test suite (>50 test cases)
- ✅ Validation test suite
- ✅ Performance benchmark suite
- ✅ Error handling test suite
- ✅ Test coverage >95%

### Documentation

- ✅ Edge case handling documentation
- ✅ Troubleshooting guide
- ✅ Performance tuning guide
- ✅ Error message reference

## Success Criteria

✅ All edge cases handled gracefully  
✅ Conversion validation passes for all formats  
✅ Performance targets met (see benchmarks)  
✅ Error messages clear and actionable  
✅ Round-trip conversions preserve data  
✅ No crashes on malformed content  
✅ Comprehensive test coverage (>95%)  
✅ All tests pass  
✅ Performance optimizations effective

## Next Phase

Phase 6 will focus on documentation, migration guides, and feature rollout preparation.
