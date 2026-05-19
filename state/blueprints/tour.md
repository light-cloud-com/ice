# Tour engine blueprint (v1)

In-house, JSON-driven, multi-step guided tour engine for ICE. Lives at
`packages/ui/src/features/tour/`. Runs alongside the existing 3-step
credential wizard at `packages/ui/src/features/onboarding/` (which stays
as-is — it collects data, tours teach surface).

The blueprint is unit-by-unit so an implementer can land one piece at a
time. Per repo discipline, every source file targets 200–500 LOC; over
500 needs further splitting (see `feedback_200_loc_ceiling`).

## 1. Architecture

### 1.1 Folder layout

```
packages/ui/src/features/tour/
├── index.ts                      Barrel: TourRunner, useTour, registerTour, types
├── tour.types.ts                 ~80 LOC. Tour, TourStep, Placement, TourEvent.
├── components/
│   ├── tour-runner.tsx           ~180 LOC. Mount component, listens to slice,
│   │                             owns lifecycle effects (route, resolve, focus).
│   ├── tour-overlay.tsx          ~140 LOC. Spotlight + click-shield. Uses
│   │                             `box-shadow: 0 0 0 9999px rgba(0,0,0,.55)` on
│   │                             a fixed div sized to the resolved target rect.
│   ├── tour-popover.tsx          ~220 LOC. Tooltip card (Radix Popover wrapper
│   │                             — see unit tour-2). Title, body, step counter,
│   │                             prev/next/skip, focus trap, role="dialog".
│   └── __tests__/
│       ├── tour-runner.test.tsx
│       ├── tour-overlay.test.tsx
│       └── tour-popover.test.tsx
├── hooks/
│   ├── use-tour.ts               ~80 LOC. Public hook: start / stop / skip /
│   │                             advance / previous + selectors.
│   ├── use-target-resolver.ts    ~140 LOC. rAF + MutationObserver retry loop
│   │                             with budget. Returns { rect, element, status }.
│   ├── use-element-position.ts   ~120 LOC. ResizeObserver + scroll/resize
│   │                             listener that re-reads getBoundingClientRect.
│   ├── use-tour-keyboard.ts      ~60 LOC. Esc / →/Enter / ←. window.keydown.
│   ├── use-tour-route.ts         ~80 LOC. react-router-dom's useNavigate. Waits
│   │                             for pathname match before resolving target.
│   └── __tests__/...
├── store/
│   ├── tour-slice.ts             ~150 LOC. RTK slice + persistence thunks.
│   └── __tests__/tour-slice.test.ts
├── config/
│   ├── tours.ts                  ~40 LOC. `export const tours: Tour[] = [...]`.
│   ├── canvas-tour.ts            ~80 LOC. Sample tour definition.
│   ├── palette-tour.ts           ~60 LOC. Sample tour definition.
│   └── __tests__/tours.test.ts
└── utils/
    ├── tour-registry.ts          ~70 LOC. Map<string, Tour>. registerTour(),
    │                             getTour(id), allTours().
    ├── focus-trap.ts             ~80 LOC. Pure focus-cycle helper for popover.
    ├── target-rect.ts            ~50 LOC. clampRectToViewport, expandPad, etc.
    └── __tests__/...
```

Approx total ~1,600 LOC of source + tests, every file inside the LOC band.

### 1.2 Anchors

Existing IDs stay verbatim. New anchors are added with `data-tour-id` —
**deliberately separate from `data-testid`** so test contracts and tour
contracts can evolve independently. Verified anchors today:

| ID | File | Status |
|---|---|---|
| `#ice-canvas-svg` | `features/canvas/components/svg-canvas.tsx:385` | exists |
| `#ice-ai-panel` | `features/ai/components/ai-chat-panel.tsx:126` | exists |
| `#ice-ai-input-message` | same | exists |
| `#ice-ai-btn-send` | same | exists |
| `#ice-palette-panel` | `features/palette/components/resource-palette.tsx:142` | exists |
| `#ice-palette-search-input` | `features/palette/sections/blocks-section.tsx:74` | exists |
| `#ice-palette-provider-select` | same:79 | exists |
| `#ice-properties-panel` | `features/properties/components/sections/node-properties-section.tsx:149` | exists (also `project-overview.tsx:63`) |
| `#ice-properties-node-name` | `features/properties/components/sections/node-identity-card.tsx:42` | exists |
| `#ice-folder-btn-create-project` | `packages/web/src/pages/folder-view.tsx:96` | exists |

Anchors that need adding (separate units, all `data-tour-id="..."` since
none of these surfaces have established id patterns yet):

| `data-tour-id` | File | Unit |
|---|---|---|
| `app-settings-tab-ai`, `app-settings-btn-save` | `packages/web/src/pages/app-settings.tsx` | tour-9 |
| `wizard-btn-next`, `wizard-btn-back`, `wizard-step-N` | `features/wizard/components/project-wizard.tsx` | tour-9 |
| `cost-panel-root`, `cost-panel-tier-slider` | `features/cost/components/cost-panel.tsx` | tour-9 |
| `sidebar-strip-cost`, `sidebar-strip-ai`, `sidebar-strip-properties`, `sidebar-strip-validation` | right-sidebar strip toggles | tour-9 |

## 2. Public API surface

### 2.1 Mount point

`<TourRunner />` mounts **once**, in `packages/web/src/app/app.tsx`,
inside `BrowserRouter` and `LocaleProvider` (so it can use `useNavigate`
and `useTranslation`) but outside any `<Routes>` element so it survives
route changes:

```tsx
<BrowserRouter>
  <TourRunner />          {/* NEW */}
  <Routes>...</Routes>
</BrowserRouter>
```

It is a sibling of `<Routes>`, not a wrapper, so the popover and overlay
portal at `document.body` regardless of which route is active.

### 2.2 `useTour()` hook

