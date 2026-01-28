# Phase 1: Input Detection & Parsing

## Overview

Implement new parsers to detect and parse modern git source formats while maintaining backward compatibility with legacy prefixes.

---

## 1. Detection Priority Order

Update the input classification algorithm to detect new formats first:

**Priority Order:**
```
1. GitHub shorthand (gh@)
2. URL protocols (https://, http://, git://, git@)
3. Git file extension (.git)
4. Legacy prefixes (github:, git:) - with deprecation warnings
5. Path detection (local filesystem)
6. Registry name (fallback)
```

**Key Changes:**
- Add GitHub shorthand detection (highest priority for git sources)
- Move URL detection before legacy prefix detection
- Add deprecation warnings for legacy prefixes
- No changes to path or registry detection

---

## 2. GitHub Shorthand Parser

### Format
```
gh@<owner>/<repo>[/<path>]
```

### Parsing Algorithm

1. Verify input starts with `gh@`
2. Strip `gh@` prefix
3. Split remaining string by `/`
4. Extract:
   - `owner` = segment 0
   - `repo` = segment 1
   - `path` = segments 2+ joined by `/`
5. Normalize to GitHub git URL: `https://github.com/<owner>/<repo>.git`
6. Ref is always `undefined` (uses default branch)

### Output Structure

```typescript
{
  type: 'git',
  url: 'https://github.com/owner/repo.git',
  ref: undefined,
  path: 'plugins/x' | undefined
}
```

### Validation Rules

- Must have at least owner and repo (minimum 2 segments)
- Empty segments not allowed
- Owner and repo cannot be empty strings
- Path segments can be empty (results in undefined path)

### Examples

| Input | Output |
|-------|--------|
| `gh@anthropics/claude-code` | `{ url: "https://github.com/anthropics/claude-code.git" }` |
| `gh@user/repo/plugins/x` | `{ url: "https://github.com/user/repo.git", path: "plugins/x" }` |
| `gh@user/repo/a/b/c` | `{ url: "https://github.com/user/repo.git", path: "a/b/c" }` |
| `gh@user/repo/` | `{ url: "https://github.com/user/repo.git", path: undefined }` |

### Error Cases

| Input | Error |
|-------|-------|
| `gh@user` | "Invalid GitHub shorthand 'gh@user'. Expected format: gh@owner/repo[/path]" |
| `gh@user/` | "Invalid GitHub shorthand 'gh@user/'. Empty repo name" |
| `gh@` | "Invalid GitHub shorthand 'gh@'. Expected format: gh@owner/repo[/path]" |

---

## 3. GitHub Web URL Parser

### Supported URL Patterns

```
https://github.com/<owner>/<repo>
https://github.com/<owner>/<repo>.git
https://github.com/<owner>/<repo>/tree/<ref>
https://github.com/<owner>/<repo>/tree/<ref>/<path>
```

### Parsing Algorithm

1. Parse URL object and validate hostname is `github.com`
2. Split pathname by `/`, filter empty segments
3. Extract owner (segment 0) and repo (segment 1)
4. Strip `.git` suffix from repo name if present
5. Check segment 2:
   - If `tree`: Extract ref (segment 3) and path (segments 4+)
   - If `blob`: Error - single file URLs not supported
   - Otherwise: No ref or path
6. Normalize to `.git` URL format

### Output Structure

```typescript
{
  type: 'git',
  url: 'https://github.com/owner/repo.git',
  ref: 'main' | 'v1.0.0' | undefined,
  path: 'plugins/x' | undefined
}
```

### Special Handling

- Query parameters → ignored
- Trailing slashes → stripped
- `/blob/` URLs → error with helpful message suggesting `/tree/` or repo URL
- URL-encoded characters → decoded

### Examples

| Input | Output |
|-------|--------|
| `https://github.com/user/repo` | `{ url: "https://github.com/user/repo.git" }` |
| `https://github.com/user/repo.git` | `{ url: "https://github.com/user/repo.git" }` |
| `https://github.com/user/repo/tree/main` | `{ url: "https://github.com/user/repo.git", ref: "main" }` |
| `https://github.com/user/repo/tree/main/plugins/x` | `{ url: "https://github.com/user/repo.git", ref: "main", path: "plugins/x" }` |
| `https://github.com/user/repo/tree/v1.0.0/packages/a/b` | `{ url: "https://github.com/user/repo.git", ref: "v1.0.0", path: "packages/a/b" }` |
| `https://github.com/user/repo?tab=readme` | `{ url: "https://github.com/user/repo.git" }` (query ignored) |
| `https://github.com/user/repo/` | `{ url: "https://github.com/user/repo.git" }` (trailing slash stripped) |

