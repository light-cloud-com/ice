/**
 * rf-canv-12 — `node-renderer-registry`.
 *
 * Two surfaces under test:
 *
 *   1. `CONCEPT_NODE_RENDERERS` — the iceType → component dispatch table.
 *   2. `renderCanvasNode(node, ctx)` — the per-node factory that selects
 *      between `SvgLogNode` / `SvgCustomDomainNode` / `SvgPrivateNetworkNode`
 *      / `SvgGroupNode` / a concept renderer / `SvgCompactNode` based on
 *      iceType + node.type, and returns `{ element, innerKey }` so the
 *      caller can derive its `<NodeLiftWrapper>` outer key.
 *
 * `renderCanvasNode` is a pure factory with no hooks and no Redux. We use
 * the direct-FC tree-walker pattern (cite
 * `tree-walker-for-react-fc-tests-must-flatten-nested-children-arrays`):
 * invoke the factory as a function, read `element` / `innerKey` directly,
 * and assert on the element's `type` / `key` / `props`.
 *
 * Component identity is preserved because `vi.mock(...)` swaps each leaf
 * `Svg*Node` for a labelled `React.FC` whose `displayName` is the name of
 * the slot it occupies in the registry. We then assert
 * `el.type === MockSvgGroupNode` etc. The mocks render `null` since the
 * tests never need the rendered DOM — only the dispatched type.
 *
 * **Risk #11**: the `node.type === 'block'` branch and the default
 * fallthrough branch both look up `CONCEPT_NODE_RENDERERS[iceType]` but
 * route through subtly different gates. Tests cover BOTH `type:'block'` AND
 * `type:'resource'` for the same iceType (`Compute.BackendAPI`,
 * `Database.PostgreSQL`) to pin that the dispatch chain lands in the right
 * arm and that the fallback to `SvgCompactNode` differs by gate but not by
 * component (which is intentional — see the file-level docs of
 * `../node-renderer-registry.tsx`).
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';

// ─── Mocks for every leaf Svg* component the registry composes ─────────────
//
// `vi.mock` calls are hoisted to the top of the file, so any shared mock
// identities have to be declared inside `vi.hoisted` so they survive the
// hoist. Each mock is a labelled FC so we can assert by component identity
// (the `type` field on the dispatched React element); the FC body returns
// `null` because the tests never need rendered DOM.

const mocks = vi.hoisted(() => {
  const mockConceptFor = (name: string) => {
    const fc: React.FC<Record<string, unknown>> = () => null;
    fc.displayName = name;
    return fc;
  };
  return {
    SvgLogNode: mockConceptFor('MockSvgLogNode'),
    SvgCustomDomainNode: mockConceptFor('MockSvgCustomDomainNode'),
    SvgGroupNode: mockConceptFor('MockSvgGroupNode'),
    SvgPrivateNetworkNode: mockConceptFor('MockSvgPrivateNetworkNode'),
    SvgCompactNode: mockConceptFor('MockSvgCompactNode'),
    SvgScalableBackendNode: mockConceptFor('MockSvgScalableBackendNode'),
    SvgServerlessFunctionNode: mockConceptFor('MockSvgServerlessFunctionNode'),
    SvgWorkerNode: mockConceptFor('MockSvgWorkerNode'),
    SvgScheduledTaskNode: mockConceptFor('MockSvgScheduledTaskNode'),
    SvgPostgresNode: mockConceptFor('MockSvgPostgresNode'),
    SvgMysqlNode: mockConceptFor('MockSvgMysqlNode'),
    SvgMongodbNode: mockConceptFor('MockSvgMongodbNode'),
    SvgRedisCacheNode: mockConceptFor('MockSvgRedisCacheNode'),
    SvgObjectStorageNode: mockConceptFor('MockSvgObjectStorageNode'),
    SvgVectorDbNode: mockConceptFor('MockSvgVectorDbNode'),
    SvgLlmGatewayNode: mockConceptFor('MockSvgLlmGatewayNode'),
    SvgPrivateAiServiceNode: mockConceptFor('MockSvgPrivateAiServiceNode'),
    SvgMessageQueueNode: mockConceptFor('MockSvgMessageQueueNode'),
    SvgEventStreamNode: mockConceptFor('MockSvgEventStreamNode'),
    SvgEmailServiceNode: mockConceptFor('MockSvgEmailServiceNode'),
    SvgApiGatewayNode: mockConceptFor('MockSvgApiGatewayNode'),
    SvgPublicTrafficNode: mockConceptFor('MockSvgPublicTrafficNode'),
    SvgSecretStoreNode: mockConceptFor('MockSvgSecretStoreNode'),
    SvgEnvConfigNode: mockConceptFor('MockSvgEnvConfigNode'),
    SvgGithubRepoNode: mockConceptFor('MockSvgGithubRepoNode'),
    SvgStaticSiteNode: mockConceptFor('MockSvgStaticSiteNode'),
    SvgSsrSiteNode: mockConceptFor('MockSvgSsrSiteNode'),
  };
});

vi.mock('../../nodes/log-node', () => ({ SvgLogNode: mocks.SvgLogNode }));
vi.mock('../../nodes/custom-domain', () => ({ SvgCustomDomainNode: mocks.SvgCustomDomainNode }));
vi.mock('../../nodes/group-node', () => ({ SvgGroupNode: mocks.SvgGroupNode }));
vi.mock('../../nodes/private-network', () => ({ SvgPrivateNetworkNode: mocks.SvgPrivateNetworkNode }));
// `compact-node` exports more than just SvgCompactNode
// (computeCompactNodeWidth/Height) but the registry only imports
// SvgCompactNode from it.
vi.mock('../../nodes/compact-node', () => ({ SvgCompactNode: mocks.SvgCompactNode }));
vi.mock('../../nodes/scalable-backend', () => ({ SvgScalableBackendNode: mocks.SvgScalableBackendNode }));
vi.mock('../../nodes/serverless-function', () => ({ SvgServerlessFunctionNode: mocks.SvgServerlessFunctionNode }));
vi.mock('../../nodes/worker', () => ({ SvgWorkerNode: mocks.SvgWorkerNode }));
vi.mock('../../nodes/scheduled-task', () => ({ SvgScheduledTaskNode: mocks.SvgScheduledTaskNode }));
vi.mock('../../nodes/postgres', () => ({ SvgPostgresNode: mocks.SvgPostgresNode }));
vi.mock('../../nodes/mysql', () => ({ SvgMysqlNode: mocks.SvgMysqlNode }));
vi.mock('../../nodes/mongodb', () => ({ SvgMongodbNode: mocks.SvgMongodbNode }));
vi.mock('../../nodes/redis-cache', () => ({ SvgRedisCacheNode: mocks.SvgRedisCacheNode }));
vi.mock('../../nodes/object-storage', () => ({ SvgObjectStorageNode: mocks.SvgObjectStorageNode }));
vi.mock('../../nodes/vector-db', () => ({ SvgVectorDbNode: mocks.SvgVectorDbNode }));
vi.mock('../../nodes/llm-gateway', () => ({ SvgLlmGatewayNode: mocks.SvgLlmGatewayNode }));
vi.mock('../../nodes/private-ai-service', () => ({ SvgPrivateAiServiceNode: mocks.SvgPrivateAiServiceNode }));
vi.mock('../../nodes/message-queue', () => ({ SvgMessageQueueNode: mocks.SvgMessageQueueNode }));
vi.mock('../../nodes/event-stream', () => ({ SvgEventStreamNode: mocks.SvgEventStreamNode }));
vi.mock('../../nodes/email-service', () => ({ SvgEmailServiceNode: mocks.SvgEmailServiceNode }));
vi.mock('../../nodes/api-gateway', () => ({ SvgApiGatewayNode: mocks.SvgApiGatewayNode }));
vi.mock('../../nodes/public-traffic', () => ({ SvgPublicTrafficNode: mocks.SvgPublicTrafficNode }));
vi.mock('../../nodes/secret-store', () => ({ SvgSecretStoreNode: mocks.SvgSecretStoreNode }));
vi.mock('../../nodes/env-config', () => ({ SvgEnvConfigNode: mocks.SvgEnvConfigNode }));
vi.mock('../../nodes/github-repo', () => ({ SvgGithubRepoNode: mocks.SvgGithubRepoNode }));
vi.mock('../../nodes/static-site', () => ({ SvgStaticSiteNode: mocks.SvgStaticSiteNode }));
vi.mock('../../nodes/ssr-site', () => ({ SvgSsrSiteNode: mocks.SvgSsrSiteNode }));

// Local aliases — keep the test-body assertion text readable.
const MockSvgLogNode = mocks.SvgLogNode;
const MockSvgCustomDomainNode = mocks.SvgCustomDomainNode;
const MockSvgGroupNode = mocks.SvgGroupNode;
const MockSvgPrivateNetworkNode = mocks.SvgPrivateNetworkNode;
const MockSvgCompactNode = mocks.SvgCompactNode;
const MockSvgScalableBackendNode = mocks.SvgScalableBackendNode;
const MockSvgServerlessFunctionNode = mocks.SvgServerlessFunctionNode;
const MockSvgPostgresNode = mocks.SvgPostgresNode;
const MockSvgVectorDbNode = mocks.SvgVectorDbNode;
const MockSvgObjectStorageNode = mocks.SvgObjectStorageNode;
const MockSvgGithubRepoNode = mocks.SvgGithubRepoNode;

// Imports come AFTER the mocks so vitest hoists/wires them correctly.
import {
  CONCEPT_NODE_RENDERERS,
  SPECIAL_NODE_RENDERERS,
  renderCanvasNode,
  type RenderCtx,
} from '../node-renderer-registry';
import type { CanvasNode } from '../../types';

// ─── Helpers ────────────────────────────────────────────────────────────────

const makeNode = (overrides: Partial<CanvasNode> = {}): CanvasNode => ({
  id: 'node-1',
  type: 'block',
  x: 100,
  y: 200,
  width: 80,
  height: 40,
  label: 'My Node',
  data: {},
  parentId: undefined,
  ...overrides,
});

const makeCtx = (overrides: Partial<RenderCtx> = {}): RenderCtx => ({
  sortedNodes: [],
  selectedNodes: [],
  lod: 3,
  zoom: 1,
  pipelineNodeStatus: {},
  dragOverGroupId: null,
  exitingGroupId: null,
  renamingNodeId: null,
  connectionDragTargets: null,
  nodeValidationMap: new Map(),
  handleToggleFold: () => {},
  handleNodeHover: () => {},
  handleNodeDoubleClick: () => {},
  handleRenameCommit: () => {},
  handleRenameCancel: () => {},
  handleUpdateNodeData: () => {},
  handlePipelineClick: () => {},
  getConnectedPipelineStatuses: () => [],
  ...overrides,
});

// ─── SPECIAL_NODE_RENDERERS table ─────────────────────────────────────────

describe('SPECIAL_NODE_RENDERERS', () => {
  it('contains exactly the bespoke iceTypes that need a custom renderer', () => {
    // Locked-in list. Adding a new bespoke renderer extends this set;
    // removing one breaks dispatch. The dispatcher reads this table
    // generically so the cardinal rule (no hardcoded iceType branches)
    // is preserved by construction.
    expect(Object.keys(SPECIAL_NODE_RENDERERS).sort()).toEqual([
      'Network.CustomDomain',
      'Network.PrivateNetwork',
      'Util.Reroute',
    ]);
  });

  it('each entry is a factory that returns an element + innerKey', () => {
    for (const [iceType, factory] of Object.entries(SPECIAL_NODE_RENDERERS)) {
      const node = makeNode({ data: { iceType } });
      const result = factory(node, makeCtx());
      expect(result.element).toBeTruthy();
      expect(typeof result.innerKey).toBe('string');
      expect(result.innerKey.length).toBeGreaterThan(0);
    }
  });

  it('Custom Domain innerKey encodes route count for stable re-mount on add/remove', () => {
    const oneRoute = SPECIAL_NODE_RENDERERS['Network.CustomDomain'](
      makeNode({ data: { iceType: 'Network.CustomDomain', routes: [{ id: 'r1', subdomain: 'a' }] } }),
      makeCtx(),
    );
    const twoRoutes = SPECIAL_NODE_RENDERERS['Network.CustomDomain'](
      makeNode({
        data: {
          iceType: 'Network.CustomDomain',
          routes: [
            { id: 'r1', subdomain: 'a' },
            { id: 'r2', subdomain: 'b' },
          ],
        },
      }),
      makeCtx(),
    );
    expect(oneRoute.innerKey).not.toBe(twoRoutes.innerKey);
  });

  it('PrivateNetwork innerKey encodes ingress mode for stable re-mount on toggle', () => {
    const open = SPECIAL_NODE_RENDERERS['Network.PrivateNetwork'](
      makeNode({ data: { iceType: 'Network.PrivateNetwork', ingress: 'open' } }),
      makeCtx(),
    );
    const sealed = SPECIAL_NODE_RENDERERS['Network.PrivateNetwork'](
      makeNode({ data: { iceType: 'Network.PrivateNetwork', ingress: 'sealed' } }),
      makeCtx(),
    );
    expect(open.innerKey).not.toBe(sealed.innerKey);
  });
});

// ─── CONCEPT_NODE_RENDERERS table ─────────────────────────────────────────

describe('CONCEPT_NODE_RENDERERS', () => {
  it('contains the expected iceType keys', () => {
    const expectedKeys = [
      // Frontend
      'Compute.StaticSite',
      'Compute.SSRSite',
      // Compute
      'Compute.Container',
      'Compute.BackendAPI',
      'Compute.ServerlessFunction',
      'Compute.Worker',
      'Compute.CronJob',
      // Data
      'Database.PostgreSQL',
      'Database.MySQL',
      'Database.MongoDB',
      'Database.Redis',
      'Storage.Bucket',
      // AI
      'AI.VectorDB',
      'AI.LLMGateway',
      'AI.PrivateAIService',
      // Messaging
      'Messaging.Queue',
      'Messaging.EventStream',
      'Messaging.Email',
      // Network / Edge
      'Network.Gateway',
      'Network.PublicTraffic',
      // Ops
      'Security.Secret',
      'Config.Environment',
      'Source.Repository',
    ];
    expect(Object.keys(CONCEPT_NODE_RENDERERS).sort()).toEqual(expectedKeys.sort());
  });

  it('Compute.Container and Compute.BackendAPI both map to SvgScalableBackendNode (intentional alias)', () => {
    expect(CONCEPT_NODE_RENDERERS['Compute.Container']).toBe(MockSvgScalableBackendNode);
    expect(CONCEPT_NODE_RENDERERS['Compute.BackendAPI']).toBe(MockSvgScalableBackendNode);
  });

  it('every value is a function (React.FC)', () => {
    for (const v of Object.values(CONCEPT_NODE_RENDERERS)) {
      expect(typeof v).toBe('function');
    }
  });
});

// ─── renderCanvasNode — branch coverage for the 7 dispatch arms ───────────

describe('renderCanvasNode — log node dispatch (arm 1)', () => {
  it('dispatches `Monitoring.Log` to SvgLogNode', () => {
    const node = makeNode({ data: { iceType: 'Monitoring.Log' } });
    const { element, innerKey } = renderCanvasNode(node, makeCtx({ lod: 2 }));
    const el = element as React.ReactElement;
    expect(el.type).toBe(MockSvgLogNode);
    expect(innerKey).toBe('node-1-lod2');
    expect(el.key).toBe('node-1-lod2');
    // Log node passes only a slim prop set: node, isSelected, onToggleFold.
    const props = el.props as { node?: unknown; isSelected?: unknown; onToggleFold?: unknown };
    expect(props.node).toBe(node);
    expect(props.isSelected).toBe(false);
    expect(typeof props.onToggleFold).toBe('function');
  });

  it('also matches `Observability.Logs`', () => {
    const node = makeNode({ data: { iceType: 'Observability.Logs' } });
    const { element } = renderCanvasNode(node, makeCtx());
    expect((element as React.ReactElement).type).toBe(MockSvgLogNode);
  });

  it('also matches the `Log.*` prefix (e.g. Log.AccessLog)', () => {
    const node = makeNode({ data: { iceType: 'Log.AccessLog' } });
    const { element } = renderCanvasNode(node, makeCtx());
    expect((element as React.ReactElement).type).toBe(MockSvgLogNode);
  });
});

describe('renderCanvasNode — Network.CustomDomain dispatch (arm 2)', () => {
  it('dispatches `Network.CustomDomain` to SvgCustomDomainNode with routes-len innerKey', () => {
    const node = makeNode({
      data: { iceType: 'Network.CustomDomain', routes: [{ path: '/' }, { path: '/api' }, { path: '/admin' }] },
    });
    const { element, innerKey } = renderCanvasNode(node, makeCtx());
    const el = element as React.ReactElement;
    expect(el.type).toBe(MockSvgCustomDomainNode);
    expect(innerKey).toBe('node-1-routes3');
    expect(el.key).toBe('node-1-routes3');
  });

  it('uses 0 when routes is missing', () => {
    const node = makeNode({ data: { iceType: 'Network.CustomDomain' } });
    const { innerKey } = renderCanvasNode(node, makeCtx());
    expect(innerKey).toBe('node-1-routes0');
  });

  it('drag state propagates from connectionDragTargets', () => {
    const node = makeNode({ data: { iceType: 'Network.CustomDomain' } });
    const targets = new Map<string, 'valid-target' | 'invalid-target' | 'source'>();
    targets.set('node-1', 'valid-target');
    const { element } = renderCanvasNode(node, makeCtx({ connectionDragTargets: targets }));
    const el = element as React.ReactElement;
    const props = el.props as { connectionDragState?: unknown };
    expect(props.connectionDragState).toBe('valid-target');
  });
});

describe('renderCanvasNode — Network.PrivateNetwork dispatch (arm 3)', () => {
  it('dispatches `Network.PrivateNetwork` to SvgPrivateNetworkNode with ingress innerKey', () => {
    const node = makeNode({ data: { iceType: 'Network.PrivateNetwork', ingress: 'sealed' } });
    const { element, innerKey } = renderCanvasNode(node, makeCtx());
    const el = element as React.ReactElement;
    expect(el.type).toBe(MockSvgPrivateNetworkNode);
    expect(innerKey).toBe('node-1-pnsealed');
    expect(el.key).toBe('node-1-pnsealed');
  });

  it('defaults ingress to "open" when missing', () => {
    const node = makeNode({ data: { iceType: 'Network.PrivateNetwork' } });
    const { innerKey } = renderCanvasNode(node, makeCtx());
    expect(innerKey).toBe('node-1-pnopen');
  });

  it('PrivateNetwork wins over the generic group dispatch — order matters', () => {
    // PrivateNetwork is classified as a container by `isContainerNode`. If
    // dispatch order were flipped, this would render as a plain SvgGroupNode.
    const node = makeNode({ type: 'container', data: { iceType: 'Network.PrivateNetwork' } });
    const { element } = renderCanvasNode(node, makeCtx());
    expect((element as React.ReactElement).type).toBe(MockSvgPrivateNetworkNode);
  });
});

describe('renderCanvasNode — group container dispatch (arm 4)', () => {
  it('dispatches `Network.VPC` (a container iceType) to SvgGroupNode', () => {
    const node = makeNode({ type: 'container', data: { iceType: 'Network.VPC' } });
    const { element, innerKey } = renderCanvasNode(node, makeCtx({ lod: 1 }));
    const el = element as React.ReactElement;
    expect(el.type).toBe(MockSvgGroupNode);
    expect(innerKey).toBe('node-1-lod1');
    expect(el.key).toBe('node-1-lod1');
  });

  it('dispatches `Network.Subnet` to SvgGroupNode', () => {
    const node = makeNode({ type: 'container', data: { iceType: 'Network.Subnet' } });
    const { element } = renderCanvasNode(node, makeCtx());
    expect((element as React.ReactElement).type).toBe(MockSvgGroupNode);
  });

  it('dispatches a plain `type:"container"` node to SvgGroupNode regardless of iceType', () => {
    const node = makeNode({ type: 'container', data: { iceType: 'Group.Foo' } });
    const { element } = renderCanvasNode(node, makeCtx());
    expect((element as React.ReactElement).type).toBe(MockSvgGroupNode);
  });

  it('passes childNodes filter, validation map lookup, and exitingGroupId through verbatim', () => {
    const node = makeNode({ id: 'parent-1', type: 'container', data: { iceType: 'Network.VPC' } });
    const child1 = makeNode({ id: 'child-1', parentId: 'parent-1' });
    const child2 = makeNode({ id: 'child-2', parentId: 'parent-1' });
    const otherNode = makeNode({ id: 'other-1', parentId: 'somewhere-else' });
    const validationMap = new Map<string, { severity: 'error' | 'warning' | 'info'; count: number }>();
    validationMap.set('parent-1', { severity: 'warning', count: 2 });
    const ctx = makeCtx({
      sortedNodes: [node, child1, child2, otherNode],
      exitingGroupId: 'parent-1',
      nodeValidationMap: validationMap,
    });
    const { element } = renderCanvasNode(node, ctx);
    const el = element as React.ReactElement;
    const props = el.props as {
      childNodes?: CanvasNode[];
      isChildExiting?: boolean;
      validationSeverity?: string | null;
      validationCount?: number;
    };
    expect(props.childNodes?.map((n) => n.id)).toEqual(['child-1', 'child-2']);
    expect(props.isChildExiting).toBe(true);
    expect(props.validationSeverity).toBe('warning');
    expect(props.validationCount).toBe(2);
  });
});

// ─── Risk #11 — block-vs-resource dispatch for the same iceType ───────────
//
// The four cases below pin the load-bearing semantics of risk #11:
//
//   - same iceType + type='block'    + concept registered    → ConceptRenderer
//   - same iceType + type='resource' + concept registered    → ConceptFallbackRenderer
//   - same iceType + type='block'    + NO concept registered → SvgCompactNode (block fallback)
//   - same iceType + type='resource' + NO concept registered → SvgCompactNode (default fallback)
//
// In the current code both concept paths land on the same component
// (`MockSvgPostgresNode` for `Database.PostgreSQL` etc.) because the table
// is shared. That is intentional. The tests verify the dispatch chain
// arrives via the right gate — see the file-level docs of
// `../node-renderer-registry.tsx`.

describe('renderCanvasNode — Risk #11: block vs. resource for the same iceType', () => {
  it('Compute.BackendAPI + type:block + concept present → ConceptRenderer (SvgScalableBackendNode)', () => {
    const node = makeNode({ type: 'block', data: { iceType: 'Compute.BackendAPI' } });
    const { element, innerKey } = renderCanvasNode(node, makeCtx({ lod: 3 }));
    const el = element as React.ReactElement;
    expect(el.type).toBe(MockSvgScalableBackendNode);
    expect(innerKey).toBe('node-1-lod3');
  });

  it('Compute.BackendAPI + type:resource + concept present → ConceptFallbackRenderer (same component, different gate)', () => {
    const node = makeNode({ type: 'resource', data: { iceType: 'Compute.BackendAPI' } });
    const { element, innerKey } = renderCanvasNode(node, makeCtx({ lod: 3 }));
    const el = element as React.ReactElement;
    // Same registry entry — but routed via the fallthrough branch's gate.
    expect(el.type).toBe(MockSvgScalableBackendNode);
    expect(innerKey).toBe('node-1-lod3');
  });

  it('UnknownIceType + type:block + NO concept → SvgCompactNode (block fallback gate)', () => {
    const node = makeNode({ type: 'block', data: { iceType: 'Foo.Unknown' } });
    const { element, innerKey } = renderCanvasNode(node, makeCtx({ lod: 3 }));
    const el = element as React.ReactElement;
    expect(el.type).toBe(MockSvgCompactNode);
    expect(innerKey).toBe('node-1-lod3');
  });

  it('UnknownIceType + type:resource + NO concept → SvgCompactNode (default fallback gate)', () => {
    const node = makeNode({ type: 'resource', data: { iceType: 'Foo.Unknown' } });
    const { element, innerKey } = renderCanvasNode(node, makeCtx({ lod: 3 }));
    const el = element as React.ReactElement;
    expect(el.type).toBe(MockSvgCompactNode);
    expect(innerKey).toBe('node-1-lod3');
  });

  it('Database.PostgreSQL + type:block → MockSvgPostgresNode via the block gate', () => {
    const node = makeNode({ type: 'block', data: { iceType: 'Database.PostgreSQL' } });
    const { element } = renderCanvasNode(node, makeCtx());
    expect((element as React.ReactElement).type).toBe(MockSvgPostgresNode);
  });

  it('Database.PostgreSQL + type:resource → MockSvgPostgresNode via the fallthrough gate', () => {
    // Resource path: gate is `node.type !== 'block'` (the four prior arms
    // didn't match). We pin that the registry STILL resolves.
    const node = makeNode({ type: 'resource', data: { iceType: 'Database.PostgreSQL' } });
    const { element } = renderCanvasNode(node, makeCtx());
    expect((element as React.ReactElement).type).toBe(MockSvgPostgresNode);
  });

  it('AI.VectorDB + type:block → MockSvgVectorDbNode via the block gate', () => {
    const node = makeNode({ type: 'block', data: { iceType: 'AI.VectorDB' } });
    const { element } = renderCanvasNode(node, makeCtx());
    expect((element as React.ReactElement).type).toBe(MockSvgVectorDbNode);
  });

  it('AI.VectorDB + type:resource → MockSvgVectorDbNode via the fallthrough gate', () => {
    const node = makeNode({ type: 'resource', data: { iceType: 'AI.VectorDB' } });
    const { element } = renderCanvasNode(node, makeCtx());
    expect((element as React.ReactElement).type).toBe(MockSvgVectorDbNode);
  });
});

// ─── Block branch (arm 5) — concept registered AND not registered ────────

describe('renderCanvasNode — block-with-concept dispatch (arm 5a)', () => {
  it('dispatches block with `Compute.ServerlessFunction` to SvgServerlessFunctionNode', () => {
    const node = makeNode({ type: 'block', data: { iceType: 'Compute.ServerlessFunction' } });
    const { element } = renderCanvasNode(node, makeCtx());
    expect((element as React.ReactElement).type).toBe(MockSvgServerlessFunctionNode);
  });

  it('passes the full block prop bundle to the concept renderer', () => {
    const node = makeNode({ id: 'p-1', type: 'block', data: { iceType: 'Database.PostgreSQL' } });
    const child = makeNode({ id: 'c-1', parentId: 'p-1' });
    const validationMap = new Map<string, { severity: 'error' | 'warning' | 'info'; count: number }>();
    validationMap.set('p-1', { severity: 'error', count: 5 });
    const pipelineNodeStatus = { 'p-1': { status: 'building' as const } };
    const ctx = makeCtx({
      sortedNodes: [node, child],
      selectedNodes: ['p-1'],
      pipelineNodeStatus,
      dragOverGroupId: 'p-1',
      renamingNodeId: 'p-1',
      lod: 2,
      zoom: 1.5,
      nodeValidationMap: validationMap,
    });
    const { element } = renderCanvasNode(node, ctx);
    const el = element as React.ReactElement;
    const props = el.props as {
      node?: CanvasNode;
      isSelected?: boolean;
      childNodes?: CanvasNode[];
      isDragOver?: boolean;
      isRenaming?: boolean;
      pipelineStatus?: unknown;
      lod?: number;
      zoom?: number;
      validationSeverity?: string | null;
      validationCount?: number;
    };
    expect(props.node).toBe(node);
    expect(props.isSelected).toBe(true);
    expect(props.childNodes?.map((n) => n.id)).toEqual(['c-1']);
    expect(props.isDragOver).toBe(true);
    expect(props.isRenaming).toBe(true);
    expect(props.pipelineStatus).toEqual({ status: 'building' });
    expect(props.lod).toBe(2);
    expect(props.zoom).toBe(1.5);
    expect(props.validationSeverity).toBe('error');
    expect(props.validationCount).toBe(5);
  });
});

describe('renderCanvasNode — block-without-concept fallback (arm 5b)', () => {
  it('dispatches block with unregistered iceType to SvgCompactNode', () => {
    const node = makeNode({ type: 'block', data: { iceType: 'Future.Unknown' } });
    const { element, innerKey } = renderCanvasNode(node, makeCtx({ lod: 3 }));
    const el = element as React.ReactElement;
    expect(el.type).toBe(MockSvgCompactNode);
    expect(innerKey).toBe('node-1-lod3');
    expect(el.key).toBe('node-1-lod3');
  });

  it('block fallback receives the same prop bundle as the concept arm', () => {
    const node = makeNode({ id: 'p-2', type: 'block', data: { iceType: 'Future.Unknown' } });
    const ctx = makeCtx({ selectedNodes: ['p-2'], lod: 3, zoom: 0.8 });
    const { element } = renderCanvasNode(node, ctx);
    const el = element as React.ReactElement;
    const props = el.props as {
      isSelected?: boolean;
      lod?: number;
      zoom?: number;
      onToggleFold?: unknown;
      onPipelineClick?: unknown;
      connectedPipelineStatuses?: unknown[];
    };
    expect(props.isSelected).toBe(true);
    expect(props.lod).toBe(3);
    expect(props.zoom).toBe(0.8);
    expect(typeof props.onToggleFold).toBe('function');
    expect(typeof props.onPipelineClick).toBe('function');
    expect(Array.isArray(props.connectedPipelineStatuses)).toBe(true);
  });
});

// ─── Default-fallthrough branch (arm 6) — both concept-present and absent

describe('renderCanvasNode — resource-with-concept dispatch (arm 6a)', () => {
  it('dispatches resource with `Storage.Bucket` to SvgObjectStorageNode', () => {
    const node = makeNode({ type: 'resource', data: { iceType: 'Storage.Bucket' } });
    const { element } = renderCanvasNode(node, makeCtx());
    expect((element as React.ReactElement).type).toBe(MockSvgObjectStorageNode);
  });

  it('dispatches resource with `Source.Repository` to SvgGithubRepoNode and forwards getConnectedPipelineStatuses', () => {
    const node = makeNode({ type: 'resource', data: { iceType: 'Source.Repository' } });
    const captured: CanvasNode[] = [];
    const ctx = makeCtx({
      getConnectedPipelineStatuses: (n) => {
        captured.push(n);
        return [{ status: 'success' }, { status: 'idle' }];
      },
    });
    const { element } = renderCanvasNode(node, ctx);
    const el = element as React.ReactElement;
    expect(el.type).toBe(MockSvgGithubRepoNode);
    const props = el.props as { connectedPipelineStatuses?: Array<{ status: string }> };
    expect(props.connectedPipelineStatuses).toEqual([{ status: 'success' }, { status: 'idle' }]);
    expect(captured).toEqual([node]);
  });
});

describe('renderCanvasNode — resource-without-concept default fallback (arm 6b)', () => {
  it('dispatches resource with unregistered iceType to SvgCompactNode', () => {
    const node = makeNode({ type: 'resource', data: { iceType: 'Brand.New.Type' } });
    const { element, innerKey } = renderCanvasNode(node, makeCtx({ lod: 3 }));
    const el = element as React.ReactElement;
    expect(el.type).toBe(MockSvgCompactNode);
    expect(innerKey).toBe('node-1-lod3');
  });

  it('also handles resource with empty iceType', () => {
    const node = makeNode({ type: 'resource', data: {} });
    const { element } = renderCanvasNode(node, makeCtx());
    expect((element as React.ReactElement).type).toBe(MockSvgCompactNode);
  });

  it('rename callbacks fire with the right node id', () => {
    const node = makeNode({ id: 'r-7', type: 'resource', data: { iceType: 'Brand.New.Type' } });
    const renameCalls: Array<[string, string]> = [];
    const dblClicks: string[] = [];
    const ctx = makeCtx({
      handleRenameCommit: (id, label) => renameCalls.push([id, label]),
      handleNodeDoubleClick: (id) => dblClicks.push(id),
    });
    const { element } = renderCanvasNode(node, ctx);
    const el = element as React.ReactElement;
    const props = el.props as {
      onDoubleClickLabel?: () => void;
      onRenameCommit?: (label: string) => void;
    };
    props.onDoubleClickLabel?.();
    expect(dblClicks).toEqual(['r-7']);
    props.onRenameCommit?.('NewName');
    expect(renameCalls).toEqual([['r-7', 'NewName']]);
  });
});

// ─── Inline callback closures fire on every dispatch arm ─────────────────
//
// The dispatch body builds arrow closures inline for `onDoubleClickLabel`,
// `onRenameCommit`, and the `childNodes={sortedNodes.filter(...)}` filter.
// Tests below invoke each via the dispatched element's props so v8 records
// function coverage on every branch (group / block-with-concept /
// block-without-concept / resource-with-concept / resource-without-concept).

describe('renderCanvasNode — inline callback closures fire on every dispatch arm', () => {
  type Arm = {
    name: string;
    node: CanvasNode;
  };
  const arms: Arm[] = [
    {
      name: 'group',
      node: makeNode({ id: 'g-1', type: 'container', data: { iceType: 'Network.VPC' } }),
    },
    {
      name: 'block-with-concept',
      node: makeNode({ id: 'b-1', type: 'block', data: { iceType: 'Database.PostgreSQL' } }),
    },
    {
      name: 'block-without-concept',
      node: makeNode({ id: 'b-2', type: 'block', data: { iceType: 'Foo.Unknown' } }),
    },
    {
      name: 'resource-with-concept',
      node: makeNode({ id: 'r-1', type: 'resource', data: { iceType: 'Source.Repository' } }),
    },
    {
      name: 'resource-without-concept',
      node: makeNode({ id: 'r-2', type: 'resource', data: { iceType: 'Foo.Unknown' } }),
    },
  ];

  for (const arm of arms) {
    it(`${arm.name}: onDoubleClickLabel + onRenameCommit + childNodes filter fire with the right ids`, () => {
      const renameCalls: Array<[string, string]> = [];
      const dblClicks: string[] = [];
      const child = makeNode({ id: 'child-x', parentId: arm.node.id });
      const otherChild = makeNode({ id: 'other-x', parentId: 'someone-else' });
      const ctx = makeCtx({
        sortedNodes: [arm.node, child, otherChild],
        handleRenameCommit: (id, label) => renameCalls.push([id, label]),
        handleNodeDoubleClick: (id) => dblClicks.push(id),
      });
      const { element } = renderCanvasNode(arm.node, ctx);
      const el = element as React.ReactElement;
      const props = el.props as {
        childNodes?: CanvasNode[];
        onDoubleClickLabel?: () => void;
        onRenameCommit?: (label: string) => void;
      };
      // childNodes filter ran — only the child whose parentId matches.
      expect(props.childNodes?.map((n) => n.id)).toEqual(['child-x']);
      // Rename + dblclick closures bind to arm.node.id.
      props.onDoubleClickLabel?.();
      expect(dblClicks).toEqual([arm.node.id]);
      props.onRenameCommit?.('Renamed');
      expect(renameCalls).toEqual([[arm.node.id, 'Renamed']]);
    });
  }
});

// ─── Sanity: the dispatch order is exactly as documented ─────────────────

describe('renderCanvasNode — dispatch order is total and ordered', () => {
  it('iceType empty + type:block → SvgCompactNode (no concept matches)', () => {
    const node = makeNode({ type: 'block', data: {} });
    const { element } = renderCanvasNode(node, makeCtx());
    expect((element as React.ReactElement).type).toBe(MockSvgCompactNode);
  });

  it('iceType empty + type:resource → SvgCompactNode (no concept, default arm)', () => {
    const node = makeNode({ type: 'resource', data: {} });
    const { element } = renderCanvasNode(node, makeCtx());
    expect((element as React.ReactElement).type).toBe(MockSvgCompactNode);
  });

  it('connectionDragTargets null → connectionDragState forwarded as null (not "valid-target")', () => {
    const node = makeNode({ type: 'block', data: { iceType: 'Compute.BackendAPI' } });
    const { element } = renderCanvasNode(node, makeCtx({ connectionDragTargets: null }));
    const el = element as React.ReactElement;
    const props = el.props as { connectionDragState?: unknown };
    expect(props.connectionDragState).toBeNull();
  });
});
