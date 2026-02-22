/**
 * Search Command (CLI layer)
 *
 * Thin shell over core/search/search-pipeline.ts.
 * Handles CLI arg parsing and terminal display only.
 */

import { Command } from 'commander';

import { CommandResult } from '../types/index.js';
import { createCliExecutionContext } from '../cli/context.js';
import { runSearchPipeline, type SearchResult, type PackageMatch, type SearchOptions } from '../core/search/search-pipeline.js';
import { getTreeConnector, getChildPrefix } from '../core/list/list-tree-renderer.js';

// ── Display (CLI-only) ───────────────────────────────────────────

const DIM = '\x1b[2m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

function dim(text: string): string {
  return `${DIM}${text}${RESET}`;
}

function cyan(text: string): string {
  return `${CYAN}${text}${RESET}`;
}

function displaySection(title: string, subtitle: string, matches: PackageMatch[], showAll: boolean): void {
  if (matches.length === 0) return;

  console.log(`${cyan(title)} ${dim(subtitle)}`);

  for (let i = 0; i < matches.length; i++) {
    const pkg = matches[i];
    const isLast = i === matches.length - 1;

    if (pkg.source === 'registry' && pkg.versions) {
      if (showAll && pkg.versions.length > 1) {
        const connector = getTreeConnector(isLast, true);
        console.log(`${connector}${pkg.name}`);
        const childPrefix = getChildPrefix('', isLast);
        for (let vi = 0; vi < pkg.versions.length; vi++) {
          const isLastVersion = vi === pkg.versions.length - 1;
          const versionConnector = getTreeConnector(isLastVersion, false);
          console.log(`${childPrefix}${versionConnector}${pkg.versions[vi]}`);
        }
      } else {
        const connector = getTreeConnector(isLast, false);
        console.log(`${connector}${pkg.name}@${pkg.versions[0]}`);
      }
    } else {
      const connector = getTreeConnector(isLast, false);
      console.log(`${connector}${pkg.name}`);
    }
  }
}

function displayResults(result: SearchResult, showAll: boolean): void {
  const project = result.matches.filter(m => m.source === 'project');
  const global = result.matches.filter(m => m.source === 'global');
  const registry = result.matches.filter(m => m.source === 'registry');

  let hasAny = false;

  if (project.length > 0) {
    displaySection('[Project Packages]', '(./.openpackage/packages)', project, showAll);
    hasAny = true;
  }
  if (global.length > 0) {
    displaySection('[Global Packages]', '(~/.openpackage/packages)', global, showAll);
    hasAny = true;
  }
  if (registry.length > 0) {
    displaySection('[Local Registry]', '(~/.openpackage/registry)', registry, showAll);
    hasAny = true;
  }
  if (!hasAny) {
    console.log(dim('No packages found.'));
  }
}

function displayJson(result: SearchResult): void {
  const output = result.matches.map(m => {
    const entry: Record<string, unknown> = { name: m.name, source: m.source };
    if (m.versions) entry.versions = m.versions;
    if (m.description) entry.description = m.description;
    if (m.keywords) entry.keywords = m.keywords;
    return entry;
  });
  console.log(JSON.stringify(output, null, 2));
}

// ── Command handler ──────────────────────────────────────────────

async function searchCommand(
  query: string | undefined,
  options: SearchOptions,
  command: Command
): Promise<CommandResult> {
  const programOpts = command.parent?.opts() || {};

  const explicitSources = options.project || options.global || options.registry;

  const result = await runSearchPipeline({
    query,
    showProject: options.project || !explicitSources,
    showGlobal: options.global || !explicitSources,
    showRegistry: options.registry || !explicitSources,
    createContext: (opts) => createCliExecutionContext({ global: opts.global, cwd: opts.cwd }),
    cwd: programOpts.cwd,
  });

  if (options.json) {
    displayJson(result);
  } else {
    displayResults(result, options.all || false);
  }

  return { success: true };
}

// ── Command setup ────────────────────────────────────────────────

export async function setupSearchCommand(args: any[]): Promise<void> {
  const [query, options, command] = args as [string | undefined, SearchOptions, Command];
  await searchCommand(query, options, command);
}
