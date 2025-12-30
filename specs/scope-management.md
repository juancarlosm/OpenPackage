# Scope Management (Deferred Aspects)

Package scopes distinguish local vs. shared mutable sources. Supports workspace and global scopes via paths; transitions are manual. Automated commands (`elevate`, `localize`) deferred to future release.

## Scopes Overview

| Scope | Location | Shared? | Use Case |
|-------|----------|---------|----------|
| **Workspace (Local)** | `./.openpackage/packages/<name>/` | No | Project-specific development |
| **Global** | `~/.openpackage/packages/<name>/` | Yes | Cross-project utilities/rules |
| **Registry** | `~/.openpackage/registry/<name>/<ver>/` | N/A | Immutable snapshots (scope-agnostic) |

Registry is scope-neutral (immutable). See [Package Sources](package-sources.md).

## Current Workflows (Manual)

### Creating Workspace Package
```bash
mkdir -p .openpackage/packages/my-rules
# Init openpackage.yml (manual or future `opkg init <name>`)
# Add to deps in .openpackage/openpackage.yml:
# - name: my-rules
#   path: ./.openpackage/packages/my-rules/
```
- Mutable; full ops.

### Using Global Package
```bash
mkdir -p ~/.openpackage/packages/shared-rules
# Create openpackage.yml
# In any workspace openpackage.yml:
# - name: shared-rules
#   path: ~/.openpackage/packages/shared-rules/
```
- Mutable; shared.

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