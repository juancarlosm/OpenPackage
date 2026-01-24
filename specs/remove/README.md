# Remove Command

`opkg remove` (alias: `rm`) deletes files and directories from a mutable package source. Unlike `uninstall` (which removes packages from workspace), `remove` operates on package source content independently of installation state.

## Purpose & Direction
- **Package Source → Deletion**: Remove files from mutable package sources or workspace root.
- **Independence**: Works with any mutable package (workspace or global), regardless of installation status.
- **Source-only operation**: Modifies package source only; workspace sync requires explicit `install`.
- Opposite of `add` (which copies files into package sources).
- Supports path-only syntax for workspace root operations.

## Preconditions
- Target package must exist as a mutable source:
  - Workspace root: `./.openpackage/` (path-only mode)
  - Workspace packages: `./.openpackage/packages/<name>/`
  - Global packages: `~/.openpackage/packages/<name>/`
- Registry packages are **immutable** and cannot be modified via `remove`.

## Flow
1. **Resolve arguments**:
   - **Two arguments** (`opkg remove <pkg> <path>`): Remove from named package source
   - **One argument** (`opkg remove <path>`): Remove from workspace root (`.openpackage/`)
   - Path validation: Check if path exists in filesystem or workspace root
   - For named packages: search workspace packages, then global packages
   - Error if not found or resolves to immutable registry path
   - Does **not** require package to be in workspace index

2. **Collect files** from input path pattern:
   - Single file: `commands/test.md`
   - Directory: `commands/` (all files recursively)
   - Resolves paths relative to package root.

3. **Confirm removal**:
   - Display list of files to be removed (up to 20, then summarize).
   - Prompt user for confirmation (unless `--force` or `--dry-run`).
   - Allow cancellation.

4. **Remove files**:
   - Delete matched files from package source.
   - Clean up empty parent directories.
   - Track removed files for reporting.

5. **Index updates**:
   - `remove` does **not** update `openpackage.index.yml`.
   - Index updates happen via `install` (if package is installed).

## Options
- `--force`: Skip confirmation prompts.
- `--dry-run`: Preview what would be removed without actually deleting.
- Input: `opkg remove [pkg] [path]` - both arguments optional, at least path required.
- Global flags: [CLI Options](../cli-options.md).

## Examples

### Workspace Root Removal (Path-Only Mode)
```bash
# Remove single file from workspace root (no package name needed)
opkg remove commands/deprecated.md
# Or use the alias
opkg rm commands/deprecated.md

# Remove directory from workspace root
opkg remove rules/old/

# Remove nested files
opkg remove root/config/legacy.yml
```

### Named Package Removal (Two-Arg Mode)
```bash
# Remove single file from workspace package (no workspace sync)
opkg remove my-pkg commands/deprecated.md
# Or use the alias
opkg rm my-pkg commands/deprecated.md

# Remove directory from global package
opkg remove shared-utils rules/old/

# Remove from any directory (works with global packages)
cd ~/projects/other-repo
opkg remove global-pkg agents/legacy.md
```



### Preview before removing
```bash
# See what would be removed from workspace root
opkg remove commands/ --dry-run

# Preview removal from named package
opkg remove my-pkg commands/ --dry-run

# Force removal without confirmation
opkg remove agents/deprecated.md --force
```

### Workflow Examples

#### Workspace Root: Remove → Install
```bash
# 1. Remove files from workspace root
opkg remove commands/deprecated/

# 2. Re-install to sync changes (if needed)
opkg install <workspace-package>
```

#### Named Package: Remove → Install
```bash
# 1. Remove files from package source
opkg remove my-pkg commands/deprecated/

# 2. If package is installed, re-install to sync deletions
opkg install my-pkg
```

## Behavior Details

### Argument Resolution

The `remove` command supports two modes of operation:

#### Two-Argument Mode: `opkg remove <pkg> <path>`
Explicit package targeting:
```bash
opkg remove my-pkg commands/test.md     # Remove from workspace/global package
opkg remove global-utils config.yml     # Works with global packages
```

#### One-Argument Mode: `opkg remove <path>`
Workspace root targeting (path-only):
```bash
opkg remove commands/test.md    # Remove from .openpackage/
opkg remove rules/              # Remove directory from workspace root
```

**Resolution Logic**:
1. If two arguments provided → always treat as `<pkg> <path>`
2. If one argument provided:
   - Check if it's a valid path (filesystem or workspace root)
   - If path exists → remove from workspace root
   - If path doesn't exist → error with suggestion to use two-arg syntax

**Path Validation**:
- Checks both current directory and `.openpackage/` directory
- Supports relative paths: `commands/test.md`
- Supports absolute paths: `/path/to/file`
- Works from any working directory

### Path Resolution
- Paths are relative to package root (or workspace root in path-only mode)
- Supports both files and directories
- Directory paths can include trailing slash (optional)
- Examples:
  - `commands/test.md` - single file
  - `commands/` or `commands` - entire directory
  - `root/tools/helper.sh` - copy-to-root content

