# Testing Strategy

## Guiding Principle

Every phase must maintain **full backward compatibility**. Users should see identical behavior before and after each phase.

## Test Categories

### 1. Existing Integration Tests
- Run full test suite after each phase
- No test modifications unless testing internal APIs that changed
- Add `--updateSnapshot` only if output format explicitly improved

### 2. New Unit Tests (Per Phase)

| Phase | New Test File | Coverage |
|-------|---------------|----------|
| Phase 1 | `tests/types/install-options.test.ts` | Type guard functions if any |
| Phase 2 | `tests/core/install/validators.test.ts` | Validation edge cases |
| Phase 3 | `tests/core/install/orchestrator.test.ts` | Routing logic |
| Phase 5 | `tests/core/install/strategies/*.test.ts` | Per-strategy unit tests |
| Phase 7 | `tests/core/install/handlers/ambiguity.test.ts` | Prompt/auto-select logic |

### 3. Regression Test Matrix

Scenarios to verify work identically after refactor:

| Scenario | Command | Expected Behavior |
|----------|---------|-------------------|
| Bulk install | `opkg install` | Install from openpackage.yml |
| Registry install | `opkg install @scope/pkg` | Fetch from registry |
| Git repo install | `opkg install gh@owner/repo` | Clone and install |
| Git with path | `opkg install gh@owner/repo/agents/foo` | Install specific resource |
| Git with ref | `opkg install gh@owner/repo@v1.0` | Checkout specific version |
| Local path | `opkg install ./path/to/pkg` | Install from filesystem |
| Marketplace | `opkg install gh@owner/marketplace` | Interactive plugin selection |
| Marketplace with --plugins | `opkg install gh@... --plugins a b` | Non-interactive selection |
| Convenience filters | `opkg install gh@... --agents foo` | Filter to specific agents |
| Ambiguous base (interactive) | `opkg install gh@nested/repo` | Prompt for base selection |
| Ambiguous base (--force) | `opkg install gh@nested/repo --force` | Auto-select deepest |
| Dry run | `opkg install pkg --dry-run` | Preview only |
| Force overwrite | `opkg install pkg --force` | Overwrite existing |
| Platform selection | `opkg install pkg --platforms cursor` | Target specific platform |

## Smoke Test Script

Create `tests/smoke/install-scenarios.sh`:

```bash
#!/bin/bash
# Run after each refactor phase

set -e

echo "Testing bulk install..."
opkg install --dry-run

echo "Testing registry install..."
opkg install @hyericlee/essentials --dry-run

echo "Testing git install..."
opkg install gh@owner/test-repo --dry-run

echo "Testing marketplace..."
opkg install gh@owner/marketplace --plugins test-plugin --dry-run

echo "All smoke tests passed!"
```

## Mocking Strategy

### Strategies Tests
- Mock `loader.load()` to avoid network/filesystem
- Provide fixture LoadedPackage results
- Test classification → strategy selection logic

### Orchestrator Tests
- Mock all strategies
- Test routing: input → strategy → handler/pipeline
- Test error propagation

### Handler Tests
- Mock `canPrompt()` to test both interactive/non-interactive
- Mock readline for prompt tests
- Test selection logic

## Phase-Specific Verification

### Phase 1 (Types)
```
npm run typecheck  # Must pass
```

### Phases 2-4 (Extraction)
```
npm test  # All existing tests pass
# New unit tests for extracted modules
```

### Phase 5 (Strategies)
```
npm test
# Add strategy unit tests
# Verify each source type works via integration tests
```

### Phase 9 (Legacy Removal)
```
npm test  # Critical - ensures strategies handle all cases
# Run full regression matrix
```

### Phase 11 (Cleanup)
```
npm run lint
npm run typecheck
npm test
npm run build
```

## Rollback Points

Each phase should be a separate commit/PR. If issues arise:
1. Revert to previous phase
2. Investigate in isolation
3. Fix and re-apply

## CI Integration

Add to CI pipeline:
```yaml
- name: Run install smoke tests
  run: ./tests/smoke/install-scenarios.sh
  
- name: Run full test suite
  run: npm test
  
- name: Verify types
  run: npm run typecheck
```
