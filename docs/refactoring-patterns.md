# Refactoring patterns

Field guide for decomposing files in the ICE codebase. Distilled from the Phase 1 + Phase 2 refactors (Apr-May 2026): 30+ files refactored, 50,000+ LOC redistributed, ~3500 new tests added, 70+ learning anchors recorded in [`state/learnings.md`](../state/learnings.md).

## When to refactor

The codebase ceiling is **200-500 LOC per source file** (test files exempt). Over 500 needs splitting; under 200 is fine when meaningfully scoped (don't fragment for fragmentation's sake).

The cohort process: planner audits files >500 LOC, the orchestrator picks 3-9 cohesive units per file, dispatches an implementer per unit, captures load-bearing behavior risks before extraction. See [`agents.md`](agents.md) for the multi-agent loop.

## Six proven decomposition patterns

Each pattern below has been applied to 2+ files with consistent results. Pick the one that fits the source file's shape.

### 1. Section pattern - React panels and pages

**When**: Single React.FC that exceeds 500 LOC by accreting subcomponents, hooks, utils, and inline render helpers.

**Shape**: Extract leaves-first into a parallel directory:
- `feature/utils/<topic>.ts` for pure functions
- `feature/components/<name>.tsx` for leaf subcomponents
- `feature/sections/<name>.tsx` for composing sections
- `feature/hooks/<name>.ts` for custom hooks bundling Redux + side-effects
- Orchestrator becomes a thin compose-and-route shell

**Hooks frequently extract into 2-3 bundles**:
- `useXActions` - useCallback handlers (often dispatching Redux thunks)
- `useXEffects` - useEffect blocks (auto-scroll, hydrate, subscribe-listeners)
- `useXState` or domain-specific (e.g. `useDestroyAction`)

**Applied to**: deploy-panel.tsx (2229 → 262 LOC), properties-panel.tsx (3268 → 94 LOC), resource-palette.tsx (962 → 220), provider-settings.tsx (784 → 224), pipeline-panel.tsx (724 → 442), template-gallery × 2, project-tree.tsx (707 → 270), ai-chat-panel.tsx (688 → 255), cost-panel.tsx (678 → 348), dev-accent-picker.tsx (826 → 184), and others.

### 2. Reducer-group pattern - RTK slices

**When**: A `createSlice` call with 20+ reducers exceeds 500 LOC.

**Shape**: Each extracted reducer module exports a plain object of RTK-compatible case-reducer functions:

```ts
// slice/reducers/lifecycle.ts
export const lifecycleReducers = {
  setActiveCard: (state, action) => { ... },
  createCard: { prepare, reducer },  // {prepare, reducer} shape if needed
  // ...
} as const;
```

The orchestrator spreads them into the single `createSlice` call:

```ts
// slice.ts
const slice = createSlice({
  name: 'cards',
  initialState,
  reducers: {
    ...lifecycleReducers,
    ...nodeEdgeAddReducers,
    ...nodePositionReducers,
    // ...
  },
});
```

**Why spread, not sub-slices**: action types are derived from the spread keys; the single `createSlice` call owns all action type strings. Sub-slices would change action type prefixes and break consumers.

**Applied to**: cards-slice.ts (1195 → 162 LOC, 14 units), deploy-slice.ts (918 → 186 LOC, 14 units).

### 3. Standalone functions taking a state interface - class decomposition

**When**: A class with many methods sharing private state exceeds 500 LOC.

**Shape**: Define a `<X>State` (or `<X>Context`) interface; convert methods to standalone functions taking `s: XState` as first arg; class becomes a thin shell holding the state and delegating.

```ts
// scheduler/dispatch.ts
export function dispatch(ctx: SchedulerContext, node_id: string): void {
  ctx.in_flight.add(node_id);
  // ...
}

// scheduler.ts
export class ParallelChangeScheduler {
  private readonly ctx: SchedulerContext;
  constructor(input: SchedulerRunInput) { this.ctx = make_scheduler_context(input); }
  async run(): Promise<ResourceDeployResult[]> {
    return run_loop(this.ctx);  // standalone function
  }
}
```

**Decision rule per method**:
- Pure (no state read/write) → extract.
- Reads state only → extract, take state as arg.
- Writes state → extract IF the state mutation is well-scoped; keep on class IF it touches many fields.

**Applied to**: parser.ts (1061 → 184 LOC, ParserState), lexer.ts (647 → 316 LOC, LexerState), sqlite-state-store.ts (946 → 249 LOC, SqliteContext), pulumi-exporter.ts (660 → 101 LOC), scheduler.ts (694 → 164 LOC, SchedulerContext), mutable-graph.ts (657 → 299 LOC, MutableGraphState).

