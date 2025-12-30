# Pack Command

`opkg pack` creates an immutable versioned snapshot from a mutable package source, copying to the local registry. It promotes dev work to distributable form, tying into save's WIP versioning.

## Purpose & Direction
- **Source → Registry**: Full dir copy to `~/.openpackage/registry/<name>/<version>/`.
- Preconditions: Mutable source (packages/ dir).
- Key: Makes package immutable; enables install/apply from registry path.

## Flow
1. Resolve package source path (from context or arg).
2. Read `openpackage.yml.version` → Target stable `S` (no bump).
3. Copy entire package root (payload rules) to registry/<name>/<S>/ (overwrite if exists).
4. Update workspace index `workspace.version = S`; refresh file mappings.
5. Clean this workspace's WIP versions for the package.
6. Idempotent: Re-pack same → same content.

## Versioning
- Uses exact `openpackage.yml.version` as stable.
- After pack, next `save` bumps to patch line for new WIP.
- See [Save Versioning](save/save-versioning.md).

## Options
- `--output <path>`: Copy directly to `<path>` (bypasses registry structure; `<path>` becomes root).
- `--dry-run`: Simulate without write.
- Global: `--cwd`, etc. (see [CLI Options](../cli-options.md)).

## Example
```bash
opkg pack my-rules  # Assumes cwd/context; copies to registry/my-rules/1.0.0/
```

Output: Shows created path, version.

## Errors
- Immutable source: "Cannot pack from registry."
- Invalid version: Semver checks.

## Integration
- Called after iterative `save` (WIP → stable promotion).
- Payload excludes metadata (see [Registry Payload](../package/registry-payload-and-copy.md)).
- Enables `install <name>@<ver>` from new snapshot.

For impl: [Pack Pipeline](../core/pack/pack-pipeline.ts). Related: [Registry](registry.md), [Commands Overview](commands-overview.md).