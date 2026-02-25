# Wave-Based BFS Dependency Resolver

## Overview

Replace the dependency resolution pipeline with a new **wave-based BFS resolver** at `packages/core/src/core/wave-resolver/`. This module processes dependencies in breadth-first waves -- each wave batches all unresolved packages at the current frontier, fetches their metadata in parallel, discovers new dependencies, and repeats until the queue is empty.

The module handles all three source types (registry, git, path) in the wave loop, integrates fully with the existing orchestrator, and updates `openpackage.index.yml` as part of its output.

---

## Illustrative Example

```
Start: read root openpackage.yml
  └─ Queue: [ react@^18, typescript@^5 ]

Wave 1 — fetch packuments for queued names:
  GET registry/react        → resolves to react@18.3.1
  GET registry/typescript   → resolves to typescript@5.7.3

  react@18.3.1 declares:
    dependencies: { "loose-envify": "^1.1.0" }

  typescript@5.7.3 declares:
    dependencies: {}    ← leaf, nothing to queue

  └─ Queue: [ loose-envify@^1.1.0 ]

Wave 2 — fetch packuments for newly discovered names:
  GET registry/loose-envify → resolves to loose-envify@1.4.0

  loose-envify@1.4.0 declares:
    dependencies: { "js-tokens": "^3.0.0 || ^4.0.0" }

  └─ Queue: [ js-tokens@^3.0.0||^4.0.0 ]

Wave 3:
  GET registry/js-tokens    → resolves to js-tokens@4.0.0

  js-tokens@4.0.0 declares:
    dependencies: {}    ← leaf

  └─ Queue empty → resolution complete
```

---

## Module Structure

New directory: `packages/core/src/core/wave-resolver/`

| File | Responsibility |
|---|---|
| `types.ts` | All types: `WaveNode`, `WaveGraph`, `WaveResult`, `FetchResult`, `PackageFetcher` interface, `WaveResolverOptions` |
| `manifest-reader.ts` | Read `openpackage.yml` from any source (thin wrapper reusing existing `resolution/manifest-reader.ts` utilities) |
| `fetcher.ts` | Per-source-type metadata fetcher (registry: local+remote version lookup; git: clone/cache; path: stat+load). All fetchers implement a common `PackageFetcher` interface. |
| `version-solver.ts` | Given all accumulated constraints per package name, pick the best version. Reuses `semver` + existing `version-ranges.ts` utilities. |
| `wave-engine.ts` | The core BFS loop: reads root manifest, enqueues direct deps, runs waves. Each wave calls `fetcher` in parallel, calls `version-solver`, reads child manifests, enqueues new deps. Produces a `WaveGraph`. |
| `context-builder.ts` | Converts `WaveGraph` nodes into `InstallationContext[]` for the existing unified pipeline. |
| `index-updater.ts` | After successful install, updates `openpackage.index.yml` with resolved versions, sources, and dependencies. |
| `index.ts` | Public API: `resolveWave(rootManifestPath, options): WaveResult` |

---

## Core Algorithm (`wave-engine.ts`)

```
function resolveWave(rootManifest, options):
  // 1. Read root openpackage.yml
  rootDeps = extractDependencies(rootManifest)

  // 2. Initialize state
  resolved = Map<string, WaveNode>()   // key = canonical dep ID
  queue = [...rootDeps]                 // frontier for next wave
  visiting = Set<string>()              // cycle detection
  waveNumber = 0

  // 3. Wave loop
  while queue.length > 0:
    waveNumber++
    currentWave = dequeueAll(queue)

    // Deduplicate: skip already-resolved or in-flight
    toFetch = currentWave.filter(dep =>
      !resolved.has(dep.id) && !visiting.has(dep.id)
    )
    for dep in toFetch: visiting.add(dep.id)

    // 4. Parallel fetch all packuments in this wave
    //    - Registry deps: resolveRegistryVersion() + loadPackageMetadata()
    //    - Git deps: loadPackageFromGit() (uses cache)
    //    - Path deps: loadPackageFromPath()
    fetchResults = await Promise.all(
      toFetch.map(dep => fetcher.fetch(dep))
    )

    // 5. For each fetched result:
    for result in fetchResults:
      // a. Version solve (for registry: pick best version from constraints)
      resolvedVersion = versionSolver.solve(result)

      // b. Record in resolved map
      node = createWaveNode(result, resolvedVersion)
      resolved.set(node.id, node)
      visiting.delete(node.id)

      // c. Read child manifest (openpackage.yml from content root)
      childDeps = readChildDependencies(node.contentRoot)

      // d. Enqueue new deps not yet resolved
      for childDep in childDeps:
        if !resolved.has(childDep.id):
          queue.push(childDep)
          // Record parent->child edge
          node.children.push(childDep.id)

  // 6. Compute topological install order (leaves first)
  installOrder = topologicalSort(resolved)

  return { nodes: resolved, installOrder, waves: waveNumber }
```

