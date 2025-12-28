### Save Pipeline – Frontmatter and Inline Platform Overrides

#### 1. Overview

For markdown files, the pipeline manages **frontmatter** and platform‑specific overrides to keep shared metadata centralized while allowing platform-specific behavior. Platform overrides now live **inline** inside the universal markdown frontmatter under `openpackage.<platform>` (ids/aliases); no separate `.yml` override files are written.

---

#### 2. Workspace Markdown Candidates

- For each platform, the latest workspace markdown candidate for a given registry path is considered.
- The frontmatter is normalized and separated from the markdown body.

---

#### 3. Universal Frontmatter Extraction

- The pipeline computes frontmatter keys and values that are **identical across all platform entries** for that path.
- These shared keys form the **universal frontmatter** that should live in the base markdown file.

---

#### 4. Platform‑Specific Overrides

For each platform:

- The per‑platform frontmatter is compared against the universal frontmatter.
- Only the **difference** per platform is treated as that platform's override, or omitted if empty.
- Platform overrides are embedded **inline** under `openpackage.<platform>` (id/alias) in the universal frontmatter.
- During apply/install, the target platform’s block is deep‑merged onto the common frontmatter to produce the final frontmatter for that platform. Platform blocks are not emitted in the installed files.

---

#### 5. Conflicts with Existing Overrides

All overrides are computed from workspace candidates (overwrite-derived). The universal frontmatter is rewritten to contain the shared keys plus per-platform blocks; no external override files are consulted or prompted for.

---

#### 6. Resulting Layout

- One universal markdown file with:
  - Shared/common frontmatter keys
  - Per‑platform blocks nested under `openpackage.<platform>` containing only the per‑platform differences

This scheme keeps:

- Shared metadata centralized in the universal file.
- Platform‑specific behavior in small, explicit override files.
- Markdown bodies free from duplication where possible.

---

#### 7. Final File Inclusion Rules

After all conflicts and frontmatter merges are resolved, the pipeline reads the final contents of the package directory and applies a last round of filtering.

##### Excluded

- `openpackage.index.yml`.
- Internal files that are not considered part of the package content.

##### Included

- Paths allowed by the regular registry path rules.
- Root files (the unified root agents file and related root docs).
- Root‑level files adjacent to `openpackage.yml` that are intended as part of the package.

---

#### 8. Output

The resulting list of files, with paths relative to the package directory, is what gets:

- Copied into the local registry under the computed version.
- Used to drive optional platform apply/sync and any subsequent operations in the save pipeline.

