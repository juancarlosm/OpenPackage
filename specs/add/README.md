# Add Command

`opkg add` incorporates new files from workspace into a mutable package source, updating mappings in the unified index. Complements `save` (edits) for initial/new content addition.

## Purpose & Direction
- **Workspace → Source**: Copy new files; discover/map based on location.
- Preconditions: Mutable source.
- Key: Handles platform files (to universal), root files, arbitrary (to root/<relpath>); optional apply after.

## Flow
1. Resolve package source (mutable check; error if registry).
2. Collect files from input path(s) or detected.
3. Map & copy:
   - Platform subdirs (e.g., .cursor/rules/) → universal (rules/).
   - Platform root (e.g., CLAUDE.md) → package root.
   - Other workspace paths → package root/<workspace-relpath> (prefix for install stripping).
4. Update index with new mappings.
5. Optional: `apply` to sync to other platforms.

## Options
- `--apply`: Sync added content to workspace platforms after copy.
- Input: `opkg add <pkg> <path>` or detect from cwd.
- Global flags: [CLI Options](../cli-options.md).

## Example
```bash
opkg add my-pkg ./new-helpers/  # Copies to root/new-helpers/; updates index
```

## Errors
- Immutable source.
- Conflicts during map (prompt/force?).

## Integration
- Builds on file discovery/mapping like save/install.
- Enables `save` after for versioning/pack.
- See [Save](save/) for sync; [Package Index](package/package-index-yml.md) for mappings; [Commands Overview](commands-overview.md).

Impl: [Add Pipeline](../core/add/add-pipeline.ts).