```ts
interface UseTour {
  activeTourId: string | null;
  stepIdx: number;            // 0-based
  totalSteps: number;
  isFirst: boolean;
  isLast: boolean;
  isCompleted: (id: string) => boolean;
  start: (tourId: string) => void;
  advance: () => void;        // → stepIdx + 1, finishes if last
  previous: () => void;       // → stepIdx − 1, no-op at 0
  skip: () => void;            // → mark completed, close
  stop: () => void;            // → close without marking completed
}

export function useTour(): UseTour;
```

Internally a thin selector + dispatcher around `tour-slice`.

### 2.3 Type shapes

```ts
// tour.types.ts

export type Placement = 'top' | 'bottom' | 'left' | 'right' | 'auto';

export interface TourStepActions {
  /** Override default "Next" label. i18n key, runs through t(). */
  nextLabel?: string;
  /** Override default "Back" label. */
  backLabel?: string;
  /** Hide the skip button on this step (e.g. terminal step). */
  hideSkip?: boolean;
}

export interface TourStep {
  id: string;                                           // unique within tour
  /** CSS selector (e.g. '#ice-canvas-svg', '[data-tour-id="..."]') OR
   *  a thunk returning the live element. Selector preferred — JSON-friendly. */
  target: string | (() => Element | null);
  /** i18n key, evaluated through t(). */
  title: string;
  /** Either an i18n key or a ReactNode. */
  body: string | React.ReactNode;
  placement?: Placement;                                // default 'auto'
  /** Optional padding around the target rect for the spotlight. Default 8. */
  pad?: number;
  /** Route to navigate to before resolving target. Skipped if pathname
   *  already starts with this. Compared as-is (no params). */
  route?: string;
  /** Runs after navigation completed AND target resolved AND placed. */
  onEnter?: (ctx: TourLifecycleCtx) => void | Promise<void>;
  /** Runs before stepIdx changes (or close). */
  onExit?: (ctx: TourLifecycleCtx) => void | Promise<void>;
  /** If returns false the step is skipped (auto-advance). */
  condition?: (ctx: TourLifecycleCtx) => boolean;
  actions?: TourStepActions;
}

export interface Tour {
  id: string;                  // 'canvas-tour', 'palette-tour', ...
  /** i18n key for tour-level title (used in registry UI / restart menu). */
  title: string;
  steps: TourStep[];
  /** Auto-fire predicate. If returns true the tour starts on app boot. */
  autoStart?: (s: AutoStartCtx) => boolean;
  /** When true, the engine will NOT mark this tour completed on skip
   *  (rare, e.g. tutorial-mode tours that the user re-runs intentionally). */
  manualOnly?: boolean;
}

export interface TourLifecycleCtx {
  tourId: string;
  stepId: string;
  stepIdx: number;
  dispatch: AppDispatch;
  navigate: NavigateFunction;
}

export interface AutoStartCtx {
  user: User | null;            // from account-slice
  completedTours: string[];     // from tour-slice + persistence
  pathname: string;
}
```

### 2.4 Registration

Two paths, both supported:

1. **Static config (preferred for in-tree tours).** Each tour exports
   from `config/<name>-tour.ts`. The barrel `config/tours.ts` collects
   them into `export const tours: Tour[]`. `<TourRunner />` calls
   `registerTour(t)` for each at mount.

2. **Dynamic registration (for plugins/integrations later).**
   `registerTour(tour: Tour)` and `unregisterTour(id: string)` are
   exported from the barrel. The registry is a module-scoped
   `Map<string, Tour>`.

Tour ids and step ids are validated at register time — duplicates throw
in dev (`process.env.NODE_ENV !== 'production'`), warn-only in prod.

## 3. Engine behavior

### 3.1 Spotlight technique

A single fixed `<div>` portal'd to `document.body`, sized and positioned
to the resolved target rect (plus `pad` from the step). CSS:

```css
position: fixed;
border-radius: 8px;
pointer-events: none;
box-shadow: 0 0 0 9999px rgba(0,0,0,0.55);
transition: top 180ms, left 180ms, width 180ms, height 180ms;
```

Why box-shadow over SVG mask: zero DOM nodes per dim region, animates on
the GPU, and the page underneath stays interactive on the inner rect.
Click-shield: a separate full-viewport invisible div listens for clicks
outside the rect → `dispatch(skipTour())`.

### 3.2 Element resolution

`use-target-resolver.ts` resolves a `target` (selector or thunk) with a
retry budget. Required because targets in lazy-mounted panels (AI chat,
properties) may not be in the DOM when the step activates.

```
budget = 30 frames (~500 ms at 60Hz)
```

Implementation: rAF loop. Every frame, run `document.querySelector(...)`
or thunk, if found return rect; if budget exhausted return
`{ status: 'missing' }`. A `MutationObserver` on `document.body` is
attached **only after** the first 6 frames fail, to avoid the hot-path
cost on common cases. Status flows back through Redux —
`'resolving' | 'placed' | 'missing'`.

If `'missing'` after budget: log dev warning, dispatch `skipStep()` so
the tour continues (configurable per step via `step.required`, default
false).

### 3.3 Resize / scroll handling

`use-element-position.ts` wires the placed-target rect to live updates:

- `ResizeObserver(target)` and `ResizeObserver(document.documentElement)`
  → re-read rect.
- `window.addEventListener('scroll', ..., { capture: true, passive: true })`
  to catch scrolls inside any scroll container.
- `IntersectionObserver(target)` with `threshold: [0, 0.5, 1]`. When
  `intersectionRatio < 0.5`, the engine calls
  `target.scrollIntoView({ behavior: 'smooth', block: 'center' })` once,
  **trailing-edge debounced** at 250 ms — each under-0.5 event resets
  the pending timer, and the call fires once 250ms after the LAST
  under-0.5 event in the window.

All listeners are torn down on step exit. Cleanup is the most common
focus-trap leak risk — pin a test for "previous step's listeners are
removed on advance" (see test plan in tour-4).

