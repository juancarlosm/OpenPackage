# Scope Management (Deferred Aspects)

Package scopes distinguish local vs. shared mutable sources. Supports workspace and global scopes via paths; transitions are manual. Automated commands (`elevate`, `localize`) deferred to future release.

## Scopes Overview

| Scope | Location | Shared? | Use Case |
|-------|----------|---------|----------|
| **Workspace (Local)** | `./.openpackage/packages/<name>/` | No | Project-specific development |
| **Global** | `~/.openpackage/packages/<name>/` | Yes | Cross-project utilities/rules |
| **Registry** | `~/.openpackage/registry/<name>/<ver>/` | N/A | Immutable snapshots (scope-agnostic) |

Registry is scope-neutral (immutable). See [Package Sources](package-sources.md).

## Current Workflows

### Creating Local Package (Workspace-Scoped)
```bash
# Interactive (prompts for scope)
opkg new my-rules

# Explicit
opkg new my-rules --scope local
# Creates: .openpackage/packages/my-rules/openpackage.yml
# Automatically added to workspace manifest with path reference
```
- Mutable; full ops.
- Project-specific; not shared across workspaces.

### Creating Global Package (Cross-Workspace)
```bash
opkg new shared-rules --scope global
# Creates: ~/.openpackage/packages/shared-rules/openpackage.yml
# Reference in any workspace openpackage.yml:
# - name: shared-rules
#   path: ~/.openpackage/packages/shared-rules/
```
- Mutable; shared across all workspaces.
- Useful for personal utilities, common rules, etc.

### Creating Root Package (Current Directory)
```bash
opkg new my-package --scope root
# Creates: ./openpackage.yml in current directory
```
- Mutable; current directory is the package.
- Typical for dedicated package repositories.

### Manual Scope Transitions
#### Workspace → Global (Elevate-like)
Share project pkg globally:
```bash
cp -r .openpackage/packages/my-rules ~/.openpackage/packages/
# Update deps path: ./.openpackage/... → ~/.openpackage/...
# Optional: rm local copy after verify
```
- Update index if needed.

#### Global → Workspace (Localize-like)
Fork shared for project mods:
```bash
cp -r ~/.openpackage/packages/shared-rules .openpackage/packages/
# Update deps path: ~/.openpackage/... → ./.openpackage/...
```

## Future: Automated Transitions (Deferred)

### `opkg elevate <name>` (Workspace → Global)
Promote local to shared.
```bash
opkg elevate my-rules  # Copies, updates paths/index; --clean removes local
```
Flow: Copy → Update yml/index → Optional clean.

Options: `--force` (overwrite), `--clean`.

### `opkg localize <name>` (Global → Workspace)
Copy shared for local edits.
```bash
opkg localize shared-tools
```
Flow: Copy → Update paths/index.

This enables workflow: Dev local → Elevate for sharing → Localize forks.

## Integration Notes

- Scoping affects naming in push/registry (see [Push Scoping](push/push-scoping.md)).
- All mutable via `packages/` dirs.
- Deferred: No CLI auto-detection of scope changes; manual path updates.

See [Directory Layout](directory-layout.md) for locations; future updates in git.