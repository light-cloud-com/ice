# Context Menus Backlog

> **Status: 12 fixed, 5 deferred, 8 won't fix** (2026-03-23)

Audit of all right-click context menus across the application. Covers the canvas (empty area, node, edge), project tree sidebar, and environment tab bar.

**Files involved:**
- `packages/ui/src/features/canvas/components/context/canvas-context-menu.tsx`
- `packages/ui/src/features/palette/components/project-tree.tsx`
- `packages/ui/src/features/environments/components/environment-tab-bar.tsx`

---

## Canvas Context Menu (right-click on empty area)

### CTX-1: Missing Undo / Redo items -- FIXED

**Type:** Missing
**Location:** `canvas-context-menu.tsx` — canvas menu branch (line 130)

**Fix applied:** Added Undo/Redo to canvas menu with history stack awareness (disabled when stack is empty).

---

### CTX-2: Missing Zoom to Fit -- WON'T FIX

**Type:** Missing
**Location:** `canvas-context-menu.tsx` — canvas menu branch

**Reason:** Zoom to Fit already available via toolbar button + keyboard shortcut (Cmd+0). Adding to context menu adds clutter without real benefit.

---

### CTX-3: Keyboard shortcuts hardcoded as `Ctrl+` -- FIXED

**Type:** Bug
**Location:** `canvas-context-menu.tsx` — all `shortcut` props (lines 164, 182, 235, 248, 271)

**Fix applied:** Platform-aware shortcuts via `modKey()` helper -- shows Cmd on Mac, Ctrl+ on others.

---

## Node Context Menu (right-click on a node)

### CTX-4: "Fold/Unfold" shown on non-container nodes -- FIXED

**Type:** Irrelevant item
**Location:** `canvas-context-menu.tsx` — node menu (line 262)

**Fix applied:** Fold/Unfold only shown on container nodes (`targetNode?.type === 'container'`).

---

### CTX-5: "Change Provider" lists unsupported providers -- FIXED

**Type:** Irrelevant items
**Location:** `canvas-context-menu.tsx` — node menu (line 201)

**Fix applied:** Changed provider list to only supported ones: GCP, AWS, Azure, Kubernetes.

---

### CTX-6: Missing "Rename" action -- FIXED

**Type:** Missing
**Location:** `canvas-context-menu.tsx` — node menu

**Fix applied:** Added Rename item that opens Properties panel focused on the node label field.

---

### CTX-7: Missing "Group Selected" action -- DEFERRED

**Type:** Missing
**Location:** `canvas-context-menu.tsx` — node menu

When multiple nodes are selected, there is no context menu action to wrap them in a container group. The store supports `updateCardNodeParent` for re-parenting, but there's no "create group from selection" flow.

Needs a new "create container from selection" store action + bounding-box sizing logic.

---

### CTX-8: Missing "Ungroup" action for containers -- DEFERRED

**Type:** Missing
**Location:** `canvas-context-menu.tsx` — node menu

Container/group nodes cannot be dissolved from the context menu. Users must manually drag each child out.

Needs a "dissolve container" store action + re-parenting logic for child nodes.

---

### CTX-9: Missing "Select Connected" action -- WON'T FIX

**Type:** Missing
**Location:** `canvas-context-menu.tsx` — node menu

**Reason:** Power-user feature that can be done by clicking connected nodes with Ctrl. Not worth menu space.

---

## Edge Context Menu (right-click on a connection)

### CTX-10: Missing "Reverse Direction" action -- FIXED

**Type:** Missing
**Location:** `canvas-context-menu.tsx` — edge menu (line 291)

**Fix applied:** Added Reverse Direction with new `reverseCardEdge` store action that swaps source/target.

---

### CTX-11: Relationship labels are lowercase -- FIXED

**Type:** Minor polish
**Location:** `canvas-context-menu.tsx` — edge menu (line 295)

**Fix applied:** Edge labels now title-cased via explicit `EDGE_LABELS` map instead of `.replace()` transform.

---

## Project Tree Context Menu (right-click in sidebar)

### CTX-12: "Move to Top Level" shown when item is already at top level -- FIXED

**Type:** Irrelevant item
**Location:** `project-tree.tsx` — context menu (lines 598-621)

**Fix applied:** "Move to Top Level" hidden when item is already at top level (checks `folderId`/`parentFolderId === null`).

---

### CTX-13: Missing "Move to Folder" submenu -- DEFERRED

**Type:** Missing
**Location:** `project-tree.tsx` — context menu

The context menu only offers "Move to Top Level". There is no way to move a project into a specific folder via right-click.

Needs SubMenu component in project tree + backend move call with cycle-prevention logic.

---

