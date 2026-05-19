/**
 * Per-node renderer dispatch for the canvas — extracted from
 * `svg-canvas.tsx` (rf-canv-12).
 *
 * Two exports:
 *
 *   1. `CONCEPT_NODE_RENDERERS`: a `Record<string, React.FC<SvgCompactNodeProps>>`
 *      keyed by `iceType` that maps each "concept" block (PostgreSQL,
 *      ScalableBackend, VectorDB, …) to a bespoke per-block canvas node
 *      component. Each entry lives in its own folder under `../nodes/<name>/`
 *      so customizing one block = editing one file.
 *
 *   2. `renderCanvasNode(node, ctx)`: a factory that selects between
 *      `SvgLogNode` / `SvgCustomDomainNode` / `SvgPrivateNetworkNode` /
 *      `SvgGroupNode` / a concept renderer / `SvgCompactNode` based on
 *      `iceType` + `node.type`. It returns the *unwrapped* React element plus
 *      the per-call-site `innerKey`; the caller wraps it in
 *      `<NodeLiftWrapper>` (rf-canv-10) and computes the wrapper's outer
 *      `key` from `(isLifted, parentId, isAnimating, innerKey)` — the
 *      verbatim priority chain the original `wrapLift` closure used. See
 *      learning `extracted-wrapper-key-must-mirror-original-closure-outer-
 *      key-chain` for why the `innerKey` is a return value rather than a
 *      caller-side constant.
 *
 * VERBATIM PRESERVATION (load-bearing):
 *
 *   - The dispatch order is fixed and order-sensitive:
 *
 *       1. `isLogIceType(iceType)`             → `SvgLogNode`
 *       2. `iceType === 'Network.CustomDomain'` → `SvgCustomDomainNode`
 *       3. `iceType === 'Network.PrivateNetwork'` → `SvgPrivateNetworkNode`
 *       4. `isContainerNode(node)`              → `SvgGroupNode`
 *       5. `node.type === 'block'`              → `ConceptRenderer` ?? `SvgCompactNode`
 *       6. (default fallthrough — typically `node.type === 'resource'`) →
 *                                                `ConceptFallbackRenderer`
 *                                                ?? `SvgCompactNode`
 *
 *     Re-ordering even subtly changes behaviour. `Network.PrivateNetwork`
 *     MUST stay above the `isContainerNode` arm because the util classifies
 *     PrivateNetwork as a container; flipping the order would render every
 *     PrivateNetwork as a plain `SvgGroupNode` (loss of identity header +
 *     ingress toggle). Likewise `isLogIceType` matches a few iceTypes that
 *     might otherwise fall through to the SvgCompactNode branch.
 *
 *   - The `innerKey` per branch is load-bearing for reconciliation when no
 *     wrapper-level branch overrides it (i.e. not lifted, no parent, not
 *     animating):
 *
 *       - log / group / block / resource fallbacks → `${id}-lod${lod}`
 *       - CustomDomain                              → `${id}-routes${len}`
 *       - PrivateNetwork                            → `${id}-pn${ingress}`
 *
 *     Changing the inner key forces React to re-mount the node when LOD /
 *     routes / ingress changes — that's intentional in the original code
 *     because each renderer reads those derived values once at mount.
 *
 *   - **Risk #11**: the *block-with-concept* (5a), *block-without-concept*
 *     (5b), *resource-with-concept* (6a), and *resource-without-concept*
 *     (6b) branches all eventually call `SvgCompactNode` if no concept
 *     renderer matches — but the gates differ. The `node.type === 'block'`
 *     branch (5) routes to `ConceptRenderer`; the default fallthrough (6)
 *     routes to `ConceptFallbackRenderer` even though both look up the same
 *     `CONCEPT_NODE_RENDERERS[iceType]`. The two paths are kept distinct so
 *     a future divergence (different prop set per type, different default
 *     fallback) is a one-line edit. Tests cover both `type:'block'` and
 *     `type:'resource'` for the same iceType — see
 *     `__tests__/node-renderer-registry.test.tsx`.
 *
 *   - Every prop on every `<SvgX>` invocation is preserved verbatim from
 *     `svg-canvas.tsx` (see L2287–2545 of the pre-rf-canv-12 file). The
 *     `RenderCtx` interface holds every value the dispatch needs so the
 *     orchestrator's call site stays a one-liner.
 */

