# Scope Behavior

This document details the behavior of each scope in the `opkg new` command, including path resolution, workspace integration, and use case patterns.

## Scope Selection

When running `opkg new` **interactively without the `--scope` flag**, you'll be prompted to choose:

```bash
$ opkg new my-package
? Where should this package be created? › 
❯ Root (current directory) - Create openpackage.yml here - for standalone/distributable packages
  Local (workspace-scoped) - Create in .openpackage/packages/ - for project-specific packages
  Global (cross-workspace) - Create in ~/.openpackage/packages/ - shared across all workspaces on this machine
```

- **Interactive mode**: Prompts for scope selection
- **Non-interactive mode**: Requires `--scope` flag (error if not provided)
- **Explicit `--scope` flag**: Skips prompt, uses specified scope

This ensures you make an explicit choice about where your package lives, without relying on an implicit default.

## Scope Types

OpenPackage supports three package scopes:

| Scope | Location | Shared? | Workspace Integration | Use Case |
|-------|----------|---------|----------------------|----------|
| `root` | `./openpackage.yml` | No | Optional | Dedicated package repos |
| `local` | `./.openpackage/packages/<name>/` | No | Automatic | Project-specific packages |
| `global` | `~/.openpackage/packages/<name>/` | Yes | Manual | Cross-workspace utilities |

## Root Scope

### Path Resolution

```
Current Directory (cwd)
├── openpackage.yml          # Created here
├── .cursor/                 # Platform content
├── root/                    # Root files
└── [other package content]
```

**Package Directory:** `cwd/`
**Manifest Path:** `cwd/openpackage.yml`
**Package Root:** `cwd/`

### Creation Behavior

```bash
# In /Users/alice/my-package/
$ opkg new --scope root
```

**Steps:**
1. Validates cwd is writable
2. Checks for existing `openpackage.yml`
3. If exists and no `--force`: displays existing, exits
4. If exists and `--force`: overwrites
5. Prompts for package details (interactive mode)
6. Creates `openpackage.yml` at cwd
7. Does NOT create workspace structure
8. Does NOT add to any workspace manifest

**Result:**
```
/Users/alice/my-package/
└── openpackage.yml
```

### Use Case Patterns

#### Dedicated Package Repository

**Scenario:** Creating a standalone package to distribute

```bash
# Create package repo
mkdir my-awesome-package
cd my-awesome-package
opkg new --scope root

# Develop package
mkdir -p .cursor/rules
echo "# Rule 1" > .cursor/rules/rule1.md

# Package and publish
opkg pack
opkg push my-awesome-package
```

#### Monorepo Package

**Scenario:** Package within a larger repository

```bash
# In monorepo
cd packages/shared-components/
opkg new --scope root

# Package exists alongside other code
packages/
├── shared-components/
│   ├── openpackage.yml    # Root package
│   ├── src/               # Other code
│   └── .cursor/
└── other-package/
```

### Workspace Integration

Root packages do NOT auto-integrate with workspaces. To use in a workspace:

```yaml
# Manually add to .openpackage/openpackage.yml
packages:
  - name: my-package
    path: /absolute/path/to/my-package/
    # or relative to workspace
    path: ../../packages/my-package/
```

### Advantages
- ✅ Clean package root (no nested directories)
- ✅ Similar to npm/cargo/pypi patterns
- ✅ Easy to distribute
- ✅ Minimal metadata overhead

### Disadvantages
- ❌ No automatic workspace integration
- ❌ Requires manual path management
- ❌ Not isolated from other cwd content

## Local Scope

### Path Resolution

```
Project Root
├── .openpackage/
│   ├── openpackage.yml           # Workspace manifest (auto-created)
│   └── packages/
│       └── my-package/           # Package directory
│           ├── openpackage.yml   # Package manifest
│           ├── .cursor/
│           └── root/
└── src/                          # Project code
```

**Package Directory:** `cwd/.openpackage/packages/<name>/`
**Manifest Path:** `cwd/.openpackage/packages/<name>/openpackage.yml`
**Package Root:** `cwd/.openpackage/packages/<name>/`

### Creation Behavior

```bash
# In /Users/alice/my-project/
$ opkg new my-package
```

**Steps:**
1. Validates package name provided
2. Normalizes package name (lowercase)
3. Resolves path: `cwd/.openpackage/packages/<name>/`
4. Checks for existing package
5. If exists and no `--force`: displays existing, exits
6. If exists and `--force`: overwrites
7. Ensures `.openpackage/packages/` directory exists
8. Prompts for package details (interactive mode)
9. Creates `openpackage.yml` in package directory
10. **Auto-creates workspace manifest** if not exists
11. **Adds package to workspace manifest** with path reference

