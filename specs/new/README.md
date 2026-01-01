# New Command Specification

The `opkg new` command creates new packages with explicit scope support. It replaces the deprecated `opkg init` command with clearer semantics and better UX.

## Overview

```bash
opkg new [package-name] [options]
```

Creates a new package with an `openpackage.yml` manifest in one of three scopes:
- **root**: Current directory as package
- **local**: Workspace-scoped package (default)
- **global**: User-scoped package shared across workspaces

## Command Signature

### Arguments
- `[package-name]` (optional for root scope, required for local/global)
  - Package name following OpenPackage naming conventions
  - Supports scoped packages (`@org/package-name`)
  - Validated against naming rules (lowercase, alphanumeric, hyphens, slashes for scopes)

### Options
- `--scope <scope>` - Package scope: `root`, `local`, or `global` (prompts if not specified in interactive mode; required in non-interactive mode)
- `-f, --force` - Overwrite existing package without prompting
- `--non-interactive` - Skip interactive prompts, use defaults
- `-h, --help` - Display help for command

### Scope Selection

When running interactively **without** the `--scope` flag, you'll be prompted to choose:

```bash
$ opkg new my-package
? Where should this package be created? › 
❯ Root (current directory) - Create openpackage.yml here - for standalone/distributable packages
  Local (workspace-scoped) - Create in .openpackage/packages/ - for project-specific packages
  Global (cross-workspace) - Create in ~/.openpackage/packages/ - shared across all workspaces on this machine
```

This ensures you make an explicit choice about where your package lives. For CI/CD and automation, use the `--scope` flag to skip the prompt.

## Scopes

### Root Scope

**Location:** Current directory (`./openpackage.yml`)

```bash
opkg new my-package --scope root
opkg new --scope root  # Interactive: prompts for name
```

**Use Cases:**
- Dedicated package repository
- Standalone package development
- Similar to `npm init`, `cargo init`

**Behavior:**
- Creates `openpackage.yml` at cwd
- Does not create workspace structure
- Package content lives at cwd

**Example Structure:**
```
my-package/
├── openpackage.yml          # Package manifest
├── .cursor/                 # Platform-specific content
│   ├── rules/
│   └── commands/
├── root/                    # Root files
│   └── AGENTS.md
└── README.md
```

### Local Scope

**Location:** `.openpackage/packages/<package-name>/`

```bash
opkg new my-package              # Interactive: prompts for scope
opkg new my-package --scope local  # Explicit
```

**Use Cases:**
- Project-specific packages
- Workspace-scoped development
- Packages tied to single project

**Behavior:**
- Creates package in `.openpackage/packages/<name>/`
- Auto-creates workspace manifest (`.openpackage/openpackage.yml`)
- Adds package to workspace manifest with path reference
- Package content lives in nested directory

**Example Structure:**
```
project/
├── .openpackage/
│   ├── openpackage.yml      # Workspace manifest (auto-created)
│   └── packages/
│       └── my-package/
│           ├── openpackage.yml  # Package manifest
│           ├── .cursor/
│           │   ├── rules/
│           │   └── commands/
│           └── root/
└── src/                     # Project source code
```

**Workspace Manifest Entry:**
```yaml
packages:
  - name: my-package
    path: ./.openpackage/packages/my-package/
```

### Global Scope

**Location:** `~/.openpackage/packages/<package-name>/`

```bash
opkg new shared-utils --scope global
```

**Use Cases:**
- Personal utilities shared across projects
- Common rules and prompts
- Cross-workspace shared packages

**Behavior:**
- Creates package in global directory
- Not added to workspace manifest (used via path reference)
- Persists across all workspaces

**Example Structure:**
```
~/.openpackage/
└── packages/
    └── shared-utils/
        ├── openpackage.yml
        ├── .cursor/
        │   ├── rules/
        │   └── commands/
        └── root/
```

**Usage in Workspace:**
```yaml
# Any workspace's .openpackage/openpackage.yml
packages:
  - name: shared-utils
    path: ~/.openpackage/packages/shared-utils/
```

## Behavior Details

### Interactive Mode (Default)

When `--non-interactive` is not specified, prompts user for:
- Package name (if not provided and scope allows)
- Description
- Keywords (space-separated)
- Private flag

**Example Session:**
```bash
$ opkg new my-package
? Package name: › my-package
? Description: › My awesome package
? Keywords (space-separated): › tools utils
? Private package? › No
✓ .openpackage/packages/my-package/openpackage.yml created
```

### Non-Interactive Mode

