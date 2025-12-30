# Uninstall Command

`opkg uninstall` removes a package's files/mappings from workspace without touching source. Cleans index/yml/root files.

## Purpose
- Workspace cleanup: Reverse of install/apply.
- Safe: Only mapped content; source persists.

## Flow
1. Read index for package entry/mappings.
2. Delete workspace files/dirs per mappings (platforms/root).
3. Update root files (e.g., remove package section from AGENTS.md).
4. Remove package from index.
5. Remove dep from openpackage.yml.
6. Optional: Prune unused registry if applicable.

## Options
- `--dry-run`: Preview deletions.
- Force without prompt.

## Example
```bash
opkg uninstall my-pkg  # Deletes mappings; updates files/index/yml
```

## Errors
- Package not installed.
- Files in use (rare; force?).

## Integration
- Uses same discovery as status/install.
- Post-uninstall: Re-add via install/add.
- See [Commands Overview](commands-overview.md); [Uninstall Pipeline](../core/uninstall/uninstall-pipeline.ts).

Root file handling: [Root Files](package/package-root-layout.md).