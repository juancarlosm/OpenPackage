# Platform Flows System

## Overview

The **Platform Flows** system is OpenPackage's universal, declarative transformation engine for mapping content between the universal package format and platform-specific formats. It provides a structured, validated approach to handling:

- File path mappings
- Extension transformations
- Format conversions (JSONC ↔ JSON ↔ YAML ↔ TOML)
- Key/value remapping and restructuring
- Content embedding and extraction
- Multi-package composition
- Conditional transformations

---

## Core Philosophy

**Everything is a flow: data moves from source → transforms → target.**

The system uses structured JSON objects (not string-based DSLs) for:
- ✅ IDE validation and autocomplete
- ✅ Type safety and schema enforcement
- ✅ Clear documentation and examples
- ✅ Extensibility through custom handlers

---

## Configuration Architecture

### File Organization

The flows system uses a **single unified configuration file** with support for modular overrides:

**Configuration file name: `flows.jsonc`** (or `flows.json`)

**Why `flows.jsonc` and not `mappings.jsonc` or `platforms.jsonc`?**
- ✅ **Accurately represents the system**: These aren't simple mappings—they're data transformation pipelines
- ✅ **Matches the specification terminology**: The entire system is built around "flow" concepts
- ✅ **Clearer semantics**: "Flows" conveys the transformation pipeline nature (source → transforms → target)
- ✅ **Industry-standard**: Familiar to users from CI/CD pipelines, data flows, ETL systems

### Configuration Merge Hierarchy

The CLI supports deep-merged configurations for flexibility without file fragmentation:

```
Built-in flows.jsonc (ships with CLI - 13 platforms)
  ↓ (merged)
~/.openpackage/flows.jsonc (global user overrides)
  ↓ (merged)
<workspace>/.openpackage/flows.jsonc (project-specific overrides)
```

**Merge order:** local → global → built-in (later configs override earlier)

**Why a single file instead of splitting by platform?**
- ✅ **Simpler mental model**: One place to look for all platform definitions
- ✅ **Easier validation**: Single schema, single load point, atomic validation
- ✅ **Cross-platform consistency**: See how other platforms handle similar transformations
- ✅ **Better for learning**: Users can reference examples within the same file
- ✅ **Override granularity**: The merge system provides modularity without file fragmentation

### Configuration Structure

```typescript
// flows.jsonc
{
  // Optional: Global flows that apply across all detected platforms
  "global"?: {
    "flows": Flow[]
  },

  // Per-platform definitions
  [platformId: string]: {
    "name": string,           // Display name
    "rootDir": string,         // Platform root directory (e.g., ".cursor")
    "rootFile"?: string,       // Optional root file (e.g., "AGENTS.md")
    "aliases"?: string[],      // CLI aliases (e.g., ["cursorcli"])
    "enabled"?: boolean,       // Default: true. Set false to disable
    "flows": Flow[]            // Flow definitions for this platform
  }
}
```

### Platform-Scoped vs Global Flows

**Platform-scoped flows** (most common):
```jsonc
{
  "cursor": {
    "name": "Cursor",
    "rootDir": ".cursor",
    "flows": [
      {
        "from": "rules/{name}.md",
        "to": ".cursor/rules/{name}.mdc"
      }
    ]
  }
}
```

**Global flows** (applies to all detected platforms):
```jsonc
{
  "global": {
    "flows": [
      {
        "from": "AGENTS.md",
        "to": "AGENTS.md",
        "pipe": ["sections"]
        // Executes for every detected platform
      }
    ]
  }
}
```

**When to use global flows:**
- Universal root files (AGENTS.md, README.md)
- Cross-platform configuration files
- Shared transformation patterns that apply everywhere

**When to use platform-scoped flows:**
- Platform-specific directory structures
- Platform-specific file transformations
- Unique format/key mapping requirements

### Configuration Validation

All configurations are strictly validated at load time:

**Platform-level validation:**
- ✅ Required fields: `name`, `rootDir`, `flows`
- ✅ Type checking: All fields must match schema
- ✅ Duplicate detection: No duplicate platform IDs
- ✅ Alias conflicts: No alias collisions across platforms

**Flow-level validation:**
- ✅ Required fields: `from`, `to`
- ✅ Type checking: All transform options validated
- ✅ Schema compliance: Custom handlers must exist
- ✅ Path validation: Source/target patterns validated

**Error reporting:**
```
Flow config validation failed in /workspace/.openpackage/flows.jsonc:
  - Platform 'cursor': Missing required field 'rootDir'
  - Platform 'claude', flows[2]: Invalid 'to' field (must be string or object)
  - Platform 'opencode', flows[0].map: Invalid key mapping syntax
```

### User Override Examples

**Global override (~/.openpackage/flows.jsonc):**
```jsonc
{
  // Add a custom platform globally
  "my-ai-platform": {
    "name": "My Custom AI",
    "rootDir": ".myai",
    "flows": [
      {
        "from": "rules/{name}.md",
        "to": ".myai/prompts/{name}.md"
      }
    ]
  },

  // Override cursor flows globally
  "cursor": {
    "flows": [
      {
        "from": "custom-rules/{name}.md",
        "to": ".cursor/custom/{name}.mdc"
      }
    ]
  }
}
```

**Project override (<workspace>/.openpackage/flows.jsonc):**
```jsonc
{
  // Disable a platform for this project only
  "windsurf": {
    "enabled": false
  },

  // Override Claude flows for this project
  "claude": {
    "flows": [
      {
        "from": "agents/{name}.md",
        "to": ".claude/custom-agents/{name}.md",
        "map": {
          "role": "agent_type",
          "model": {
            "to": "llm_model",
            "values": {
              "anthropic/claude-sonnet-4.5": "claude-sonnet-4.5-custom"
            }
          }
        }
      }
    ]
  }
}
```

### Platform Metadata

Each platform definition includes metadata that affects behavior:

```jsonc
{
  "cursor": {
    // Display name (used in UI/logs)
    "name": "Cursor",

    // Platform root directory (relative to workspace root)
    "rootDir": ".cursor",

    // Optional root file (e.g., CLAUDE.md, QWEN.md)
    // Note: AGENTS.md is universal and handled by global flows
    "rootFile": "AGENTS.md",

    // CLI aliases (case-insensitive)
    "aliases": ["cursorcli"],

    // Enable/disable platform
    // Default: true. Set false to disable without removing definition
    "enabled": true,

    // Flow definitions
    "flows": [
      // ...
    ]
  }
}
```

**Platform detection:**
A platform is considered "present" in a workspace if:
1. Its `rootDir` exists (e.g., `.cursor/` folder exists), OR
2. Its `rootFile` exists (e.g., `CLAUDE.md` exists at project root)

**Enabled vs detected:**
- `enabled: false` → Platform exists in config but is ignored by all operations
- Detected → Platform's files are present in the workspace
- A disabled platform is never detected, even if its files exist

### Backwards Compatibility

The system automatically converts the old `platforms.jsonc` format to the new `flows.jsonc` format:

**Old format (platforms.jsonc):**
```jsonc
{
  "cursor": {
    "name": "Cursor",
    "rootDir": ".cursor",
    "subdirs": [
      {
        "universalDir": "rules",
        "platformDir": "rules",
        "exts": [".md"],
        "transformations": [
          {
            "packageExt": ".md",
            "workspaceExt": ".mdc"
          }
        ]
      }
    ]
  }
}
```

