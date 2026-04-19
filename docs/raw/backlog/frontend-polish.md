# Frontend Polish Backlog

> User feedback: "Canvas is not silk or stable. Sidebars are hard to resize, show, or hide. Elements feel cluttered/messy and too small. UI feels not clean enough."

**Status: 4/43 done** | 6 epics | Organized by user-perceived symptom

> **Also fixed (AI operations pipeline):** reparentNode now repositions children inside new parent using non-overlapping grid; overlap detection gap tightened from 40px to 8px; auto-organize triggered automatically after structural AI operations (addNode, reparentNode, deleteNode). See `operation-executor.ts`.

---

## Epic 1: Containment & Boundary Enforcement

> Blocks and groups visually stick out of their parent group.

Root cause: the containment system is **reactive** (expand parent after the fact) rather than **preventive** (constrain child to parent bounds). Three structural issues:

### A. No drag constraints against parent bounds

#### BND-1: Child nodes have zero position clamping during drag (P1) -- FIXED

**File:** `packages/ui/src/features/canvas/components/svg-canvas.tsx` (lines 664-814)

`handleNodeMove` accepts any `(newX, newY)` the user drags to. There is no check against parent bounds. Instead, the parent auto-expands afterward to encompass the child. During the expansion calculation (and between drag frames), the child is visually outside the parent.

**Fix:** Before dispatching position updates, clamp `newX`/`newY` to `[parent.x + CONTAINER_PAD, parent.x + parent.width - CONTAINER_PAD - child.width]` (and same for Y with header offset). Allow the parent to expand only when the child is dragged near the edge, not after the child has already left.

#### BND-2: Redux reducers accept any position blindly (P1) -- FIXED

**File:** `packages/ui/src/store/slices/cards-slice.ts` (lines 339-367)

`updateCardNodePositions` sets `node.position.x/y` directly with zero validation. No containment check at the state layer.

**Fix:** Add an optional validation pass in the reducer (or a middleware) that clamps child positions to parent bounds when the node has a `parentId`.

#### BND-3: Snap-to-grid can push nodes outside parent bounds (P2)

**File:** `packages/ui/src/features/canvas/hooks/use-canvas-interactions.ts` (lines 338-354)

Grid snapping (`snapToGrid`) is applied after drag position calculation but before the position is sent to Redux. A node at (105, 205) inside parent bounds could snap to (96, 192) outside bounds. No re-check occurs after snapping.

**Fix:** After `snapToGrid`, re-clamp to parent bounds.

#### BND-4: Multi-select drag of nodes with different parents (P2)

**File:** `packages/ui/src/features/canvas/hooks/use-canvas-interactions.ts` (lines 348-354)

When multi-selecting nodes that belong to different parent groups, each node moves independently with no cross-parent consistency check. Children can escape their respective parents.

**Fix:** During multi-drag, compute per-node clamping against each node's own parent bounds independently.

### B. No SVG clipping on group bodies

#### BND-5: Groups have no clipPath (P1) -- FIXED

**File:** `packages/ui/src/features/canvas/components/nodes/svg-group-node.tsx`

Block nodes clip their accent stripe (lines 593-620 use `<clipPath>`), but group body rectangles have zero clipping. Any child positioned outside the group rect is fully visible.

**Fix:** Add a `<clipPath>` matching the group rect dimensions and apply it to the group's children container `<g>`. This provides an immediate visual safety net even before drag clamping is implemented.