**Result:**
```
/Users/alice/my-project/
├── .openpackage/
│   ├── openpackage.yml
│   └── packages/
│       └── my-package/
│           └── openpackage.yml
└── src/
```

**Workspace Manifest Entry:**
```yaml
name: my-project
packages:
  - name: my-package
    path: ./.openpackage/packages/my-package/
dev-packages: []
```

### Use Case Patterns

#### Project-Specific Rules

**Scenario:** Custom rules for a specific project

```bash
cd my-project/
opkg new project-rules

# Develop rules
cd .openpackage/packages/project-rules/
mkdir -p .cursor/rules
echo "# Project-specific rule" > .cursor/rules/style-guide.md

# Save and apply
opkg save project-rules
opkg apply project-rules
```

#### Temporary Development Package

**Scenario:** Testing package before publishing

```bash
# Create local package for development
opkg new experimental-feature

# Develop and test locally
cd .openpackage/packages/experimental-feature/
# Add content

# Test in workspace
opkg apply experimental-feature

# When ready, pack and publish
opkg pack experimental-feature
opkg push experimental-feature
```

#### Multiple Related Packages

**Scenario:** Multiple packages in one project

```bash
opkg new frontend-rules
opkg new backend-rules
opkg new shared-prompts

# All packages available in project
.openpackage/
└── packages/
    ├── frontend-rules/
    ├── backend-rules/
    └── shared-prompts/
```

### Workspace Integration

Local packages are **automatically integrated**:
- Workspace manifest auto-created if needed
- Package added with relative path
- Available for `opkg install`, `opkg apply`, etc.

### Advantages
- ✅ Automatic workspace integration
- ✅ Relative paths (portable)
- ✅ Clear separation from project code
- ✅ Easy to manage multiple packages
- ✅ Isolated in `.openpackage/` directory

### Disadvantages
- ❌ Not shared across workspaces
- ❌ Nested directory structure
- ❌ Requires workspace context

## Global Scope

### Path Resolution

```
~/.openpackage/
└── packages/
    └── shared-utils/             # Package directory
        ├── openpackage.yml       # Package manifest
        ├── .cursor/
        └── root/
```

**Package Directory:** `~/.openpackage/packages/<name>/`
**Manifest Path:** `~/.openpackage/packages/<name>/openpackage.yml`
**Package Root:** `~/.openpackage/packages/<name>/`

### Creation Behavior

```bash
# In any directory
$ opkg new shared-utils --scope global
```

**Steps:**
1. Validates package name provided
2. Normalizes package name
3. Resolves path: `~/.openpackage/packages/<name>/`
4. Expands tilde to user home directory
5. Checks for existing package
6. If exists and no `--force`: displays existing, exits
7. If exists and `--force`: overwrites
8. Ensures `~/.openpackage/packages/` directory exists
9. Prompts for package details (interactive mode)
10. Creates `openpackage.yml` in global package directory
11. Does NOT add to any workspace manifest

**Result:**
```
~/.openpackage/
└── packages/
    └── shared-utils/
        └── openpackage.yml
```

### Use Case Patterns

#### Personal Utility Library

**Scenario:** Rules/prompts used across all projects

```bash
# Create global utilities
opkg new personal-rules --scope global

# Add content
cd ~/.openpackage/packages/personal-rules/
mkdir -p .cursor/rules
echo "# My coding standards" > .cursor/rules/standards.md

# Pack to registry
opkg pack personal-rules

# Use in any project
cd ~/projects/any-project/
# Add to .openpackage/openpackage.yml:
# packages:
#   - name: personal-rules
#     path: ~/.openpackage/packages/personal-rules/
opkg install
```

#### Team Shared Packages

**Scenario:** Packages shared within team (via git)

```bash
# Team member creates package
opkg new team-conventions --scope global

# Add to version control
cd ~/.openpackage/packages/team-conventions/
git init
git add .
git commit -m "Initial conventions"
git remote add origin git@github.com:team/conventions.git
git push

# Other team members clone
cd ~/.openpackage/packages/
git clone git@github.com:team/conventions.git team-conventions

# Use in projects
cd ~/projects/any-project/
# Add to .openpackage/openpackage.yml:
# packages:
#   - name: team-conventions
#     path: ~/.openpackage/packages/team-conventions/
```

#### Development Templates

**Scenario:** Reusable templates for new projects

