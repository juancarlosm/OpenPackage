# Install Command Refactoring Plan

This directory contains the technical plan for refactoring the `install` command to improve organization, modularity, and maintainability.

## Documents

| File | Description |
|------|-------------|
| [01-current-flow-analysis.md](./01-current-flow-analysis.md) | Traces through existing code flow and identifies key patterns |
| [02-problems-identified.md](./02-problems-identified.md) | Catalogs architectural, structural, and flow issues |
| [03-proposed-architecture.md](./03-proposed-architecture.md) | Describes new module structure and abstractions |
| [04-refactor-phases.md](./04-refactor-phases.md) | Step-by-step implementation phases |
| [05-file-mapping.md](./05-file-mapping.md) | Maps current code to proposed locations |
| [06-testing-strategy.md](./06-testing-strategy.md) | Test approach to ensure backward compatibility |

## Summary

### Current State
- `install.ts` is ~588 lines mixing CLI parsing, orchestration, and business logic
- Two parallel code paths (resource model vs legacy) with overlapping logic
- Marketplace detection scattered across 4 locations
- Package loading happens twice for git sources
- Mutable context anti-pattern makes state hard to reason about

### Proposed State
- `install.ts` reduced to ~80 lines (CLI definition only)
- Single orchestrator coordinates all install flows
- Strategy pattern handles source-type differences
- Preprocessing layer resolves base detection and filtering before pipeline
- Dedicated handlers for marketplace and ambiguity resolution
- Immutable context after preprocessing

### Key Benefits
1. **Testability**: Each concern can be tested in isolation
2. **Maintainability**: Clear boundaries between modules
3. **Extensibility**: New source types require only new strategy
4. **Performance**: No duplicate loading
5. **Type Safety**: Proper option types eliminate `any` casts

## Implementation Order

1. **Phase 1-2**: Foundation (types, validators) - Low risk
2. **Phase 3-4**: Orchestrator shell, input classification - Medium risk
3. **Phase 5-6**: Strategies, preprocessing - Higher risk, most value
4. **Phase 7-8**: Handlers - Medium risk
5. **Phase 9-11**: Cleanup - Low risk after above phases stable

Total estimated effort: 8-12 hours across phases.

## Non-Goals

- Changing user-facing behavior
- Modifying the unified pipeline phases
- Changing manifest format
- Adding new features

This is a pure refactoring effort focused on code organization.
