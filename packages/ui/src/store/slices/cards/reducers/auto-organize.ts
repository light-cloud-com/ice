/**
 * Cards slice — auto-organize reducer.
 *
 * Single reducer that runs `autoLayout` over the active card and writes the
 * fresh positions / sizes / edge routes back onto the draft. Spread into
 * `createSlice`'s `reducers` block in the orchestrator (`cards-slice.ts`) so
 * RTK still owns the action type string (`'cards/autoOrganizeCard'`).
 *
 * Two operating modes, gated on `payload.containerId`:
 *
 *   - **Master organize** (`containerId` absent). Re-lays out every node on
 *     the canvas. After autoLayout returns, a centroid-stabilize block shifts
 *     all top-level nodes (and their `edgeRoutes`) so the centroid of the
 *     post-layout top-level nodes lands at the SAME canvas point as the
 *     pre-layout centroid — keeps the diagram from drifting under repeated
 *     organize calls. Only this branch calls `applyEdgeRoutes`; per-container
 *     organize leaves siblings outside the container at stale positions, and
 *     rewriting their incident routes against the fresh layout would mismatch
 *     the surviving stale node positions.
 *   - **Per-container organize** (`containerId` present). Re-lays out only
 *     the descendants of `containerId`, keeps the container's own position
 *     fixed, updates its width/height to match the layout output, and
 *     translates each descendant by the `(dx, dy)` offset between the old
 *     and new container origin so the children stay anchored to the
 *     container that didn't move on screen.
 *
 * Pre-layout cleanup pass: any `node.parentId` that points to a node that
 * is NOT a container (typed `'container'` OR an iceType from
 * `isContainer(...)` — covers `Network.PrivateNetwork`, `Network.VPC`,
 * `Network.Subnet`, `Group.*`, etc.) is `delete`d before the LayoutNode
 * mapping runs. Without this, blocks like Private Network — stored as
 * `type: 'resource'` — would drop their children's parentId right before
 * layout, breaking containment in the layout pass.
 *
 * Order of operations (RISK #4: centroid-stabilize edgeRoutes shift MUST run
 * BEFORE `applyEdgeRoutes`):
 *
 *   1. pushSnapshot — undoable.
 *   2. parentId cleanup pass.
 *   3. Build LayoutNode[] / LayoutEdge[] from card.nodes / card.edges.
 *   4. autoLayout(...) → { nodes: organized, edgeRoutes }.
 *   5a. Master branch: compute pre-layout centroid (top-level nodes), remap
 *       card.nodes to layout positions/sizes, compute post-layout centroid,
 *       shift all nodes AND `edgeRoutes` by (dx, dy) so the centroid is
 *       stable.
 *   5b. Per-container branch: keep container origin, resize container,
 *       offset each descendant by (oldOrigin - newOrigin).
 *   6. NOTE: `cascadeContainerReflow` and `forceResolveOverlaps` are
 *      INTENTIONALLY skipped — autoLayout already sizes containers to
 *      `max(content + padding, MIN_CONTAINER, visual minimum)` and places
 *      siblings with 48px clearance. The legacy cascade recomputes container
 *      size from raw child content (ignoring visual minimums like Private
 *      Network's 560×320 floor) AND repositions the container around its
 *      children's centroid — both of which undo the fresh dagre layout and
 *      manifest as overlapping blocks. This comment is operational
 *      documentation and must be preserved verbatim across refactors.
 *   7. Master branch only: `applyEdgeRoutes(card.edges, edgeRoutes)`.
 *
 * Folded nodes preserve their existing `height` even when autoLayout
 * reports a different height — the user's collapsed state is sticky across
 * organize passes.
 *
 * `nodeGap` is `LAYOUT_NODE_SEP` (40px). It MUST be a multiple of
 * `LAYOUT_GRID_STEP` (40); using e.g. 36 makes each block-step (width 240 +
 * gap 36 = 276) misalign with the grid, so the post-layout snapToGrid pass
 * rounds adjacent positions inconsistently and eats one grid step (40px)
 * out of one gap per row.
 *
 * @see rf-cards-12
 */