When `--non-interactive` is specified:
- Uses provided package name or cwd basename
- Skips all prompts
- Creates minimal manifest with name only

**Example:**
```bash
$ opkg new my-package --non-interactive
✓ .openpackage/packages/my-package/openpackage.yml created
  - Name: my-package
```

### Conflict Handling

#### Existing Package Without Force

If package already exists and `--force` is not specified:
- Displays existing package information
- Does not overwrite
- Exits successfully

```bash
$ opkg new existing-package
✓ .openpackage/packages/existing-package/openpackage.yml already exists
  - Name: existing-package
  - Version: 1.0.0
  - Description: Existing package
```

#### Existing Package With Force

If package already exists and `--force` is specified:
- Overwrites `openpackage.yml`
- Preserves existing content directories
- Logs overwrite action

```bash
$ opkg new existing-package --force
✓ .openpackage/packages/existing-package/openpackage.yml created
  - Name: existing-package
```

### Workspace Integration

For **local scope** packages:
1. Auto-creates `.openpackage/openpackage.yml` if not exists
2. Adds package to workspace manifest with path reference
3. Uses workspace directory name as manifest name

```yaml
# Auto-generated workspace manifest
name: my-project
packages:
  - name: my-package
    path: ./.openpackage/packages/my-package/
dev-packages: []
```

### Error Handling

#### Missing Package Name
```bash
$ opkg new --scope local
Error: Package name is required for local scope.
Usage: opkg new <package-name> --scope local
```

#### Invalid Scope
```bash
$ opkg new my-package --scope invalid
Error: Invalid scope: 'invalid'
Valid scopes: root, local, global
```

#### Invalid Package Name
```bash
$ opkg new My-Package
Error: Package name 'My-Package' is invalid.
Package names must be lowercase...
```

## Output Format

### Success Output

```bash
✓ <path-to-openpackage.yml> created
  - Name: <package-name>
  [- Version: <version>]      # If specified
  [- Description: <desc>]     # If specified

📍 Scope: <scope-description>
💡 <scope-specific-tip>

💡 Next steps:
   1. <step-1>
   2. <step-2>
   3. <step-3>
```

### Error Output

```bash
Error: <error-message>
[Additional context or suggestions]
```

## Examples

### Create Package with Interactive Scope Selection
```bash
$ opkg new my-tools
? Where should this package be created? › 
❯ Root (current directory) - Create openpackage.yml here - for standalone/distributable packages
  Local (workspace-scoped) - Create in .openpackage/packages/ - for project-specific packages
  Global (cross-workspace) - Create in ~/.openpackage/packages/ - shared across all workspaces on this machine

# User selects "Root"
? Package name: › my-tools
? Description: › My project tools
? Keywords (space-separated): › tools utils
? Private package? › No

✓ openpackage.yml created
  - Name: my-tools
  - Description: My project tools
  - Keywords: tools, utils

📍 Scope: Current directory (root package)

💡 Next steps:
   1. Add files to your package in current directory
   2. Save to registry: opkg pack
   3. Install in other workspaces: opkg install my-tools
```

### Create Local Package (Explicit Scope)
```bash
$ opkg new my-tools --scope local
# Skips scope prompt, goes directly to package details
✓ .openpackage/packages/my-tools/openpackage.yml created
  - Name: my-tools
📋 Initialized workspace openpackage.yml in .openpackage/
✓ Added to workspace manifest with path: ./.openpackage/packages/my-tools/

📍 Scope: Workspace-local (.openpackage/packages/)
💡 This package is local to the current workspace

💡 Next steps:
   1. Add files to your package: cd .openpackage/packages/my-tools/
   2. Save to registry: opkg pack my-tools
   3. Use in workspace: opkg apply my-tools
```

### Create Global Package
```bash
$ opkg new shared-prompts --scope global
✓ /Users/user/.openpackage/packages/shared-prompts/openpackage.yml created
  - Name: shared-prompts

📍 Scope: Global shared (~/.openpackage/packages/)
💡 This package can be used across all workspaces

💡 Next steps:
   1. Add files to your package: cd ~/.openpackage/packages/shared-prompts/
   2. Save to registry: opkg pack shared-prompts
   3. Reference in any workspace with path: ~/.openpackage/packages/shared-prompts/
```

### Create Root Package
```bash
$ opkg new my-package --scope root
✓ openpackage.yml created
  - Name: my-package

📍 Scope: Current directory (root package)

💡 Next steps:
   1. Add files to your package in current directory
   2. Save to registry: opkg pack
   3. Install in other workspaces: opkg install my-package
```