### CTX-14: Missing "Add Environment" for project context menu -- WON'T FIX

**Type:** Missing
**Location:** `project-tree.tsx` — context menu (project type)

**Reason:** Redundant. Users navigate to project and use + button in env tab bar. Adding here duplicates existing workflow.

---

### CTX-15: Missing "New Project" in folder context menu -- WON'T FIX

**Type:** Missing
**Location:** `project-tree.tsx` — context menu (folder type)

**Reason:** Redundant. Project wizard exists and works from sidebar "New Project" button. Adding here duplicates existing workflow.

---

### CTX-16: Missing "New Subfolder" in folder context menu -- FIXED

**Type:** Missing
**Location:** `project-tree.tsx` — context menu (folder type)

**Fix applied:** Added "New Subfolder" to folder context menu, triggers inline folder creation with parent ID.

---

### CTX-17: Missing "Duplicate" for project context menu -- DEFERRED

**Type:** Missing
**Location:** `project-tree.tsx` — context menu (project type)

No way to clone a project. Common workflow: duplicate an existing project as a starting point for a similar architecture.

Needs backend deep-copy endpoint that clones project + environment + card data.

---

### CTX-18: Project context menu missing icons for Rename and Delete -- WON'T FIX

**Type:** Inconsistency
**Location:** `project-tree.tsx` — context menu

**Reason:** Pure cosmetic polish. Current icons work fine and menus are consistent within themselves.

---

## Environment Tab Bar Context Menu (right-click on env tab)

### CTX-19: Protected environments have no context menu at all (P2)

**Type:** Missing
**Location:** `environment-tab-bar.tsx` — context menu (line 317)

Right-clicking a production (protected) environment shows nothing — the guard `if (!env || env.is_protected) return null` suppresses the entire menu. Non-destructive actions like "Deploy" or viewing details should still be available.

**Implementation:** Split the guard: always render the menu, but conditionally include destructive items (Delete, Promote). Non-destructive items should always appear.

---

### CTX-20: Missing "Rename" for environments (P2)

**Type:** Missing
**Location:** `environment-tab-bar.tsx` — context menu

No way to rename an environment from the tab bar. Should be available for all non-protected environments.

**Store action needed:** A `renameEnvironment` thunk (does not exist yet — needs to be added to `environments-slice.ts` with a backend API call).

---

### CTX-21: Missing "Deploy" action in environment context menu (P2)

**Type:** Missing
**Location:** `environment-tab-bar.tsx` — context menu

The "Deploy Infra" button exists in the tab bar's right side, but it's not in the context menu. Right-click → Deploy is a natural shortcut.

**Store action exists:** `openDeployPanel()` in `deploy-slice.ts`
**Implementation:** Add a "Deploy" menu item with a Rocket icon. First switch to the environment, then dispatch `openDeployPanel()`.

---

### CTX-22: Missing "Duplicate" for environments (P3)

**Type:** Missing
**Location:** `environment-tab-bar.tsx` — context menu

Common workflow: clone staging as a feature branch environment. No way to do this from context menu.

**Implementation:** Add "Duplicate" item. Needs a `duplicateEnvironment` thunk that clones the card and creates a new environment record.

---

### CTX-23: Awkward menu when only "Delete" remains (P3)

**Type:** Polish
**Location:** `environment-tab-bar.tsx` — context menu (line 331)

When `Promote to production` is not applicable (e.g. no production env exists), the menu shows just a separator followed by "Delete environment" — looks broken.

**Implementation:** Only render the separator when there are items above it. Wrap the separator in a conditional: `{showPromote && <div className="h-px ..." />}`.

---

## Cross-cutting Issues

### CTX-24: No shared context menu primitive (P3)

**Type:** Architectural
**Location:** All context menu files

Each context menu reimplements its own HTML overlay, positioning, outside-click handling, and styling. The Radix UI `ContextMenu` primitives are exported in `packages/ui/src/primitives/context-menu.tsx` but never used.

**Implementation:** Migrate all context menus to use the Radix UI primitives for:
- Consistent animation and positioning (auto-flips near screen edges)
- Built-in keyboard navigation (arrow keys, type-ahead)
- Accessibility (role="menu", aria attributes)
- Reduced code duplication

---

### CTX-25: No keyboard shortcut to open context menu (P3)

**Type:** Missing
**Location:** All canvas interactions

There is no `Shift+F10` or `Menu key` handler to open the context menu for the selected node/edge without a mouse. This is an accessibility gap — keyboard-only users cannot access context menu actions.

**Implementation:** Add a keydown listener for `Shift+F10` (or the `ContextMenu` key) that dispatches `openContextMenu` positioned near the selected node's center.
