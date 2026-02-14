# New Command - Summary

## Quick Reference

```bash
# Create package (defaults to global scope)
opkg new my-package

# Create project package (explicit)
opkg new my-package --scope project

# Create global package
opkg new shared-utils --scope global

# Create root package
opkg new my-package --scope root

# Force overwrite
opkg new my-package --scope project --force
```

## What is `opkg new`?

The `opkg new` command creates new OpenPackage packages with explicit scope support. It replaces the deprecated `opkg init` command with clearer semantics and better UX.

## Key Features

### Three Scopes

1. **Project** - Workspace-scoped packages
   - Location: `./.openpackage/packages/<name>/`
   - Best for project-specific packages

2. **Global (Default)** - Cross-workspace packages
   - Location: `~/.openpackage/packages/<name>/`
   - Shared across all projects
   - Best for personal utilities

3. **Root** - Current directory as package
   - Location: `./openpackage.yml`
   - Standalone package
   - Best for distribution

### Smart Behavior

- **Default Scope**: Defaults to `global` if not specified
- **Minimal Creation**: Creates minimal manifest with name only (use `opkg set` for metadata)
- **Conflict Detection**: Won't overwrite without `--force`

### Package Creation

For project packages:
- Package is created in `.openpackage/packages/<name>/`
- Not automatically added to workspace (use `opkg install` to add)
- Separation between creation and usage

## When to Use Each Scope

| Situation | Scope | Command |
|-----------|-------|---------|
| Project-specific rules | `project` | `opkg new my-rules` |
| Personal utilities | `global` | `opkg new utils --scope global` |
| Distributable package | `root` | `opkg new pkg --scope root` |
| Team shared package | `root` | `opkg new team-pkg --scope root` (separate repo) |
| Temporary/experimental | `project` | `opkg new experiment` |

## Common Workflows

### Local Package Development

```bash
# Create package
opkg new my-package

# Add content
cd .openpackage/packages/my-package/
mkdir -p rules
echo "# Rule" > rules/rule1.md

# Install to sync to workspace
opkg install my-package
```

### Global Package Usage

```bash
# Create global package
opkg new shared-prompts --scope global

# Add content
cd ~/.openpackage/packages/shared-prompts/
mkdir -p .cursor/prompts
echo "# Prompt" > .cursor/prompts/prompt1.md

# Use in any workspace
cd ~/projects/any-project/
# Add to .openpackage/openpackage.yml:
# packages:
#   - name: shared-prompts
#     path: ~/.openpackage/packages/shared-prompts/
opkg install
```

### Root Package Distribution

```bash
# Create package repo
mkdir my-package && cd my-package
opkg new --scope root

# Add content
mkdir -p .cursor/rules
echo "# Rule" > .cursor/rules/rule1.md

# Package ready for distribution via git or registry
```

## Comparison with Deprecated `opkg init`

| Feature | `opkg init` (deprecated) | `opkg new` |
|---------|-------------------------|-----------|
| Create root package | `opkg init` | `opkg new --scope root` |
| Create local package | `opkg init <name>` | `opkg new <name>` |
| Create global package | ❌ Not supported | `opkg new <name> --scope global` |
| Workspace init | Manual required | Auto-created |
| Scope clarity | ❌ Implicit | ✅ Explicit |
| Dual purpose | ✅ Yes (confusing) | ❌ No (clear) |

## Integration with Other Commands

### After Creation

```bash
# Create → Add content → Install
opkg new my-pkg
# ... add files to package source ...
opkg install my-pkg
```

### With Install

```bash
# Create project package
opkg new my-pkg

# Workspace manifest updated automatically
opkg install  # Installs all deps including my-pkg
```

### With Status

```bash
opkg new my-pkg
# ... make changes ...
opkg list my-pkg  # Check sync state
```

## Options Reference

### `--scope <scope>`

Specifies package scope:
- `root` - Current directory
- `project` - Workspace packages
- `global` - Global packages (default)

**Example:**
```bash
opkg new my-pkg --scope global
```

### `-f, --force`

Overwrites existing package without confirmation.

**Example:**
```bash
opkg new existing-pkg --force
```

## Error Handling

### Missing Package Name
```
Error: Package name is required for project scope.
Usage: opkg new <package-name> --scope project
```

### Invalid Scope
```
Error: Invalid scope: 'invalid'
Valid scopes: root, project, global
```

### Invalid Package Name
```
Error: Package name 'Invalid-Name' is invalid.
Package names must be lowercase...
```

### Existing Package (without --force)
```
✓ .openpackage/packages/existing-pkg/openpackage.yml already exists
  - Name: existing-pkg
  - Version: 1.0.0
```

## Best Practices

### Do's

✅ Use project scope for project-specific packages
✅ Use global scope for personal utilities
✅ Use root scope for distributable packages
✅ Run `opkg new` early in development

### Don'ts

❌ Don't use root scope for project-specific packages
❌ Don't commit global packages to project repos
❌ Don't use force flag without understanding impact
❌ Don't create packages with uppercase names

## Migration from `opkg init`

If you previously used `opkg init`:

```bash
# Old way
opkg init              # Workspace + root package
opkg init my-package   # Project package

# New way
opkg new --scope root  # Just root package
opkg new my-package    # Defaults to global (use --scope project for workspace)
```

See [MIGRATION-INIT-TO-NEW.md](../../MIGRATION-INIT-TO-NEW.md) for complete migration guide.

## File Structure Examples

### Project Package

```
project/
├── .openpackage/
│   ├── openpackage.yml          # Workspace (must be created separately)
│   └── packages/
│       └── my-package/
│           └── openpackage.yml  # Package
└── src/
```

### Global Package

```
~/.openpackage/
└── packages/
    └── shared-utils/
        └── openpackage.yml
```

### Root Package

```
my-package/
└── openpackage.yml
```

## Further Reading

- [Full Command Specification](./README.md) - Complete command details
- [Scope Behavior](./scope-behavior.md) - Deep dive into scopes
- [Scope Management](../scope-management.md) - Scope transitions
- [Commands Overview](../commands-overview.md) - All commands
- [Directory Layout](../directory-layout.md) - Directory structure

## Support

For questions or issues:
1. Check this documentation
2. Run `opkg new --help`
3. Check [MIGRATION-INIT-TO-NEW.md](../../MIGRATION-INIT-TO-NEW.md)
4. Open issue on GitHub