### Create with Force Overwrite
```bash
$ opkg new existing-package --scope local --force --non-interactive
✓ .openpackage/packages/existing-package/openpackage.yml created
  - Name: existing-package
✓ Added to workspace manifest with path: ./.openpackage/packages/existing-package/

📍 Scope: Workspace-local (.openpackage/packages/)
💡 This package is local to the current workspace
```

### Non-Interactive Mode Requires Scope
```bash
$ opkg new my-package --non-interactive
Error: The --scope flag is required in non-interactive mode.
Usage: opkg new [package-name] --scope <root|local|global> --non-interactive

Available scopes:
  root   - Create in current directory
  local  - Create in .openpackage/packages/
  global - Create in ~/.openpackage/packages/

$ opkg new my-package --scope local --non-interactive
✓ .openpackage/packages/my-package/openpackage.yml created
  - Name: my-package
✓ Added to workspace manifest with path: ./.openpackage/packages/my-package/
```

### Create Scoped Package
```bash
$ opkg new @myorg/utils
✓ .openpackage/packages/@myorg/utils/openpackage.yml created
  - Name: @myorg/utils
📋 Initialized workspace openpackage.yml in .openpackage/
✓ Added to workspace manifest with path: ./.openpackage/packages/@myorg/utils/
```

## Integration with Other Commands

### After `opkg new`

**Local Package Workflow:**
```bash
opkg new my-package               # Create package
cd .openpackage/packages/my-package/
# Add files (rules, commands, etc.)
opkg save my-package              # Save WIP to registry
opkg pack my-package              # Create stable release
opkg apply my-package             # Sync to workspace platforms
```

**Global Package Workflow:**
```bash
opkg new shared-utils --scope global  # Create global package
cd ~/.openpackage/packages/shared-utils/
# Add files
opkg pack shared-utils            # Pack to registry

# In any workspace:
# Add to .openpackage/openpackage.yml:
# - name: shared-utils
#   path: ~/.openpackage/packages/shared-utils/
opkg install                      # Install all deps including shared-utils
```

**Root Package Workflow:**
```bash
mkdir my-package && cd my-package
opkg new --scope root             # Create root package
# Add files to current directory
opkg pack                         # Pack to registry
opkg push my-package              # Share to remote registry
```

### Auto-Creation by Other Commands

The `opkg add` command may auto-create a root package if needed:
```bash
$ cd my-package/
$ opkg add ./rules/example.md
# No package detected - prompts to create root package
? Create package for current directory? › Yes
? Package name: › my-package
? Description: › ...
✓ Created root package
✓ Added ./rules/example.md to package
```

## Comparison with Deprecated `opkg init`

| Aspect | Old `opkg init` | New `opkg new` |
|--------|----------------|----------------|
| **Command** | `opkg init` | `opkg new` |
| **Dual Purpose** | ✅ Yes (workspace + package) | ❌ No (package only) |
| **Root Package** | `opkg init` | `opkg new --scope root` |
| **Local Package** | `opkg init <name>` | `opkg new <name>` |
| **Global Package** | ❌ Not supported | `opkg new <name> --scope global` |
| **Workspace Init** | Manual required | Auto-created when needed |
| **Scope Clarity** | Implicit | Explicit with `--scope` |
| **Overwrite** | `--force` | `--force` (same) |
| **Interactive** | Yes (default) | Yes (default) |

## Implementation Notes

### Core Logic
- Implemented in `src/commands/new.ts` (CLI interface)
- Core logic in `src/core/package-creation.ts` (business logic)
- Path resolution in `src/utils/scope-resolution.ts` (pure functions)

### Design Patterns
- **Separation of Concerns**: CLI, business logic, and utilities separated
- **Single Responsibility**: Each module has one clear purpose
- **Reusability**: `createPackage()` used by both `new` command and `add` pipeline
- **Testability**: Pure functions for path resolution, testable business logic

### Extensibility
Adding a new scope (e.g., "team"):
1. Add to `PackageScope` type in `scope-resolution.ts`
2. Add path resolution in `getScopePackageDir()`
3. Add description in `getScopeDescription()`
4. Update command help text

## See Also

- [Scope Management](../scope-management.md) - Details on local/global scopes
- [Directory Layout](../directory-layout.md) - Package directory structure
- [Package Sources](../package-sources.md) - Path-based source resolution
- [Save Command](../save/) - Syncing changes back to packages
- [Pack Command](../pack/) - Creating registry snapshots