### 3.4 Route navigation

The router is `react-router-dom@6.30.3` (`BrowserRouter`, `useNavigate`,
`useLocation`). `use-tour-route.ts`:

```
on step enter, if step.route is set and !pathname.startsWith(step.route):
  navigate(step.route)
  await pathname change (subscribe to useLocation, resolve when new
                          pathname startsWith step.route)
then resolve target
```

The "wait for pathname change" piece is handled inside the `TourRunner`
effect, gated by a state machine field `phase: 'navigating' | 'resolving'
| 'placed'`. This is necessary because navigation is async — calling
`navigate()` does not synchronously change `useLocation()`.

### 3.5 Step lifecycle

```
advance() / start() →
  dispatch(setStep(idx))
  phase = 'navigating'
  if step.route: navigate(step.route); wait for pathname match
  phase = 'resolving'
  resolve target (rAF + retry, see 3.2)
  if missing: skipStep() (or surface error if step.required)
  phase = 'placed'
  await step.onEnter?.(ctx)        ← runs ONCE; errors are caught + logged
  attach overlay + popover
  attach keyboard + position listeners

previous() / advance(next) →
  await step.onExit?.(ctx)
  detach listeners
  detach overlay + popover
  proceed to new step
```

`onEnter` and `onExit` await both Promise and void returns. Errors
caught and logged via `console.warn` — they never abort the tour.

### 3.6 Keyboard

`use-tour-keyboard.ts` registers `window.keydown` (capture-phase) only
while a tour is active:

| Key | Effect |
|---|---|
| `Escape` | `dispatch(stopTour())` (does NOT mark completed; user can resume) |
| `ArrowRight` or `Enter` | `advance()` |
| `ArrowLeft` | `previous()` |
| `Tab` / `Shift+Tab` | handled by focus trap (see 3.7) |

`Enter` is suppressed when the active element is a form input — the
user is typing inside the highlighted UI (palette search, property
field), not advancing the tour. Detected via
`document.activeElement?.tagName in {INPUT, TEXTAREA}`.

### 3.7 Accessibility

- Popover root: `role="dialog"`, `aria-modal="false"` (the rest of the
  page is intentionally interactive — this is a coachmark, not a modal),
  `aria-labelledby="tour-popover-title"`.
- Focus enters the popover when a step opens; on close, focus restores
  to whatever element was focused before `start()`.
- `utils/focus-trap.ts` keeps `Tab` cycling inside the popover when the
  user is interacting with popover-internal controls. Tab-out from the
  popover lets focus reach the spotlit element (this is intentional —
  tutorials sometimes want users to type into the highlighted field).
- Reduced motion: `useReducedMotion()` already exists at
  `packages/ui/src/shared/hooks/use-reduced-motion.ts`. When `true`, the
  spotlight transitions are disabled and `scrollIntoView` uses
  `behavior: 'auto'`.
- `aria-live="polite"` on the step counter so screen readers announce
  step changes.

## 4. State

### 4.1 New slice: `tour-slice.ts`

Lives at `packages/ui/src/features/tour/store/tour-slice.ts` (NOT under
`packages/ui/src/store/slices/` — feature-local slice, follows the
pattern set by deploy-slice's reducers/ subfolder being feature-local
file-organization). Registered in the root store's `configureStore` call
exactly once.

```ts
interface TourState {
  activeTourId: string | null;
  stepIdx: number;                    // 0-based
  phase: 'idle' | 'navigating' | 'resolving' | 'placed' | 'missing';
  completedTours: string[];           // ids in completion order
  /** Per-tour skipped-step counts, for telemetry. Optional. */
  perTour: Record<string, { stepsAdvanced: number; skipped: boolean }>;
  /** Hydrated from User.completedTours on first profile fetch. */
  hydrated: boolean;
}
```

Reducers: `startTour`, `setStep`, `setPhase`, `markCompleted`,
`stopTour`, `hydrateFromUser`, `resetTour`.

Action logger middleware prefix: add `'tour/'` to
`LOGGED_ACTION_PREFIXES` in `packages/ui/src/store/index.ts`.

### 4.2 Persistence — three-tier

1. **localStorage fast path.** Key `ice-completed-tours` (JSON array).
   Read synchronously in slice initialState computation so the engine
   knows to suppress auto-fired tours before the profile API resolves.
2. **API authoritative.** New `User.completed_tours` column on the
   Prisma model — `String?` storing a JSON-encoded array (sqlite-friendly,
   no array type). Hydrated via `fetchProfile` (account-slice already
   fetches; extend its select). On `markCompleted`, slice dispatches a
   thunk that PUTs `/api/onboarding/completed-tours/:id` (new route).
3. **Slice merges both** in `hydrateFromUser`: union of localStorage +
   server, server wins on conflict, write merged set back to localStorage.

The Prisma migration is its own unit (tour-7) — separate from the slice
(tour-6) because it touches `services/iam` and the database. The route
addition lives in `services/iam/src/routes/onboarding.ts` (extends the
existing onboarding router rather than introducing a new one — same
auth middleware, same shape).

### 4.3 Auto-fire trigger logic

Default policy:

| Tour | Trigger |
|---|---|
| `canvas-tour` | After wizard completes AND first project canvas is open AND `!completedTours.includes('canvas-tour')`. Fires on the next `placed` route — i.e. canvas mounted. |
| `palette-tour` | First time the palette panel is opened AND `canvas-tour` is completed. |
| `ai-tour` | First time `#ice-ai-panel` is opened AND `palette-tour` is completed. |
| `cost-tour` | Manual only (Help menu → "Show me around → Cost") in v1. |

Auto-fire is evaluated by `<TourRunner />` on every `useLocation()`
change AND on `account.user` mutation. The logic is centralized in
`use-tour-autostart.ts` (called from `TourRunner`).