```bash
# Create template package
opkg new project-template --scope global
cd ~/.openpackage/packages/project-template/

# Add template content
mkdir -p root/
echo "# Template README" > root/README.md
mkdir -p .cursor/rules
echo "# Template rule" > .cursor/rules/setup.md

opkg pack project-template

# Use in new projects
cd ~/new-project/
# Add template to manifest
opkg install
opkg apply project-template
```

### Workspace Integration

Global packages require **manual integration**:

```yaml
# Add to any workspace's .openpackage/openpackage.yml
packages:
  - name: shared-utils
    path: ~/.openpackage/packages/shared-utils/
```

Then install:
```bash
opkg install
# or
opkg install shared-utils
```

### Advantages
- ✅ Shared across all workspaces
- ✅ Single source of truth
- ✅ Easy to maintain in one place
- ✅ Persists across projects
- ✅ Tilde expansion (portable home path)

### Disadvantages
- ❌ Requires manual workspace integration
- ❌ User-specific (not in project repo)
- ❌ Needs documentation for team use
- ❌ Potential path conflicts between users

## Scope Comparison

### Path Portability

| Scope | Path Example | Portable? | Notes |
|-------|--------------|-----------|-------|
| Root | `./openpackage.yml` | ✅ In repo | Relative to repo root |
| Local | `./.openpackage/packages/pkg/` | ✅ In repo | Relative to workspace |
| Global | `~/.openpackage/packages/pkg/` | ⚠️ Per-user | Tilde expands to home |

### Version Control

| Scope | In Git? | Shared? | Notes |
|-------|---------|---------|-------|
| Root | ✅ Yes | Team | Part of repo |
| Local | ✅ Yes | Team | In `.openpackage/` |
| Global | ❌ No* | No* | User-specific, can be git repo itself |

*Global packages can be separate git repos

### Workspace Integration

| Scope | Auto-Added? | Manual Steps | Install Command |
|-------|-------------|--------------|-----------------|
| Root | ❌ No | Add path to manifest | `opkg install` |
| Local | ✅ Yes | None | Auto-available |
| Global | ❌ No | Add path to manifest | `opkg install` |

## Scope Selection Decision Tree

```
Is this package for one project only?
├─ Yes → Use LOCAL scope
│        opkg new my-package
│
└─ No → Is this package shareable?
        ├─ Yes → Is it personal or team-wide?
        │        ├─ Personal → Use GLOBAL scope
        │        │              opkg new utils --scope global
        │        │
        │        └─ Team → Use ROOT scope (separate repo)
        │                   mkdir shared-package
        │                   cd shared-package
        │                   opkg new --scope root
        │
        └─ No → Are you distributing this package?
                ├─ Yes → Use ROOT scope
                │        opkg new my-package --scope root
                │
                └─ No → Use LOCAL scope (default)
                        opkg new my-package
```

## Scope Migration

### Local → Global

When a local package becomes useful across projects:

```bash
# Copy to global location
cp -r .openpackage/packages/my-package ~/.openpackage/packages/

# Update workspace manifest
# Change:
#   path: ./.openpackage/packages/my-package/
# To:
#   path: ~/.openpackage/packages/my-package/

# Remove local copy (optional)
rm -rf .openpackage/packages/my-package/

# Reinstall from global
opkg install my-package
```

### Global → Root (for distribution)

When a global package should be distributed:

```bash
# Create new repo
mkdir my-package-repo
cd my-package-repo

# Copy content from global
cp -r ~/.openpackage/packages/my-package/* .

# Already has openpackage.yml at root
# Just add git
git init
git add .
git commit -m "Initial commit"

# Pack and publish
opkg pack
opkg push my-package
```

### Local → Root (for monorepo)

When restructuring to monorepo:

```bash
# Move package to monorepo location
mv .openpackage/packages/my-package ../monorepo/packages/my-package/

# Update workspace manifest to point to new location
# packages:
#   - name: my-package
#     path: ../monorepo/packages/my-package/
```

## Scope Best Practices

### Choose Local When:
- Package is specific to one project
- Team collaboration through git
- Need automatic workspace integration
- Just starting development

### Choose Global When:
- Package used across multiple projects
- Personal development utilities
- Want to maintain once, use everywhere
- Independent of any single project

### Choose Root When:
- Creating standalone package for distribution
- Package has its own repository
- Monorepo structure with packages/ directory
- Following npm/cargo patterns

## See Also

- [New Command README](./README.md) - Full command specification
- [Scope Management](../scope-management.md) - Scope transitions and management
- [Directory Layout](../directory-layout.md) - Directory structure details
- [Package Sources](../package-sources.md) - Source resolution and paths
