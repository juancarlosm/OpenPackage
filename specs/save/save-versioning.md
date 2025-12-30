# Save and Pack Versioning

Uses semver with prereleases for WIP (work-in-progress) versions during save, while pack promotes to stable. `openpackage.yml.version` declares next stable; index tracks last workspace version. Matches impl in [save-versioning.ts](../core/save/save-versioning.ts).

## Version Roles

- **`openpackage.yml.version` (User/CLI-Managed)**: Canonical next stable (e.g., "1.2.3"). CLI may auto-bump to patch on new cycle.
- **`openpackage.index.yml.workspace.version` (CLI-Managed)**: Last effective version (WIP or stable) from this workspace.
- **Registry Versions**: Full copies under <wip> or <stable>; WIP scoped by workspace hash for cleanup.

## WIP Version Scheme

WIP as prerelease of intended stable `S`:
- Format: `S-<t>.<w>`
  - `<t>`: Fixed-width base36 epoch seconds (monotonic, lex-order = time-order).
  - `<w>`: Short workspace tag (from hash of cwd).
- Example: `1.2.3-000fz8.a3k` < `1.2.3` (semver).
- Goals: Attributable to workspace/time; pre-release of exact stable target.

## Save Versioning Behavior

`save` creates WIP snapshot (full copy to registry) for iterative dev.

### Computation
- Read `openpackage.yml.version` → `stable = S`.
- Read index `workspace.version` → `lastWorkspaceVersion?`.
- Effective base:
  - Default: `effectiveStable = S`.
  - If `lastWorkspaceVersion` is non-prerelease stable matching `S` base: `effectiveStable = patch(S)` (start next cycle).
- `wipVersion = generateWipVersion(effectiveStable)` (adds `<t>.<w>`).
- Reset if mismatch: Log, restart WIP from `S`.

Result interface (from code):
```ts
interface WipVersionComputationResult {
  stable: string;              // e.g., "1.2.3"
  effectiveStable: string;     // "1.2.3" or "1.2.4"
  wipVersion: string;          // "1.2.4-000fz8.a3k"
  lastWorkspaceVersion?: string;
  reset: boolean;              // Mismatch?
  resetMessage?: string;
  shouldBumpPackageYml: boolean; // Auto-bump yml?
  nextStable?: string;         // To bump to
}
```

### Flow
1. Compute WIP.
2. Copy package to registry/<name>/<wipVersion>/.
3. Update index `workspace.version = wipVersion`.
4. Clean old WIP for this workspace/package.
5. Optional: Bump `openpackage.yml.version` if `shouldBumpPackageYml`.

Examples:
- First save on "1.2.3": WIP "1.2.3-<t>.<w>".
- After pack "1.2.3": Next save bumps to effective "1.2.4-<t>.<w>"; may update yml to "1.2.4".

CLI: `opkg save <name>` (infers from cwd/context).

## Pack Versioning Behavior

`pack` publishes stable snapshot.

- Target: Exact `openpackage.yml.version = S` (no bump).
- Flow: Copy to registry/<name>/<S>/; update index `workspace.version = S`; clean this workspace's WIP.
- No mutation of yml.
- After pack, next `save` detects stable → bumps line.

CLI: `opkg pack <name>`.

## Invariants & UX

- `openpackage.yml.version` authoritative for next stable.
- WIP always < stable (semver).
- Workspace isolation: Hash-based cleanup.
- Mental model: yml = "target stable"; save = WIP prereleases; pack = publish exact target.

Errors: Invalid semver, resolution fails → clear messages.

See [Save](README.md), [Pack](pack/), [Version Generator](../utils/version-generator.ts).