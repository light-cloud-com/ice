/**
 * rf-props-22 — edge-properties-section subcomponent.
 *
 * `EdgePropertiesSection` is the right-sidebar panel for an edge
 * selection. It uses `useDispatch` plus `useCallback` (the
 * `updateEdgeField` writer) — no `useState`/`useEffect`. We use the
 * direct-FC tree-walker pattern (cite
 * `tree-walker-for-react-fc-tests-must-flatten-nested-children-arrays`):
 * invoke the FC as a function with React's `useCallback` mocked to
 * passthrough so the body returns a synchronous tree, then walk it.
 *
 * `useCallback` MUST be mocked when invoking the FC outside a renderer
 * context — same diagnostic as the rf-props-21 `useMemo` lesson (cite
 * `use-memo-must-be-mocked-too-when-the-extracted-component-uses-it`):
 * the real React.useCallback reads `null.useCallback` from the dispatcher
 * and throws `Cannot read properties of null (reading 'useCallback')`.
 * Eager-passthrough mock is sufficient here because the tests don't care
 * about identity stability — they just need the returned callable to be
 * the source-supplied function.
 *
 * Mocks:
 *  - `react.useCallback` → passthrough `(cb, _deps) => cb`.
 *  - `react-redux.useDispatch` → returns `mocks.dispatchSpy`.
 *  - `'../../fields'` → `Section` and `TextField` are vi.fn stubs the
 *    walker matches by reference (cite
 *    `mocked-component-leaves-are-invisible-to-direct-fc-tree-walkers`).
 *  - `'../../../../shared/components/ui/panel-header'` → `PanelHeader`
 *    is a vi.fn the walker matches by reference; we assert
 *    `onClose`/`closeLabel`/`title` props.
 *  - `'../../utils/edge-warnings'` → `computeEdgeWarnings` is a vi.fn so
 *    we control the returned warning list deterministically.
 *  - `'../../utils/normalize-subdomain'` → `normalizeSubdomain` returns
 *    its arg unchanged, `validateSubdomain` is a vi.fn we drive per-test.
 *  - `'../../../../store/slices/cards-slice'` → `updateCardEdgeData`,
 *    `deleteCardEdge`, `updateCardNodeData` are tagged spies so the
 *    dispatch arg is verifiable.
 *  - `'../../../../store/slices/ui-slice'` → `toggleProperties` returns
 *    a tagged action.
 *  - `'../../../../i18n'.t` → echoes `t:<key>` for stable text assertions.
 *  - `'../../../../shared/utils/cn'` → identity passthrough so the
 *    className walk comparisons stay legible.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted stubs — vi.mock factories run before module-level statements, so
// shared identities have to live in vi.hoisted (cite
// `vi-hoisted-for-stable-mock-identity-in-direct-fc-tree-walker-tests`).
const mocks = vi.hoisted(() => ({
  MockSection: vi.fn(),
  MockTextField: vi.fn(),
  MockPanelHeader: vi.fn(),
  // Pretty-stable cn passthrough — joins truthy strings with a space.
  cnSpy: vi.fn((...args: unknown[]) =>
    args.filter((a) => typeof a === 'string' && a).join(' '),
  ),
  // Subdomain helpers.
  normalizeSubdomainSpy: vi.fn((s: string) => s),
  validateSubdomainSpy: vi.fn((_s: string): string | null => null),
  // Edge warnings — default empty.
  computeEdgeWarningsSpy: vi.fn(
    (_src: string, _tgt: string, _t: (k: string) => string) =>
      [] as Array<{ level: string; message: string; suggestion?: string }>,
  ),
  // Dispatch spy.
  dispatchSpy: vi.fn(),
  // Slice action spies — return tagged objects so dispatch arg is verifiable.
  updateCardEdgeDataSpy: vi.fn(
    (arg: { edgeId: string; data: Record<string, unknown> }) => ({
      type: 'cards/updateCardEdgeData',
      payload: arg,
    }),
  ),
  deleteCardEdgeSpy: vi.fn((id: string) => ({
    type: 'cards/deleteCardEdge',
    payload: id,
  })),
  updateCardNodeDataSpy: vi.fn(
    (arg: { nodeId: string; data: Record<string, unknown> }) => ({
      type: 'cards/updateCardNodeData',
      payload: arg,
    }),
  ),
  toggleProperties: vi.fn(() => ({ type: 'ui/toggleProperties' })),
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    // Direct-FC invocation has no React dispatcher context. Passthrough so
    // the wrapped callback is invocable from our test handlers.
    useCallback: vi.fn((cb: unknown, _deps?: unknown[]) => cb),
  };
});

vi.mock('react-redux', () => ({
  useDispatch: () => mocks.dispatchSpy,
}));

vi.mock('../../fields', () => ({
  Section: mocks.MockSection,
  TextField: mocks.MockTextField,
}));

vi.mock('../../../../../shared/components/ui/panel-header', () => ({
  PanelHeader: mocks.MockPanelHeader,
}));

vi.mock('../../../../../shared/utils/cn', () => ({
  cn: mocks.cnSpy,
}));

vi.mock('../../../utils/edge-warnings', () => ({
  computeEdgeWarnings: mocks.computeEdgeWarningsSpy,
}));

vi.mock('../../../utils/normalize-subdomain', () => ({
  normalizeSubdomain: mocks.normalizeSubdomainSpy,
  validateSubdomain: mocks.validateSubdomainSpy,
}));

vi.mock('../../../../../store/slices/cards-slice', () => ({
  updateCardEdgeData: mocks.updateCardEdgeDataSpy,
  deleteCardEdge: mocks.deleteCardEdgeSpy,
  updateCardNodeData: mocks.updateCardNodeDataSpy,
}));

vi.mock('../../../../../store/slices/ui-slice', () => ({
  toggleProperties: mocks.toggleProperties,
}));

vi.mock('../../../../../i18n', () => ({
  t: vi.fn((key: string) => `t:${key}`),
}));

import { EdgePropertiesSection } from '../edge-properties-section';
import type { Card, CardEdge, CardNode } from '../../../../../store/slices/cards-slice';

// ─── Tree-walker (same shape as rf-props-6/9/10/11/12/13/14/15/16/17/18/19/20/21) ──

type ReactNodeLike = React.ReactNode;

function* walk(node: ReactNodeLike): Generator<React.ReactElement> {
  if (
    node == null ||
    typeof node === 'boolean' ||
    typeof node === 'string' ||
    typeof node === 'number'
  ) {
    return;
  }
  if (Array.isArray(node)) {
    for (const c of node) yield* walk(c as ReactNodeLike);
    return;
  }
  const el = node as React.ReactElement;
  yield el;
  const children = (el.props as { children?: React.ReactNode } | undefined)?.children;
  if (children == null) return;
  yield* walk(children);
}

function findByPredicate(
  tree: React.ReactNode,
  predicate: (el: React.ReactElement) => boolean,
): React.ReactElement[] {
  const out: React.ReactElement[] = [];
  for (const el of walk(tree)) {
    if (el && predicate(el)) out.push(el);
  }
  return out;
}

function findByType(
  tree: React.ReactNode,
  type: string | React.ComponentType<unknown> | unknown,
): React.ReactElement[] {
  return findByPredicate(tree, (el) => el.type === type);
}

function collectText(tree: React.ReactNode): string {
  const parts: string[] = [];
  const visit = (n: ReactNodeLike): void => {
    if (n == null || typeof n === 'boolean') return;
    if (typeof n === 'string' || typeof n === 'number') {
      parts.push(String(n));
      return;
    }
    if (Array.isArray(n)) {
      for (const c of n) visit(c as ReactNodeLike);
      return;
    }
    const el = n as React.ReactElement;
    visit((el.props as { children?: React.ReactNode } | undefined)?.children ?? null);
  };
  visit(tree);
  return parts.join(' ');
}

// ─── Fixtures ───────────────────────────────────────────────────────────────

const makeNode = (
  id: string,
  data: Record<string, unknown> = {},
  overrides: Partial<CardNode> = {},
): CardNode => ({
  id,
  type: 'block',
  position: { x: 0, y: 0 },
  width: 100,
  height: 100,
  data,
  ...overrides,
});

const makeEdge = (overrides: Partial<CardEdge> = {}): CardEdge => ({
  id: 'edge-1',
  source: 'src-1',
  target: 'tgt-1',
  data: {},
  ...overrides,
});

const makeCard = (overrides: Partial<Card> = {}): Card => ({
  id: 'card-1',
  name: 'Card 1',
  nodes: [
    makeNode('src-1', { iceType: 'Compute.Service', label: 'svc-src' }),
    makeNode('tgt-1', { iceType: 'Storage.Bucket', label: 'bkt-tgt' }),
  ],
  edges: [],
  viewport: { panX: 0, panY: 0, scale: 1 },
  createdAt: 0,
  ...overrides,
});

interface PropOnly<T> {
  (...args: any[]): T;
}

const renderSection = (
  edge: CardEdge = makeEdge(),
  card: Card = makeCard(),
): React.ReactElement => {
  return EdgePropertiesSection({
    selectedEdge: edge,
    activeCard: card,
  }) as React.ReactElement;
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('EdgePropertiesSection', () => {
  beforeEach(() => {
    // Reset call history without clobbering subsequent mockReturnValue() calls
    // — those are per-test overrides set before the renderSection invocation.
    mocks.dispatchSpy.mockClear();
    mocks.updateCardEdgeDataSpy.mockClear();
    mocks.deleteCardEdgeSpy.mockClear();
    mocks.updateCardNodeDataSpy.mockClear();
    mocks.toggleProperties.mockClear();
    mocks.computeEdgeWarningsSpy.mockClear();
    mocks.normalizeSubdomainSpy.mockClear();
    mocks.validateSubdomainSpy.mockClear();
    mocks.MockSection.mockClear();
    mocks.MockTextField.mockClear();
    mocks.MockPanelHeader.mockClear();
    mocks.cnSpy.mockClear();
    // Default behaviors. Per-test overrides via mockReturnValueOnce or
    // mockReturnValue happen AFTER beforeEach but BEFORE renderSection().
    mocks.computeEdgeWarningsSpy.mockReturnValue([]);
    mocks.validateSubdomainSpy.mockReturnValue(null);
    mocks.normalizeSubdomainSpy.mockImplementation((s: string) => s);
  });

  // ── Header ────────────────────────────────────────────────────────────────

  it('renders PanelHeader with title + close action that dispatches toggleProperties', () => {
    const tree = renderSection();
    const headers = findByType(tree, mocks.MockPanelHeader);
    expect(headers).toHaveLength(1);
    const props = headers[0].props as {
      title: string;
      onClose: () => void;
      closeLabel: string;
    };
    expect(props.title).toBe('t:properties.title');
    expect(props.closeLabel).toBe('t:properties.closeTitle');
    // Calling onClose dispatches toggleProperties.
    props.onClose();
    expect(mocks.toggleProperties).toHaveBeenCalledTimes(1);
    expect(mocks.dispatchSpy).toHaveBeenCalledWith({ type: 'ui/toggleProperties' });
  });

  // ── Source / target visual ────────────────────────────────────────────────

  it('resolves source/target labels from node.data.label', () => {
    const card = makeCard({
      nodes: [
        makeNode('src-1', { iceType: 'Compute.Service', label: 'My Service' }),
        makeNode('tgt-1', { iceType: 'Storage.Bucket', label: 'My Bucket' }),
      ],
    });
    const tree = renderSection(makeEdge(), card);
    const text = collectText(tree);
    expect(text).toContain('My Service');
    expect(text).toContain('My Bucket');
  });

  it('falls back to source/target node id when label is absent', () => {
    const card = makeCard({
      nodes: [
        makeNode('src-1', { iceType: 'Compute.Service' }), // no label
        makeNode('tgt-1', { iceType: 'Storage.Bucket' }), // no label
      ],
    });
    const tree = renderSection(makeEdge(), card);
    const text = collectText(tree);
    expect(text).toContain('src-1');
    expect(text).toContain('tgt-1');
  });

  it('renders the iceType suffix below each label', () => {
    const tree = renderSection();
    const text = collectText(tree);
    // Compute.Service.split('.').pop() === 'Service'
    expect(text).toContain('Service');
    expect(text).toContain('Bucket');
  });

  it('falls back to "node" suffix when iceType is missing', () => {
    const card = makeCard({
      nodes: [
        makeNode('src-1', {}),
        makeNode('tgt-1', {}),
      ],
    });
    const tree = renderSection(makeEdge(), card);
    const text = collectText(tree);
    // "node" appears twice — once for each side.
    expect(text.match(/node/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('renders connectionCategory in the middle when edge.data.connectionCategory is set', () => {
    const tree = renderSection(
      makeEdge({ data: { connectionCategory: 'reads-from' } }),
    );
    const text = collectText(tree);
    expect(text).toContain('reads-from');
  });

  it('renders relationship (with _ → space) when no connectionCategory', () => {
    const tree = renderSection(
      makeEdge({ data: { relationship: 'depends_on' } }),
    );
    const text = collectText(tree);
    expect(text).toContain('depends on');
  });

  it('connectionCategory wins over relationship when both are set', () => {
    const tree = renderSection(
      makeEdge({
        data: { connectionCategory: 'cat-A', relationship: 'rel_B' },
      }),
    );
    const text = collectText(tree);
    expect(text).toContain('cat-A');
    expect(text).not.toContain('rel B');
  });

  // ── Warnings ─────────────────────────────────────────────────────────────

  it('renders no warning block when computeEdgeWarnings returns empty', () => {
    mocks.computeEdgeWarningsSpy.mockReturnValue([]);
    const tree = renderSection();
    const text = collectText(tree);
    // Sanity: no warning suggestion text leaks through.
    expect(text).not.toContain('warn-msg');
  });

  it('renders a warning block per entry when computeEdgeWarnings returns entries', () => {
    mocks.computeEdgeWarningsSpy.mockReturnValue([
      { level: 'warning', message: 'warn-msg-1', suggestion: 'suggest-1' },
      { level: 'warning', message: 'warn-msg-2' },
    ]);
    const tree = renderSection();
    const text = collectText(tree);
    expect(text).toContain('warn-msg-1');
    expect(text).toContain('suggest-1');
    expect(text).toContain('warn-msg-2');
  });

  it('passes (srcIceType, tgtIceType, t) to computeEdgeWarnings', () => {
    renderSection();
    expect(mocks.computeEdgeWarningsSpy).toHaveBeenCalledTimes(1);
    const args = mocks.computeEdgeWarningsSpy.mock.calls[0];
    expect(args[0]).toBe('Compute.Service');
    expect(args[1]).toBe('Storage.Bucket');
    // Third arg is the imported `t` function — it's the mocked echoer.
    expect(typeof args[2]).toBe('function');
    expect((args[2] as (k: string) => string)('foo')).toBe('t:foo');
  });

  // ── Subdomain field (CustomDomain / PublicEndpoint edges) ─────────────────

  it('does NOT render the subdomain editor when neither end is a Network endpoint', () => {
    const tree = renderSection();
    // The subdomain editor's <label> string is the literal "Subdomain".
    const labels = findByPredicate(
      tree,
      (el) => el.type === 'label' && (el.props as any).children === 'Subdomain',
    );
    expect(labels).toHaveLength(0);
  });

  it('renders the subdomain editor when source is Network.PublicEndpoint', () => {
    const card = makeCard({
      nodes: [
        makeNode('src-1', { iceType: 'Network.PublicEndpoint', domain: 'example.com' }),
        makeNode('tgt-1', { iceType: 'Compute.Service' }),
      ],
    });
    const tree = renderSection(makeEdge(), card);
    const labels = findByPredicate(
      tree,
      (el) => el.type === 'label' && (el.props as any).children === 'Subdomain',
    );
    expect(labels).toHaveLength(1);
  });

  it('renders the subdomain editor when target is Network.CustomDomain', () => {
    const card = makeCard({
      nodes: [
        makeNode('src-1', { iceType: 'Compute.Service' }),
        makeNode('tgt-1', { iceType: 'Network.CustomDomain', domain: 'example.com' }),
      ],
    });
    const tree = renderSection(makeEdge(), card);
    const labels = findByPredicate(
      tree,
      (el) => el.type === 'label' && (el.props as any).children === 'Subdomain',
    );
    expect(labels).toHaveLength(1);
  });

  it('subdomain edit normalizes via normalizeSubdomain and dispatches updateCardEdgeData', () => {
    const card = makeCard({
      nodes: [
        makeNode('src-1', { iceType: 'Network.CustomDomain', domain: 'example.com' }),
        makeNode('tgt-1', { iceType: 'Compute.Service' }),
      ],
    });
    mocks.normalizeSubdomainSpy.mockReturnValueOnce('api');
    const tree = renderSection(
      makeEdge({ data: { subdomain: '' } }),
      card,
    );
    // Find the subdomain <input> inside the JSX (the only <input type="text">
    // before the port row, which only exists with envNode coupling).
    const inputs = findByType(tree, 'input').filter(
      (el) => (el.props as any).type === 'text',
    );
    expect(inputs.length).toBeGreaterThanOrEqual(1);
    // Trigger onChange with an arbitrary string — the normalize spy returns 'api'.
    (inputs[0].props as any).onChange({ target: { value: 'API!!!' } });
    expect(mocks.normalizeSubdomainSpy).toHaveBeenCalledWith('API!!!');
    expect(mocks.dispatchSpy).toHaveBeenCalledWith({
      type: 'cards/updateCardEdgeData',
      payload: { edgeId: 'edge-1', data: { subdomain: 'api' } },
    });
  });

  it('subdomain edit dispatches null when normalizeSubdomain returns empty', () => {
    const card = makeCard({
      nodes: [
        makeNode('src-1', { iceType: 'Network.CustomDomain', domain: 'example.com' }),
        makeNode('tgt-1', { iceType: 'Compute.Service' }),
      ],
    });
    mocks.normalizeSubdomainSpy.mockReturnValueOnce('');
    const tree = renderSection(
      makeEdge({ data: { subdomain: 'api' } }),
      card,
    );
    const inputs = findByType(tree, 'input').filter(
      (el) => (el.props as any).type === 'text',
    );
    (inputs[0].props as any).onChange({ target: { value: '!!!' } });
    expect(mocks.dispatchSpy).toHaveBeenCalledWith({
      type: 'cards/updateCardEdgeData',
      payload: { edgeId: 'edge-1', data: { subdomain: null } },
    });
  });

  it('renders the validation error in red when validateSubdomain returns a message', () => {
    mocks.validateSubdomainSpy.mockReturnValue('bad subdomain');
    const card = makeCard({
      nodes: [
        makeNode('src-1', { iceType: 'Network.CustomDomain', domain: 'example.com' }),
        makeNode('tgt-1', { iceType: 'Compute.Service' }),
      ],
    });
    const tree = renderSection(
      makeEdge({ data: { subdomain: '-bad-' } }),
      card,
    );
    const text = collectText(tree);
    expect(text).toContain('bad subdomain');
    // The previewHost arrow should NOT be present when there is a validation
    // error (the JSX is a ternary).
    expect(text).not.toContain('→ -bad-.example.com');
  });

  it('renders the previewHost when subdomain is set and validation passes', () => {
    mocks.validateSubdomainSpy.mockReturnValue(null);
    const card = makeCard({
      nodes: [
        makeNode('src-1', { iceType: 'Network.CustomDomain', domain: 'example.com' }),
        makeNode('tgt-1', { iceType: 'Compute.Service' }),
      ],
    });
    const tree = renderSection(
      makeEdge({ data: { subdomain: 'api' } }),
      card,
    );
    const text = collectText(tree);
    expect(text).toContain('api.example.com');
  });

  it('previewHost falls back to root domain when subdomain is empty', () => {
    const card = makeCard({
      nodes: [
        makeNode('src-1', { iceType: 'Network.CustomDomain', domain: 'example.com' }),
        makeNode('tgt-1', { iceType: 'Compute.Service' }),
      ],
    });
    const tree = renderSection(
      makeEdge({ data: { subdomain: '' } }),
      card,
    );
    const text = collectText(tree);
    expect(text).toContain('example.com');
    // Doesn't render `<empty>.example.com`.
    expect(text).not.toContain('.example.com.');
  });

  it('previewHost renders "(no domain set)" when neither subdomain nor rootDomain', () => {
    const card = makeCard({
      nodes: [
        makeNode('src-1', { iceType: 'Network.CustomDomain' }), // no domain
        makeNode('tgt-1', { iceType: 'Compute.Service' }),
      ],
    });
    const tree = renderSection(
      makeEdge({ data: { subdomain: '' } }),
      card,
    );
    const text = collectText(tree);
    expect(text).toContain('(no domain set)');
  });

  it('endpointNode resolves to the source side when source is the Network.* endpoint', () => {
    // Asserted via previewHost — the source's domain wins.
    const card = makeCard({
      nodes: [
        makeNode('src-1', { iceType: 'Network.PublicEndpoint', domain: 'src-side.com' }),
        makeNode('tgt-1', { iceType: 'Compute.Service', domain: 'tgt-side.com' }),
      ],
    });
    const tree = renderSection(
      makeEdge({ data: { subdomain: 'api' } }),
      card,
    );
    const text = collectText(tree);
    expect(text).toContain('api.src-side.com');
    expect(text).not.toContain('api.tgt-side.com');
  });

  it('endpointNode resolves to the target side when only target is the Network.* endpoint', () => {
    const card = makeCard({
      nodes: [
        makeNode('src-1', { iceType: 'Compute.Service', domain: 'src-side.com' }),
        makeNode('tgt-1', { iceType: 'Network.CustomDomain', domain: 'tgt-side.com' }),
      ],
    });
    const tree = renderSection(
      makeEdge({ data: { subdomain: 'api' } }),
      card,
    );
    const text = collectText(tree);
    expect(text).toContain('api.tgt-side.com');
    expect(text).not.toContain('api.src-side.com');
  });

  // ── Port — plain TextField (no env-var coupling) ──────────────────────────

  it('renders TextField for the port when no Config.Environment is connected', () => {
    const tree = renderSection(makeEdge({ data: { port: 5432 } }));
    const fields = findByType(tree, mocks.MockTextField);
    expect(fields).toHaveLength(1);
    const props = fields[0].props as {
      label: string;
      value: string;
      placeholder: string;
      onChange: (v: string) => void;
    };
    expect(props.label).toBe('t:properties.edge.portLabel');
    expect(props.value).toBe('5432');
    expect(props.placeholder).toBe('e.g. 5432');
  });

  it('renders empty value when port is unset', () => {
    const tree = renderSection(makeEdge({ data: {} }));
    const fields = findByType(tree, mocks.MockTextField);
    const props = fields[0].props as { value: string };
    expect(props.value).toBe('');
  });

  it('TextField onChange dispatches updateCardEdgeData with Number(v)', () => {
    const tree = renderSection(makeEdge({ data: {} }));
    const fields = findByType(tree, mocks.MockTextField);
    (fields[0].props as { onChange: (v: string) => void }).onChange('8080');
    expect(mocks.dispatchSpy).toHaveBeenCalledWith({
      type: 'cards/updateCardEdgeData',
      payload: { edgeId: 'edge-1', data: { port: 8080 } },
    });
  });

  it('TextField onChange dispatches null when value is empty string', () => {
    const tree = renderSection(makeEdge({ data: {} }));
    const fields = findByType(tree, mocks.MockTextField);
    (fields[0].props as { onChange: (v: string) => void }).onChange('');
    expect(mocks.dispatchSpy).toHaveBeenCalledWith({
      type: 'cards/updateCardEdgeData',
      payload: { edgeId: 'edge-1', data: { port: null } },
    });
  });

  // ── Port — env-var coupled select+input ──────────────────────────────────

  const envCouplingCard = (): Card =>
    makeCard({
      nodes: [
        makeNode('src-1', { iceType: 'Compute.Service' }),
        makeNode('tgt-1', { iceType: 'Storage.Bucket' }),
        makeNode('env-1', {
          iceType: 'Config.Environment',
          variables: [
            { name: 'PORT', value: '5432' },
            { name: 'DEBUG', value: 'true' },
          ],
        }),
      ],
      edges: [
        // env-1 is wired to src-1 (the edge's source).
        { id: 'e-env', source: 'env-1', target: 'src-1' },
      ],
    });

  it('switches to env-var coupled select+input when Config.Environment is wired to source', () => {
    const tree = renderSection(makeEdge({ data: { port: 5432 } }), envCouplingCard());
    // No TextField when coupled.
    expect(findByType(tree, mocks.MockTextField)).toHaveLength(0);
    // Native <select> appears.
    const selects = findByType(tree, 'select');
    expect(selects).toHaveLength(1);
    // Options: empty (custom) + 2 vars = 3.
    const options = findByType(tree, 'option');
    expect(options).toHaveLength(3);
    expect((options[0].props as any).value).toBe('');
    expect((options[1].props as any).value).toBe('PORT');
    expect((options[2].props as any).value).toBe('DEBUG');
  });

  it('env-var picker onChange dispatches envVarName + auto-syncs port to numeric value', () => {
    const tree = renderSection(
      makeEdge({ data: {} }),
      envCouplingCard(),
    );
    const select = findByType(tree, 'select')[0];
    (select.props as any).onChange({ target: { value: 'PORT' } });
    // First call sets envVarName.
    expect(mocks.dispatchSpy).toHaveBeenNthCalledWith(1, {
      type: 'cards/updateCardEdgeData',
      payload: { edgeId: 'edge-1', data: { envVarName: 'PORT' } },
    });
    // Second call auto-sets port from PORT="5432".
    expect(mocks.dispatchSpy).toHaveBeenNthCalledWith(2, {
      type: 'cards/updateCardEdgeData',
      payload: { edgeId: 'edge-1', data: { port: 5432 } },
    });
  });

  it('env-var picker does NOT auto-sync port when var value is non-numeric', () => {
    const tree = renderSection(
      makeEdge({ data: {} }),
      envCouplingCard(),
    );
    const select = findByType(tree, 'select')[0];
    (select.props as any).onChange({ target: { value: 'DEBUG' } });
    // Only the envVarName dispatch.
    expect(mocks.dispatchSpy).toHaveBeenCalledTimes(1);
    expect(mocks.dispatchSpy).toHaveBeenCalledWith({
      type: 'cards/updateCardEdgeData',
      payload: { edgeId: 'edge-1', data: { envVarName: 'DEBUG' } },
    });
  });

  it('env-var picker → empty value dispatches envVarName=null and skips auto-port', () => {
    const tree = renderSection(
      makeEdge({ data: {} }),
      envCouplingCard(),
    );
    const select = findByType(tree, 'select')[0];
    (select.props as any).onChange({ target: { value: '' } });
    expect(mocks.dispatchSpy).toHaveBeenCalledTimes(1);
    expect(mocks.dispatchSpy).toHaveBeenCalledWith({
      type: 'cards/updateCardEdgeData',
      payload: { edgeId: 'edge-1', data: { envVarName: null } },
    });
  });

  it('env-var port input onChange sets port AND syncs the env-var value back via updateCardNodeData', () => {
    const tree = renderSection(
      makeEdge({ data: { envVarName: 'PORT', port: 5432 } }),
      envCouplingCard(),
    );
    // The port <input> sits next to the <select>; it has placeholder "5432".
    const inputs = findByType(tree, 'input').filter(
      (el) => (el.props as any).placeholder === '5432',
    );
    expect(inputs).toHaveLength(1);
    (inputs[0].props as any).onChange({ target: { value: '8080' } });
    // First dispatch: port update.
    expect(mocks.dispatchSpy).toHaveBeenNthCalledWith(1, {
      type: 'cards/updateCardEdgeData',
      payload: { edgeId: 'edge-1', data: { port: 8080 } },
    });
    // Second dispatch: env-var sync — PORT becomes "8080".
    expect(mocks.dispatchSpy).toHaveBeenNthCalledWith(2, {
      type: 'cards/updateCardNodeData',
      payload: {
        nodeId: 'env-1',
        data: {
          variables: [
            { name: 'PORT', value: '8080' },
            { name: 'DEBUG', value: 'true' },
          ],
        },
      },
    });
  });

  it('env-var port input onChange clears port to null when input is empty', () => {
    const tree = renderSection(
      makeEdge({ data: { envVarName: 'PORT', port: 5432 } }),
      envCouplingCard(),
    );
    const inputs = findByType(tree, 'input').filter(
      (el) => (el.props as any).placeholder === '5432',
    );
    (inputs[0].props as any).onChange({ target: { value: '' } });
    // Port → null.
    expect(mocks.dispatchSpy).toHaveBeenNthCalledWith(1, {
      type: 'cards/updateCardEdgeData',
      payload: { edgeId: 'edge-1', data: { port: null } },
    });
  });

  it('env-var port input onChange does NOT sync env-var when no envVarName is set', () => {
    // edgeData has no envVarName — the sync branch should skip.
    const tree = renderSection(
      makeEdge({ data: {} }),
      envCouplingCard(),
    );
    const inputs = findByType(tree, 'input').filter(
      (el) => (el.props as any).placeholder === '5432',
    );
    (inputs[0].props as any).onChange({ target: { value: '8080' } });
    // Only the port update; no updateCardNodeData dispatch.
    expect(mocks.dispatchSpy).toHaveBeenCalledTimes(1);
    expect(mocks.updateCardNodeDataSpy).not.toHaveBeenCalled();
  });

  it('env-var coupling also fires when env node is wired in the reverse direction (env → src or src → env)', () => {
    // Edge case: the iceType-detection uses .some over (e.source === sourceId
    // && e.target === envId) || the reverse — verify the reverse direction
    // also triggers env coupling.
    const card = makeCard({
      nodes: [
        makeNode('src-1', { iceType: 'Compute.Service' }),
        makeNode('tgt-1', { iceType: 'Storage.Bucket' }),
        makeNode('env-1', {
          iceType: 'Config.Environment',
          variables: [{ name: 'PORT', value: '5432' }],
        }),
      ],
      edges: [
        // src-1 → env-1 (reverse of envCouplingCard).
        { id: 'e-env', source: 'src-1', target: 'env-1' },
      ],
    });
    const tree = renderSection(makeEdge({ data: {} }), card);
    expect(findByType(tree, 'select')).toHaveLength(1);
  });

  // ── Delete edge button ───────────────────────────────────────────────────

  it('renders the delete-edge button with the i18n label', () => {
    const tree = renderSection();
    const buttons = findByType(tree, 'button');
    expect(buttons).toHaveLength(1);
    const text = (buttons[0].props as any).children;
    expect(text).toBe('t:properties.edge.deleteButton');
  });

  it('delete-edge button onClick dispatches deleteCardEdge(selectedEdge.id)', () => {
    const tree = renderSection(makeEdge({ id: 'edge-XYZ' }));
    const buttons = findByType(tree, 'button');
    (buttons[0].props as any).onClick();
    expect(mocks.deleteCardEdgeSpy).toHaveBeenCalledTimes(1);
    expect(mocks.deleteCardEdgeSpy).toHaveBeenCalledWith('edge-XYZ');
    expect(mocks.dispatchSpy).toHaveBeenCalledWith({
      type: 'cards/deleteCardEdge',
      payload: 'edge-XYZ',
    });
  });

  // ── Properties section wrapper ───────────────────────────────────────────

  it('wraps the per-field controls in a single Section with the propertiesSection title', () => {
    const tree = renderSection();
    const sections = findByType(tree, mocks.MockSection);
    expect(sections).toHaveLength(1);
    expect((sections[0].props as any).title).toBe('t:properties.edge.propertiesSection');
  });

  // ── Edge-case branches ──────────────────────────────────────────────────

  it('handles edge with no data at all (data === undefined defaults to {})', () => {
    // Provide an edge with `data: undefined` — the source code uses
    // `selectedEdge.data || {}` for the fallback. This covers the falsy branch.
    const edge = makeEdge();
    delete (edge as { data?: unknown }).data;
    const tree = renderSection(edge);
    // No subdomain/port-coupling controls; just the plain TextField + delete.
    expect(findByType(tree, mocks.MockTextField)).toHaveLength(1);
  });

  it('relationship _ replacement still runs for an empty-string relationship', () => {
    // `(edgeData.relationship as string) || ''` — if relationship is the
    // empty string, the fallback '' is used; the outer `||` chains it to
    // the connectionCategory (also undefined/empty here), so the wrapping
    // span isn't rendered at all. This covers the empty-string branch of
    // the relationship fallback.
    const tree = renderSection(
      makeEdge({ data: { relationship: '' } }),
    );
    // No rendered relationship pill — the outer guard hides the span.
    const text = collectText(tree);
    // Ensure we still rendered the rest of the panel (sanity check).
    expect(text).toContain('t:properties.edge.deleteButton');
  });

  it('env-var port input does NOT sync env-var when current envVarName matches no variable', () => {
    // Source's findIndex returns -1 — the inner `if (idx !== -1)` branch
    // skips the dispatch. Verify no updateCardNodeData call occurs.
    const card = makeCard({
      nodes: [
        makeNode('src-1', { iceType: 'Compute.Service' }),
        makeNode('tgt-1', { iceType: 'Storage.Bucket' }),
        makeNode('env-1', {
          iceType: 'Config.Environment',
          variables: [{ name: 'OTHER_VAR', value: '5432' }],
        }),
      ],
      edges: [{ id: 'e-env', source: 'env-1', target: 'src-1' }],
    });
    const tree = renderSection(
      makeEdge({ data: { envVarName: 'NONEXISTENT', port: 5432 } }),
      card,
    );
    const inputs = findByType(tree, 'input').filter(
      (el) => (el.props as any).placeholder === '5432',
    );
    (inputs[0].props as any).onChange({ target: { value: '8080' } });
    // Port update fires.
    expect(mocks.dispatchSpy).toHaveBeenCalledWith({
      type: 'cards/updateCardEdgeData',
      payload: { edgeId: 'edge-1', data: { port: 8080 } },
    });
    // But NO node-data sync.
    expect(mocks.updateCardNodeDataSpy).not.toHaveBeenCalled();
  });
});
