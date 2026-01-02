# Registry

The local registry stores **immutable, versioned package snapshots** for offline use, distribution, and caching. It uses directory-based storage for simplicity, analogous to a local npm or Docker registry (file-system only currently; remotes deferred).

## Structure

Scoped, nested directories:

```
~/.openpackage/registry/
├── <name>/                           # Unscoped package
│   ├── <version>/                    # e.g., 1.0.0 or WIP prerelease
│   │   ├── openpackage.yml          # Manifest (version, deps)
│   │   ├── commands/                # Universal subdirs
│   │   ├── rules/
│   │   ├── AGENTS.md                # Root files
│   │   └── root/                    # Direct copy content
│   └── <version>/
│
└── @<scope>/                         # Scoped
    └── <name>/
        └── <version>/
            └── ...
```

Each `<version>/` is a full, self-contained package copy (no links/extraction).

## Why Directory-Based (vs. Tarballs)?

| Aspect | Directories | Tarballs |
|--------|-------------|----------|
| Simplicity | ✅ No extraction | ❌ Pack/unpack steps |
| Path Refs | ✅ Direct `path:` works | ❌ Cache + extract |
| Debugging | ✅ Browse files | ❌ Must unpack to inspect |
| Code Reuse | ✅ Same read logic as sources | ❌ Special handling |
| Storage | ⚠️ Uncompressed (text pkgs small) | ✅ Compressed |

The architecture prioritizes dev ergonomics over size.

## Version Directory Contents (Payload)

Full package root; structural rules—no YAML filters.

- **Always**: `openpackage.yml`.
- **Universal Subdirs**: `commands/`, `rules/`, etc. (from platforms.jsonc).
- **Root Files**: `AGENTS.md`, platform variants (e.g., `CLAUDE.md` overrides).
- **root/**: 1:1 copy to workspace root (prefix stripped on install).
- **Other**: Docs (`README.md`), licenses, arbitrary files/dirs.

**Excludes**:
- `.openpackage/**` (metadata).
- `openpackage.index.yml` (workspace-local).
- `packages/**` (reserved).

Details: [Registry Payload and Copy](package/registry-payload-and-copy.md).

## Operations

### Creation (pack)
From mutable source to registry snapshot.

```bash
opkg pack <name>  # Copies source to registry/<name>/<version>/
```

- Version from `openpackage.yml` or computed stable/WIP.
- Full dir copy; marks immutable.
- Options: `--output <path>` (direct copy, no <name>/<ver>); `--dry-run`.
- See [Pack](pack/).

### Consumption (install, apply)
```bash
opkg install <name>@<ver>  # Resolves, copies from registry/<name>/<ver>/ to workspace
opkg apply <name>          # Syncs from inferred path
```

- Direct file access.
- Updates index/yml.
- See [Install](install/), [Apply](apply/).

### Listing
```bash
opkg list <name>  # Versions from dir names
```

### Git Clones in Registry
Git deps cloned here → treated immutable (current behavior).

## Immutability

- Registry dirs read-only: `save`/`add` detect and error.
- Re-pack overwrites entire dir (idempotent).
- No partial updates.

Error example:
```
Error: Cannot save – source in registry (immutable).
Path: ~/.openpackage/registry/my-pkg/1.0.0/
Fix: Copy to packages/, update path.
```

## Scoping

Scoped: `registry/@org/my-pkg/<ver>/`; yml uses `@org/my-pkg`.

## Remote Registries (Deferred)

Future: Push/pull tarballs for transfer; extract to local dir.
See [Push](push/) for upload prep; [Self-Hosted](self-hosted-registries.md) if created.

Cross-links: [Package Sources](package-sources.md) for resolution; [Directory Layout](directory-layout.md).