### 4. Handler-domain pattern - service modules

**When**: A service file with many independent exported functions grouped by domain (e.g. CRUD by resource type, or REST endpoints by domain).

**Shape**: Group cohesive functions into `<service>/<domain>.ts` modules. The orchestrator becomes a re-export shim.

```ts
// pipeline/rule-management.ts
export async function ensureRulesForCanvas(...) { ... }
export async function createRule(...) { ... }
export async function deleteRule(...) { ... }

// pipeline.service.ts (shim)
export { ensureRulesForCanvas, createRule, deleteRule } from './pipeline/rule-management.js';
export { createDeploymentEvent, updateEventProgress } from './pipeline/events.js';
// ...
```

**Applied to**: deploy.service.ts (2843 → 1572 LOC, 17 units), pipeline.service.ts (880 → 42 shim), log-stream.service.ts (869 → 181), ai.service.ts (994 → 164), firebase-hosting.ts (1140 → 422), cloud-storage.ts (856 → 267).

### 5. Data-heavy shim split - files dominated by lookup tables

**When**: A file with mostly data (a giant `Record`, array, or `Map`) plus a few helpers.

**Shape**: Three files:
- `<name>-data.ts` - the giant data dict (size exception, document in file header)
- `<name>-types.ts` - interfaces and types
- `<name>.ts` - re-export shim + small helpers (`<200 LOC`)

```ts
// <name>.ts
export { BIG_DATA_TABLE } from './<name>-data.js';
export { type FooConfig, BAR_CONST } from './<name>-types.js';

// helpers stay here
export function getFromTable(key: string) { ... }
export function processConfig(...) { ... }
```

**Why keep helpers with the shim**: the helpers depend on data + types but importers only see the shim path. Putting helpers in the data file would require importers to know about the data file structure.

**Applied to**: scale-presets.ts (1562 → 58 shim + 64 types + 1482 data), cloud-blocks.ts (1315 → 141 shim + 222 types + 1009 data), dev-accent-picker.tsx (826 → 184 shim + types + utils + 590 data), ast.ts (701 → 17 shim + types + helpers).

### 6. Hook bundling with state-ref passthrough

**When**: A custom hook with 4+ useState slots, multiple useEffects, and many useCallback handlers exceeds 200 LOC.

**Shape**: Split into sub-hooks taking shared `MutableRefObject` for state that crosses sub-hook boundaries:

```ts
// canvas/hooks/interactions/use-mouse-handlers.ts
export function useMouseHandlers(args: {
  stateRef: MutableRefObject<InteractionState>;
  // ...
}) {
  const handleMouseDown = useCallback(/* ... */, [stateRef, /* ... */]);
  // ...
}

// canvas/hooks/use-canvas-interactions.ts (orchestrator hook)
export function useCanvasInteractions({ ... }) {
  const stateRef = useRef<InteractionState>({ /* ... */ });
  const mouseHandlers = useMouseHandlers({ stateRef, ... });
  const keyboardHandlers = useKeyboardHandlers({ stateRef, ... });
  return { ...mouseHandlers, ...keyboardHandlers };
}
```

**Why MutableRefObject not RefObject**: sub-hooks that mutate the ref (e.g. write back state) need `MutableRefObject<T>` access; `RefObject<T>` is read-only and `current` is `T | null`.

**Applied to**: useCanvasInteractions (666 → 185 LOC), useDeployActions/useDeployEffects/useDestroyAction (rf-pdpl Layer 4), use-canvas-data/handlers/effects (rf-canv2).

## Test patterns

### Direct-FC tree-walker (no jsdom)

The monorepo doesn't ship jsdom or `@testing-library/react`. UI tests use `react-dom/server` plus a manual tree walker:

```ts
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';

function findByPredicate(el: ReactElement, predicate: (e) => boolean) { /* recurse */ }
function collectText(el: ReactElement): string { /* concat strings */ }

it('renders the section header', () => {
  const tree = createElement(MyComponent, { /* props */ });
  expect(collectText(tree)).toContain('Expected text');
});
```

**Common gotchas**:
- `findByPredicate` must recurse into ARRAY children for Fragments (`<>{x.map(...)}{y.map(...)}</>`). Children aren't always primitive trees.
- `collectText` must handle array-of-strings children for icon-followed-by-text patterns.
- `lucide-react` icons are `forwardRef` objects, not FCs. Filter on `className` or reference equality, not `typeof el.type === 'function'`.

### Capture-ref pattern for hook tests

Hooks that return objects (callbacks, refs) can be tested without React-DOM by rendering a tiny probe component that captures the return value via a ref:

```ts
let captured: ReturnType<typeof useMyHook>;
function Probe() {
  captured = useMyHook(/* args */);
  return null;
}
renderToStaticMarkup(createElement(Provider, { store }, createElement(Probe)));
captured.handleClick();  // invoke directly
```

### Multi-state useState mock

For FCs with 3+ `useState` calls:

```ts
const states: Array<{ value: any; setter: ReturnType<typeof vi.fn> }> = [];
let callIdx = 0;
vi.mock('react', async (orig) => {
  const r = await orig() as any;
  return {
    ...r,
    useState: (init: any) => {
      const slot = states[callIdx++] ?? { value: init, setter: vi.fn() };
      return [slot.value, slot.setter];
    },
  };
});
```

The orchestrator drives `states` and `callIdx` between renders.

### vi.mock path resolution

`vi.mock(specifier)` resolves the path **relative to the TEST FILE's directory**, not the SUT's. When extracting helpers into deeper subdirectories, recount `..` segments.

```ts
// SUT at packages/ui/src/features/deploy/components/foo.tsx
import { bar } from '../../../store';

// Test at packages/ui/src/features/deploy/components/__tests__/foo.test.tsx
vi.mock('../../../../store', /* ... */);  // 4 dots, not 3
```

### vi.hoisted for stable mock identity

```ts
const mocks = vi.hoisted(() => ({ getApi: vi.fn() }));
vi.mock('../../../api', () => ({ getApi: mocks.getApi }));
```

Without `vi.hoisted`, the mock factory runs in module-init scope where the mocked module's identity isn't stable across reloads.

## Common gotchas

### `.js` extension in Node ESM imports

`packages/core` and `services/*` are Node ESM packages. **Imports must include `.js` extensions** even when source files are `.ts`:

```ts
import { foo } from './foo.js';   // ✓ resolves at runtime
import { foo } from './foo';      // ✗ fails Node resolution
```

UI/web packages use bundler resolution and don't require `.js`. Mixing the two is the most common cross-package import bug.

### Pre-commit hook auto-bumps package.json

The pre-commit hook runs `npm version patch` on every commit. This means:
- `package.json` is included in every commit (acceptable, expected).
- Don't manually edit `package.json` version.
- Don't be alarmed when `0.1.X` increments unexpectedly.
- A commit "doing nothing" is impossible; always pair with a real change.

### TypeScript baseline noise (TS2834)

`packages/core` carries ~29 pre-existing TS2834 errors in unrelated barrel files (`src/index.ts`, `src/graph/index.ts`, `src/importers/*`, `src/schema/embedded-schema-provider.ts`). These are NOT new errors introduced by refactor work. Verify by stash + re-run. The fix is unrelated module-resolution work; don't accidentally chase them during a refactor.

### Re-export shims preserve public API

When extracting types or values that have external consumers, the original file becomes a re-export shim:

```ts
// types.ts (shim)
export type { CardNode, CardEdge, CardsState } from './cards/types.js';
export { migrateCardNodes } from './cards/migration.js';
```

Type-only re-exports (`export type {}`) don't create runtime cycles; runtime re-exports (`export {}`) do - be careful with import order if cycles form.

### JSDoc `*/` inside prose closes the block early

Writing `/* ... cluster.*/block.* prefixes ... */` inside a JSDoc comment closes the block at `cluster.*/`, not at the trailing `*/`. The TypeScript parser then errors on the next line of prose with a misleading "Unexpected token" message. Drop the `/` or escape it.

### Brief line numbers shift across a multi-unit series

Each unit deletes/inserts lines. The line numbers in the brief are accurate at the start of the series only. Always re-grep before each extraction:

```bash
grep -n "^function extract_foo" path/to/file.ts
```

The `find current line numbers via grep first` rule applies even when a brief seems to give exact ranges.

## Multi-agent workflow integration

These patterns are dispatched through the implementer agent (see [`agents.md`](agents.md)). The orchestrator (main session) writes a per-unit brief naming the source range, the chosen pattern, and the behavior-risk flags. The implementer extracts, writes tests, commits per unit, and reports back. The critic verifies API equivalence; ux-tester is skipped for refactor-only work.

The `state/learnings.md` file accumulates non-obvious gotchas discovered during refactor work. Patterns generalize from there into this doc when cited 3+ times across series.

## See also

- [agents.md](agents.md) - multi-agent workflow and per-agent responsibilities
- [`state/refactor-targets.md`](../state/refactor-targets.md) - current decomposition queue
- [`state/learnings.md`](../state/learnings.md) - granular gotchas (citations to this doc indicate "promoted from learnings")
- [`state/decisions.md`](../state/decisions.md) - architectural decisions
