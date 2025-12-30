### Registry Payload and 1:1 Copy

The **registry payload** for a given version is defined structurally. There is
no manifest-level include/exclude filtering.

---

#### 1. Payload membership

**Never include (always excluded):**
- `.openpackage/**` (workspace-local metadata directory; never part of payload)
- `openpackage.index.yml` (workspace-local index; never part of payload)
- `packages/**` (reserved; never part of payload)

**Always include:**
- `openpackage.yml` (package manifest; marks the package root)

**Included in the payload when present at the package root:**
- Universal subdirs (standard: `commands/`, `rules/`, `agents/`, `skills/`, plus custom from `platforms.jsonc`)
- Root files (e.g., `AGENTS.md`, and platform root files like `CLAUDE.md`)
- `root/**` (direct copy; copied 1:1 to workspace root with `root/` stripped on install)
- Other root-level files/dirs (e.g., `README.md`, `LICENSE.md`, arbitrary folders)

> **Note**: Some root-level content is not installed by default, but it can still be
> part of the payload (e.g., docs or license files).

---

#### Save, Pack, and Install Operations

**Pack (Source → Registry)**:
- From mutable source, creates immutable snapshot in `~/.openpackage/registry/<name>/<version>/`.
- Copies full package root (per payload rules); idempotent overwrite.
- Example: `opkg pack my-pkg` → dir copy, no extraction.

**Save (Workspace → Source, then optional pack)**:
- Syncs edits to mutable source root.
- Files written unchanged; can pack after to registry.
- Does not directly write to registry (pack does that).

**Install/Apply (Registry/Source → Workspace)**:
- Reads from registry version dir or source path.
- Maps payload to workspace (universal → platforms, root/ → root, root files → root).
- Updates index with mappings; yml with intent (no path for registry).
- Example: `opkg install my-pkg@1.0.0` → copies from registry dir.

> **Note**: `cwd/.openpackage/packages/` reserved for nested workspace packages. See [Pack](pack/), [Install](install/), [Save](save/) for flows; [Registry](registry.md) for storage.

---

#### Example Registry Version Directory

Each version directory in the registry is a complete, self-contained copy of the package root (per payload rules above):

```text
~/.openpackage/registry/my-rules/1.0.0/
├── openpackage.yml            # Package manifest (name, version, deps)
├── commands/                  # Universal subdirs (from platforms.jsonc)
│   └── *.md
├── rules/
│   └── *.md
├── agents/                   # Example universal subdir
│   └── *.md
├── root/                     # Copy-to-root content (prefix stripped on install)
│   └── utils/
│       └── helper.md
├── AGENTS.md                 # Root files (universal or platform-specific)
└── README.md                 # Other root files (docs, etc.)
```

- Matches [Package Root Layout](package-root-layout.md).
- Installed via [Install Flow](install/install-behavior.md).

---

#### Guarantees

This system guarantees that:

- The **workspace package root** (root or nested) and the **registry version directory** share the **same tree shape**
- Save and install operations are **pure copies** at the package boundary, without structural rewrites
- Packages can be moved between locations (workspace root ↔ nested ↔ registry) without modification

