# Directory Layout

This document describes the global (`~/.openpackage/`) and workspace directory structures central to the path-based model.

## Global Directory (`~/.openpackage/`)

The global dir holds shared mutable sources and local registry snapshots.

```
~/.openpackage/
├── packages/                          # Mutable development codebases
│   ├── <name>/                       # e.g., shared-rules/
│   │   ├── openpackage.yml           # Manifest
│   │   ├── commands/                 # Universal content
│   │   ├── rules/
│   │   └── root/                     # Copy-to-root files
│   └── @scope/                       # Scoped (e.g., @org/tools/)
│       └── <name>/
│
├── registry/                          # Immutable versioned snapshots
│   ├── <name>/                       # Directory-based (no tarballs)
│   │   ├── <version>/                # e.g., 1.0.0/
│   │   │   ├── openpackage.yml
│   │   │   ├── commands/
│   │   │   ├── rules/
│   │   │   └── AGENTS.md             # Root files
│   │   └── <version>/
│   └── @scope/
│       └── <name>/
│           └── <version>/
│
└── config.yml                         # Global config (future?)
```

## Workspace Directory

Workspace-local metadata and packages; platforms are sync targets.

```
<workspace>/
├── .openpackage/                      # Local metadata & packages
│   ├── openpackage.yml               # Root manifest (deps)
│   ├── openpackage.index.yml         # Unified index (all packages/sources/mappings)
│   └── packages/                     # Workspace-local mutable sources
│       └── <name>/                   # e.g., project-tools/
│           ├── openpackage.yml
│           ├── commands/
│           └── root/
│
├── .cursor/                           # Platform dir (sync target)
│   ├── rules/                        # From package universal subdirs
│   └── commands/
├── .opencode/                         # Other platforms
│   └── ...
└── docs/                              # Root-level (e.g., from package root/ or AGENTS.md processing)
    └── ...
```

## Directory Purposes

| Directory | Purpose | Mutability | Notes |
|-----------|---------|------------|-------|
| `~/.openpackage/packages/` | Global shared dev codebases | ✅ Mutable | Cross-workspace sharing |
| `~/.openpackage/registry/` | Versioned immutable snapshots | ❌ Immutable | From pack; git clones cached here |
| `./.openpackage/packages/` | Workspace-local dev codebases | ✅ Mutable | Project-specific; inside .openpackage/ for cleanliness |
| `./.openpackage/openpackage.index.yml` | Tracks installs/sources/mappings | Metadata | Unified; never in payload |

## Key Principles

- **Unified Index**: Single file at `.openpackage/openpackage.index.yml` for all package tracking—replaces prior per-package indices.
- **Directory Registry**: Expanded dirs for easy inspection/debugging; same code for all sources (no extraction).
- **Workspace Packages in `.openpackage/`**: Keeps root clean; signals opkg management.
- **No Workspace Metadata in Payload**: `.openpackage/` excluded from registry copies.

See [Package Root Layout](package/package-root-layout.md) for inside package dirs; [Registry](registry.md) for version details.

## Path Conventions

| Type | Example | Use | Portability |
|------|---------|-----|-------------|
| Workspace Rel | `./.openpackage/packages/my-pkg/` | Local packages | ✅ (project-committed) |
| Global Tilde | `~/.openpackage/packages/shared/` | Shared | ✅ (tilde expands) |
| Registry | `~/.openpackage/registry/my-pkg/1.0.0/` | Immutable | Inferred post-install |
| Absolute | `/custom/path/` | Custom | ❌ Machine-specific |

Tilde `~` expands at runtime; relatives from openpackage.yml location.

## Key Changes from Prior Versions

- **Unified Index**: Single file vs. per-package.
- **No Per-Package Metadata Dirs**: Embedded in index.
- **Directory Registry**: No tarballs.
- **Workspace Packages Location**: `./.openpackage/packages/` (was `./packages/?`).

For source resolution, see [Package Sources](package-sources.md).