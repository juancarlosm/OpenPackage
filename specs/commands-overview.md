# Commands Overview

This file provides high-level semantics for core commands in the path-based model. Detailed behaviors in subdirs (e.g., [Save](save/), [Pack](pack/)). Commands enforce mutability (e.g., save/add require mutable sources).

## Command Summary

| Command | Direction | Purpose | Mutable Source | Immutable Source |
|---------|-----------|---------|----------------|------------------|
| `save` | Workspace → Source | Sync edits back | ✅ | ❌ Error |
| `add` | Workspace → Source | Add new files | ✅ | ❌ Error |
| `pack` | Source → Registry | Create immutable snapshot | ✅ | N/A |
| `apply` | Source/Registry → Workspace | Sync content to platforms | ✅ | ✅ |
| `install` | Registry → Workspace | Install version (git/path too) | N/A | ✅ |
| `status` | N/A | Report sync state | ✅ | ✅ |
| `uninstall` | Workspace | Remove package files/mappings | ✅ | ✅ |
| `push` | Local → Remote | Upload (deferred details) | N/A | N/A |

Other: `init`, `list`, `prune`, `login`/`logout` in subdocs or future.

## Detailed Semantics

### `save`

Sync workspace changes to mutable source via index mappings.

- Preconditions: Mutable source; fails on registry.
- Flow: Read index → Collect/resolve conflicts (mtime, platforms) → Write to source.
- Versioning: Computes WIP prerelease; copies full to registry for persistence.
- Example: `opkg save my-pkg` (or `opkg save <path>` for add-like).
- See [Save](save/) and [Save Versioning](save/save-versioning.md).

### `add`

Add new workspace files to mutable source.

- Preconditions: Mutable.
- Flow: Collect input → Map (platform→universal, root→root, other→root/<rel>) → Copy → Update index.
- Options: `--apply` (sync to platforms after).
- Example: `opkg add my-pkg ./new-files/`.
- See [Add](add/).

### `pack`

Archive mutable source to registry snapshot.

- Flow: Read source → Version from yml/compute → Copy dir to registry/<name>/<ver>/.
- Options: `--output <path>` (bypass registry), `--dry-run`.
- Ties to save: Promotes stable from WIP line.
- Example: `opkg pack my-pkg`.
- See [Pack](pack/).

### `apply`

Sync from source/registry to workspace platforms/root.

- Flow: Resolve path → Map files → Write/update → Update index.
- Handles universal/platform variants, conflicts.
- Example: `opkg apply my-pkg`.
- See [Apply](apply/).

### `install`

Resolve/install from registry/git/path to workspace.

- Flow: Resolve ver/source → Apply files → Update yml (constraint) / index (path/ver/mappings).
- Partial via `files:` supported.
- Example: `opkg install community-pkg@^1.0.0`.
- See [Install](install/).

### `status`

Check package states.

- Flow: Read index → Validate paths → Hash compare source vs. workspace → Report (synced/modified/missing).
- Example: `opkg status` (✅/⚠️/❌ output).
- See [Status](status/).

### `uninstall`

Remove package from workspace.

- Flow: Read index → Delete mapped files (not source) → Remove sections from root files → Update index/yml.
- Example: `opkg uninstall my-pkg`.
- See [Uninstall](uninstall/).

## Mutability Matrix (Expanded)

| Command | Mutable Source | Immutable Source | Creates Files In |
|---------|----------------|------------------|------------------|
| `save` | ✅ Syncs to source | ❌ Error | Source path |
| `add` | ✅ Adds to source | ❌ Error | Source path |
| `pack` | ✅ Creates version | N/A | Registry |
| `apply` | ✅ Syncs to workspace | ✅ Syncs to workspace | Workspace |
| `install` | N/A | ✅ Syncs to workspace | Workspace |
| `status` | ✅ Shows status | ✅ Shows status | N/A |
| `uninstall` | ✅ Removes | ✅ Removes | N/A (deletes) |

See table above for summary; full ops rules in [Package Sources](package-sources.md).

For CLI options common to commands, see [CLI Options](cli-options.md). Future commands (e.g., elevate) in [Scope Management](scope-management.md).