Recommendation, **flag this for orchestrator confirmation**: in v1
auto-fire is OFF by default and tours are launched only via:

1. A `tour=<id>` URL param on first project (e.g. wizard's "Finish &
   tour me around" button appends `?tour=canvas-tour` to the redirect).
2. The Help menu (existing AppBar slot).

This keeps v1 from accidentally surprising users who already know the
app. v2 can flip to predicate-based auto-fire once the engine has run in
production for a release. See unit tour-13.

## 5. Configuration model

### 5.1 Sample tour: `canvas-tour.ts`

```ts
import type { Tour } from '../tour.types';

export const canvasTour: Tour = {
  id: 'canvas-tour',
  title: 'tour.canvas.title',          // "Welcome to your canvas"
  steps: [
    {
      id: 'canvas-overview',
      target: '#ice-canvas-svg',
      title: 'tour.canvas.overview.title',
      body: 'tour.canvas.overview.body',
      placement: 'auto',
      pad: 16,
    },
    {
      id: 'palette-intro',
      target: '#ice-palette-panel',
      title: 'tour.canvas.palette.title',
      body: 'tour.canvas.palette.body',
      placement: 'right',
    },
    {
      id: 'palette-search',
      target: '#ice-palette-search-input',
      title: 'tour.canvas.search.title',
      body: 'tour.canvas.search.body',
      placement: 'right',
      pad: 4,
    },
    {
      id: 'properties-intro',
      target: '#ice-properties-panel',
      title: 'tour.canvas.properties.title',
      body: 'tour.canvas.properties.body',
      placement: 'left',
    },
    {
      id: 'ai-intro',
      target: '#ice-ai-panel',
      title: 'tour.canvas.ai.title',
      body: 'tour.canvas.ai.body',
      placement: 'left',
      // Open the AI panel on enter so it's actually visible.
      onEnter: ({ dispatch }) => {
        dispatch({ type: 'ui/openSidebarPanel', payload: 'ai' });
      },
      actions: { hideSkip: true, nextLabel: 'tour.actions.finish' },
    },
  ],
};
```

### 5.2 i18n keys

Add a new top-level `tour` namespace in
`packages/ui/src/i18n/en.json` and the parallel zh.json. Skeleton:

```json
"tour": {
  "actions": {
    "next": "Next",
    "back": "Back",
    "skip": "Skip tour",
    "finish": "Got it"
  },
  "canvas": {
    "title": "Welcome to your canvas",
    "overview": { "title": "...", "body": "..." },
    "palette": { "title": "...", "body": "..." },
    "search":   { "title": "...", "body": "..." },
    "properties": { "title": "...", "body": "..." },
    "ai":       { "title": "...", "body": "..." }
  }
}
```

`TranslationKey` is autogenerated via `NestedKeyOf<TranslationData>` —
new keys are typed automatically once the json file is updated. Tests
in `tour-popover.test.tsx` mock `useTranslation` with a passthrough
identity (already a documented pattern; see
`vi-mock-paths-resolve-relative-to-test-file-not-source-file` learning
for the relative-path gotcha — popover tests will need
`'../../../../i18n'` from `__tests__/tour-popover.test.tsx`).

## 6. Per-unit plan

Order is leaves-first so the engine runs end-to-end as early as
possible. Implementer can split tour-3 across two days if needed; every
other unit is a single sitting.

---

### tour-1 — Types + barrel skeleton

**Files**
- `packages/ui/src/features/tour/tour.types.ts` (new)
- `packages/ui/src/features/tour/index.ts` (new)
- `packages/ui/src/features/tour/utils/tour-registry.ts` (new)
- `packages/ui/src/features/tour/utils/__tests__/tour-registry.test.ts` (new)

**Contract.** Defines `Tour`, `TourStep`, `Placement`, `TourLifecycleCtx`,
`AutoStartCtx`. Registry is a module-scoped `Map<string, Tour>` with
`registerTour(t)` (throws on duplicate id in dev, warn in prod),
`getTour(id)`, `unregisterTour(id)`, `allTours()`. Barrel re-exports
public surface only — internal hooks are NOT exported.

**Tests (≥10).**
- registerTour adds to map; getTour returns it.
- duplicate registerTour throws in `NODE_ENV !== 'production'`.
- duplicate registerTour warns + overwrites in production.
- unregisterTour removes; subsequent getTour returns undefined.
- allTours returns array snapshot, not the live map (mutation-safe).
- registerTour validates step ids are unique within a tour, throws if not.
- registerTour rejects empty steps array.

**Risks.** None — pure module.

**Deps.** None.

---

### tour-2 — Wrapped Popover primitive

**Files**
- `packages/ui/src/shared/components/ui/popover.tsx` (new)
- `packages/ui/src/shared/components/ui/index.ts` (modified — add export)
- `packages/ui/src/shared/components/ui/__tests__/popover.test.tsx` (new)

**Contract.** Wraps `@radix-ui/react-popover` (already in
`packages/ui/package.json`) following the same shape as `dialog.tsx` /
`tooltip.tsx`: `Popover`, `PopoverTrigger`, `PopoverContent`,
`PopoverAnchor`, `PopoverPortal`. Tailwind classes for
`bg-ice-raised`, `border-ice-border`, `text-ice-text-1`, animations
mirroring the tooltip. NOT tour-specific.

**Tests (≥6).** Tree-walker: PopoverContent renders with class string
including expected tokens; Anchor passes `ref` through; PopoverPortal
respects portalled markup (mock createPortal).

**Risks.** None — primitive wrapper.

**Deps.** None. (Pulled out as a standalone unit so other features can
reuse it. The tour engine will use the lower-level Radix primitive
directly via `PopoverAnchor` for arbitrary-element anchoring, but the
wrapped pieces still apply for the popover content shell.)

---

### tour-3 — Target resolver hook

**Files**
- `packages/ui/src/features/tour/hooks/use-target-resolver.ts` (new)
- `packages/ui/src/features/tour/utils/target-rect.ts` (new)
- `packages/ui/src/features/tour/hooks/__tests__/use-target-resolver.test.ts` (new)
- `packages/ui/src/features/tour/utils/__tests__/target-rect.test.ts` (new)

**Contract.** `useTargetResolver(target: string | (() => Element | null), { budget = 30, padding = 0 }) → { status: 'idle' | 'resolving' | 'placed' | 'missing', element: Element | null, rect: DOMRect | null }`.
rAF retry loop with budget. After 6 failed frames, attaches a
`MutationObserver` on `document.body { childList: true, subtree: true }`
which retriggers a single rAF check on each mutation batch (debounced).
On unmount or target change, all timers/observers torn down.

`target-rect.ts` exports `expandRect(rect, pad)`, `clampRectToViewport(rect)`.

**Tests (≥18).**
- selector resolves on frame 0 → status 'placed' with rect.
- thunk resolves on frame 0 → same.
- target absent for 30 frames → 'missing'.
- target absent for 5 frames then appears via Mutation → 'placed'.
- changing the target prop tears down old observer.
- unmount tears down both rAF + MutationObserver.
- expandRect adds pad to all sides; clampRectToViewport clips negatives.
- rect re-read on every successful frame (live drag scenario).

**Risks.**
- rAF + MutationObserver in node-env vitest. Use the
  `stubbing-window-and-keyboardevent-for-node-env-keydown-listener-tests`
  pattern: `vi.stubGlobal('window', { requestAnimationFrame, cancelAnimationFrame, MutationObserver })`.
- MutationObserver constructor needs to be a class with `observe`,
  `disconnect`, `takeRecords` — stub minimally.

**Deps.** None (pure hook + util).

---

### tour-4 — Element-position hook

**Files**
- `packages/ui/src/features/tour/hooks/use-element-position.ts` (new)
- `packages/ui/src/features/tour/hooks/__tests__/use-element-position.test.ts` (new)

**Contract.** `useElementPosition(element: Element | null, { observeViewport = true }) → DOMRect | null`. Returns the live rect, updated via:
- `ResizeObserver(element)` on the target.
- `ResizeObserver(document.documentElement)` on the viewport (when `observeViewport`).
- `window.addEventListener('scroll', _, { capture: true, passive: true })` so scrolls inside any container trigger an update.
- `IntersectionObserver(element, { threshold: [0, 0.5, 1] })` — when ratio drops below 0.5, calls `element.scrollIntoView({ behavior, block: 'center' })`. Debounced 250 ms.

**Tests (≥14).**
- Initial rect on mount.
- ResizeObserver fires → rect updated.
- Scroll listener fires → rect updated.
- IntersectionObserver `< 0.5` ratio → scrollIntoView called once
  (debounced — multiple ratios under 0.5 within 250ms call it once).
- `useReducedMotion() === true` → `behavior: 'auto'`.
- Element changes from non-null to null → all listeners torn down.
- Unmount tears down every listener.

**Risks.** Listener leak on element change is the highest-risk bug.
Pin "swap target then unmount → 0 listeners" explicitly.

**Deps.** None.

---

### tour-5 — Focus trap util

**Files**
- `packages/ui/src/features/tour/utils/focus-trap.ts` (new)
- `packages/ui/src/features/tour/utils/__tests__/focus-trap.test.ts` (new)

**Contract.** `installFocusTrap(container: HTMLElement, { initialFocus?: HTMLElement, returnFocus?: HTMLElement }) → () => void`.
Listens for keydown Tab on the container, queries focusable selectors
(`a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])` plus filter out `aria-hidden="true"` and `hidden`),
cycles focus inside. On install, focuses `initialFocus` or first focusable.
On uninstall, restores focus to `returnFocus`.

Important: the trap is **soft** — it does NOT block focus from leaving
when the user clicks outside. Only `Tab`/`Shift+Tab` cycle. This lets
users intentionally tab into the spotlit page element.

**Tests (≥8).**
- Tab on last focusable → wraps to first.
- Shift+Tab on first → wraps to last.
- Initial focus respects `initialFocus`.
- Uninstall restores focus to `returnFocus`.
- Empty container (no focusables) → no-op, no throw.
- Reinstall on changed container is safe.

**Risks.** Stash event listeners with named handlers so uninstall is
exact. Don't re-attach on re-render; the popover unit owns the lifecycle.

**Deps.** None.

---

### tour-6 — Tour slice

**Files**
- `packages/ui/src/features/tour/store/tour-slice.ts` (new)
- `packages/ui/src/features/tour/store/__tests__/tour-slice.test.ts` (new)
- `packages/ui/src/store/index.ts` (modified — register reducer +
  add `'tour/'` to `LOGGED_ACTION_PREFIXES`)
- `packages/ui/src/features/tour/hooks/use-tour.ts` (new)
- `packages/ui/src/features/tour/hooks/__tests__/use-tour.test.ts` (new)

**Contract.** Slice as defined in §4.1. `start(tourId)` resets stepIdx
to 0 and validates the tour is registered. `advance()` increments
stepIdx; if it equals `totalSteps` the slice transitions to `markCompleted`
+ closes. `stopTour()` closes without marking completed.
`hydrateFromUser({ completedTours: string[] })` merges with localStorage.

`use-tour.ts` is the public consumer hook — selectors + dispatchers,
typed. The async persistence thunk (`persistCompletedTour`) lives in
the slice file.

**Tests (≥30).**
- start sets activeTourId, stepIdx=0, phase=navigating.
- start with unregistered tour throws (or no-ops with warn — implementer pick).
- advance: not-last step → stepIdx + 1, phase=navigating.
- advance: last step → markCompleted dispatched, slice closes.
- previous: stepIdx > 0 → stepIdx − 1.
- previous: stepIdx === 0 → no-op.
- skip: closes + adds to completedTours.
- stop: closes, completedTours unchanged.
- hydrateFromUser merges arrays + dedupes; later set wins.
- localStorage fast-path read in initialState (mock localStorage).
- localStorage write on markCompleted.
- isCompleted selector + totalSteps selector.

**Risks.**
- RTK 2 unknown-action-payload double-cast in tests
  (`redux-toolkit-unknown-action-payload-needs-double-cast-via-unknown`).
- localStorage writes must be guarded by `try { ... } catch` (matches
  pattern in `onboarding-checklist.tsx:32-38`).

**Deps.** tour-1.

---

### tour-7 — User.completed_tours migration + API route

**Files**
- `packages/db/prisma/schema.prisma` (modified — add `completed_tours String?` to User)
- `packages/db/prisma/migrations/<ts>_add_user_completed_tours/migration.sql` (new)
- `services/iam/src/routes/onboarding.ts` (modified — add PUT `/api/onboarding/completed-tours/:id`)
- `services/iam/src/routes/__tests__/onboarding.test.ts` (modified — extend)

**Contract.** New User column `completed_tours` (sqlite-friendly,
`String?` storing a JSON-encoded `string[]`). Default empty. Existing
`/status` route extends its `select` to include `completed_tours`. New
`PUT /api/onboarding/completed-tours/:id` appends an id (idempotent —
no-op if already present), returns the updated array. `requireAuth`
applies, same as the rest of the router.

**Tests (≥6).**
- /status returns `completed_tours: []` for fresh user.
- PUT /completed-tours/:id appends; second PUT same id is idempotent.
- Returns 401 when unauthenticated.
- Concurrency: parallel PUTs of two ids both land (unique merge in
  service code; SQLite update-if doesn't lock the read).

**Risks.**
- SQLite has no array column, so we serialize JSON in/out at the route
  layer. Document this as a learning if it bites.
- Migration must NOT default to a non-empty value — fresh installs
  should see no completed tours.

**Deps.** None functionally — but landing this BEFORE tour-6 means the
slice can read the real shape. If sequencing is awkward, land tour-6
first with a stub thunk, then wire the real PUT in tour-7.

---

### tour-8 — Tour overlay component

**Files**
- `packages/ui/src/features/tour/components/tour-overlay.tsx` (new)
- `packages/ui/src/features/tour/components/__tests__/tour-overlay.test.tsx` (new)

**Contract.** `<TourOverlay rect={DOMRect | null} pad={number} onSkip={() => void} />`.
Renders a fixed div spotlight (box-shadow technique) AND a click-shield
sibling that catches outside-clicks → `onSkip()`. Pure presentational —
takes rect as a prop (the runner owns rect derivation).

**Tests (≥10).**
- Renders nothing when rect is null.
- Spotlight div top/left/width/height match rect + pad.
- Click on shield → onSkip.
- Click on spotlight inner → does NOT call onSkip (pointer-events: none
  on shield within rect bounds).
- `useReducedMotion()` true → no transition class.

**Risks.** Box-shadow technique fails if the target is in a
`position: fixed` ancestor whose own `transform` creates a stacking
context — shadow renders relative to that, not the viewport. In v1 the
plan accepts this limitation (anchors are app-level: canvas, panels).
Document as v1-out-of-scope (§7).

**Deps.** tour-1.

---

### tour-9 — Add `data-tour-id` anchors

**Files (all modified, no new files)**
- `packages/web/src/pages/app-settings.tsx` — add `data-tour-id="app-settings-tab-ai"` to AI tab trigger and `data-tour-id="app-settings-btn-save"` to save button.
- `packages/ui/src/features/wizard/components/project-wizard.tsx` — add `data-tour-id="wizard-btn-next"`, `wizard-btn-back`, `wizard-step-${idx+1}`.
- `packages/ui/src/features/cost/components/cost-panel.tsx` — `data-tour-id="cost-panel-root"` on container, `cost-panel-tier-slider` on the slider input.
- The right-sidebar strip toggle file (verify path during the unit;
  candidates in `packages/ui/src/shared/components/sidebar-strip.tsx`
  per the existing primitives) — `data-tour-id="sidebar-strip-cost"`,
  `sidebar-strip-ai`, `sidebar-strip-properties`, `sidebar-strip-validation`.

**Contract.** Pure attribute additions. Zero behavior change. NOT
substituting for `data-testid` — both attributes coexist where
applicable. `data-tour-id` selectors used in tour configs only.

**Tests.** Each touched file's existing test file gets one extra
assertion: "expected `data-tour-id="..."` attribute present on
\<element\>". No new test files. Touched files (5) — 5 extra assertions.

**Risks.** `feedback_validated_blocks` doesn't apply (no behavior
change to GitHub Repo / Custom Domain / Static Site / Private Network
blocks). Per `feedback_no_canvas_inputs`, no input goes onto the
canvas — none of these anchors live on canvas blocks anyway.

**Deps.** None. Can land in parallel with the engine work, but in
practice land it just before tour-12 so the configured tours have real
selectors to point at.

---

### tour-10 — Tour popover component

**Files**
- `packages/ui/src/features/tour/components/tour-popover.tsx` (new)
- `packages/ui/src/features/tour/components/__tests__/tour-popover.test.tsx` (new)

**Contract.** `<TourPopover step={TourStep} stepIdx={number} totalSteps={number} placement={Placement} anchor={Element} onAdvance onPrevious onSkip onClose />`.
Renders the Radix Popover (from tour-2) anchored to `anchor` via
`PopoverAnchor`. Title from `t(step.title)`, body from `t(step.body)`
or `step.body` directly when ReactNode. Footer: step counter
("3 of 5"), Back, Skip, Next. Focus trap installed on mount via tour-5
util. `role="dialog"`, `aria-labelledby`, `aria-describedby`.

`placement: 'auto'` → compute best side from anchor rect vs. viewport.
Use a tiny utility (~25 LOC) inside the component file or `utils/auto-placement.ts`
if it grows: prefer the side with most space, fall back top → bottom →
right → left.

**Tests (≥18).**
- Renders title + body + counter + buttons.
- isFirst → no Back button.
- step.actions.hideSkip → no Skip.
- step.actions.nextLabel/backLabel respected.
- isLast → Next button label is `t('tour.actions.finish')` unless
  overridden.
- onAdvance/onPrevious/onSkip wired to clicks.
- ReactNode body bypasses t().
- Focus moves to the popover on mount.
- Tab cycles inside; Shift+Tab from first → last.
- Auto-placement picks `right` when target on left edge; etc.
- Reduced-motion → no transition class.

**Risks.**
- Radix Popover focus-management vs. our focus trap: configure
  `<PopoverContent onOpenAutoFocus>` and `onCloseAutoFocus` to no-op
  so our trap owns focus. Otherwise Radix steals first focus.
- Test mock-path depth: `__tests__/tour-popover.test.tsx` →
  `vi.mock('../../../../i18n', ...)` (one extra `../` per
  `vi-mock-paths-resolve-relative-to-test-file-not-source-file`).

**Deps.** tour-1, tour-2, tour-5.

---

### tour-11 — Keyboard + route hooks

**Files**
- `packages/ui/src/features/tour/hooks/use-tour-keyboard.ts` (new)
- `packages/ui/src/features/tour/hooks/use-tour-route.ts` (new)
- `packages/ui/src/features/tour/hooks/__tests__/use-tour-keyboard.test.ts` (new)
- `packages/ui/src/features/tour/hooks/__tests__/use-tour-route.test.ts` (new)

**Contract.**
`use-tour-keyboard(active: boolean, { onAdvance, onPrevious, onSkip })`.
Attaches `window.addEventListener('keydown', ...)` capture-phase only
when `active`. Detaches on `active === false`. Suppresses
ArrowRight/Enter when `document.activeElement` is INPUT/TEXTAREA.

`use-tour-route(targetRoute: string | undefined)` → `{ phase: 'idle' | 'navigating' | 'arrived', navigate(): void }`. Watches `useLocation()` and resolves `arrived` when pathname matches.

**Tests (≥16).**
- ArrowRight → onAdvance.
- ArrowRight while focused on INPUT → no advance.
- ArrowLeft → onPrevious.
- Enter → onAdvance; Enter on INPUT → no advance.
- Escape → onSkip.
- listener detached when `active=false`.
- targetRoute undefined → phase='arrived' immediately.
- targetRoute set + pathname mismatch → phase='navigating'.
- pathname changes to match → phase='arrived'.

**Risks.** Per
`stubbing-window-and-keyboardevent-for-node-env-keydown-listener-tests`,
stub `window.addEventListener` etc. for node-env. KeyboardEvent stub
class needs `key` field at minimum.

**Deps.** None for keyboard hook; `useLocation`/`useNavigate` from
react-router-dom for route hook (mock via `vi.mock`).

---

### tour-12 — TourRunner + tour configs

**Files**
- `packages/ui/src/features/tour/components/tour-runner.tsx` (new)
- `packages/ui/src/features/tour/components/__tests__/tour-runner.test.tsx` (new)
- `packages/ui/src/features/tour/config/tours.ts` (new)
- `packages/ui/src/features/tour/config/canvas-tour.ts` (new)
- `packages/ui/src/features/tour/config/palette-tour.ts` (new)
- `packages/ui/src/features/tour/config/__tests__/tours.test.ts` (new)
- `packages/ui/src/i18n/en.json` (modified — add `tour` namespace)
- `packages/ui/src/i18n/zh.json` (modified — same keys, English placeholder copy is acceptable; translation pass is a separate task)
- `packages/web/src/app/app.tsx` (modified — mount `<TourRunner />` inside `<BrowserRouter>`)

**Contract.** Top-level coordinator:
- On mount, calls `registerTour(t)` for each tour in `tours.ts`.
- Subscribes to `tour-slice`. When `activeTourId` flips on:
  - read step, dispatch `setPhase('navigating')`.
  - if step.route, navigate; await pathname match.
  - dispatch `setPhase('resolving')`, run useTargetResolver.
  - on resolve, dispatch `setPhase('placed')`, run `step.onEnter`.
  - render `<TourOverlay>` + `<TourPopover>` portals, wire keyboard.
- On step change, runs `step.onExit`, tears down listeners, repeats.
- On stop/skip/complete, restores focus, removes overlay, clears state.

This file is the runner + the controller — no Redux logic in the
overlay/popover children. Keep `tour-runner.tsx` ≤ 240 LOC; if it grows,
extract a `use-tour-runner.ts` hook.

**Tests (≥22).**
- registerTour called for each config on mount.
- start('canvas-tour') → phase progresses idle → navigating → resolving → placed.
- step.route triggers navigate.
- step.onEnter awaited before listeners attach.
- step.onExit awaited before next step.
- skip/stop/Escape → focus restored.
- Multiple tours can coexist in registry; only one active at a time.
- Resize/scroll on placed step → popover repositions (asserted via
  rect prop changes on TourPopover mock).

**Risks.**
- Focus restoration: stash `document.activeElement` at `start`; restore
  in cleanup. `document.activeElement` may be null in tests — guard.
- React StrictMode double-effect: ensure registerTour is idempotent
  (already required by tour-1) — duplicate-register in dev is the test
  case.

**Deps.** tour-1, tour-3, tour-4, tour-5, tour-6, tour-8, tour-10, tour-11.

---

### tour-13 — Auto-fire + Help-menu launcher

**Files**
- `packages/ui/src/features/tour/hooks/use-tour-autostart.ts` (new)
- `packages/ui/src/features/tour/hooks/__tests__/use-tour-autostart.test.ts` (new)
- `packages/ui/src/shared/components/app-bar.tsx` (modified — Help menu
  gets a "Show me around" submenu with one entry per registered tour)
- `packages/ui/src/shared/components/__tests__/app-bar.test.tsx` (modified)

**Contract.** v1 default policy:
- `use-tour-autostart` reads `?tour=<id>` from `useLocation().search`.
  If present AND tour is registered AND not in `completedTours`, call
  `start(id)` once, then strip the param via `navigate(pathname, { replace: true })`.
- All other tours are launched via the Help menu only.

The hook lives in TourRunner. The Help-menu addition wires
`useTour().start(id)` per entry.

**Tests (≥10).**
- ?tour=canvas-tour → start dispatched, query param stripped.
- ?tour=unknown → ignored (warn in dev).
- Already in completedTours → ignored.
- Help-menu click on tour entry → start dispatched.

**Risks.** Tour `?tour=` param interferes with deep-linking — strip on
fire. Help-menu UI requires a small decision on placement; defer to the
existing AppBar conventions (the Help item already has a subtree).

**Deps.** tour-12.

---

### tour-14 — Replace `OnboardingChecklist` with tour entry points

**Files**
- `packages/ui/src/features/onboarding/components/onboarding-checklist.tsx` (modified)
- `packages/ui/src/features/onboarding/components/__tests__/onboarding-checklist.test.tsx` (modified)
- `packages/ui/src/features/onboarding/components/onboarding-page.tsx` (modified — Finish button gets `?tour=canvas-tour` redirect)

**Contract.**
- The "create-and-start" finish on `onboarding-page.tsx` already navigates
  to the project URL — append `?tour=canvas-tour` so first-launch users
  see the canvas tour automatically.
- `OnboardingChecklist`'s items get a subtle "Show me how" link next to
  each item that fires the corresponding tour. Existing checklist
  behavior unchanged otherwise.

**Tests.** Extend existing test files; don't add new ones. ≥4 new
assertions.

**Risks.** Don't break the existing wizard flow. Per the brief, the
wizard stays intact — this unit is wiring only.

**Deps.** tour-12, tour-13.

---

## 7. Out of scope for v1

- **Branching tours.** All tours are linear sequences. Conditional
  branches based on user choices are v2.
- **Embedded forms inside tour steps.** A step shows copy + buttons.
  Forms live in the surfaces being taught, not the tour popover.
- **Voiceover / video / animated transitions inside the popover.**
  Static copy + arrows only.
- **Cross-edition tours.** Cloud / multi-tenant editions can re-use
  the engine but ship their own configs; the engine itself is
  edition-agnostic.
- **Tour authoring UI.** Tours live in code, not in the database.
- **Progress sync across devices in real time.** `completed_tours`
  persists per user but doesn't push — refresh required to see
  another device's completions.
- **Targets inside transformed ancestors.** Box-shadow spotlight
  doesn't render correctly when an ancestor has `transform: ...` and
  creates a new stacking context. Documented limitation; targets
  defined today are all top-level.
- **Telemetry pipe.** `perTour.stepsAdvanced` is captured in slice
  state for future telemetry but no analytics emit happens in v1.

## 8. Risks / open questions for orchestrator

1. **Auto-fire policy.** §4.3 recommends OFF by default in v1
   (manual + `?tour=...` param only). Confirm — alternate is to enable
   auto-fire after wizard completion for the canvas tour.

2. **Slice location.** The blueprint proposes `features/tour/store/tour-slice.ts`
   (feature-local). The repo convention to date is
   `packages/ui/src/store/slices/<name>-slice.ts` (centralized). Either
   works. Centralized is more consistent; feature-local keeps the tour
   feature self-contained for plugin-style extraction. Recommend
   feature-local. Confirm before tour-6 lands.

3. **DB migration shape.** `User.completed_tours` is JSON-string in
   sqlite. Alternative: a separate `UserTourCompletion` table with
   `(user_id, tour_id, completed_at)`. Stronger query story, more code.
   Recommend JSON-string for v1 simplicity. Confirm before tour-7.

4. **Help-menu placement.** Tour-13 adds a "Show me around" submenu to
   the existing AppBar Help entry. Need to confirm where in the existing
   menu structure it lands (or a new top-level entry).

5. **Reduced-motion default.** v1 honors `useReducedMotion()` (the hook
   already exists). Confirm spotlight transitions and `scrollIntoView`
   both fall back to instant — that is the plan.

6. **i18n placeholder copy for zh.** Plan adds keys to en.json; zh.json
   gets the same keys with English placeholder copy until a translation
   pass. Acceptable per repo's existing zh.json style? (skim of the file
   suggests yes.) Confirm.

7. **`step.required` field.** §3.2 mentions `required` on `TourStep`
   for "fail tour if target missing" semantics. The type shape in §2.3
   doesn't list it — leave OFF for v1, default to "skip-on-missing" so
   tours never get stuck. Add field if/when a tour needs it.

## 9. Sequencing summary

```
tour-1  types + registry
tour-2  Popover primitive            (parallel with tour-1)
tour-3  target resolver
tour-4  element position              (parallel with tour-3)
tour-5  focus trap
tour-6  tour slice + useTour          (depends on tour-1)
tour-7  Prisma migration + API route  (parallel with tour-6)
tour-8  TourOverlay                   (depends on tour-1)
tour-9  data-tour-id anchors          (any time)
tour-10 TourPopover                   (depends on tour-1, tour-2, tour-5)
tour-11 keyboard + route hooks
tour-12 TourRunner + configs + en.json (depends on 1,3,4,5,6,8,10,11)
tour-13 auto-fire + Help menu         (depends on tour-12)
tour-14 wire onboarding entry points  (depends on tour-12, tour-13)
```

Earliest end-to-end working engine: after tour-12 (canvas-tour
launchable via `?tour=canvas-tour`). tour-13 and tour-14 are wiring
units that can be paused without blocking the engine itself.