---

## Key Design Decisions

### 1. Source-Specific Fetcher Strategies (`fetcher.ts`)

A `PackageFetcher` interface with three implementations:

- **`RegistryFetcher`**: Uses existing `resolveCandidateVersionsForInstall()` + `selectInstallVersionUnified()` for local-first-with-remote-fallback version resolution. Loads package content root via `resolvePackageContentRoot()`. If not locally available, calls `pullPackageFromRemote()`.

- **`GitFetcher`**: Uses existing `loadPackageFromGit()` with git cache. Returns content root + manifest. Uses `ensureContentRoot()` from `content-root-cache.ts` for dedup within a run.

- **`PathFetcher`**: Uses existing `loadPackageFromPath()`. Returns content root + manifest.

Each returns a `FetchResult` with: `name`, `version`, `contentRoot`, `sourceType`, `metadata (PackageYml)`, `childDependencies[]`.

### 2. Version Constraint Accumulation

As waves progress, the same package name may appear from multiple parents with different version constraints. The `version-solver.ts` accumulates all constraints per package name in a `Map<string, string[]>` and finds the highest satisfying version across all constraints (reusing `semver.maxSatisfying` with `includePrerelease: true`).

If constraints are incompatible, it follows the existing conflict handling: interactive prompt (if available) or `--force` to pick latest.

### 3. Canonical Dependency ID

Each dependency gets a canonical ID for deduplication:
- Registry: `registry:${normalizedName}`
- Git: `git:${urlHash}:${ref||'HEAD'}:${resourcePath||''}`
- Path: `path:${absolutePath}`

This reuses the logic from `resolution/id-generator.ts`.

### 4. Wave Parallelism

Within each wave, all fetches run in parallel via `Promise.all()`. This is the key efficiency gain over the current serial DFS: if wave 1 has 10 registry deps, all 10 are fetched concurrently.

Git clones within a wave also run in parallel (the git cache prevents duplicate clones for the same URL).

### 5. No Depth Limit

The BFS runs until the queue is empty (all leaf nodes have been resolved). There is no max depth cutoff -- this guarantees completeness and avoids silently dropping real dependencies.

Termination is guaranteed by:
- **Cycle detection**: The `visiting` set prevents infinite loops from circular dependencies. When a cycle is detected, the cycle-causing edge is skipped and a warning is emitted. This is the only case where a dependency is not fully traversed.
- **Safety valve (node count limit)**: A generous upper bound on total resolved nodes (e.g., 10,000) as a sanity check against pathological graphs or bugs. This is a hard error (not a silent skip) and in practice should never be hit by real dependency trees.

The `waveNumber` is tracked for diagnostic/logging purposes but does not gate resolution.

### 6. openpackage.index.yml Updates (`index-updater.ts`)

After resolution, the `index-updater` will:
- Read existing `openpackage.index.yml` via `readWorkspaceIndex()`
- For each resolved node, update/create the entry with `path`, `version`, `dependencies[]`
- Write back via `writeWorkspaceIndex()`

This runs after the installation pipeline (not during resolution), ensuring the index reflects actually-installed packages.

---

## Integration Points

### A. Orchestrator Integration

In `orchestrator.ts`, the current flow for bulk install (`opkg i`) and single-package-with-deps calls either:
- `DependencyResolutionExecutor` (newer system)
- `resolveDependencies()` (legacy resolver, via `resolve-dependencies.ts` phase)

The new module will be wired as follows:

1. **Bulk install** (`runRecursiveBulkInstall`): Replace `DependencyResolutionExecutor` with `resolveWave()` + `buildInstallContexts()` + existing `runUnifiedInstallPipeline()`.

2. **Single package with deps** (`installDependenciesOnly`): Replace `DependencyResolutionExecutor` with `resolveWave()` using `rootManifestPath` as the root.