**Auto-converted to (flows.jsonc):**
```jsonc
{
  "cursor": {
    "name": "Cursor",
    "rootDir": ".cursor",
    "flows": [
      {
        "from": "rules/{name}.md",
        "to": ".cursor/rules/{name}.mdc"
      }
    ]
  }
}
```

**Migration path:**
1. **Phase 1** (v1.x): Support both `platforms.jsonc` and `flows.jsonc` simultaneously
2. **Phase 2** (v2.0): Deprecation warnings when `platforms.jsonc` is detected
3. **Phase 3** (v2.x): Provide `opkg migrate flows` command to auto-convert
4. **Phase 4** (v3.0): Remove `platforms.jsonc` support entirely

During the transition, the CLI will:
- Load `flows.jsonc` if it exists
- Fall back to `platforms.jsonc` and auto-convert with a warning
- Never load both files simultaneously (flows.jsonc takes precedence)

---

## Table of Contents

1. [Overview](#overview)
2. [Core Philosophy](#core-philosophy)
3. [Configuration Architecture](#configuration-architecture)
   - File Organization
   - Configuration Merge Hierarchy
   - Configuration Structure
   - Platform-Scoped vs Global Flows
   - Configuration Validation
   - User Override Examples
   - Platform Metadata
   - Backwards Compatibility
4. [Flow Structure](#flow-structure)
5. [Execution Pipeline](#execution-pipeline)
6. [Simple Examples](#simple-examples)
7. [Key Mapping](#key-mapping)
8. [Content Extraction](#content-extraction)
9. [Content Embedding](#content-embedding)
10. [Multi-Target Flows](#multi-target-flows)
11. [Transform Pipeline](#transform-pipeline)
12. [Value Transforms](#value-transforms)
13. [Markdown Frontmatter Transformations](#markdown-frontmatter-transformations)
14. [Conditional Flows](#conditional-flows)
15. [Merge Strategies](#merge-strategies)
16. [Namespace Isolation](#namespace-isolation)
17. [Complete Platform Example](#complete-platform-example)
18. [Complex Use Cases](#complex-use-cases)
19. [Custom Handlers](#custom-handlers)
20. [Backwards Compatibility](#backwards-compatibility)
21. [Migration Path](#migration-path)
22. [Validation](#validation)
23. [Performance Considerations](#performance-considerations)
24. [Future Extensions](#future-extensions)
25. [Summary](#summary)
26. [Architecture Decisions](#architecture-decisions)
27. [Implementation Notes](#implementation-notes)
28. [Getting Started](#getting-started)

---

## Flow Structure

### Basic Flow

```jsonc
{
  "from": "source-pattern",
  "to": "target-path"
}
```

### Complete Flow Schema

```typescript
interface Flow {
  // Source pattern (required)
  from: string
  
  // Target path/pattern (required)
  to: string | MultiTarget
  
  // Transform pipeline (optional)
  pipe?: string[]
  
  // Key mapping/transformation (optional)
  map?: KeyMap
  
  // Key extraction (optional)
  pick?: string[]
  
  // Key exclusion (optional)
  omit?: string[]
  
  // Path extraction (optional)
  path?: string  // JSONPath syntax
  
  // Embedding location (optional)
  embed?: string  // Key path for embedding
  
  // Section for TOML/INI (optional)
  section?: string
  
  // Condition (optional)
  when?: Condition
  
  // Merge strategy (optional)
  merge?: "deep" | "shallow" | "replace"
  
  // Namespace wrapping (optional)
  namespace?: boolean | string
  
  // Format conversion (optional, usually auto-detected)
  format?: string
  
  // Custom handler (optional, escape hatch)
  handler?: string
}
```

---

## Execution Pipeline

A flow executes transformations in this order:

```
1. Load source file
2. Extract path (if `path` specified)
3. Pick keys (if `pick` specified)
4. Omit keys (if `omit` specified)
5. Map keys (if `map` specified)
6. Apply transforms (if `pipe` specified)
7. Wrap in namespace (if `namespace` specified)
8. Embed in target structure (if `embed` or `section` specified)
9. Merge with existing target (if `merge` specified)
10. Write to target file
```

---

## Simple Examples

### 1. File Path Mapping

```jsonc
{
  "from": "rules/{name}.md",
  "to": ".cursor/rules/{name}.mdc"
}
```

Maps all files from `rules/` to `.cursor/rules/` with extension change.

### 2. Format Conversion

```jsonc
{
  "from": "config.yaml",
  "to": ".cursor/config.json"
}
```

Auto-detects format conversion (YAML → JSON).

### 3. Composable Merge

```jsonc
{
  "from": "mcp.jsonc",
  "to": ".cursor/mcp.json",
  "merge": "deep"
}
```

Multiple packages can contribute to the same target file.

### 4. Namespace Isolation

```jsonc
{
  "from": "mcp.jsonc",
  "to": ".cursor/mcp.json",
  "namespace": true,
  "merge": "deep"
}
```

Wraps content under `packages.{packageName}` to prevent collisions.

---

## Key Mapping

### Simple Key Rename

```jsonc
{
  "from": "settings.jsonc",
  "to": ".cursor/settings.json",
  "map": {
    "theme": "workbench.colorTheme",
    "fontSize": "editor.fontSize"
  },
  "merge": "deep"
}
```

**Before:**
```json
{
  "theme": "dark",
  "fontSize": 14
}
```

**After:**
```json
{
  "workbench": {
    "colorTheme": "dark"
  },
  "editor": {
    "fontSize": 14
  }
}
```

### Nested Key Mapping

```jsonc
{
  "map": {
    "editor.font.family": "editor.fontFamily",
    "editor.font.size": "editor.fontSize",
    "ai.model.name": "cursor.aiModel"
  }
}
```

Supports dot notation for nested key paths.

### Wildcard Mapping

```jsonc
{
  "map": {
    "ai.*": "cursor.*",                // ai.model → cursor.model
    "features.*": "experimental.*",     // features.x → experimental.x
    "*.enabled": "*.active"             // x.enabled → x.active
  }
}
```

`*` matches any key segment. Patterns are replaced intelligently.

### Advanced Key Transforms

```jsonc
{
  "map": {
    "port": {
      "to": "server.port",
      "transform": "number",
      "default": 3000
    },
    "enabled": {
      "to": "active",
      "transform": "boolean"
    },
    "name": {
      "to": "displayName",
      "transform": "title-case",
      "required": true
    }
  }
}
```

Full `KeyTransform` object with:
- **to**: Target key path
- **transform**: Transform function name
- **default**: Default value if source missing
- **required**: Validation flag
- **when**: Conditional mapping

---

## Content Extraction

### Pick Specific Keys

```jsonc
{
  "from": "config.jsonc",
  "to": ".cursor/config.json",
  "pick": ["theme", "fontSize", "keybindings"],
  "merge": "deep"
}
```

Only extracts specified keys from source.

### Omit Keys

```jsonc
{
  "from": "config.jsonc",
  "to": ".cursor/config.json",
  "omit": ["__internal", "debug", "dev.*"],
  "merge": "deep"
}
```

Excludes specified keys. Supports wildcards.

### JSONPath Extraction

```jsonc
{
  "from": "mcp.jsonc",
  "to": ".codex/config.toml",
  "path": "$.servers",
  "section": "mcp_servers",
  "merge": "deep"
}
```

Extracts only `$.servers` subtree using JSONPath syntax.

---

## Content Embedding

### Embed Under JSON Key

```jsonc
{
  "from": "mcp.jsonc",
  "to": ".opencode/opencode.json",
  "embed": "mcp",
  "merge": "deep"
}
```

**Source (mcp.jsonc):**
```json
{
  "servers": { "fs": {...} },
  "timeout": 5000
}
```

**Target (.opencode/opencode.json):**
```json
{
  "version": "1.0.0",
  "mcp": {
    "servers": { "fs": {...} },
    "timeout": 5000
  }
}
```

### Embed in TOML Section

```jsonc
{
  "from": "mcp.jsonc",
  "to": ".codex/config.toml",
  "path": "$.servers",
  "section": "mcp_servers",
  "merge": "deep"
}
```

**Source (mcp.jsonc):**
```json
{
  "servers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem"]
    }
  }
}
```

**Target (.codex/config.toml):**
```toml
[general]
log_level = "info"

[mcp_servers.filesystem]
command = "npx"
args = ["-y", "@modelcontextprotocol/server-filesystem"]
```

---

## Multi-Target Flows

A single source can flow to multiple targets with different transformations:

```jsonc
{
  "from": "mcp.jsonc",
  "to": {
    ".cursor/mcp.json": {
      "namespace": true,
      "merge": "deep"
    },
    ".opencode/opencode.json": {
      "embed": "mcp",
      "merge": "deep"
    },
    ".codex/config.toml": {
      "path": "$.servers",
      "section": "mcp_servers",
      "merge": "deep"
    }
  }
}
```

One source file transforms differently for each platform.

---

## Transform Pipeline

The `pipe` field allows chaining transforms:

```jsonc
{
  "from": "config.yml",
  "to": ".cursor/config.json",
  "pipe": ["yaml", "filter-comments", "validate", "merge"]
}
```

### Built-in Pipe Transforms

**Format Converters:**
- `jsonc` - Strip comments from JSONC → JSON
- `yaml` - Convert YAML ↔ JSON
- `toml` - Convert TOML ↔ JSON
- `xml` - Convert XML ↔ JSON
- `ini` - Convert INI ↔ JSON

**Merging:**
- `merge` - Deep merge into target (default)
- `merge-shallow` - Shallow merge
- `replace` - Replace target entirely

**Filtering:**
- `filter-comments` - Remove comments
- `filter-empty` - Remove empty values
- `filter-null` - Remove null values

**Validation:**
- `validate` - Validate against schema
- `validate-schema(path)` - Validate against specific schema file

**Markdown:**
- `sections` - Marker-based section merging (AGENTS.md style)
- `frontmatter` - Merge frontmatter only
- `body` - Extract body only

**Custom:**
- `plugin(name)` - Load custom plugin
- `fn(path/to/handler.js)` - Custom function

---

## Value Transforms

When using `map` with `KeyTransform` objects, you can apply value transformations:

### Type Converters
```jsonc
{
  "map": {
    "port": {
      "to": "server.port",
      "transform": "number"
    },
    "enabled": {
      "to": "active",
      "transform": "boolean"
    }
  }
}
```

Available: `number`, `string`, `boolean`, `json`, `date`

### String Transforms
```jsonc
{
  "map": {
    "name": {
      "to": "displayName",
      "transform": "title-case"
    },
    "identifier": {
      "to": "id",
      "transform": "kebab-case"
    }
  }
}
```

Available: `uppercase`, `lowercase`, `title-case`, `camel-case`, `kebab-case`, `snake-case`, `trim`, `slugify`

### Array Transforms
```jsonc
{
  "map": {
    "tags": {
      "to": "labels",
      "transform": "array-append"
    },
    "exclude": {
      "to": "ignore",
      "transform": "array-unique"
    }
  }
}
```

Available: `array-append`, `array-unique`, `array-flatten`, `array-map`, `array-filter`

### Object Transforms
```jsonc
{
  "map": {
    "nested": {
      "to": "flattened",
      "transform": "flatten"
    }
  }
}
```

Available: `flatten`, `unflatten`, `pick-keys`, `omit-keys`

### Value Mapping

For simple value transformations, use direct value mapping:

```jsonc
{
  "map": {
    "model": {
      "to": "model",
      "values": {
        "anthropic/claude-sonnet-4.5": "claude-sonnet-4.5",
        "anthropic/claude-opus-4": "claude-opus-4",
        "openai/gpt-4": "gpt-4",
        "openai/gpt-3.5-turbo": "gpt-3.5-turbo"
      }
    }
  }
}
```

**Before:** `model: anthropic/claude-sonnet-4.5`  
**After:** `model: claude-sonnet-4.5`

If value not in the mapping, it stays unchanged. If you don't need to rename the key:

```jsonc
{
  "map": {
    "model": {
      "values": {
        "anthropic/claude-sonnet-4.5": "claude-sonnet-4.5"
      }
    }
  }
}
```

Key stays `model`, only the value changes.

---

## Markdown Frontmatter Transformations

For markdown files (`.md` files), the `map` field automatically operates on **frontmatter** (YAML metadata) while preserving the markdown body unchanged.

### Understanding Frontmatter

Frontmatter is YAML metadata enclosed in `---` delimiters at the start of a markdown file:

```markdown
---
name: Code Reviewer
role: reviewer
expertise: ["code-quality", "security"]
model: gpt-4
---

# Code Reviewer Agent

You are an expert code reviewer...
```

### Basic Frontmatter Example

**Universal Package: `agents/reviewer.md`**
```markdown
---
name: Code Reviewer
role: reviewer
model: anthropic/claude-sonnet-4.5
temperature: 0.3
---

# Code Reviewer Agent

You are an expert code reviewer...
```

**Flow Definition:**
```jsonc
{
  "from": "agents/{name}.md",
  "to": ".claude/agents/{name}.md",
  "map": {
    "role": "type",
    "model": {
      "values": {
        "anthropic/claude-sonnet-4.5": "claude-sonnet-4.5",
        "anthropic/claude-opus-4": "claude-opus-4"
      }
    }
  }
}
```

**Result: `.claude/agents/reviewer.md`**
```markdown
---
name: Code Reviewer
type: reviewer
model: claude-sonnet-4.5
temperature: 0.3
---

# Code Reviewer Agent

You are an expert code reviewer...
```

**Note:** The markdown body is **preserved exactly**. Only frontmatter keys and values are transformed.

### Complete Agent Example

**Universal: `agents/reviewer.md`**
```markdown
---
name: Code Reviewer
description: Expert code reviewer for quality and security
role: reviewer
expertise: ["code-quality", "security", "best-practices"]
model: anthropic/claude-sonnet-4.5
temperature: 0.3
maxTokens: 4000
---

# Code Reviewer Agent

You are an expert code reviewer with deep knowledge of:
- Code quality and maintainability
- Security vulnerabilities and best practices
- Performance optimization

## Review Process

1. Analyze code structure
2. Check for security issues
3. Evaluate performance
4. Suggest improvements
```

**Flow Definition:**
```jsonc
{
  "from": "agents/{name}.md",
  "to": ".opencode/agent/{name}.md",
  "map": {
    "role": "type",
    "expertise": "skills",
    "description": "summary",
    "model": {
      "to": "llm.model",
      "values": {
        "anthropic/claude-sonnet-4.5": "claude-3-5-sonnet-20241022",
        "anthropic/claude-opus-4": "claude-3-opus-20240229"
      }
    },
    "temperature": "llm.temperature",
    "maxTokens": "llm.maxTokens"
  },
  "add": {
    "version": "1.0.0",
    "enabled": true
  }
}
```

**Result: `.opencode/agent/reviewer.md`**
```markdown
---
name: Code Reviewer
summary: Expert code reviewer for quality and security
type: reviewer
skills: ["code-quality", "security", "best-practices"]
llm:
  model: claude-3-5-sonnet-20241022
  temperature: 0.3
  maxTokens: 4000
version: 1.0.0
enabled: true
---

# Code Reviewer Agent

You are an expert code reviewer with deep knowledge of:
- Code quality and maintainability
- Security vulnerabilities and best practices
- Performance optimization

## Review Process

1. Analyze code structure
2. Check for security issues
3. Evaluate performance
4. Suggest improvements
```

**What Changed:**
- ✅ `role` → `type` (key renamed)
- ✅ `expertise` → `skills` (key renamed)
- ✅ `description` → `summary` (key renamed)
- ✅ `model` value transformed + nested under `llm.model`
- ✅ `temperature` → `llm.temperature` (nested)
- ✅ `maxTokens` → `llm.maxTokens` (nested)
- ✅ `version` and `enabled` added
- ✅ **Body preserved exactly as-is**

### Multi-Platform Frontmatter Mapping

Different platforms have different requirements. One universal agent can map to multiple platforms:

```jsonc
{
  "from": "agents/{name}.md",
  "to": {
    ".claude/agents/{name}.md": {
      "map": {
        "role": "type",
        "model": {
          "values": {
            "anthropic/claude-sonnet-4.5": "claude-sonnet-4.5"
          }
        }
      }
    },
    ".opencode/agent/{name}.md": {
      "map": {
        "role": "type",
        "model": {
          "to": "llm.model",
          "values": {
            "anthropic/claude-sonnet-4.5": "claude-3-5-sonnet-20241022"
          }
        }
      }
    },
    ".cursor/agents/{name}.md": {
      "map": {
        "role": "agentType",
        "model": {
          "values": {
            "anthropic/claude-sonnet-4.5": "claude-sonnet-4.5"
          }
        }
      }
    }
  }
}
```

Same source, three different frontmatter outputs!

### Wildcard Frontmatter Mapping

```jsonc
{
  "from": "agents/{name}.md",
  "to": ".cursor/agents/{name}.md",
  "map": {
    "ai.*": "llm.*",
    "features.*": "capabilities.*"
  }
}
```

**Universal:**
```markdown
---
name: Code Reviewer
ai.model: gpt-4
ai.temperature: 0.3
features.codeAnalysis: true
features.securityScan: true
---
```

**Result:**
```markdown
---
name: Code Reviewer
llm:
  model: gpt-4
  temperature: 0.3
capabilities:
  codeAnalysis: true
  securityScan: true
---
```

### Adding Platform-Specific Frontmatter

Use `add` to inject platform-specific keys:

```jsonc
{
  "from": "agents/{name}.md",
  "to": ".opencode/agent/{name}.md",
  "map": {
    "role": "type"
  },
  "add": {
    "version": "1.0.0",
    "platform": "opencode",
    "enabled": true
  }
}
```

### Removing Frontmatter Keys

Use `omit` to exclude keys:

```jsonc
{
  "from": "agents/{name}.md",
  "to": ".cursor/agents/{name}.md",
  "map": {
    "role": "type"
  },
  "omit": ["__internal", "debug", "dev.*"]
}
```

### Key Takeaway

When the target is a markdown file (`.md`), the `map` field:
- ✅ Transforms **frontmatter** (YAML metadata)
- ✅ Preserves **body** (markdown content) unchanged
- ✅ Supports key renaming, value mapping, nesting, wildcards
- ✅ Works with `add` and `omit` for additional control

---

## Conditional Flows

### File Exists Condition

```jsonc
{
  "from": "rules/*.cursor.md",
  "to": ".cursor/rules/*.mdc",
  "when": {
    "exists": ".cursor"
  }
}
```

Only executes if `.cursor` directory exists.

### Platform Enabled Condition

```jsonc
{
  "from": "config.jsonc",
  "to": ".cursor/config.json",
  "when": {
    "platform": "cursor"
  }
}
```

Only executes if platform is enabled.

### Key Value Condition

```jsonc
{
  "from": "settings.jsonc",
  "to": ".cursor/settings.json",
  "map": {
    "devPort": {
      "to": "port",
      "when": { "key": "env", "equals": "development" }
    }
  }
}
```

Conditional key mapping based on other key values.

### Composite Conditions

```jsonc
{
  "when": {
    "and": [
      { "exists": ".cursor" },
      { "platform": "cursor" }
    ]
  }
}
```

```jsonc
{
  "when": {
    "or": [
      { "key": "env", "equals": "development" },
      { "key": "debug", "equals": true }
    ]
  }
}
```

---

## Merge Strategies

### Deep Merge (Default)

```jsonc
{
  "from": "mcp.jsonc",
  "to": ".cursor/mcp.json",
  "merge": "deep"
}
```

Recursively merges objects. Arrays are replaced (not concatenated by default).

**Package A:**
```json
{ "servers": { "fs": {...} } }
```

**Package B:**
```json
{ "servers": { "git": {...} }, "timeout": 5000 }
```

**Result:**
```json
{
  "servers": {
    "fs": {...},
    "git": {...}
  },
  "timeout": 5000
}
```

### Shallow Merge

```jsonc
{
  "merge": "shallow"
}
```

Only merges top-level keys. Nested objects/arrays are replaced.

### Replace

```jsonc
{
  "merge": "replace"
}
```

Completely replaces target file. Last package wins.

---

## Namespace Isolation

Prevent package collisions by wrapping content under package namespace:

### Auto Namespace

```jsonc
{
  "from": "mcp.jsonc",
  "to": ".cursor/mcp.json",
  "namespace": true,
  "merge": "deep"
}
```

**Package "my-mcp-pkg":**
```json
{ "servers": { "fs": {...} } }
```

**Result:**
```json
{
  "packages": {
    "my-mcp-pkg": {
      "servers": { "fs": {...} }
    }
  }
}
```

### Custom Namespace

```jsonc
{
  "namespace": "custom.path.here"
}
```

Wraps under `{ "custom": { "path": { "here": {...} } } }`.

---

## Complete Platform Example

```jsonc
// flows.jsonc - Complete example showing all features
{
  // Global flows (apply to all detected platforms)
  "global": {
    "flows": [
      // Universal root file (marker-based section merging)
      {
        "from": "AGENTS.md",
        "to": "AGENTS.md",
        "pipe": ["sections"]
      },
      
      // Shared README (simple copy)
      {
        "from": "README.md",
        "to": "README.md"
      }
    ]
  },

  // Platform-specific flow definitions
  "cursor": {
    "name": "Cursor",
    "rootDir": ".cursor",
    "rootFile": "AGENTS.md",
    "aliases": ["cursorcli"],
    "enabled": true,
    "flows": [
      // Simple file mappings with extension transformation
      {
        "from": "rules/{name}.md",
        "to": ".cursor/rules/{name}.mdc"
      },
      {
        "from": "commands/{name}.md",
        "to": ".cursor/commands/{name}.md"
      },
      
      // MCP with namespace and merge
      {
        "from": "mcp.jsonc",
        "to": ".cursor/mcp.json",
        "namespace": true,
        "merge": "deep"
      },
      
      // Settings with complex key mapping
      {
        "from": "settings.jsonc",
        "to": ".cursor/settings.json",
        "map": {
          "theme": "workbench.colorTheme",
          "fontSize": {
            "to": "editor.fontSize",
            "transform": "number",
            "default": 14
          },
          "ai.*": "cursor.*",
          "features.*.enabled": "experimental.*.active"
        },
        "merge": "deep"
      },
      
      // Conditional platform-specific files
      {
        "from": "rules/*.cursor.md",
        "to": ".cursor/rules/*.mdc",
        "when": { "exists": ".cursor" },
        "merge": "replace"
      }
    ]
  },
  
  "opencode": {
    "name": "OpenCode",
    "rootDir": ".opencode",
    "rootFile": "AGENTS.md",
    "enabled": true,
    "flows": [
      {
        "from": "commands/{name}.md",
        "to": ".opencode/command/{name}.md"
      },
      
      // MCP embedded under key with key remapping
      {
        "from": "mcp.jsonc",
        "to": ".opencode/opencode.json",
        "embed": "mcp",
        "map": {
          "servers": "mcpServers",
          "timeout": "connectionTimeout"
        },
        "merge": "deep"
      }
    ]
  },
  
  "codex": {
    "name": "Codex CLI",
    "rootDir": ".codex",
    "rootFile": "AGENTS.md",
    "aliases": ["codexcli"],
    "enabled": true,
    "flows": [
      {
        "from": "commands/{name}.md",
        "to": ".codex/prompts/{name}.md"
      },
      
      // Extract path, remap keys, embed in TOML section
      {
        "from": "mcp.jsonc",
        "to": ".codex/config.toml",
        "path": "$.servers",
        "map": {
          "*.command": "*.executable",
          "*.args": "*.arguments"
        },
        "section": "mcp_servers",
        "merge": "deep"
      }
    ]
  },

  "claude": {
    "name": "Claude Code",
    "rootDir": ".claude",
    "rootFile": "CLAUDE.md",
    "aliases": ["claudecode"],
    "enabled": true,
    "flows": [
      {
        "from": "rules/{name}.md",
        "to": ".claude/rules/{name}.md"
      },
      {
        "from": "commands/{name}.md",
        "to": ".claude/commands/{name}.md"
      },
      {
        "from": "agents/{name}.md",
        "to": ".claude/agents/{name}.md",
        "map": {
          "role": "type",
          "model": {
            "values": {
              "anthropic/claude-sonnet-4.5": "claude-sonnet-4.5",
              "anthropic/claude-opus-4": "claude-opus-4"
            }
          }
        }
      }
    ]
  },

  "windsurf": {
    "name": "Windsurf",
    "rootDir": ".windsurf",
    "enabled": true,
    "flows": [
      {
        "from": "rules/{name}.md",
        "to": ".windsurf/rules/{name}.md"
      }
    ]
  }
}
```

**Key features demonstrated:**
- ✅ **Global flows**: AGENTS.md and README.md apply to all platforms
- ✅ **Platform metadata**: Names, directories, aliases, enable flags
- ✅ **Simple mappings**: File path with extension transformations
- ✅ **Complex mappings**: Key remapping, value transforms, nesting
- ✅ **Multi-format**: JSON, JSONC, TOML transformations
- ✅ **Conditional flows**: Platform-specific file handling
- ✅ **Namespace isolation**: Multi-package composition
- ✅ **Content embedding**: Different formats for different platforms

---

## Complex Use Cases

### 1. Multi-Package MCP Composition

Three packages each providing MCP server configurations:

**Package A (filesystem):**
```json
{ "servers": { "filesystem": {...} } }
```

**Package B (git):**
```json
{ "servers": { "git": {...} } }
```

**Package C (database):**
```json
{ "servers": { "postgres": {...} } }
```

**Flow:**
```jsonc
{
  "from": "mcp.jsonc",
  "to": ".cursor/mcp.json",
  "namespace": true,
  "merge": "deep"
}
```

**Result:**
```json
{
  "packages": {
    "pkg-a": { "servers": { "filesystem": {...} } },
    "pkg-b": { "servers": { "git": {...} } },
    "pkg-c": { "servers": { "postgres": {...} } }
  }
}
```

### 2. Unified Settings with Platform-Specific Remapping

**Universal settings.jsonc:**
```json
{
  "theme": "dark",
  "fontSize": 14,
  "ai": {
    "model": "gpt-4",
    "temperature": 0.7
  },
  "features": {
    "autocomplete": { "enabled": true },
    "hover": { "enabled": false }
  }
}
```

**Cursor flow:**
```jsonc
{
  "from": "settings.jsonc",
  "to": ".cursor/settings.json",
  "map": {
    "theme": "workbench.colorTheme",
    "fontSize": "editor.fontSize",
    "ai.*": "cursor.*",
    "features.*.enabled": "experimental.*.active"
  },
  "merge": "deep"
}
```

**Result (.cursor/settings.json):**
```json
{
  "workbench": {
    "colorTheme": "dark"
  },
  "editor": {
    "fontSize": 14
  },
  "cursor": {
    "model": "gpt-4",
    "temperature": 0.7
  },
  "experimental": {
    "autocomplete": { "active": true },
    "hover": { "active": false }
  }
}
```

### 3. Cross-Format Extract-Transform-Load

**Universal mcp.jsonc:**
```jsonc
{
  "servers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem"]
    },
    "git": {
      "command": "uvx",
      "args": ["mcp-server-git"]
    }
  },
  "timeout": 30000
}
```

**Codex TOML flow:**
```jsonc
{
  "from": "mcp.jsonc",
  "to": ".codex/config.toml",
  "path": "$.servers",
  "map": {
    "*.command": "*.executable",
    "*.args": "*.arguments"
  },
  "section": "mcp_servers",
  "merge": "deep"
}
```

**Result (.codex/config.toml):**
```toml
[general]
log_level = "info"

[mcp_servers.filesystem]
executable = "npx"
arguments = ["-y", "@modelcontextprotocol/server-filesystem"]

[mcp_servers.git]
executable = "uvx"
arguments = ["mcp-server-git"]
```

---

## Custom Handlers

For complex transformations beyond built-in capabilities, use custom handlers:

```jsonc
{
  "from": "custom.xyz",
  "to": ".cursor/custom.abc",
  "handler": "./transforms/xyz-to-abc.js"
}
```

**transforms/xyz-to-abc.js:**
```javascript
export default async function transform(data, context) {
  // data: parsed source content
  // context: { packageName, targetPath, cwd, ... }
  
  // Custom transformation logic
  const transformed = myComplexTransform(data)
  
  return transformed
}
```

Handler receives parsed source data and returns transformed data. The system handles file I/O and format detection.

---

## Backwards Compatibility

The system provides seamless backwards compatibility with the old `platforms.jsonc` format through automatic conversion.

### File Name Migration

**Old:** `platforms.jsonc` (or `platforms.json`)  
**New:** `flows.jsonc` (or `flows.json`)

**Loading priority:**
1. Load `flows.jsonc` if it exists (preferred)
2. Load `flows.json` if it exists (preferred)
3. Fall back to `platforms.jsonc` with deprecation warning
4. Fall back to `platforms.json` with deprecation warning

### Format Conversion

The system automatically converts the old `subdirs` format to the new `flows` format at load time:

**Old format (platforms.jsonc):**
```jsonc
{
  "cursor": {
    "name": "Cursor",
    "rootDir": ".cursor",
    "rootFile": "AGENTS.md",
    "subdirs": [
      {
        "universalDir": "rules",
        "platformDir": "rules",
        "exts": [".md"],
        "transformations": [
          {
            "packageExt": ".md",
            "workspaceExt": ".mdc"
          }
        ]
      },
      {
        "universalDir": "commands",
        "platformDir": "commands",
        "exts": [".md"]
      }
    ]
  }
}
```

**Auto-converted to (flows.jsonc):**
```jsonc
{
  "cursor": {
    "name": "Cursor",
    "rootDir": ".cursor",
    "rootFile": "AGENTS.md",
    "flows": [
      // Extension transformation applied
      {
        "from": "rules/{name}.md",
        "to": ".cursor/rules/{name}.mdc"
      },
      // Simple mapping
      {
        "from": "commands/{name}.md",
        "to": ".cursor/commands/{name}.md"
      }
    ]
  }
}
```

### Conversion Rules

**1. Subdirs without transformations:**
```jsonc
// Old
{
  "universalDir": "commands",
  "platformDir": "commands",
  "exts": [".md"]
}

// Converted to
{
  "from": "commands/{name}.md",
  "to": ".cursor/commands/{name}.md"
}
```

**2. Subdirs with extension transformations:**
```jsonc
// Old
{
  "universalDir": "rules",
  "platformDir": "rules",
  "exts": [".mdc", ".md"],
  "transformations": [
    { "packageExt": ".md", "workspaceExt": ".mdc" }
  ]
}

// Converted to
{
  "from": "rules/{name}.md",
  "to": ".cursor/rules/{name}.mdc"
}
```

**3. Subdirs with different platform directories:**
```jsonc
// Old
{
  "universalDir": "commands",
  "platformDir": "prompts",
  "exts": [".md"]
}

// Converted to
{
  "from": "commands/{name}.md",
  "to": ".codex/prompts/{name}.md"
}
```

**4. Multiple extensions:**
```jsonc
// Old
{
  "universalDir": "rules",
  "platformDir": "rules",
  "exts": [".md", ".txt"]
}

// Converted to (multiple flows)
{
  "from": "rules/{name}.md",
  "to": ".cursor/rules/{name}.md"
},
{
  "from": "rules/{name}.txt",
  "to": ".cursor/rules/{name}.txt"
}
```

### Migration Warnings

When the CLI detects the old format, it logs a deprecation warning:

```
⚠️  DEPRECATION WARNING: platforms.jsonc is deprecated
   Please migrate to flows.jsonc for better flexibility and features
   Run: opkg migrate flows
   
   The old format will be removed in v3.0.0
```

---

## Migration Path

### Phase 1: Dual Support (v1.x - Current)

**Status:** Both formats supported simultaneously  
**Behavior:**
- Load `flows.jsonc` if present (preferred)
- Fall back to `platforms.jsonc` with warning
- Auto-convert old format to new format in-memory
- No breaking changes for existing users

**User action:** None required

### Phase 2: Deprecation Warnings (v2.0)

**Status:** Old format deprecated but still functional  
**Behavior:**
- Prominent deprecation warnings in CLI output
- Documentation updated to show only new format
- Migration guide published
- New CLI command: `opkg migrate flows`

**User action:** Recommended to migrate

**Migration command:**
```bash
# Auto-convert platforms.jsonc → flows.jsonc
opkg migrate flows

# Output
✓ Converted platforms.jsonc to flows.jsonc
✓ Backup saved to platforms.jsonc.backup
✓ Validated new flows.jsonc configuration
```

The `opkg migrate flows` command:
1. Reads existing `platforms.jsonc` (built-in + global + local)
2. Converts `subdirs` to `flows` format
3. Writes `flows.jsonc` with all conversions
4. Creates backup of old file
5. Validates new configuration
6. Reports any issues or manual steps needed

### Phase 3: Removal Warning (v2.x)

**Status:** Old format still works but logs errors  
**Behavior:**
- Error-level warnings when old format detected
- CI/CD checks fail if old format used
- Strong migration encouragement

**User action:** Must migrate before v3.0

### Phase 4: Complete Removal (v3.0)

**Status:** Old format no longer supported  
**Behavior:**
- Only `flows.jsonc` supported
- Loading `platforms.jsonc` throws error
- Clean codebase without legacy conversion code

**User action:** Migration required to upgrade

### Hybrid Configurations

During the transition, users can have both files:

```
~/.openpackage/
  ├── platforms.jsonc    # Legacy global config (deprecated)
  └── flows.jsonc        # New global config (preferred)

<workspace>/.openpackage/
  └── flows.jsonc        # New local config
```

**Merge behavior:**
- New `flows.jsonc` files take precedence
- Old `platforms.jsonc` files are converted and merged if no new file exists
- Mixing old and new in the same merge hierarchy is supported (old → new → new)

---

## Validation

Flow configurations are validated against a JSON schema:

```typescript
{
  type: 'object',
  required: ['from', 'to'],
  properties: {
    from: { type: 'string', minLength: 1 },
    to: { 
      oneOf: [
        { type: 'string', minLength: 1 },
        { type: 'object', minProperties: 1 }
      ]
    },
    pipe: { 
      type: 'array', 
      items: { type: 'string' } 
    },
    map: { type: 'object' },
    pick: { 
      type: 'array', 
      items: { type: 'string' } 
    },
    omit: { 
      type: 'array', 
      items: { type: 'string' } 
    },
    path: { type: 'string' },
    embed: { type: 'string' },
    section: { type: 'string' },
    when: { type: 'object' },
    merge: { 
      enum: ['deep', 'shallow', 'replace'] 
    },
    namespace: { 
      oneOf: [
        { type: 'boolean' },
        { type: 'string' }
      ]
    },
    format: { type: 'string' },
    handler: { type: 'string' }
  }
}
```

Invalid configurations throw detailed validation errors at load time.

---

## Performance Considerations

### Optimization Strategies

1. **Simple file copies** bypass parsing/transformation entirely
2. **Format auto-detection** caches parsers per file type
3. **Multi-target flows** parse source once, transform multiple times
4. **Namespace wrapping** is lazy - only applied when needed
5. **Merge strategies** use structural sharing where possible

### Execution Order

Flows execute in declaration order. For optimal performance:
- Place simple file copies first
- Group multi-target flows together
- Place conditional flows last

---

## Future Extensions

Potential future enhancements to the flow system:

1. **Flow composition**: Reference and compose flows
2. **Flow templates**: Parameterized flow definitions
3. **Bidirectional flows**: Install/uninstall reversibility
4. **Flow validation**: Pre-flight checks before execution
5. **Flow visualization**: Generate flow diagrams
6. **Flow debugging**: Step-through execution
7. **Flow testing**: Unit test transformations

---

## Summary

The Platform Flows system provides:

- ✅ **Declarative** - Describe what, not how
- ✅ **Structured** - Validated JSON objects
- ✅ **Powerful** - Handles simple to complex transformations
- ✅ **Extensible** - Custom handlers for edge cases
- ✅ **Composable** - Multi-package content merging
- ✅ **Format-agnostic** - JSON, YAML, TOML, XML, INI, Markdown
- ✅ **Type-safe** - IDE autocomplete and validation
- ✅ **Clear** - Self-documenting configuration

All through a single, unified flow specification.

---

## Architecture Decisions

This section documents the key architectural decisions made for the Platform Flows system.

### Decision 1: Single File vs Multiple Files

**Decision:** Use a single `flows.jsonc` file instead of splitting by platform

**Rationale:**
- **Simplicity**: One place to look for all platform definitions
- **Existing merge system**: The built-in → global → local merge hierarchy already provides modularity
- **Cross-platform learning**: Users can reference other platform examples in the same file
- **Atomic validation**: Single load point, single schema validation
- **Easier maintenance**: No import resolution, no circular dependencies
- **Version control**: One file changing is cleaner than 13+ files

**Alternatives considered:**
- ❌ Split by platform (`flows/cursor.jsonc`, `flows/claude.jsonc`, etc.) - Added complexity without clear benefit
- ❌ Split by category (directory-flows, config-flows, etc.) - Awkward organizational boundaries

**User flexibility preserved:**
Users can still modularize via the override system:
```
Built-in: flows.jsonc (all platforms)
Global: ~/.openpackage/flows.jsonc (user customizations)
Local: .openpackage/flows.jsonc (project overrides)
```

### Decision 2: File Name - `flows.jsonc` vs `mappings.jsonc` vs `platforms.jsonc`

**Decision:** Use `flows.jsonc` as the configuration file name

**Rationale:**
- **Matches specification**: The entire system is built around "flow" terminology
- **Accurate semantics**: These aren't simple mappings—they're transformation pipelines
- **Better mental model**: "Flow" conveys the pipeline nature (source → transforms → target)
- **Industry familiarity**: Flows are common in CI/CD, data pipelines, ETL systems
- **Future-proof**: "Flows" encompasses potential future features (flow composition, debugging, etc.)

**Alternatives considered:**
- ❌ `mappings.jsonc` - Too limiting, doesn't capture transformation capabilities
- ❌ `platforms.jsonc` - Confusing mix of platform structure and flow behavior
- ❌ `transforms.jsonc` - Too technical, less intuitive

### Decision 3: Platform Grouping vs Flat Structure

**Decision:** Keep platform-based grouping with optional global section

**Rationale:**

**Benefits of platform grouping:**
1. **Logical organization**: Related flows grouped together
2. **Metadata co-location**: Platform name, rootDir, aliases live with flows
3. **Performance**: Load only relevant platform's flows, no filtering needed
4. **Override granularity**: Users can override specific platforms cleanly
5. **Conditional enabling**: Easy to enable/disable entire platforms

**Benefits of global section:**
1. **DRY principle**: Universal flows (AGENTS.md) defined once
2. **Shared patterns**: Common transformations apply everywhere
3. **Cleaner per-platform definitions**: No duplicated universal flows

**Structure:**
```jsonc
{
  "global": { "flows": [...] },  // Optional, applies to all
  "cursor": { "flows": [...] },   // Platform-scoped
  "claude": { "flows": [...] }    // Platform-scoped
}
```

**Alternatives considered:**
- ❌ Flat array with platform tags:
  ```jsonc
  {
    "flows": [
      { "platform": "cursor", "from": "...", "to": "..." },
      { "platform": "cursor", "from": "...", "to": "..." }
    ]
  }
  ```
  Problems: No metadata co-location, harder to override, requires filtering

- ❌ No global section, duplicate universal flows:
  ```jsonc
  {
    "cursor": { "flows": [{ "from": "AGENTS.md", ... }, ...] },
    "claude": { "flows": [{ "from": "AGENTS.md", ... }, ...] }
  }
  ```
  Problems: Repetition, maintenance burden, inconsistency risk

### Decision 4: Backwards Compatibility Approach

**Decision:** Automatic conversion with phased migration path

**Rationale:**
- **No breaking changes initially**: Existing users continue working without action
- **Clear migration path**: 4-phase approach gives users time to adapt
- **Helpful tooling**: `opkg migrate flows` automates conversion
- **Validation safety**: Auto-converted configs are validated before use
- **Documentation**: Old format examples still work during transition

**Migration phases:**
1. **Phase 1 (v1.x)**: Dual support, no warnings
2. **Phase 2 (v2.0)**: Deprecation warnings, migration guide
3. **Phase 3 (v2.x)**: Error-level warnings, CI fails
4. **Phase 4 (v3.0)**: Old format removed completely

**Alternatives considered:**
- ❌ Immediate breaking change - Too disruptive for users
- ❌ Maintain both formats forever - Technical debt and confusion
- ❌ No auto-conversion - Requires manual work from all users

### Design Principles

These decisions follow core design principles:

1. **User-first**: Minimize disruption, maximize flexibility
2. **Simplicity**: Choose the simpler option when functionality is equivalent
3. **Consistency**: Use familiar patterns (merge hierarchy, JSON schema)
4. **Extensibility**: Support future features without breaking changes
5. **Validation**: Fail fast with clear error messages
6. **Documentation**: Make the system self-explanatory

---

## Implementation Notes

### Key Files

**Configuration:**
- `flows.jsonc` (built-in, ships with CLI)
- `~/.openpackage/flows.jsonc` (global user overrides)
- `<workspace>/.openpackage/flows.jsonc` (project overrides)

**Code modules (planned):**
- `src/core/flows.ts` - Flow loading, merging, validation
- `src/core/flow-executor.ts` - Flow execution engine
- `src/core/flow-transforms.ts` - Built-in transform implementations
- `src/core/platforms.ts` (updated) - Platform detection, metadata (remove subdirs logic)

**Migration:**
- `src/commands/migrate.ts` - Migration command implementation
- `src/core/flows-converter.ts` - Old format → new format conversion

### TypeScript Interfaces

```typescript
// Core flow types
interface FlowsConfig {
  global?: {
    flows: Flow[]
  }
  [platformId: string]: {
    name: string
    rootDir: string
    rootFile?: string
    aliases?: string[]
    enabled?: boolean
    flows: Flow[]
  }
}

interface Flow {
  from: string
  to: string | MultiTargetFlows
  pipe?: string[]
  map?: KeyMap
  pick?: string[]
  omit?: string[]
  path?: string
  embed?: string
  section?: string
  when?: Condition
  merge?: "deep" | "shallow" | "replace"
  namespace?: boolean | string
  format?: string
  handler?: string
}

interface MultiTargetFlows {
  [targetPath: string]: Omit<Flow, "from" | "to">
}

// Legacy format (for conversion)
interface PlatformsConfig {
  [platformId: string]: {
    name: string
    rootDir: string
    rootFile?: string
    aliases?: string[]
    enabled?: boolean
    subdirs: SubdirConfigEntry[]
  }
}
```

### Validation Strategy

1. **Schema validation**: JSON Schema for structure validation
2. **Semantic validation**: Custom validators for flow logic
3. **Reference validation**: Ensure handlers, paths, conditions are valid
4. **Cross-platform validation**: Check for conflicts, duplicates
5. **Deprecation detection**: Warn on old format usage

### Performance Considerations

1. **Lazy loading**: Load platform flows only when platform is detected
2. **Caching**: Cache parsed flows per working directory
3. **Validation memoization**: Validate once, cache results
4. **Simple flow optimization**: Bypass pipeline for simple file copies
5. **Multi-target optimization**: Parse source once, transform N times

---

## Getting Started

### Quick Start: Using Built-in Flows

The CLI ships with built-in flows for all 13 supported platforms. No configuration needed:

```bash
# Install a package - flows run automatically
opkg install @username/cursor-rules

# Files are automatically transformed according to platform flows
# rules/code-review.md → .cursor/rules/code-review.mdc
# commands/refactor.md → .cursor/commands/refactor.md
# mcp.jsonc → .cursor/mcp.json (with namespace isolation)
```

**Zero configuration required!** Built-in flows handle all standard platforms.

### Customizing Flows: Global Overrides

Create `~/.openpackage/flows.jsonc` to customize flows globally:

```jsonc
{
  // Override Cursor to use custom directory
  "cursor": {
    "flows": [
      {
        "from": "rules/{name}.md",
        "to": ".cursor/custom-rules/{name}.mdc"
      }
    ]
  },

  // Add a custom platform
  "my-ai-platform": {
    "name": "My AI Platform",
    "rootDir": ".myai",
    "flows": [
      {
        "from": "rules/{name}.md",
        "to": ".myai/prompts/{name}.md"
      }
    ]
  }
}
```

**Global overrides merge with built-in flows**, so you only specify what changes.

### Project-Specific Flows

Create `<workspace>/.openpackage/flows.jsonc` for project-specific customizations:

```jsonc
{
  // Disable Windsurf for this project
  "windsurf": {
    "enabled": false
  },

  // Custom agent transformation for this project
  "cursor": {
    "flows": [
      {
        "from": "agents/{name}.md",
        "to": ".cursor/agents/{name}.md",
        "map": {
          "role": "agentType",
          "model": {
            "to": "ai.model",
            "values": {
              "anthropic/claude-sonnet-4.5": "claude-sonnet-4.5-project"
            }
          }
        }
      }
    ]
  }
}
```

**Project overrides take highest precedence**, perfect for team-specific requirements.

### Adding Global Flows

To add flows that apply to all platforms, use the `global` section:

```jsonc
{
  "global": {
    "flows": [
      // Universal documentation
      {
        "from": "CONTRIBUTING.md",
        "to": "CONTRIBUTING.md"
      },

      // Shared configuration
      {
        "from": "shared-config.jsonc",
        "to": ".ai/config.json",
        "merge": "deep"
      }
    ]
  }
}
```

**Global flows execute for every detected platform**, avoiding duplication.

### Validating Your Flows

Use the CLI to validate your flow configuration:

```bash
# Validate flows configuration
opkg validate flows

# Output
✓ Global flows: 2 flows validated
✓ Platform 'cursor': 8 flows validated
✓ Platform 'claude': 5 flows validated
✓ All flow configurations valid
```

### Migrating from Old Format

If you have an existing `platforms.jsonc` file:

```bash
# Automatically convert to flows.jsonc
opkg migrate flows

# Output
✓ Converted platforms.jsonc to flows.jsonc
✓ Converted 13 platforms, 47 subdirs → 47 flows
✓ Backup saved to platforms.jsonc.backup
✓ Validated new flows.jsonc configuration

# Review the new file
cat .openpackage/flows.jsonc
```

The migration tool handles all conversion logic automatically.

### Testing Flows

Test flows without installing packages:

```bash
# Dry run to see what would happen
opkg install @username/mcp-servers --dry-run

# Output shows flow transformations:
# [DRY RUN] Would transform:
#   mcp.jsonc → .cursor/mcp.json (namespace: true, merge: deep)
#   mcp.jsonc → .opencode/opencode.json (embed: mcp, merge: deep)
#   mcp.jsonc → .codex/config.toml (section: mcp_servers, merge: deep)
```

### Common Patterns

**Pattern 1: Simple file mapping**
```jsonc
{
  "from": "rules/{name}.md",
  "to": ".cursor/rules/{name}.md"
}
```

**Pattern 2: Extension transformation**
```jsonc
{
  "from": "rules/{name}.md",
  "to": ".cursor/rules/{name}.mdc"
}
```

**Pattern 3: Directory remapping**
```jsonc
{
  "from": "commands/{name}.md",
  "to": ".codex/prompts/{name}.md"
}
```

**Pattern 4: Format conversion + key remapping**
```jsonc
{
  "from": "config.yaml",
  "to": ".cursor/settings.json",
  "map": {
    "theme": "workbench.colorTheme",
    "ai.*": "cursor.*"
  },
  "merge": "deep"
}
```

**Pattern 5: Multi-package composition**
```jsonc
{
  "from": "mcp.jsonc",
  "to": ".cursor/mcp.json",
  "namespace": true,
  "merge": "deep"
}
```

**Pattern 6: Content embedding**
```jsonc
{
  "from": "mcp.jsonc",
  "to": ".opencode/opencode.json",
  "embed": "mcp",
  "merge": "deep"
}
```

### Troubleshooting

**Issue: Flows not executing**
```bash
# Check if platform is detected
opkg status

# Output shows detected platforms:
# Detected platforms: cursor, claude
# If your platform isn't detected, create its rootDir or rootFile
```

**Issue: Files in wrong location**
```bash
# Validate flows configuration
opkg validate flows

# Check specific platform flows
opkg show flows --platform=cursor
```

**Issue: Merge conflicts**
```bash
# Check merge strategy in flows
# Default: "deep" (recursive merge)
# Change to "shallow" or "replace" if needed

{
  "from": "config.jsonc",
  "to": ".cursor/config.json",
  "merge": "replace"  // Last package wins
}
```

**Issue: Key mapping not working**
```bash
# Enable debug logging
DEBUG=opkg:flows opkg install @username/package

# Shows detailed flow execution:
# [DEBUG] Executing flow: rules/{name}.md → .cursor/rules/{name}.mdc
# [DEBUG] Mapping keys: role → type, model → llm.model
# [DEBUG] Transformed: 12 keys, 3 nested
```

### Best Practices

1. **Start with built-in flows**: Only customize what you need
2. **Use global section for universal files**: Avoid duplication
3. **Test with --dry-run**: Preview transformations before applying
4. **Validate after changes**: Run `opkg validate flows`
5. **Version control your overrides**: Commit `.openpackage/flows.jsonc` to git
6. **Document custom platforms**: Add comments explaining your flows
7. **Use meaningful platform IDs**: lowercase, kebab-case (e.g., `my-ai-platform`)
8. **Group related flows**: Keep platform flows together for easier maintenance
9. **Prefer simple flows**: Use `handler` only for complex transformations
10. **Test incrementally**: Add one flow at a time, test, then continue

### Next Steps

- **Read [Flow Structure](#flow-structure)** for detailed syntax
- **Explore [Complex Use Cases](#complex-use-cases)** for advanced patterns
- **Check [Transform Pipeline](#transform-pipeline)** for built-in transforms
- **Review [Architecture Decisions](#architecture-decisions)** for design rationale
- **Try the migration tool**: `opkg migrate flows` if upgrading