```tsx
<clipPath id={`group-clip-${node.id}`}>
  <rect x={x} y={y} width={w} height={h} rx={cornerRadius} />
</clipPath>
<g clipPath={`url(#group-clip-${node.id})`}>
  {/* children rendered here */}
</g>
```

#### BND-6: No overflow protection in SVG render loop (P1) -- FIXED

**File:** `packages/ui/src/features/canvas/components/svg-canvas.tsx` (render loop)

SVG has no equivalent of CSS `overflow: hidden`. Children of a group are rendered at absolute canvas coordinates in the same SVG layer as the group, with no clipping boundary.

**Fix:** This is addressed by BND-5 (clipPath on group `<g>` elements). The render loop should wrap children inside their parent's clipped group.

### C. Parent expansion is reactive, not preventive

#### BND-7: Auto-expand only grows, never constrains (P2)

**File:** `packages/ui/src/features/canvas/components/svg-canvas.tsx` (lines 707-763)

The overflow detection algorithm checks each edge independently and shifts/grows the parent. It never prevents the child from going outside — it chases the child. This causes a visual lag where the child leads and the parent catches up.

**Fix:** Invert the logic: constrain child first, then expand parent only when child is near the edge (within a "hot zone" threshold, e.g. 20px from boundary).

#### BND-8: Expansion skipped during Shift-drag reparent (P3)

**File:** `packages/ui/src/features/canvas/components/svg-canvas.tsx` (line 692)

When `skipAncestorResize = true` (Shift held for reparenting), the child moves freely without any parent adjustment. The child can land anywhere.

**Fix:** After reparent completes in `handleDragEnd`, run a one-time expansion/fit of the new parent to encompass the child.

#### BND-9: Resize smaller doesn't move children back in (P2)

**File:** `packages/ui/src/features/canvas/components/svg-canvas.tsx` (lines 1002-1030)

`calculateMinimumContainerSize` prevents shrinking below children's bounding box. But if children are already positioned outside the parent (from prior drag operations), resizing doesn't push them back inside.

**Fix:** On resize commit, clamp all child positions to the new parent bounds.

#### BND-10: Unfold reveals children outside parent bounds (P3)

**File:** `packages/ui/src/features/canvas/components/svg-canvas.tsx` (lines 819-996)

When a group is unfolded, children are revealed at their stored absolute positions. These positions may extend beyond the parent's current rect if the parent was resized or moved while folded.

**Fix:** After unfold, run a containment pass that clamps or repositions children to fit within the parent, then expand parent if needed.

#### BND-11: Group dimensions are stored, not computed from children (P2)

**File:** `packages/ui/src/features/canvas/components/nodes/svg-group-node.tsx` (lines 85-86)

Groups use fixed `width`/`height` values from Redux state. They are NOT dynamically computed from the bounding box of their children. New empty groups default to 400x300. If children are added, moved, or resized, the stored dimensions may become stale.

**Fix:** Add a `fitToChildren()` utility that recalculates group dimensions from child bounding box + padding. Call it after bulk operations (template expansion, auto-layout, paste, unfold).

#### BND-12: Child positions are absolute, not relative to parent (P3 — architectural)

**File:** `packages/ui/src/features/canvas/components/svg-canvas.tsx` (lines 226-256)

Both parent and children store absolute canvas coordinates. Moving a parent requires updating all children. This is the architectural root cause of many edge cases — if any child update is missed, it appears to "fly off" the parent.

**Note:** This is a deep architectural choice. Changing to relative coordinates would be a large refactor. The pragmatic fix is robust clamping (BND-1) and clipping (BND-5) rather than changing the coordinate system.

### Test coverage gaps

The project has 124 containment tests across 5 files, but critical gaps exist:

| Gap | What's missing |
|---|---|
| Drag clamping | No tests for position clamping against parent bounds during drag |
| Sibling overlap | No tests for overlap detection between nodes at the same parent level |
| Fold/unfold bounds | No tests that unfold preserves children within parent rect |
| Grid snap + bounds | No tests for snap-to-grid causing boundary violations |
| Circular parents | No tests preventing A -> B -> A parent cycles |
| Multi-select + parents | No tests for multi-drag across different parent groups |

---

## Epic 2: Canvas Smoothness & Performance

> Canvas doesn't feel silk-smooth during pan, zoom, and drag.

#### CVS-1: SvgCompactNode and SvgGroupNode not memoized (P1)

**Files:** `packages/ui/src/features/canvas/components/nodes/svg-compact-node.tsx`, `svg-group-node.tsx`

These two most-rendered components are NOT wrapped in `React.memo()`. Every viewport change (pan, zoom, drag) re-renders every node, even when props haven't changed. `SvgConnectionPath` and `SvgLogNode` are already memoized.

**Fix:** Wrap both in `React.memo()` with shallow prop comparison.

#### CVS-2: No viewport culling — all nodes render to DOM (P1)

**File:** `packages/ui/src/features/canvas/components/svg-canvas.tsx`

All visible nodes are rendered regardless of whether they're in the viewport. At 100+ nodes this causes measurable lag.

**Fix:** Before the render loop, filter `sortedNodes` to only include nodes whose bounding rect intersects the current viewport (accounting for zoom/pan). Estimated performance ceiling: smooth <50 nodes currently, should be smooth at 200+ after culling.

#### CVS-3: No CSS compositing hints on SVG viewport (P2)

**File:** `packages/ui/src/features/canvas/components/svg-canvas.tsx`

The viewport `<g>` transform group has no `will-change` or `contain` hints. The browser can't optimize the compositing layer.

**Fix:** Add `style={{ willChange: 'transform', contain: 'layout' }}` to the viewport `<g>` element.

#### CVS-4: Mouse move not throttled to 60fps (P2)

**File:** `packages/ui/src/features/canvas/hooks/use-canvas-interactions.ts`

Keyboard panning uses `requestAnimationFrame` for smooth 60fps updates, but mouse drag does not — mouse move events fire at device rate (often 120-240Hz on modern trackpads), causing unnecessary position dispatches.

**Fix:** Gate `handleMouseMove` behind a RAF frame: set a flag on each RAF, only process mouse moves when the flag is set.

#### CVS-5: Zoom-to-fit hardcoded width (P3)

**File:** `packages/ui/src/features/canvas/components/svg-canvas.tsx`

`handleZoomToFit` uses `window.innerWidth * 0.6` instead of the actual SVG container bounding rect. Incorrect in split-view or different window sizes.

**Fix:** Use `containerRef.current.getBoundingClientRect()` for actual dimensions.

#### CVS-6: Copy/paste uses fragile setTimeout (P3)

**File:** `packages/ui/src/features/canvas/components/svg-canvas.tsx`

Clipboard operations use `setTimeout(..., 50ms)` as a timing hack.

**Fix:** Use proper async clipboard API or Redux middleware for sequencing.

#### CVS-7: Edge bundle badges recalculate every render (P3)

**File:** `packages/ui/src/features/canvas/components/svg-canvas.tsx`

Edge bundling deduplication and count badge computation runs on every render pass, not memoized.

**Fix:** Memoize edge bundling output with `useMemo` keyed on edge list.

---

## Epic 3: Panel Resize, Show & Hide

> Sidebars are hard to resize, show, or hide.

#### PNL-1: Two separate resize systems (P1)

**File:** `packages/ui/src/shared/components/main-layout.tsx`

Portrait mode uses `react-resizable-panels` (with `autoSaveId` persistence). Landscape mode uses a custom `DragResizePanel` with manual pointer event handling and separate localStorage keys (`ice-left-w`, `ice-right-w`). Two completely different UX behaviors for the same action.

**Fix:** Unify both orientations to use `react-resizable-panels`. Remove custom DragResizePanel.

#### PNL-2: Panel visibility not persisted (P1)

**File:** `packages/ui/src/store/slices/ui-slice.ts`

`showPalette`, `showProperties`, `showAiChat` are Redux state only — they reset to defaults on page reload. Panel sizes are persisted but open/closed state is not.

**Fix:** Save visibility flags to localStorage on change, restore on mount. Use a single key like `ice-panel-visibility`.

#### PNL-3: Resize handle hit area is 1px (P1)

**File:** `packages/ui/src/shared/components/ui/resizable.tsx`

The ResizableHandle renders a `w-px` (1px) divider. Users must position the cursor with pixel precision to grab it.

**Fix:** Keep the visual line at 1px but expand the interactive hit area to 8-12px using padding or an invisible overlay. Add a visible grip icon (GripVertical) that appears on hover.

#### PNL-4: Landscape resize handle ignores design tokens (P3)

**File:** `packages/ui/src/shared/components/main-layout.tsx`

Custom landscape handle uses `hover:bg-blue-500/30 active:bg-blue-500/50` — hardcoded blue instead of `var(--ice-accent)`.

**Fix:** Replace with `hover:bg-[var(--ice-accent-muted)] active:bg-[var(--ice-accent)]` or use the `ice-accent` Tailwind extension. (Moot if PNL-1 eliminates the custom handle.)

#### PNL-5: No keyboard shortcuts for panel toggles (P2)

**Missing feature.**

No keyboard shortcuts exist to toggle sidebar panels. Only clickable strip icons.

**Fix:** Add shortcuts: `Cmd+Shift+E` (palette/explorer), `Cmd+Shift+P` (properties), `Cmd+Shift+A` (AI chat). Register in the existing keyboard handler.

#### PNL-6: No visual feedback for panel size limits (P3)

**Missing feature.**

When dragging a resize handle, there's no indication of minimum or maximum panel width. The handle just stops moving.

**Fix:** Show a subtle highlight or snap effect when hitting the min/max boundary.

---

## Epic 4: Visual Clutter & Spacing

> Elements feel cluttered and messy.

#### CLT-1: No consistent spacing rhythm (P1)

**Scope:** Codebase-wide (126x gap-2, 72x gap-1.5, 49x gap-1, 42x gap-0.5 — no clear hierarchy)

Padding and gap values are chosen ad-hoc per component. No enforced spacing scale. Vertical rhythm broken with space-y-1, space-y-1.5, space-y-2, space-y-3, space-y-4 mixed across similar components.

**Fix:** Adopt a 4px base unit. Standardize on: `gap-1` (4px) for tight groups, `gap-2` (8px) for default, `gap-3` (12px) for sections, `gap-4` (16px) for major divisions. Audit and update all components.

#### CLT-2: Two parallel color token systems (P1)

**Files:** `packages/web/src/styles/globals.css`, `packages/web/tailwind.config.js`

ICE tokens (`--ice-bg-base`, `--ice-accent`, etc.) coexist with shadcn HSL tokens (`--primary`, `--secondary`, `--destructive`, etc.). Both are defined, both are used, sometimes in the same component.

**Fix:** Pick one system. Recommended: keep `--ice-*` as the source of truth and map shadcn tokens to ICE values (for Radix component compatibility). Remove direct shadcn token usage from custom components.

#### CLT-3: Hardcoded colors bypass theme system (P1)

**Scope:** 50+ component files

Direct Tailwind colors like `bg-red-500/10`, `text-amber-500`, `bg-emerald-600`, `text-blue-500` used instead of `--ice-red`, `--ice-yellow`, `--ice-green`, `--ice-accent`. These don't adapt to dark/light theme transitions.

**Fix:** Replace all hardcoded Tailwind color classes with `--ice-*` token equivalents. Create Tailwind utilities: `text-ice-red`, `bg-ice-green/10`, etc.

#### CLT-4: Border radius fragmentation (P2)

**Files:** `globals.css` (cards use `border-radius: 10px`), button components (use `rounded-md` = 6px)

Inconsistent curvature across component types. Cards, buttons, inputs, badges, and tooltips each use different radii.

**Fix:** Standardize on `rounded-lg` (8px) for containers/cards and `rounded-md` (6px) for interactive elements. Remove hardcoded pixel values from CSS.

#### CLT-5: Shadow/elevation inconsistent (P2)

**File:** `packages/web/src/styles/globals.css`

Components use a mix of `shadow-md`, `shadow-lg`, `shadow-xl`, `shadow-2xl` without a clear elevation hierarchy. Dark mode removes ALL shadows (`.dark .ice-card { box-shadow: none; }`), making everything flat.

**Fix:** Define 3 elevation levels: subtle (cards), medium (dropdowns), strong (modals). Keep shadows in dark mode with reduced opacity (e.g. `rgba(0,0,0,0.3)` instead of `rgba(0,0,0,0.1)`).

#### CLT-6: Arbitrary pixel values scattered (P3)

**Scope:** 30+ files with values like `w-[420px]`, `h-[85vh]`, `max-w-[250px]`, `text-[11px]`, `w-[14px]`

Prevents systematic design changes — each arbitrary value must be found and updated individually.

**Fix:** Replace with Tailwind scale equivalents or define named tokens for recurring values. E.g., `w-[420px]` -> Tailwind `max-w-md` or a custom `--ice-dialog-width` token.

#### CLT-7: No standardized icon sizing (P2)

**Scope:** 172 inline icon styles across codebase

Icon sizes scattered: w-3 (12px), w-3.5 (14px), w-4 (16px), w-5 (20px), w-8 (32px), w-[14px]. No consistent mapping between context and size.

**Fix:** Define icon size tokens: `icon-xs` (12px), `icon-sm` (16px), `icon-md` (20px), `icon-lg` (24px). Create an `<Icon>` wrapper or document size conventions per context (inline text, buttons, toolbar, canvas).

---

## Epic 5: Element Sizing & Readability

> Elements feel too small.

#### SIZ-1: Monospace font for all UI text (P1)

**File:** `packages/web/src/styles/globals.css`

JetBrains Mono (monospace) at 13px/500wt is used for everything — navigation, labels, buttons, panel headers. Monospace fonts are wider per-character and create a dense, technical appearance. Body text readability suffers.

**Fix:** Use a proportional sans-serif (Inter, system-ui) for UI text. Keep JetBrains Mono for code blocks, property values, terminal output, and the canvas node labels where monospace alignment matters.

#### SIZ-2: Mixed text size scales (P1)

**Scope:** Codebase-wide (646+ instances)

Three sizing systems coexist:
- ICE custom: `text-ice-2xs` (9px) through `text-ice-3xl` (28px)
- Tailwind default: `text-xs` (12px), `text-sm` (14px), `text-base` (16px)
- Arbitrary: `text-[11px]`, `text-[9px]`

Same logical element can be found at different sizes in different panels.

**Fix:** Pick one scale. Recommended: keep ICE scale but bump minimums — `text-ice-xs` should be 11px (not 10px), remove `text-ice-2xs` (9px). Remove all arbitrary `text-[Npx]` values.

#### SIZ-3: Minimum text size too small (P2)

**File:** `packages/web/tailwind.config.js`

`text-ice-2xs` is 9px — below comfortable reading threshold for most users. Used in status indicators and metadata.

**Fix:** Set 11px as the absolute minimum text size. Remove or remap `text-ice-2xs`.

#### SIZ-4: Sidebar strip too narrow (P2)

**File:** `packages/ui/src/shared/components/ui/sidebar-strip.tsx`

Collapsed sidebar strip is 28px wide with rotated text labels. Click targets are narrow and the rotated text is hard to read.

**Fix:** Widen to 36-40px. Increase icon size from w-4 to w-5. Consider showing icon-only without rotated text (tooltip on hover instead).

#### SIZ-5: Canvas node cards are compact to a fault (P3)

**File:** `packages/ui/src/features/canvas/components/nodes/svg-compact-node.tsx`

Nodes are fixed at 220px wide with 11-12px text and metadata rows at 16px height. Dense metadata (repo, domain, scaling, pipeline, status) is crammed into a small card.

**Fix:** Consider bumping to 240-260px width and 13px base text. Evaluate which metadata rows are essential at default zoom (use LOD system to hide less critical rows earlier).

#### SIZ-6: Resize handle hit area is 1px (P1)

**(Same as PNL-3 — tracked there.)**

#### SIZ-7: Property panel labels at 10px (P2)

**File:** `packages/ui/src/features/properties/components/properties-panel.tsx`

Property labels use `text-ice-xs` (10px). Combined with monospace font, these are hard to read.

**Fix:** Bump to `text-ice-sm` (11px) minimum. With sans-serif font (SIZ-1), this becomes much more readable.

---

## Epic 6: Overall Polish & Coherence

> UI doesn't feel clean.

#### POL-1: Context menus are custom HTML overlay (P2)

**Ref:** CTX-24 in `docs/backlog/context-menus.md`

Canvas context menus use a custom HTML overlay positioned manually, not Radix UI `ContextMenu` primitives. Inconsistent with the rest of the UI which uses Radix for dropdowns and dialogs.

**Fix:** Migrate to Radix UI `ContextMenu`. Gains: keyboard navigation, focus management, consistent styling, animation support.

#### POL-2: Block property help text exists but is never rendered (P2)

**Ref:** FEAT-25 in `docs/backlog/missing-features.md`

Property definitions in `high-level-resources.ts` include `description` fields for most properties. The properties panel fetches these but doesn't render them.

**Fix:** Add a small info icon next to each property label. On hover, show the description as a Radix Tooltip.

#### POL-3: No tooltips on technical properties (P2)

**File:** `packages/ui/src/features/properties/components/properties-panel.tsx`

Properties like "CIDR", "Replicas", "Retention (days)" are displayed as raw labels with no explanation.

**Fix:** Covered by POL-2 (render existing help text) and the user-friendly properties initiative (`docs/backlog/user-friendly-properties.md`).

#### POL-4: Dark mode has no elevation depth (P3)

**File:** `packages/web/src/styles/globals.css`

All shadows are removed in dark mode (`.dark .ice-card { box-shadow: none; }`). Cards, modals, and dropdowns all appear at the same visual layer.

**Fix:** Keep shadows in dark mode with higher opacity and slightly blue-tinted shadow color to match the navy theme. E.g., `box-shadow: 0 2px 8px rgba(0,0,0,0.4)`.

---

## Summary

| Epic | Items | Critical | High | Medium | Low |
|---|---|---|---|---|---|
| 1. Containment & Boundaries | 12 | 4 (BND-1,2,5,6) | 3 (BND-3,7,11) | 3 (BND-4,9,10) | 2 (BND-8,12) |
| 2. Canvas Performance | 7 | 0 | 2 (CVS-1,2) | 2 (CVS-3,4) | 3 (CVS-5,6,7) |
| 3. Panel Resize/Show/Hide | 6 | 0 | 3 (PNL-1,2,3) | 1 (PNL-5) | 2 (PNL-4,6) |
| 4. Visual Clutter & Spacing | 7 | 0 | 3 (CLT-1,2,3) | 3 (CLT-4,5,7) | 1 (CLT-6) |
| 5. Element Sizing | 7 | 0 | 2 (SIZ-1,2) | 4 (SIZ-3,4,5,7) | 0 |
| 6. Overall Polish | 4 | 0 | 0 | 3 (POL-1,2,3) | 1 (POL-4) |
| **Total** | **43** | **4** | **13** | **16** | **9** |

### Recommended implementation order

**Phase 1 — Containment (highest user pain):**
BND-5 + BND-6 (SVG clipping), BND-1 + BND-3 (drag clamping), BND-7 (constrain-then-expand)

**Phase 2 — Canvas performance:**
CVS-1 (React.memo), CVS-2 (viewport culling), CVS-3 + CVS-4 (CSS hints + throttle)

**Phase 3 — Panel UX:**
PNL-3/SIZ-6 (wider handles), PNL-2 (persist visibility), PNL-1 (unify resize system)

**Phase 4 — Design system:**
SIZ-1 (sans-serif for UI), SIZ-2 (unify text scale), CLT-1 + CLT-4 (spacing + radii), CLT-2 + CLT-3 (color tokens)

**Phase 5 — Polish:**
POL-1 (Radix context menus), POL-2 + POL-3 (property help text), PNL-5 (keyboard shortcuts)