import React from 'react';
import type { CanvasNode } from '../types';
import { isLogIceType, isContainerNode } from '../../utils/node-classification';
import { SvgLogNode } from '../nodes/log-node';
import { SvgCustomDomainNode } from '../nodes/custom-domain';
import { SvgGroupNode } from '../nodes/group-node';
import { SvgPrivateNetworkNode } from '../nodes/private-network';
import { SvgCompactNode } from '../nodes/compact-node';
import type { SvgCompactNodeProps, NodePipelineStatus } from '../nodes/compact-node/types';
// ─── Concept block canvas nodes (one folder per block, individually customizable) ───
import { SvgApiGatewayNode } from '../nodes/api-gateway';
import { SvgEmailServiceNode } from '../nodes/email-service';
import { SvgEnvConfigNode } from '../nodes/env-config';
import { SvgEventStreamNode } from '../nodes/event-stream';
import { SvgGithubRepoNode } from '../nodes/github-repo';
import { SvgLlmGatewayNode } from '../nodes/llm-gateway';
import { SvgMessageQueueNode } from '../nodes/message-queue';
import { SvgMongodbNode } from '../nodes/mongodb';
import { SvgMysqlNode } from '../nodes/mysql';
import { SvgObjectStorageNode } from '../nodes/object-storage';
import { SvgPostgresNode } from '../nodes/postgres';
import { SvgPrivateAiServiceNode } from '../nodes/private-ai-service';
import { SvgPublicTrafficNode } from '../nodes/public-traffic';
import { SvgRedisCacheNode } from '../nodes/redis-cache';
import { SvgScalableBackendNode } from '../nodes/scalable-backend';
import { SvgScheduledTaskNode } from '../nodes/scheduled-task';
import { SvgSecretStoreNode } from '../nodes/secret-store';
import { SvgServerlessFunctionNode } from '../nodes/serverless-function';
import { SvgSsrSiteNode } from '../nodes/ssr-site';
import { SvgStaticSiteNode } from '../nodes/static-site';
import { SvgVectorDbNode } from '../nodes/vector-db';
import { SvgWorkerNode } from '../nodes/worker';

// =============================================================================
// Per-concept block renderer table
// =============================================================================
//
// Maps iceType → per-block canvas node component. The block branch of the
// dispatcher loop checks this table first and falls back to SvgCompactNode
// when no bespoke renderer is registered. Each entry lives in its own
// folder under ../nodes/<name>/ so customizing one block = editing one file.

export const CONCEPT_NODE_RENDERERS: Record<string, React.FC<SvgCompactNodeProps>> = {
  // Frontend
  'Compute.StaticSite': SvgStaticSiteNode,
  'Compute.SSRSite': SvgSsrSiteNode,
  // Compute
  'Compute.Container': SvgScalableBackendNode,
  'Compute.BackendAPI': SvgScalableBackendNode,
  'Compute.ServerlessFunction': SvgServerlessFunctionNode,
  'Compute.Worker': SvgWorkerNode,
  'Compute.CronJob': SvgScheduledTaskNode,
  // Data
  'Database.PostgreSQL': SvgPostgresNode,
  'Database.MySQL': SvgMysqlNode,
  'Database.MongoDB': SvgMongodbNode,
  'Database.Redis': SvgRedisCacheNode,
  'Storage.Bucket': SvgObjectStorageNode,
  // AI
  'AI.VectorDB': SvgVectorDbNode,
  'AI.LLMGateway': SvgLlmGatewayNode,
  'AI.PrivateAIService': SvgPrivateAiServiceNode,
  // Messaging
  'Messaging.Queue': SvgMessageQueueNode,
  'Messaging.EventStream': SvgEventStreamNode,
  'Messaging.Email': SvgEmailServiceNode,
  // Network / Edge
  'Network.Gateway': SvgApiGatewayNode,
  'Network.PublicTraffic': SvgPublicTrafficNode,
  // Ops
  'Security.Secret': SvgSecretStoreNode,
  'Config.Environment': SvgEnvConfigNode,
  'Source.Repository': SvgGithubRepoNode,
};

// =============================================================================
// Render context — every prop the inner dispatch consumes
// =============================================================================
//
// One object so the orchestrator's `sortedNodes.map(...)` body stays clean.
// Field shapes mirror the orchestrator's local declarations verbatim so a
// drop-in replacement at the call site requires no further plumbing.