### Error Cases

| Input | Error |
|-------|-------|
| `https://github.com/user/repo/blob/main/file.md` | "Cannot install from single file URL. Use repository or directory URL instead." |
| `https://github.com/user` | "Invalid GitHub URL. Expected: https://github.com/owner/repo" |
| `https://github.com/` | "Invalid GitHub URL. Missing owner and repo" |
| `https://github.com/user/repo/tree/` | "Invalid GitHub URL. Ref is required after /tree/" |

---

## 4. Generic Git URL Parser

### Supported URL Patterns

```
https://<host>/<path>.git
git://<host>/<path>
git@<host>:<path>.git
<any-git-url>#<ref>
<any-git-url>#<ref>&path=<path>
<any-git-url>#path=<path>
```

### Parsing Algorithm

1. Detect git URL by:
   - Protocol: `https://`, `http://`, `git://`, `git@`
   - Extension: ends with `.git`
2. Split URL by `#` to separate base URL and hash fragment
3. Parse hash fragment (if present):
   - Split by `&` to get parts
   - First part without `=` → ref
   - `path=<value>` → path
   - `subdirectory=<value>` → path (backward compat, no warning)
   - Other keys → error (unsupported parameter)
4. Keep base URL as-is (don't normalize)

### Output Structure

```typescript
{
  type: 'git',
  url: '<original-url>',
  ref: 'branch' | 'tag' | 'sha' | undefined,
  path: 'packages/x' | undefined
}
```

### Hash Fragment Format

**Supported Patterns:**
- `#<ref>` → ref only
- `#path=<path>` → path only
- `#subdirectory=<path>` → path only (backward compat)
- `#<ref>&path=<path>` → ref and path
- `#<ref>&subdirectory=<path>` → ref and path (backward compat)

**Important:** No warnings for `subdirectory=` - will naturally phase out with legacy prefixes

### Examples

| Input | Output |
|-------|--------|
| `https://gitlab.com/user/repo.git` | `{ url: "https://gitlab.com/user/repo.git" }` |
| `git@gitlab.com:user/repo.git` | `{ url: "git@gitlab.com:user/repo.git" }` |
| `https://gitlab.com/user/repo.git#main` | `{ url: "https://gitlab.com/user/repo.git", ref: "main" }` |
| `https://example.com/repo.git#v1.0.0&path=packages/a` | `{ url: "https://example.com/repo.git", ref: "v1.0.0", path: "packages/a" }` |
| `git://host/repo.git#path=src/plugin` | `{ url: "git://host/repo.git", path: "src/plugin" }` |
| `https://gitlab.com/user/repo.git#main&subdirectory=packages/x` | `{ url: "https://gitlab.com/user/repo.git", ref: "main", path: "packages/x" }` |

### Error Cases

| Input | Error |
|-------|-------|
| `https://example.com/repo.git#main&foo=bar` | "Invalid hash fragment. Unknown parameter: foo" |
| `https://example.com/repo.git#main&v1.0.0` | "Multiple refs specified in hash fragment" |
| Not a git URL | Returns `null` (not an error, continue detection) |

---

## 5. Legacy Prefix Support

### Deprecated Formats

- `github:<owner>/<repo>[#ref][&subdirectory=<path>]`
- `git:<url>[#ref][&subdirectory=<path>]`

### Handling Strategy

1. Detect legacy prefix in input
2. Emit deprecation warning to console
3. Strip prefix and parse using appropriate new parser
4. Continue processing normally

### Deprecation Warnings

**For `github:` prefix:**
```
⚠️  The 'github:' prefix is deprecated. Use 'gh@user/repo' instead.
```

**For `git:` prefix:**
```
⚠️  The 'git:' prefix is deprecated. Use the URL directly.
```

**Important:** 
- Warnings only shown during CLI input parsing
- NO warnings for `#subdirectory=` parameter
- NO warnings when reading manifest files
- Warnings are console-only (not logged)

### Examples

| Input | Warning | Parsed As |
|-------|---------|-----------|
| `github:user/repo` | Yes (github: deprecated) | `gh@user/repo` |
| `git:https://github.com/user/repo.git` | Yes (git: deprecated) | `https://github.com/user/repo.git` |
| `github:user/repo#main&subdirectory=x` | Yes (github: deprecated) | GitHub URL with ref and path |
| `git:https://gitlab.com/repo.git#main` | Yes (git: deprecated) | Generic git URL with ref |

### Backward Compatibility

- All old syntax continues to work
- Warnings are informational only
- No errors or failures
- Files written in new format regardless of input syntax
- Legacy prefixes never written to manifest

---

## 6. Module Structure

### New Module: `git-url-detection.ts`

**Purpose:** Replace `git-spec.ts` with modern URL detection

**Exports:**

```typescript
// Main entry point
export function detectGitSource(input: string): GitSpec | null

// Individual parsers
export function parseGitHubShorthand(input: string): GitSpec | null
export function parseGitHubUrl(url: string): GitSpec | null
export function parseGenericGitUrl(url: string): GitSpec | null

// Helpers
export function isGitUrl(input: string): boolean
export function normalizeGitHubUrl(owner: string, repo: string): string
```

**Types:**

```typescript
interface GitSpec {
  url: string;       // Normalized git URL
  ref?: string;      // Branch/tag/commit
  path?: string;     // Subdirectory within repo
}
```

### Update: `package-input.ts`

**Changes:**
- Import new `git-url-detection` module
- Update `classifyPackageInput()` to use new parsers
- Add GitHub shorthand detection (priority 1)
- Add URL detection before path detection
- Keep legacy prefix support with warnings

**Detection Flow:**

```typescript
async function classifyPackageInput(raw: string, cwd: string) {
  // 1. Try git source detection
  const gitSpec = detectGitSource(raw);
  if (gitSpec) {
    return {
      type: 'git',
      gitUrl: gitSpec.url,
      gitRef: gitSpec.ref,
      gitPath: gitSpec.path
    };
  }
  
  // 2. Existing path detection
  // 3. Existing registry detection
}
```

---

## 7. Error Handling

### Parse Errors

**Invalid GitHub Shorthand:**
```
Error: Invalid GitHub shorthand 'gh@user'

Expected format: gh@owner/repo[/path]

Examples:
  gh@anthropics/claude-code
  gh@user/repo/plugins/my-plugin
```

**Single File URL:**
```
Error: Cannot install from single file URL

You provided:
  https://github.com/user/repo/blob/main/file.md

To install a package, use:
  • Repository: https://github.com/user/repo
  • With branch: https://github.com/user/repo/tree/main
  • Subdirectory: https://github.com/user/repo/tree/main/plugins/x
  • Shorthand: gh@user/repo/plugins/x
```

**Malformed URL:**
```
Error: Invalid git URL format

The URL could not be parsed: <url>

Supported formats:
  • GitHub: https://github.com/owner/repo.git
  • GitLab: https://gitlab.com/owner/repo.git
  • SSH: git@host:path.git
  • Generic: https://host/path.git
```

**Invalid Hash Fragment:**
```
Error: Invalid hash fragment '#main&foo=bar'

Unknown parameter: foo

Supported parameters:
  • ref (unnamed): #main
  • path: #path=plugins/x
  • combined: #main&path=plugins/x
```

### User Guidance Principles

- Always show what was provided
- Always show what's expected
- Provide concrete examples
- Suggest alternatives when applicable
- Link to documentation for complex cases

---

## 8. Testing Strategy

### Unit Tests - GitHub Shorthand

**Valid Cases:**
- `gh@user/repo` → valid, no path
- `gh@user/repo/plugins/x` → valid with path
- `gh@user/repo/a/b/c` → valid with nested path
- `gh@user/repo/` → valid, empty path = undefined

**Error Cases:**
- `gh@user` → error (missing repo)
- `gh@user/` → error (empty repo)
- `gh@` → error (missing owner and repo)
- `gh@/repo` → error (empty owner)

### Unit Tests - GitHub URL

**Valid Cases:**
- `https://github.com/user/repo` → valid
- `https://github.com/user/repo.git` → valid (strip .git)
- `https://github.com/user/repo/tree/main` → valid with ref
- `https://github.com/user/repo/tree/main/plugins/x` → valid with ref + path
- `https://github.com/user/repo/tree/v1.0.0/a/b/c` → valid with tag + nested path
- `https://github.com/user/repo?tab=readme` → valid (ignore query)
- `https://github.com/user/repo/` → valid (strip trailing slash)

**Error Cases:**
- `https://github.com/user/repo/blob/main/file.md` → error
- `https://github.com/user` → error
- `https://github.com/` → error
- `https://github.com/user/repo/tree/` → error (empty ref)

### Unit Tests - Generic Git URL

**Valid Cases:**
- `https://gitlab.com/user/repo.git` → valid
- `git@github.com:user/repo.git` → valid
- `git://host/repo.git` → valid
- `https://example.com/repo.git#main` → valid with ref
- `https://gitlab.com/repo.git#main&path=x` → valid with ref + path
- `https://example.com/repo.git#path=x` → valid with path only
- `https://example.com/repo.git#subdirectory=x` → valid (backward compat)

**Error Cases:**
- `https://example.com/repo.git#main&foo=bar` → error (unknown param)
- `https://example.com/repo.git#main&v1.0.0` → error (multiple refs)

### Unit Tests - Legacy Syntax

**With Warnings:**
- `github:user/repo` → valid with warning, parsed as `gh@user/repo`
- `git:https://github.com/user/repo.git` → valid with warning, parsed as GitHub URL
- `github:user/repo#main` → valid with warning
- `git:https://gitlab.com/repo.git#main&subdirectory=x` → valid with warning (no subdirectory warning)

### Integration Tests

**Detection Priority:**
- `gh@user/repo` detected before path check
- GitHub URLs detected before generic git
- Git URLs detected before path check
- Legacy prefixes detected and handled

**End-to-End Parsing:**
- All valid inputs produce correct GitSpec
- All error cases produce clear error messages
- Deprecation warnings shown for legacy syntax
- No warnings for hash fragment parameters

---

## Summary

### What Gets Implemented

✅ GitHub shorthand parser (`gh@user/repo[/path]`)
✅ GitHub web URL parser (extract ref/path from URL structure)
✅ Generic git URL parser (any git URL + hash fragments)
✅ Legacy prefix detection (with deprecation warnings)
✅ Updated detection priority order
✅ Clear error messages with examples
✅ Comprehensive test coverage

### Key Behaviors

- GitHub shorthand always uses default branch (no ref support)
- GitHub URLs extract ref and path from URL structure
- Generic git URLs use hash fragments for ref and path
- Legacy prefixes emit warnings but continue to work
- `subdirectory=` in hash fragments supported without warnings
- All parsers produce consistent `GitSpec` output

### Next Phase

Phase 2 will implement schema changes and auto-migration to support the new `url:` field format in openpackage.yml.

---

## Implementation Notes (Completed)

### Files Created
- `src/utils/git-url-detection.ts` - New module with all git source detection and parsing logic
- `tests/utils/git-url-detection.test.ts` - Comprehensive unit tests for all parsers
- `tests/utils/package-input-git-detection.test.ts` - Integration tests for classifyPackageInput

### Files Modified
- `src/utils/package-input.ts` - Updated to use `detectGitSource()` from new module
  - Changed import from `git-spec` to `git-url-detection`
  - Updated to use `gitPath` instead of `gitSubdirectory` (consistent naming)

### Backward Compatibility
- Old `git-spec.ts` module preserved for manifest parsing (used by `parsePackageYml`)
- All legacy tests continue to pass
- No breaking changes to existing functionality

### Detection Priority (Final Implementation)
1. Legacy prefixes (`github:`, `git:`) - checked first to avoid conflicts
2. GitHub shorthand (`gh@owner/repo`)
3. GitHub web URLs (extracts ref/path from URL structure)
4. Generic git URLs (with hash fragments)

**Note:** Legacy prefixes must be checked first because they mask the underlying URL format. For example, `git:https://...` starts with `git:` and must be detected before trying to parse the `https://` portion.

### Test Coverage
- ✅ 50+ test cases covering all parsers
- ✅ Error cases with clear error messages
- ✅ Edge cases (URL encoding, special characters, etc.)
- ✅ Integration with `classifyPackageInput()`
- ✅ Deprecation warnings for legacy prefixes

### Known Limitations
- None. All planned functionality implemented.
