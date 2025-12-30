# Package Sources

All packages resolve to a filesystem **path** as the source of truth. Dependency declarations in `openpackage.yml` determine the type, with mutability enforced based on the resolved location.

## Source Types

### 1. Workspace Path (Mutable)

Local project-specific source.

```yaml
packages:
  - name: project-tools
    path: ./.openpackage/packages/project-tools/
```

- Relative to workspace `openpackage.yml`.
- Full dev support: `save`, `add`, `pack`, `apply`.
- See [Directory Layout](directory-layout.md).

### 2. Global Path (Mutable)

Shared across workspaces.

```yaml
packages:
  - name: shared-rules
    path: ~/.openpackage/packages/shared-rules/
```

- Tilde-expanded to user home.
- Same ops as workspace path.

### 3. Registry Version (Immutable)

From local registry; path inferred at runtime.

```yaml
packages:
  - name: community-pkg
    version: ^1.2.0  # Range or exact; resolves to latest satisfying
```

- No `path:` written to yml (inferred from index post-install).
- Resolved dir: `~/.openpackage/registry/<name>/<resolved-version>/`.
- `apply`/`install` ok; `save`/`add` error (immutable).

### 4. Git Source (Typically Immutable)

Cloned to local path; mutability by location.

```yaml
packages:
  - name: git-pkg
    git: https://github.com/user/repo.git
    ref: main  # Branch/tag/commit optional
```

- Cloned to `~/.openpackage/registry/...` (current impl; thus immutable).
- Ops: `apply`/`install` ok; `save`/`add` fail if in registry.
- Future: Could clone to mutable dir for editability.
- See [Git Sources](install/git-sources.md) for install details.

Other: Absolute/custom paths treated by resolved location.

## Source Resolution Flow

```text
1. Parse dep from openpackage.yml
2. Determine type:
   - `path:` → Resolve (tilde/rel/abs); validate exists
   - `version:` → Query registry for matching version → Infer path
   - `git:` → Clone/fetch to local dir → Use resolved path
3. Classify mutability: registry/ → immutable; packages/ or custom → mutable
4. Ops proceed or error (e.g., save requires mutable)
```

Details in [Dependency Resolver](../core/dependency-resolver.ts); errors in [Install Errors](../core/install/install-errors.ts).

## Mutability Rules

| Source Type                      | `save`   | `add`   | `pack`               | `apply` | `install` | Notes             |
|----------------------------------|----------|---------|----------------------|---------|-----------|-------------------|
| Workspace/Global Path (`packages/`) | ✅       | ✅       | ✅                    | ✅       | N/A       | Mutable dev       |
| Registry (`registry/<name>/<ver>/`) | ❌ Error | ❌ Error | N/A                  | ✅       | ✅         | Immutable         |
| Git (resolved to registry/)      | ❌       | ❌       | ✅ (if mutable, else N/A) | ✅       | ✅         | Current: immutable|
| Custom Path (non-registry)       | ✅ (if writable) | ✅       | ✅                    | ✅       | N/A       | User-defined      |

Errors guide users (e.g., "Copy to mutable dir first").

## Error Handling Examples

### Modifying Immutable

```
Error: Cannot save 'community-pkg' – from registry (immutable, v1.2.3).
Path: ~/.openpackage/registry/community-pkg/1.2.3/

Fix: Copy to ~/.openpackage/packages/, update path:, edit, then pack.
```

### Path Not Found

```
Error: Source not found for 'my-rules': ~/.openpackage/packages/my-rules/
Run `opkg status` to verify.
```

## Path Resolution

### Tilde Expansion

`~/.openpackage/...` expands to user's home directory at runtime.

Stored in YAML with tilde for portability across machines.

### Relative Paths

Relative paths (e.g., `./.openpackage/packages/...`) resolve relative to the `openpackage.yml` file location.

### Portability

| Path Type | Example | Portability |
|-----------|---------|-------------|
| Tilde | `~/.openpackage/packages/...` | ✅ Portable (same home structure) |
| Relative | `./.openpackage/packages/...` | ✅ Portable (committed with project) |
| Absolute | `/opt/packages/...` | ❌ Machine-specific |

## Registry Path After Install

`openpackage.yml` declares dependency **intent** (e.g., version constraint). On `install` from registry:

- yml **unchanged**: Keeps requested `version` (range/exact); no `path:` added (inferred at runtime).
- Unified index updated with **resolved facts**: exact version, source path, mappings.

Example:

```yaml
# openpackage.yml (before and after install - unchanged)
packages:
  - name: community-pkg
    version: ^1.2.0  # Intent: latest satisfying ^1.2.0

# .openpackage/openpackage.index.yml (added/updated after install)
packages:
  community-pkg:
    version: 1.2.3  # Resolved exact (e.g., latest in range from local/remote)
    path: ~/.openpackage/registry/community-pkg/1.2.3/  # Resolved source
    files:
      rules/auth.md: [.cursor/rules/auth.md, .opencode/rules/auth.md]  # Mappings
      # ... more
```

- If re-install runs with same constraint, prefers same resolved version (local-first).
- See [Version Resolution](install/version-resolution.md) for selection logic; [Workspace Index](package/package-index-yml.md) for full schema; [Package Sources](.) for inference rules.