export interface RenderCtx {
  /** All visible nodes, post-LOD/fold filtering — used to compute `childNodes` per group/block. */
  sortedNodes: CanvasNode[];
  /** Currently-selected node ids. */
  selectedNodes: string[];
  /** Level-of-detail bucket (1/2/3) — passed through to renderers that adapt their layout. */
  lod: number;
  /** Raw zoom factor — renderers use it to size LOD cards inversely. */
  zoom: number;
  /** Per-node pipeline status (idle/queued/building/deploying/success/failed). */
  pipelineNodeStatus: Record<string, NodePipelineStatus | undefined>;
  /** Group id currently under the cursor during a shift-drag-reparent. */
  dragOverGroupId: string | null;
  /** Group id that just lost a child during a reparent (animates the exit). */
  exitingGroupId: string | null;
  /** Node id currently in inline-rename mode (null when no rename is active). */
  renamingNodeId: string | null;
  /** Per-node 'valid-target' / 'invalid-target' / 'source' state during a connection-draw. */
  connectionDragTargets: Map<string, 'valid-target' | 'invalid-target' | 'source'> | null;
  /** Per-node validation severity + count rollup. */
  nodeValidationMap: Map<string, { severity: 'error' | 'warning' | 'info'; count: number }>;
  /** Toggle the fold/unfold state of a container — also cascades resize for unfolds. */
  handleToggleFold: (nodeId: string) => void;
  /** Hover enter/leave callback (null on leave). */
  handleNodeHover: (nodeId: string | null) => void;
  /** Double-click on a node label starts inline rename. */
  handleNodeDoubleClick: (nodeId: string) => void;
  /** Commit an inline rename (empty/whitespace-only labels are dropped). */
  handleRenameCommit: (nodeId: string, newLabel: string) => void;
  /** Cancel inline rename (restores the previous label). */
  handleRenameCancel: () => void;
  /** Update arbitrary fields on a node's data record (used by inline +/- controls). */
  handleUpdateNodeData: (nodeId: string, data: Record<string, unknown>) => void;
  /** Click on the pipeline badge — selects the node so the pipeline panel shows. */
  handlePipelineClick: (nodeId: string) => void;
  /** Aggregated pipeline statuses for services connected to a Source.Repository node. */
  getConnectedPipelineStatuses: (node: CanvasNode) => NodePipelineStatus[];
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Pick the right per-node renderer for `node` and return both the element and
 * the per-call-site `innerKey` that the caller's wrapper-key derivation
 * function needs. The element is *unwrapped* — the orchestrator wraps it in
 * `<NodeLiftWrapper>` so the entrance animation, shift-drag highlight, and
 * parent-clip mask layer consistently across all dispatch arms.
 *
 * The dispatch order is fixed (see file-level docs). Risk #11: the
 * `node.type === 'block'` and default-fallthrough arms both consult the same
 * `CONCEPT_NODE_RENDERERS[iceType]` table but route through distinct local
 * names (`ConceptRenderer` / `ConceptFallbackRenderer`) so future per-type
 * divergence is a one-line edit. Tests cover both arms for the same iceType.
 */
export function renderCanvasNode(
  node: CanvasNode,
  ctx: RenderCtx,
): { element: React.ReactNode; innerKey: string } {
  const {
    sortedNodes,
    selectedNodes,
    lod,
    zoom,
    pipelineNodeStatus,
    dragOverGroupId,
    exitingGroupId,
    renamingNodeId,
    connectionDragTargets,
    nodeValidationMap,
    handleToggleFold,
    handleNodeHover,
    handleNodeDoubleClick,
    handleRenameCommit,
    handleRenameCancel,
    handleUpdateNodeData,
    handlePipelineClick,
    getConnectedPipelineStatuses,
  } = ctx;

  const iceType = (node.data?.iceType as string) || '';
  const isLogNode = isLogIceType(iceType);
  const isGroup = isContainerNode(node);
  const isBlock = node.type === 'block';

  // 1. Log terminal — minimal SvgLogNode renderer.
  if (isLogNode) {
    const innerKey = `${node.id}-lod${lod}`;
    return {
      innerKey,
      element: (
        <SvgLogNode
          key={innerKey}
          node={node}
          isSelected={selectedNodes.includes(node.id)}
          onToggleFold={handleToggleFold}
          connectionDragState={connectionDragTargets?.get(node.id) ?? null}
        />
      ),
    };
  }

  // 2. Custom Domain — owns its own renderer with dynamic per-route rows
  //    + per-row connection ports. Lives outside the compact-node tree so
  //    it can have variable height and multiple right-side ports.
  if (iceType === 'Network.CustomDomain') {
    const innerKey = `${node.id}-routes${((node.data?.routes as unknown[]) || []).length}`;
    return {
      innerKey,
      element: (
        <SvgCustomDomainNode
          key={innerKey}
          node={node}
          isSelected={selectedNodes.includes(node.id)}
          isDragOver={dragOverGroupId === node.id}
          onNodeHover={handleNodeHover}
          onUpdateData={handleUpdateNodeData}
          connectionDragState={connectionDragTargets?.get(node.id) ?? null}
        />
      ),
    };
  }

  // 3. Private Network — pure container with a header that shows identity
  //    (shield icon + title + subtitle) and the Open/Sealed ingress toggle.
  //    Children nest inside via parentId and render through the standard
  //    dispatcher loop on top of the Private Network frame. Must come
  //    BEFORE the generic group dispatch below or it would render as a
  //    plain SvgGroupNode.
  if (iceType === 'Network.PrivateNetwork') {
    const innerKey = `${node.id}-pn${(node.data?.ingress as string) || 'open'}`;
    return {
      innerKey,
      element: (
        <SvgPrivateNetworkNode
          key={innerKey}
          node={node}
          isSelected={selectedNodes.includes(node.id)}
          isDragOver={dragOverGroupId === node.id}
          onNodeHover={handleNodeHover}
          onUpdateData={handleUpdateNodeData}
          connectionDragState={connectionDragTargets?.get(node.id) ?? null}
        />
      ),
    };
  }

  // 4. Groups always render as containers.
  if (isGroup) {
    const innerKey = `${node.id}-lod${lod}`;
    return {
      innerKey,
      element: (
        <SvgGroupNode
          key={innerKey}
          node={node}
          isSelected={selectedNodes.includes(node.id)}
          childNodes={sortedNodes.filter((n) => n.parentId === node.id)}
          onToggleFold={handleToggleFold}
          isDragOver={dragOverGroupId === node.id}
          isChildExiting={exitingGroupId === node.id}
          isRenaming={renamingNodeId === node.id}
          onDoubleClickLabel={() => handleNodeDoubleClick(node.id)}
          onRenameCommit={(newLabel) => handleRenameCommit(node.id, newLabel)}
          onRenameCancel={handleRenameCancel}
          lod={lod}
          zoom={zoom}
          connectionDragState={connectionDragTargets?.get(node.id) ?? null}
          validationSeverity={nodeValidationMap.get(node.id)?.severity ?? null}
          validationCount={nodeValidationMap.get(node.id)?.count ?? 0}
        />
      ),
    };
  }

  // 5. Blocks: check for a per-concept renderer first, fall back to the
  //    generic SvgCompactNode. Each block in the Concepts Palette has its
  //    own folder under nodes/, so editing one block's look only touches
  //    one file.
  if (isBlock) {
    const innerKey = `${node.id}-lod${lod}`;
    const ConceptRenderer = CONCEPT_NODE_RENDERERS[iceType];
    if (ConceptRenderer) {
      return {
        innerKey,
        element: (
          <ConceptRenderer
            key={innerKey}
            node={node}
            isSelected={selectedNodes.includes(node.id)}
            childNodes={sortedNodes.filter((n) => n.parentId === node.id)}
            onToggleFold={handleToggleFold}
            isDragOver={dragOverGroupId === node.id}
            onNodeHover={handleNodeHover}
            isRenaming={renamingNodeId === node.id}
            onDoubleClickLabel={() => handleNodeDoubleClick(node.id)}
            onRenameCommit={(newLabel) => handleRenameCommit(node.id, newLabel)}
            onRenameCancel={handleRenameCancel}
            onUpdateData={handleUpdateNodeData}
            pipelineStatus={pipelineNodeStatus[node.id]}
            onPipelineClick={handlePipelineClick}
            connectedPipelineStatuses={getConnectedPipelineStatuses(node)}
            lod={lod}
            zoom={zoom}
            connectionDragState={connectionDragTargets?.get(node.id) ?? null}
            validationSeverity={nodeValidationMap.get(node.id)?.severity ?? null}
            validationCount={nodeValidationMap.get(node.id)?.count ?? 0}
          />
        ),
      };
    }
    return {
      innerKey,
      element: (
        <SvgCompactNode
          key={innerKey}
          node={node}
          isSelected={selectedNodes.includes(node.id)}
          childNodes={sortedNodes.filter((n) => n.parentId === node.id)}
          onToggleFold={handleToggleFold}
          isDragOver={dragOverGroupId === node.id}
          onNodeHover={handleNodeHover}
          isRenaming={renamingNodeId === node.id}
          onDoubleClickLabel={() => handleNodeDoubleClick(node.id)}
          onRenameCommit={(newLabel) => handleRenameCommit(node.id, newLabel)}
          onRenameCancel={handleRenameCancel}
          onUpdateData={handleUpdateNodeData}
          pipelineStatus={pipelineNodeStatus[node.id]}
          onPipelineClick={handlePipelineClick}
          connectedPipelineStatuses={getConnectedPipelineStatuses(node)}
          lod={lod}
          zoom={zoom}
          connectionDragState={connectionDragTargets?.get(node.id) ?? null}
          validationSeverity={nodeValidationMap.get(node.id)?.severity ?? null}
          validationCount={nodeValidationMap.get(node.id)?.count ?? 0}
        />
      ),
    };
  }

  // 6. Fallthrough (resource nodes and anything else): same concept-renderer
  //    check as the isBlock branch, because palette drops create nodes with
  //    type='resource' not 'block'. The two paths are kept distinct (Risk
  //    #11) so future per-type divergence is a one-line edit.
  const innerKey = `${node.id}-lod${lod}`;
  const ConceptFallbackRenderer = CONCEPT_NODE_RENDERERS[iceType];
  if (ConceptFallbackRenderer) {
    return {
      innerKey,
      element: (
        <ConceptFallbackRenderer
          key={innerKey}
          node={node}
          isSelected={selectedNodes.includes(node.id)}
          childNodes={sortedNodes.filter((n) => n.parentId === node.id)}
          onToggleFold={handleToggleFold}
          isDragOver={dragOverGroupId === node.id}
          onNodeHover={handleNodeHover}
          isRenaming={renamingNodeId === node.id}
          onDoubleClickLabel={() => handleNodeDoubleClick(node.id)}
          onRenameCommit={(newLabel) => handleRenameCommit(node.id, newLabel)}
          onRenameCancel={handleRenameCancel}
          onUpdateData={handleUpdateNodeData}
          pipelineStatus={pipelineNodeStatus[node.id]}
          onPipelineClick={handlePipelineClick}
          connectedPipelineStatuses={getConnectedPipelineStatuses(node)}
          lod={lod}
          zoom={zoom}
          connectionDragState={connectionDragTargets?.get(node.id) ?? null}
          validationSeverity={nodeValidationMap.get(node.id)?.severity ?? null}
          validationCount={nodeValidationMap.get(node.id)?.count ?? 0}
        />
      ),
    };
  }

  return {
    innerKey,
    element: (
      <SvgCompactNode
        key={innerKey}
        node={node}
        isSelected={selectedNodes.includes(node.id)}
        childNodes={sortedNodes.filter((n) => n.parentId === node.id)}
        onToggleFold={handleToggleFold}
        isDragOver={dragOverGroupId === node.id}
        onNodeHover={handleNodeHover}
        isRenaming={renamingNodeId === node.id}
        onDoubleClickLabel={() => handleNodeDoubleClick(node.id)}
        onRenameCommit={(newLabel) => handleRenameCommit(node.id, newLabel)}
        onRenameCancel={handleRenameCancel}
        onUpdateData={handleUpdateNodeData}
        pipelineStatus={pipelineNodeStatus[node.id]}
        onPipelineClick={handlePipelineClick}
        connectedPipelineStatuses={getConnectedPipelineStatuses(node)}
        lod={lod}
        zoom={zoom}
        connectionDragState={connectionDragTargets?.get(node.id) ?? null}
        validationSeverity={nodeValidationMap.get(node.id)?.severity ?? null}
        validationCount={nodeValidationMap.get(node.id)?.count ?? 0}
      />
    ),
  };
}