3. **Resolve-dependencies phase** (`unified/phases/resolve-dependencies.ts`): Replace `resolveDependencies()` call with `resolveWave()` for the target package's manifest.

### B. Reused Existing Code

| Existing Module | What's Reused |
|---|---|
| `version-ranges.ts` | `selectVersionWithWipPolicy`, `findBestVersion`, `parseVersionRange` |
| `version-selection.ts` | `selectInstallVersionUnified` (for registry version resolution) |
| `local-source-resolution.ts` | `resolveCandidateVersionsForInstall`, `resolvePackageContentRoot` |
| `resolution/id-generator.ts` | `computeDependencyId` |
| `resolution/manifest-reader.ts` | `readManifestAtPath`, `extractDependencies`, `getManifestPathAtContentRoot` |
| `resolution/content-root-cache.ts` | `ensureContentRoot`, `getCachedContentRoot` |
| `git-package-loader.ts` | `loadPackageFromGit` |
| `path-package-loader.ts` | `loadPackageFromPath` |
| `sources/registry-source.ts` | `RegistrySourceLoader.load()` (for loading after resolution) |
| `workspace-index-yml.ts` | `readWorkspaceIndex`, `writeWorkspaceIndex` |
| `unified/pipeline.ts` | `runUnifiedInstallPipeline` (for installing each resolved package) |

### C. What Gets Deprecated / Removed

| Module | Status |
|---|---|
| `dependency-resolver/resolver.ts` | Deprecated (already marked). All callers switch to wave resolver. |
| `resolution/graph-builder.ts` | Replaced by `wave-engine.ts` |
| `resolution/executor.ts` | Replaced by wave resolver + context builder |
| `resolution/package-loader.ts` | Replaced by `fetcher.ts` (wave-integrated loading) |
| `resolution/version-solver.ts` | Replaced by `wave-resolver/version-solver.ts` |
| `resolution/installation-planner.ts` | Replaced by `context-builder.ts` |

These won't be deleted immediately -- they'll be marked `@deprecated` and callers will be migrated in this same PR.

---

## Edge Cases Handled

- **Circular dependencies**: Detected via the `visiting` set. Cycles are recorded and the cycle-causing edge is skipped (same as current behavior).
- **No depth limit**: The BFS runs to completion. A safety-valve node count limit (e.g., 10,000) guards against pathological graphs but should never be hit in practice.
- **Mixed source types in same wave**: A wave can contain registry, git, and path deps simultaneously. Each gets routed to the appropriate fetcher.
- **Git marketplace deps**: If a git dep points to a marketplace, it's flagged and excluded from recursive dep resolution (consistent with current behavior).
- **Version conflicts**: Accumulated per package name across waves. Interactive resolution or force-latest when constraints are incompatible.
- **Remote fallback**: Registry fetcher follows existing local-first-with-remote-fallback policy per the spec in `specs/install/version-resolution.md`.
- **Dev dependencies**: Only included at depth 0 (root level), consistent with current behavior.
- **Already-installed packages**: Checked against `openpackage.index.yml` to skip re-installation (unless `--force`).

---

## Implementation Tasks

1. Create `wave-resolver/types.ts` -- Define `WaveNode`, `WaveGraph`, `WaveResult`, `FetchResult`, `PackageFetcher` interface, `WaveResolverOptions`
2. Create `wave-resolver/fetcher.ts` -- Implement `RegistryFetcher`, `GitFetcher`, `PathFetcher` using existing loaders
3. Create `wave-resolver/version-solver.ts` -- Constraint accumulation + resolution (port logic from existing `resolution/version-solver.ts` + legacy resolver)
4. Create `wave-resolver/manifest-reader.ts` -- Thin wrapper around existing `resolution/manifest-reader.ts`
5. Create `wave-resolver/wave-engine.ts` -- Core BFS loop
6. Create `wave-resolver/context-builder.ts` -- Convert `WaveGraph` to `InstallationContext[]`
7. Create `wave-resolver/index-updater.ts` -- Update `openpackage.index.yml` post-install
8. Create `wave-resolver/index.ts` -- Public API
9. Wire into `orchestrator.ts` -- Replace `DependencyResolutionExecutor` usage and `resolveDependencies` calls
10. Wire into `unified/phases/resolve-dependencies.ts` -- Replace legacy resolver call
11. Deprecate old modules -- Add `@deprecated` annotations
12. Test -- Run existing test suite, add wave-specific tests