import { LAYOUT_NODE_SEP } from '@ice/constants';
import type { PayloadAction } from '@reduxjs/toolkit';
import { isContainer as isContainerIceType } from '../../../../config/containment-rules';
import { autoLayout, type LayoutNode } from '../../../../shared/utils/auto-layout';
import { applyEdgeRoutes } from '../edge-routes';
import { pushSnapshot } from '../snapshot';
import type { CardsState } from '../types';

export const autoOrganizeReducers = {
  // Auto-organize nodes in active card.
  // When containerId is provided, only reorganize inside that container (per-group organize).
  // Otherwise, organize all levels (master organize).
  autoOrganizeCard: (
    state: CardsState,
    action: PayloadAction<
      | {
          direction?: 'vertical' | 'horizontal';
          layout?: 'flow' | 'grid' | 'circular';
          containerId?: string;
          zoom?: number;
        }
      | undefined
    >,
  ) => {
    const card = state.cards.find((c) => c.id === state.activeCardId);
    if (!card || card.nodes.length === 0) return;
    pushSnapshot(state);

    const direction = action?.payload?.direction || 'vertical';
    const layout = action?.payload?.layout || 'flow';
    const containerId = action?.payload?.containerId;
    const zoom = action?.payload?.zoom;

    // Cleanup pass: strip parentId where the parent isn't a valid container.
    // A node qualifies as a container if it's typed `'container'` OR its
    // iceType is a container type (e.g. Network.PrivateNetwork, Network.VPC,
    // Network.Subnet, Group.*). Without the iceType check, blocks like
    // Private Network — stored as `type: 'resource'` — would drop their
    // children's parentId right before layout, breaking containment.
    const containerIds = new Set(
      card.nodes
        .filter((n) => n.type === 'container' || isContainerIceType((n.data?.iceType as string) || ''))
        .map((n) => n.id),
    );
    for (const node of card.nodes) {
      if (node.parentId && !containerIds.has(node.parentId)) {
        delete node.parentId;
      }
    }

    // Convert CardNodes to LayoutNodes
    const layoutNodes: LayoutNode[] = card.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      iceType: (node.data?.iceType as string) || '',
      label: (node.data?.label as string) || node.id,
      parentId: node.parentId || null,
      width: node.width || 280,
      height: node.height || 160,
      x: node.position.x,
      y: node.position.y,
      data: node.data,
      folded: (node.data?.folded as boolean) || false,
    }));

    // Convert edges for layout
    const layoutEdges = card.edges.map((e) => ({
      source: e.source,
      target: e.target,
      relationship: e.data?.relationship as string | undefined,
    }));

    // Apply auto-layout with direction and layout mode.
    // nodeGap MUST be a multiple of LAYOUT_GRID_STEP (40). Using e.g. 36 makes
    // each block-step (width 240 + gap 36 = 276) misalign with the grid, so
    // the post-layout snapToGrid pass rounds adjacent positions inconsistently
    // and eats one grid step (40px) out of one gap per row.
    const { nodes: organizedNodes, edgeRoutes } = autoLayout(layoutNodes, layoutEdges, {
      startX: 50,
      startY: 50,
      nodeGap: LAYOUT_NODE_SEP,
      nodesPerRow: 3,
      containerPadding: 30,
      direction,
      layout,
      zoom,
    });

    const organizedMap = new Map(organizedNodes.map((n) => [n.id, n]));

    if (containerId) {
      // Per-container organize: keep the container position, update size + children positions
      const containerOrganized = organizedMap.get(containerId);
      const containerOld = card.nodes.find((n) => n.id === containerId);
      if (!containerOrganized || !containerOld) return;

      // Offset = difference between old and new container position
      const dx = containerOld.position.x - containerOrganized.x;
      const dy = containerOld.position.y - containerOrganized.y;

      // Collect all descendants of this container
      const descendantIds = new Set<string>();
      const collectDescendants = (parentId: string) => {
        for (const node of card.nodes) {
          if (node.parentId === parentId && !descendantIds.has(node.id)) {
            descendantIds.add(node.id);
            collectDescendants(node.id);
          }
        }
      };
      collectDescendants(containerId);

      card.nodes = card.nodes.map((node) => {
        if (node.id === containerId) {
          return {
            ...node,
            width: containerOrganized.width,
            height: containerOrganized.height,
          };
        }
        if (descendantIds.has(node.id)) {
          const organized = organizedMap.get(node.id);
          if (organized) {
            const isFolded = !!node.data?.folded;
            return {
              ...node,
              position: { x: organized.x + dx, y: organized.y + dy },
              width: organized.width,
              height: isFolded ? node.height : organized.height,
            };
          }
        }
        return node;
      });
    } else {
      // Compute old centroid (center of mass of all top-level nodes)
      const topNodes = card.nodes.filter((n) => !n.parentId);
      let oldCentroidX = 0,
        oldCentroidY = 0;
      if (topNodes.length > 0) {
        for (const n of topNodes) {
          oldCentroidX += n.position.x + n.width / 2;
          oldCentroidY += n.position.y + n.height / 2;
        }
        oldCentroidX /= topNodes.length;
        oldCentroidY /= topNodes.length;
      }

      // Master organize: update all nodes with layout positions + sizes
      card.nodes = card.nodes.map((node) => {
        const organized = organizedMap.get(node.id);
        if (organized) {
          const isFolded = !!node.data?.folded;
          return {
            ...node,
            position: { x: organized.x, y: organized.y },
            width: organized.width,
            height: isFolded ? node.height : organized.height,
          };
        }
        return node;
      });

      // Centroid-stabilize: shift the entire layout so the centroid of
      // top-level nodes stays at the same position. This prevents the
      // whole diagram from drifting when node sizes change with zoom.
      if (topNodes.length > 0) {
        const newTopNodes = card.nodes.filter((n) => !n.parentId);
        let newCentroidX = 0,
          newCentroidY = 0;
        for (const n of newTopNodes) {
          newCentroidX += n.position.x + n.width / 2;
          newCentroidY += n.position.y + n.height / 2;
        }
        newCentroidX /= newTopNodes.length;
        newCentroidY /= newTopNodes.length;

        const dx = oldCentroidX - newCentroidX;
        const dy = oldCentroidY - newCentroidY;
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
          for (const node of card.nodes) {
            node.position.x += dx;
            node.position.y += dy;
          }
          // Shift routes by the same amount so they stay aligned with nodes
          for (const [key, pts] of edgeRoutes) {
            edgeRoutes.set(
              key,
              pts.map((p) => ({ x: p.x + dx, y: p.y + dy })),
            );
          }
        }
      }
    }

    // NOTE: `cascadeContainerReflow` and `forceResolveOverlaps` are intentionally
    // skipped here. `autoLayout` already sizes every container to
    // `max(content + padding, MIN_CONTAINER, visual minimum)` and places
    // siblings with 48px clearance. The legacy cascade recomputes container
    // size from raw child content (ignoring visual minimums like Private
    // Network's 560×320 floor) AND repositions the container around its
    // children's centroid — both of which undo the fresh dagre layout and
    // manifest as overlapping blocks.

    // Persist dagre's routed polylines so SvgConnectionPath can draw edges
    // that actually bend around nodes instead of cutting straight through.
    // Only safe for master-organize: per-container organize leaves outside
    // nodes in old positions, which would mismatch fresh routes.
    if (!containerId) {
      applyEdgeRoutes(card.edges, edgeRoutes);
    }
  },
} as const;