### Empty Directory Cleanup
After removing files, `remove` automatically cleans up empty parent directories:
```
Before: pkg/deep/nested/dir/file.md
After:  (entire deep/ directory removed if it becomes empty)
```

This prevents leaving behind empty directory structures in the package source.

### Confirmation Prompt
Unless `--force` or `--dry-run` is specified, users are prompted:
```
The following 3 files will be removed from 'my-pkg':

  - commands/test1.md
  - commands/test2.md
  - rules/auth.md

Do you want to proceed with the removal? (y/N)
```

For large removals (>20 files), the display is summarized:
```
The following 45 files will be removed from 'my-pkg':

  - commands/test1.md
  - commands/test2.md
  ... (first 20 shown)
  ... and 25 more files

Do you want to proceed with the removal? (y/N)
```

### Dry-Run Mode
With `--dry-run`:
- No files are actually deleted
- Shows preview of what would be removed
- Useful for verifying before executing
- No confirmation prompt needed

## Errors

### Invalid path in path-only mode
```
Path 'nonexistent' not found.

If you meant to specify a package name, use: opkg remove nonexistent <path>
```

### Package not found
```
Package 'my-pkg' not found in workspace or global packages.
Available locations:
  - Workspace packages: ./.openpackage/packages/
  - Global packages: ~/.openpackage/packages/

Registry packages are immutable and cannot be modified directly.
```

### Immutable source (registry)
```
Package 'my-pkg' resolves to a registry path, which is immutable.
Registry packages cannot be modified via remove command.
Path: ~/.openpackage/registry/my-pkg/1.0.0/
```

### Path not found in package
```
Path 'commands/nonexistent.md' not found in package.
Package source: ~/.openpackage/packages/my-pkg/
```

### Path not found in workspace root
```
Path 'commands/nonexistent.md' not found in package.
Package source: /path/to/project/.openpackage/
```

### Empty directory
```
Directory 'commands/' is empty.
No files to remove.
```



### User cancellation
```
Operation cancelled by user.
```

## Integration

### Relationship to other commands
- **`add`**: Opposite operation; add copies TO source, remove deletes FROM source.
- **`install`**: Materializes package to workspace + updates index.
- **`uninstall`**: Removes package from workspace + index (different from remove).
- **`pack`**: Creates registry snapshot from source (deletions reflected in new versions).

### Comparison with Uninstall

| Aspect | `remove` | `uninstall` |
|--------|----------|-------------|
| **Target** | Package source files | Workspace files + index |
| **Mutability** | Requires mutable source | Works with any source |
| **Installation** | Not required | Required (reads index) |
| **Index** | No update | Removes from index |
| **Source** | Modifies source | Preserves source |
| **Scope** | Source-only by default | Workspace cleanup |
| **Purpose** | Content management | Package removal |

### Workflows

1. **Removing from workspace root**:
   ```bash
   opkg remove commands/deprecated/  # Remove from workspace root
   # Or use alias: opkg rm commands/deprecated/
   opkg install <workspace-package>  # Re-install to sync changes (if needed)
   ```

2. **Removing deprecated content from package**:
   ```bash
   opkg remove pkg commands/deprecated/  # Remove from package source
   opkg install pkg                      # Re-install to sync to workspace
   ```

3. **Cleaning up after uninstall**:
   ```bash
   opkg uninstall pkg    # Remove from workspace
   opkg remove pkg root/ # Clean up source files
   ```

4. **Preview before removing**:
   ```bash
   opkg remove commands/ --dry-run       # Preview workspace root removal
   opkg remove pkg commands/ --dry-run   # Preview package removal
   opkg remove commands/ --force         # Execute without prompt
   ```

## Behavior Changes

### Current behavior (v2)
- Supports both two-arg (`pkg + path`) and one-arg (`path` only) modes.
- **Path-only mode**: Targets workspace root (`.openpackage/`) directly.
- Works with any mutable package (workspace or global).
- Does **not** update workspace index (separation of concerns).
- Users explicitly control workspace sync via `install`.
- Uses consistent argument resolution with `add` command.

### Previous behavior (v1)
- Required both package name and path arguments.
- No workspace root targeting support.
- Otherwise functionally equivalent to current behavior.

## Implementation
- Pipeline: `src/core/remove/remove-from-source-pipeline.ts`
- Collector: `src/core/remove/removal-collector.ts`
- Confirmation: `src/core/remove/removal-confirmation.ts`
- Source resolution: `src/core/source-resolution/resolve-mutable-source.ts`
- Command: `src/commands/remove.ts`
- Tests: `tests/core/remove/remove-from-workspace-root.test.ts`

## See Also
- [Add](../add/) – Copy files into package sources (opposite operation)
- [Install](../install/) – Install package to workspace
- [Uninstall](../uninstall/) – Remove package from workspace
- [Package Index](../package/package-index-yml.md) – Workspace installation state
- [Commands Overview](../commands-overview.md) – All command relationships
