# Implementation Plan: Modern Git Source Syntax

## Overview

This implementation plan modernizes git source syntax for the `opkg install` command by adding URL-based detection and GitHub shorthand notation while maintaining full backward compatibility with existing syntax.

**Goals:**
- Add intuitive `gh@user/repo` shorthand for GitHub sources
- Support direct GitHub web URLs (`https://github.com/user/repo/tree/ref/path`)
- Auto-detect git URLs without requiring `git:` prefix
- Simplify manifest schema by embedding ref in URL
- Deprecate `github:` and `git:` prefixes (soft deprecation with warnings)
- Maintain 100% backward compatibility (no breaking changes)

**Non-Goals:**
- No breaking changes or forced migrations
- No version bump to v1.0.0
- No removal of legacy syntax
- No migration commands (auto-migration handles everything)

---

## Implementation Phases

### Phase 1: Input Detection & Parsing ✅ COMPLETE
**File:** [01-input-detection.md](./01-input-detection.md)

Implement new parsers and detection logic:
- ✅ GitHub shorthand parser (`gh@user/repo[/path]`)
- ✅ GitHub web URL parser (extract owner/repo/ref/path)
- ✅ Generic git URL parser (any git URL with hash fragments)
- ✅ Legacy prefix detection (with deprecation warnings)
- ✅ Update detection priority order
- ✅ Comprehensive test coverage

### Phase 2: Schema & Auto-Migration ✅ COMPLETE
**File:** [02-schema-migration.md](./02-schema-migration.md)

Update manifest format and implement transparent migration:
- ✅ New `url:` field format (replaces `git:` + `ref:`)
- ✅ Auto-migration on read (old format → new format in-memory)
- ✅ Auto-migration on write (always write new format)
- ✅ Type system updates
- ✅ Path field semantic overloading

### Phase 3: Testing & Documentation ✅ COMPLETE
**File:** [03-testing-docs.md](./03-testing-docs.md)
**Summary:** [PHASE3-SUMMARY.md](./PHASE3-SUMMARY.md)

Comprehensive testing and documentation:
- ✅ Unit tests (parsers, migrations, edge cases)
- ✅ Integration tests (end-to-end, backward compat)
- ✅ Regression tests (no breaking changes)
- ✅ User documentation (README, help text, examples)
- ✅ Spec documentation updates

---

## Quick Reference

### New Syntax Examples

**GitHub Shorthand:**
```bash
gh@anthropics/claude-code
gh@user/repo/plugins/my-plugin
```

**GitHub Web URLs:**
```bash
https://github.com/user/repo
https://github.com/user/repo/tree/main/plugins/x
```

**Generic Git URLs:**
```bash
https://gitlab.com/user/repo.git#v1.0.0
git@github.com:user/repo.git#main&path=plugins/x
```

**Manifest Format:**
```yaml
packages:
  # No ref (default branch)
  - name: my-plugin
    url: https://github.com/user/repo.git
    path: plugins/x
  
  # With ref (branch/tag/commit)
  - name: my-plugin-versioned
    url: https://github.com/user/repo.git#v1.0.0
    path: plugins/x
```

---

## What's Changing

### ✅ Added
- `gh@owner/repo[/path]` shorthand
- GitHub web URL parsing
- Direct git URL support (no prefix)
- `url:` field in manifest with embedded `#ref`
- Auto-migration (transparent)

### ⚠️ Deprecated
- `github:` prefix (warning, still works)
- `git:` prefix (warning, still works)

### ✅ Unchanged
- 100% backward compatible
- No breaking changes
- No forced migrations
- Path/registry sources
- All existing functionality

---

## Implementation Timeline

**✅ Phase 1:** Input Detection & Parsing - COMPLETE
**✅ Phase 2:** Schema & Auto-Migration - COMPLETE
**✅ Phase 3:** Testing & Documentation - COMPLETE

**Status:** Implementation complete and production-ready.

---

## Success Criteria

- ✅ All new parsers working correctly
- ✅ Auto-migration transparent to users
- ✅ Deprecation warnings clear and helpful
- ✅ 100% backward compatibility maintained
- ✅ All existing tests pass
- ✅ New integration tests added (19 tests)
- ✅ Documentation updated and clear
- ✅ No user action required for existing projects

**All success criteria met. Implementation complete.**
