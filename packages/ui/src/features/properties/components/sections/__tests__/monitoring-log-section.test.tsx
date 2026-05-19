/**
 * MonitoringLogSection — properties-panel section for Monitoring.Log blocks.
 *
 * `MonitoringLogSection` reads from BOTH `cards-slice` (for `node.data`) AND
 * `logs-slice` (for the live stream status), and writes to `cards-slice` only.
 * No `useState`, no `useEffect`, no hooks beyond `useDispatch`/`useSelector`.
 * That means tests can call the component as a plain function and walk the
 * returned element tree directly — no need for the queued-ref `useState`
 * dispatcher pattern used by the sibling sections.
 *
 * Behavior surfaces under test:
 *  - early return null when the node is not in the active card.
 *  - status pill mapping for every `LogStreamStatus` (idle/streaming/connecting
 *    /pre-deploy/no-source/ambiguous/unsupported/permission-denied/error/default).
 *  - caveats render verbatim from the resolved `SourceResolution`.
 *  - inline error message only on error/permission-denied with `lastError`.
 *  - streaming-mode radio reflects `node.data.streamingMode`, defaults to
 *    'polling'; clicking dispatches `updateCardNodeData`.
 *  - source-override block visibility (only when ambiguous|none).
 *  - candidates from `streamState.source.candidates` (ambiguous) vs derived
 *    from inbound edges (none). Label fallback chain: candidate.label →
 *    activeCard node label → nodeId slice. Inbound filtering excludes
 *    non-supported iceTypes and missing nodes.
 *  - clear-override sentinel mapping bidirectional.
 *
 * Direct-FC tree-walker pattern (cite
 * `tree-walker-for-react-fc-tests-must-flatten-nested-children-arrays`,
 * `vi-hoisted-for-stable-mock-identity-in-direct-fc-tree-walker-tests`):
 * invoke the FC as a function, mock react-redux so `useSelector` runs
 * against a synthetic state slice, walk the returned tree.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  dispatchSpy: vi.fn(),
  state: {
    cards: {
      cards: [] as Array<{
        id: string;
        nodes: Array<{ id: string; type?: string; data?: Record<string, unknown> }>;
        edges: Array<{ source: string; target: string }>;
      }>,
      activeCardId: 'card-1',
    },
    logs: {
      byTerminalNodeId: {} as Record<string, unknown>,
    },
  },
  updateCardNodeDataSpy: vi.fn((arg: { nodeId: string; data: Record<string, unknown> }) => ({
    type: 'cards/updateCardNodeData',
    payload: arg,
  })),
}));

vi.mock('react-redux', () => ({
  useDispatch: () => mocks.dispatchSpy,
  useSelector: (selector: (s: typeof mocks.state) => unknown) => selector(mocks.state),
}));

// The component uses `selectActiveCard` and `updateCardNodeData` from cards-slice.
// We re-export the real selector signature; updateCardNodeData is a tagged-action spy
// so dispatch arguments are verifiable.
vi.mock('../../../../../store/slices/cards-slice', () => ({
  selectActiveCard: (state: typeof mocks.state) => state.cards.cards.find((c) => c.id === state.cards.activeCardId),
  updateCardNodeData: mocks.updateCardNodeDataSpy,
}));

// `selectLogStream` looks up by terminalNodeId on the byTerminalNodeId map.
vi.mock('../../../../../store/slices/logs-slice', () => ({
  selectLogStream: (state: typeof mocks.state, terminalNodeId: string) => state.logs.byTerminalNodeId[terminalNodeId],
}));

import { MonitoringLogSection } from '../monitoring-log-section';

// ─── Tree-walker (rf-props-6 standard shape) ────────────────────────────────

type ReactNodeLike = React.ReactNode;

function* walk(node: ReactNodeLike): Generator<React.ReactElement> {
  if (node == null || typeof node === 'boolean' || typeof node === 'string' || typeof node === 'number') {
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

function findByPredicate(tree: React.ReactNode, predicate: (el: React.ReactElement) => boolean): React.ReactElement[] {
  const out: React.ReactElement[] = [];
  for (const el of walk(tree)) {
    if (el && predicate(el)) out.push(el);
  }
  return out;
}

function findByTestid(tree: React.ReactNode, testid: string): React.ReactElement | undefined {
  return findByPredicate(tree, (el) => (el.props as { ['data-testid']?: string })?.['data-testid'] === testid)[0];
}

function findAllByTestid(tree: React.ReactNode, testid: string): React.ReactElement[] {
  return findByPredicate(tree, (el) => (el.props as { ['data-testid']?: string })?.['data-testid'] === testid);
}

// ─── Props/rendering helpers ────────────────────────────────────────────────

interface RadioProps {
  type: string;
  name?: string;
  value: string;
  checked?: boolean;
  onChange: () => void;
}

interface SelectProps {
  value: string;
  onChange: (e: { target: { value: string } }) => void;
}

interface OptionProps {
  value: string;
  children?: React.ReactNode;
}

const renderSection = (nodeId: string = 'log-1'): React.ReactElement | null => {
  mocks.dispatchSpy.mockClear();
  mocks.updateCardNodeDataSpy.mockClear();
  return MonitoringLogSection({ nodeId }) as React.ReactElement | null;
};

// Helper to seed a default Monitoring.Log node + cards-slice shape.
const seedLogNode = (
  data: Record<string, unknown> = {},
  extraNodes: Array<{
    id: string;
    type?: string;
    data?: Record<string, unknown>;
  }> = [],
  edges: Array<{ source: string; target: string }> = [],
): void => {
  mocks.state.cards.cards = [
    {
      id: 'card-1',
      nodes: [{ id: 'log-1', type: 'resource', data: { iceType: 'Monitoring.Log', ...data } }, ...extraNodes],
      edges,
    },
  ];
  mocks.state.cards.activeCardId = 'card-1';
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('MonitoringLogSection', () => {
  beforeEach(() => {
    mocks.state.cards.cards = [];
    mocks.state.cards.activeCardId = 'card-1';
    mocks.state.logs.byTerminalNodeId = {};
  });

  // ── Early return ─────────────────────────────────────────────────────────

  describe('early return when node is missing', () => {
    it('returns null when the active card has no matching nodeId', () => {
      seedLogNode();
      const tree = renderSection('not-a-real-node');
      expect(tree).toBeNull();
    });

    it('returns null when there is no active card', () => {
      mocks.state.cards.cards = [];
      mocks.state.cards.activeCardId = null as unknown as string;
      const tree = renderSection('log-1');
      expect(tree).toBeNull();
    });

    it('renders a section element when the node is found', () => {
      seedLogNode();
      const tree = renderSection('log-1');
      expect(tree).not.toBeNull();
      expect(findByTestid(tree, 'monitoring-log-section')).toBeDefined();
    });
  });

  // ── Status pill mapping ──────────────────────────────────────────────────

  describe('status pill mapping', () => {
    const cases: Array<[string | undefined, string, string]> = [
      ['streaming', 'green', 'Live'],
      ['connecting', 'amber', 'Connecting'],
      ['pre-deploy', 'grey', 'Pre-deploy'],
      ['no-source', 'grey', 'No source'],
      ['ambiguous', 'grey', 'Ambiguous source'],
      ['unsupported', 'grey', 'Unsupported source'],
      ['permission-denied', 'red', 'Access denied'],
      ['error', 'red', 'Error'],
      ['idle', 'grey', 'Idle'],
    ];

    for (const [status, expectedTone, expectedLabel] of cases) {
      it(`maps status='${status}' → tone='${expectedTone}' label='${expectedLabel}'`, () => {
        seedLogNode();
        mocks.state.logs.byTerminalNodeId['log-1'] = {
          status,
          mode: 'polling',
          source: null,
          entries: [],
          lastError: null,
        };
        const tree = renderSection('log-1');
        const pill = findByTestid(tree, 'monitoring-log-status-pill');
        expect(pill).toBeDefined();
        expect((pill!.props as { ['data-pill-tone']?: string })['data-pill-tone']).toBe(expectedTone);
        // The label is the second child after the dot indicator span — search
        // for any direct text node equal to expectedLabel inside the pill.
        const texts: string[] = [];
        const visit = (n: React.ReactNode): void => {
          if (n == null || typeof n === 'boolean') return;
          if (typeof n === 'string' || typeof n === 'number') {
            texts.push(String(n));
            return;
          }
          if (Array.isArray(n)) {
            for (const c of n) visit(c as React.ReactNode);
            return;
          }
          const el = n as React.ReactElement;
          visit((el.props as { children?: React.ReactNode } | undefined)?.children ?? null);
        };
        visit(pill!);
        expect(texts.join(' ')).toContain(expectedLabel);
      });
    }

    it("falls back to 'Idle' / grey when streamState is undefined", () => {
      seedLogNode();
      // No state seeded for log-1.
      const tree = renderSection('log-1');
      const pill = findByTestid(tree, 'monitoring-log-status-pill');
      expect(pill).toBeDefined();
      expect((pill!.props as { ['data-pill-tone']?: string })['data-pill-tone']).toBe('grey');
    });

    it('falls back to grey when status is an unknown value (default branch)', () => {
      seedLogNode();
      mocks.state.logs.byTerminalNodeId['log-1'] = {
        status: 'something-weird',
        mode: 'polling',
        source: null,
        entries: [],
        lastError: null,
      };
      const tree = renderSection('log-1');
      const pill = findByTestid(tree, 'monitoring-log-status-pill');
      expect((pill!.props as { ['data-pill-tone']?: string })['data-pill-tone']).toBe('grey');
    });
  });

  describe('pill dot indicator className branches', () => {
    it("green tone uses 'bg-emerald-400'", () => {
      seedLogNode();
      mocks.state.logs.byTerminalNodeId['log-1'] = {
        status: 'streaming',
        mode: 'polling',
        source: null,
        entries: [],
        lastError: null,
      };
      const tree = renderSection('log-1');
      const dot = findByPredicate(
        tree,
        (el) =>
          el.type === 'span' &&
          typeof (el.props as { className?: string }).className === 'string' &&
          (el.props as { className: string }).className.includes('bg-emerald-400'),
      );
      expect(dot.length).toBeGreaterThan(0);
    });

    it("amber tone uses 'bg-amber-400 animate-pulse'", () => {
      seedLogNode();
      mocks.state.logs.byTerminalNodeId['log-1'] = {
        status: 'connecting',
        mode: 'polling',
        source: null,
        entries: [],
        lastError: null,
      };
      const tree = renderSection('log-1');
      const dot = findByPredicate(
        tree,
        (el) =>
          el.type === 'span' &&
          typeof (el.props as { className?: string }).className === 'string' &&
          (el.props as { className: string }).className.includes('bg-amber-400'),
      );
      expect(dot.length).toBeGreaterThan(0);
    });

    it("red tone uses 'bg-red-400'", () => {
      seedLogNode();
      mocks.state.logs.byTerminalNodeId['log-1'] = {
        status: 'error',
        mode: 'polling',
        source: null,
        entries: [],
        lastError: null,
      };
      const tree = renderSection('log-1');
      const dot = findByPredicate(
        tree,
        (el) =>
          el.type === 'span' &&
          typeof (el.props as { className?: string }).className === 'string' &&
          (el.props as { className: string }).className.includes('bg-red-400'),
      );
      expect(dot.length).toBeGreaterThan(0);
    });

    it("grey/default tone uses 'bg-ice-text-3/50'", () => {
      seedLogNode();
      // Idle → grey path
      mocks.state.logs.byTerminalNodeId['log-1'] = {
        status: 'idle',
        mode: 'polling',
        source: null,
        entries: [],
        lastError: null,
      };
      const tree = renderSection('log-1');
      const dot = findByPredicate(
        tree,
        (el) =>
          el.type === 'span' &&
          typeof (el.props as { className?: string }).className === 'string' &&
          (el.props as { className: string }).className.includes('bg-ice-text-3/50'),
      );
      expect(dot.length).toBeGreaterThan(0);
    });
  });

  // ── Caveats ──────────────────────────────────────────────────────────────

  describe('resolver caveats', () => {
    it('renders caveats verbatim under the pill on resolved + caveats present', () => {
      seedLogNode();
      mocks.state.logs.byTerminalNodeId['log-1'] = {
        status: 'streaming',
        mode: 'polling',
        source: {
          state: 'resolved',
          sourceNodeId: 'svc-1',
          iceType: 'Compute.Container',
          caveats: ['First caveat', 'Second caveat'],
        },
        entries: [],
        lastError: null,
      };
      const tree = renderSection('log-1');
      const caveats = findAllByTestid(tree, 'monitoring-log-caveat');
      expect(caveats).toHaveLength(2);
      const texts = caveats.map((p) => (p.props as { children?: string }).children ?? '');
      expect(texts).toEqual(['First caveat', 'Second caveat']);
    });

    it('renders no caveats when source state is resolved without caveats', () => {
      seedLogNode();
      mocks.state.logs.byTerminalNodeId['log-1'] = {
        status: 'streaming',
        mode: 'polling',
        source: {
          state: 'resolved',
          sourceNodeId: 'svc-1',
          iceType: 'Compute.Container',
        },
        entries: [],
        lastError: null,
      };
      const tree = renderSection('log-1');
      expect(findAllByTestid(tree, 'monitoring-log-caveat')).toHaveLength(0);
    });

    it('renders no caveats when the caveats array exists but is empty', () => {
      seedLogNode();
      mocks.state.logs.byTerminalNodeId['log-1'] = {
        status: 'streaming',
        mode: 'polling',
        source: {
          state: 'resolved',
          sourceNodeId: 'svc-1',
          iceType: 'Compute.Container',
          caveats: [],
        },
        entries: [],
        lastError: null,
      };
      const tree = renderSection('log-1');
      expect(findAllByTestid(tree, 'monitoring-log-caveat')).toHaveLength(0);
    });

    it('renders no caveats when source is not resolved (e.g. ambiguous)', () => {
      seedLogNode();
      mocks.state.logs.byTerminalNodeId['log-1'] = {
        status: 'ambiguous',
        mode: 'polling',
        source: { state: 'ambiguous', candidates: [] },
        entries: [],
        lastError: null,
      };
      const tree = renderSection('log-1');
      expect(findAllByTestid(tree, 'monitoring-log-caveat')).toHaveLength(0);
    });

    it('renders no caveats when source is null', () => {
      seedLogNode();
      mocks.state.logs.byTerminalNodeId['log-1'] = {
        status: 'idle',
        mode: 'polling',
        source: null,
        entries: [],
        lastError: null,
      };
      const tree = renderSection('log-1');
      expect(findAllByTestid(tree, 'monitoring-log-caveat')).toHaveLength(0);
    });

    it('renders no caveats when streamState itself is undefined', () => {
      seedLogNode();
      const tree = renderSection('log-1');
      expect(findAllByTestid(tree, 'monitoring-log-caveat')).toHaveLength(0);
    });
  });

  // ── Inline error ─────────────────────────────────────────────────────────

  describe('inline error message', () => {
    it('renders the error message on status=error with a non-empty lastError', () => {
      seedLogNode();
      mocks.state.logs.byTerminalNodeId['log-1'] = {
        status: 'error',
        mode: 'polling',
        source: null,
        entries: [],
        lastError: 'connection refused',
      };
      const tree = renderSection('log-1');
      const err = findByTestid(tree, 'monitoring-log-error');
      expect(err).toBeDefined();
      expect((err!.props as { children?: string }).children).toBe('connection refused');
    });

    it('renders the error message on status=permission-denied with a non-empty lastError', () => {
      seedLogNode();
      mocks.state.logs.byTerminalNodeId['log-1'] = {
        status: 'permission-denied',
        mode: 'polling',
        source: null,
        entries: [],
        lastError: 'logging.entries.list denied',
      };
      const tree = renderSection('log-1');
      const err = findByTestid(tree, 'monitoring-log-error');
      expect(err).toBeDefined();
      expect((err!.props as { children?: string }).children).toBe('logging.entries.list denied');
    });

    it('does NOT render the error message on status=streaming', () => {
      seedLogNode();
      mocks.state.logs.byTerminalNodeId['log-1'] = {
        status: 'streaming',
        mode: 'polling',
        source: null,
        entries: [],
        lastError: 'leftover error',
      };
      const tree = renderSection('log-1');
      expect(findByTestid(tree, 'monitoring-log-error')).toBeUndefined();
    });

    it('does NOT render the error message when lastError is null', () => {
      seedLogNode();
      mocks.state.logs.byTerminalNodeId['log-1'] = {
        status: 'error',
        mode: 'polling',
        source: null,
        entries: [],
        lastError: null,
      };
      const tree = renderSection('log-1');
      expect(findByTestid(tree, 'monitoring-log-error')).toBeUndefined();
    });

    it('does NOT render the error message when lastError is empty string', () => {
      seedLogNode();
      mocks.state.logs.byTerminalNodeId['log-1'] = {
        status: 'error',
        mode: 'polling',
        source: null,
        entries: [],
        lastError: '',
      };
      const tree = renderSection('log-1');
      expect(findByTestid(tree, 'monitoring-log-error')).toBeUndefined();
    });
  });

  // ── Streaming-mode radios ────────────────────────────────────────────────

  describe('streaming-mode radio', () => {
    it("defaults checked='polling' when node.data.streamingMode is undefined", () => {
      seedLogNode();
      const tree = renderSection('log-1');
      const polling = findByTestid(tree, 'monitoring-log-mode-polling');
      const pollingInput = findByPredicate(polling!, (el) => el.type === 'input')[0];
      const tail = findByTestid(tree, 'monitoring-log-mode-tail');
      const tailInput = findByPredicate(tail!, (el) => el.type === 'input')[0];
      expect((pollingInput.props as RadioProps).checked).toBe(true);
      expect((tailInput.props as RadioProps).checked).toBe(false);
    });

    it('reflects streamingMode=tail from node.data', () => {
      seedLogNode({ streamingMode: 'tail' });
      const tree = renderSection('log-1');
      const polling = findByTestid(tree, 'monitoring-log-mode-polling');
      const pollingInput = findByPredicate(polling!, (el) => el.type === 'input')[0];
      const tail = findByTestid(tree, 'monitoring-log-mode-tail');
      const tailInput = findByPredicate(tail!, (el) => el.type === 'input')[0];
      expect((pollingInput.props as RadioProps).checked).toBe(false);
      expect((tailInput.props as RadioProps).checked).toBe(true);
    });

    it("clicking 'polling' dispatches updateCardNodeData with streamingMode='polling'", () => {
      seedLogNode({ streamingMode: 'tail' });
      const tree = renderSection('log-1');
      const polling = findByTestid(tree, 'monitoring-log-mode-polling');
      const pollingInput = findByPredicate(polling!, (el) => el.type === 'input')[0];
      (pollingInput.props as RadioProps).onChange();
      expect(mocks.updateCardNodeDataSpy).toHaveBeenCalledTimes(1);
      expect(mocks.updateCardNodeDataSpy).toHaveBeenCalledWith({
        nodeId: 'log-1',
        data: { streamingMode: 'polling' },
      });
    });

    it("clicking 'tail' dispatches updateCardNodeData with streamingMode='tail'", () => {
      seedLogNode();
      const tree = renderSection('log-1');
      const tail = findByTestid(tree, 'monitoring-log-mode-tail');
      const tailInput = findByPredicate(tail!, (el) => el.type === 'input')[0];
      (tailInput.props as RadioProps).onChange();
      expect(mocks.updateCardNodeDataSpy).toHaveBeenCalledWith({
        nodeId: 'log-1',
        data: { streamingMode: 'tail' },
      });
    });

    it('radio inputs share name="monitoring-log-mode-{nodeId}" for grouping', () => {
      seedLogNode();
      const tree = renderSection('log-XYZ');
      // The render call uses log-XYZ but the seed wires log-1 — re-seed.
      mocks.state.cards.cards = [
        {
          id: 'card-1',
          nodes: [{ id: 'log-XYZ', type: 'resource', data: { iceType: 'Monitoring.Log' } }],
          edges: [],
        },
      ];
      const tree2 = renderSection('log-XYZ');
      const polling = findByTestid(tree2, 'monitoring-log-mode-polling');
      const tail = findByTestid(tree2, 'monitoring-log-mode-tail');
      const pollingInput = findByPredicate(polling!, (el) => el.type === 'input')[0];
      const tailInput = findByPredicate(tail!, (el) => el.type === 'input')[0];
      expect((pollingInput.props as RadioProps).name).toBe('monitoring-log-mode-log-XYZ');
      expect((tailInput.props as RadioProps).name).toBe('monitoring-log-mode-log-XYZ');
      expect(tree).toBeDefined();
    });
  });

  // ── Source override block visibility ────────────────────────────────────

  describe('source-override block visibility', () => {
    it('hidden when source state is resolved', () => {
      seedLogNode();
      mocks.state.logs.byTerminalNodeId['log-1'] = {
        status: 'streaming',
        mode: 'polling',
        source: {
          state: 'resolved',
          sourceNodeId: 'svc-1',
          iceType: 'Compute.Container',
        },
        entries: [],
        lastError: null,
      };
      const tree = renderSection('log-1');
      expect(findByTestid(tree, 'monitoring-log-source-override')).toBeUndefined();
    });

    it('hidden when source state is pre-deploy', () => {
      seedLogNode();
      mocks.state.logs.byTerminalNodeId['log-1'] = {
        status: 'pre-deploy',
        mode: 'polling',
        source: {
          state: 'pre-deploy',
          sourceNodeId: 'svc-1',
          iceType: 'Compute.Container',
        },
        entries: [],
        lastError: null,
      };
      const tree = renderSection('log-1');
      expect(findByTestid(tree, 'monitoring-log-source-override')).toBeUndefined();
    });

    it('hidden when streamState is undefined', () => {
      seedLogNode();
      const tree = renderSection('log-1');
      expect(findByTestid(tree, 'monitoring-log-source-override')).toBeUndefined();
    });

    it('visible when source state is ambiguous', () => {
      seedLogNode();
      mocks.state.logs.byTerminalNodeId['log-1'] = {
        status: 'ambiguous',
        mode: 'polling',
        source: { state: 'ambiguous', candidates: [] },
        entries: [],
        lastError: null,
      };
      const tree = renderSection('log-1');
      expect(findByTestid(tree, 'monitoring-log-source-override')).toBeDefined();
    });

    it('visible when source state is none', () => {
      seedLogNode();
      mocks.state.logs.byTerminalNodeId['log-1'] = {
        status: 'no-source',
        mode: 'polling',
        source: { state: 'none' },
        entries: [],
        lastError: null,
      };
      const tree = renderSection('log-1');
      expect(findByTestid(tree, 'monitoring-log-source-override')).toBeDefined();
    });
  });

  // ── Candidates: ambiguous path ───────────────────────────────────────────

  describe('candidates from ambiguous resolver', () => {
    it('renders one option per ambiguous candidate plus the placeholder', () => {
      seedLogNode();
      mocks.state.logs.byTerminalNodeId['log-1'] = {
        status: 'ambiguous',
        mode: 'polling',
        source: {
          state: 'ambiguous',
          candidates: [
            { nodeId: 'svc-A', iceType: 'Compute.Container', label: 'A label' },
            { nodeId: 'svc-B', iceType: 'Database.PostgreSQL', label: 'B label' },
          ],
        },
        entries: [],
        lastError: null,
      };
      const tree = renderSection('log-1');
      const options = findByPredicate(tree, (el) => el.type === 'option');
      // Placeholder + 2 candidates.
      expect(options).toHaveLength(3);
      const values = options.map((o) => (o.props as OptionProps).value);
      expect(values).toContain('svc-A');
      expect(values).toContain('svc-B');
    });

    it('uses candidate.label when present in option text', () => {
      seedLogNode();
      mocks.state.logs.byTerminalNodeId['log-1'] = {
        status: 'ambiguous',
        mode: 'polling',
        source: {
          state: 'ambiguous',
          candidates: [{ nodeId: 'svc-A', iceType: 'Compute.Container', label: 'My API' }],
        },
        entries: [],
        lastError: null,
      };
      const tree = renderSection('log-1');
      const opt = findByPredicate(tree, (el) => el.type === 'option' && (el.props as OptionProps).value === 'svc-A')[0];
      expect((opt.props as OptionProps).children).toContain('My API');
      expect((opt.props as OptionProps).children).toContain('Container');
    });

    it('falls back to activeCard node.data.label when candidate.label is empty', () => {
      seedLogNode({}, [{ id: 'svc-A', type: 'resource', data: { iceType: 'Compute.Container', label: 'From Card' } }]);
      mocks.state.logs.byTerminalNodeId['log-1'] = {
        status: 'ambiguous',
        mode: 'polling',
        source: {
          state: 'ambiguous',
          candidates: [{ nodeId: 'svc-A', iceType: 'Compute.Container', label: '' }],
        },
        entries: [],
        lastError: null,
      };
      const tree = renderSection('log-1');
      const opt = findByPredicate(tree, (el) => el.type === 'option' && (el.props as OptionProps).value === 'svc-A')[0];
      expect((opt.props as OptionProps).children).toContain('From Card');
    });

    it('falls back to nodeId.slice(0,8) when both candidate.label and node.data.label are absent', () => {
      seedLogNode();
      mocks.state.logs.byTerminalNodeId['log-1'] = {
        status: 'ambiguous',
        mode: 'polling',
        source: {
          state: 'ambiguous',
          candidates: [
            // Long unique node id, no label, no card-node entry.
            { nodeId: 'abcdefgh-rest-of-uuid', iceType: 'Compute.Container', label: '' },
          ],
        },
        entries: [],
        lastError: null,
      };
      const tree = renderSection('log-1');
      const opt = findByPredicate(
        tree,
        (el) => el.type === 'option' && (el.props as OptionProps).value === 'abcdefgh-rest-of-uuid',
      )[0];
      expect((opt.props as OptionProps).children).toContain('abcdefgh');
    });

    it('falls back to nodeId.slice when activeCard is undefined for the candidate (no matching node)', () => {
      seedLogNode();
      mocks.state.logs.byTerminalNodeId['log-1'] = {
        status: 'ambiguous',
        mode: 'polling',
        source: {
          state: 'ambiguous',
          candidates: [{ nodeId: 'unknown1', iceType: 'Compute.Container', label: '' }],
        },
        entries: [],
        lastError: null,
      };
      const tree = renderSection('log-1');
      const opt = findByPredicate(
        tree,
        (el) => el.type === 'option' && (el.props as OptionProps).value === 'unknown1',
      )[0];
      expect((opt.props as OptionProps).children).toContain('unknown1');
    });

    it("renders 'No supported source connected' when the ambiguous candidates list is empty", () => {
      seedLogNode();
      mocks.state.logs.byTerminalNodeId['log-1'] = {
        status: 'ambiguous',
        mode: 'polling',
        source: { state: 'ambiguous', candidates: [] },
        entries: [],
        lastError: null,
      };
      const tree = renderSection('log-1');
      // No <select>, just the placeholder paragraph.
      const select = findByTestid(tree, 'monitoring-log-source-select');
      expect(select).toBeUndefined();
      const para = findByPredicate(
        tree,
        (el) =>
          el.type === 'p' &&
          typeof (el.props as { children?: unknown }).children === 'string' &&
          ((el.props as { children: string }).children as string).includes('No supported source connected'),
      );
      expect(para.length).toBe(1);
    });
  });

  // ── Candidates: 'none' path with inbound edges ───────────────────────────

  describe('candidates derived from inbound edges (state=none)', () => {
    it('uses inbound edges to enumerate candidates when source state is none', () => {
      seedLogNode(
        {},
        [
          { id: 'svc-A', type: 'resource', data: { iceType: 'Compute.Container', label: 'A' } },
          { id: 'svc-B', type: 'resource', data: { iceType: 'Database.PostgreSQL', label: 'B' } },
          { id: 'other', type: 'resource', data: { iceType: 'Compute.Container', label: 'X' } },
        ],
        [
          { source: 'svc-A', target: 'log-1' },
          { source: 'svc-B', target: 'log-1' },
          // 'other' isn't connected to log-1, but is connected via a different edge.
          { source: 'other', target: 'svc-A' },
        ],
      );
      mocks.state.logs.byTerminalNodeId['log-1'] = {
        status: 'no-source',
        mode: 'polling',
        source: { state: 'none' },
        entries: [],
        lastError: null,
      };
      const tree = renderSection('log-1');
      const options = findByPredicate(tree, (el) => el.type === 'option');
      const values = options.map((o) => (o.props as OptionProps).value);
      // Placeholder + svc-A + svc-B (other is excluded — not inbound to log-1).
      expect(values).toContain('svc-A');
      expect(values).toContain('svc-B');
      expect(values).not.toContain('other');
    });

    it('excludes inbound nodes whose iceType is not in SUPPORTED_LOG_SOURCE_ICE_TYPES', () => {
      seedLogNode(
        {},
        [
          { id: 'svc-bad', type: 'resource', data: { iceType: 'Source.Repository' } },
          { id: 'svc-good', type: 'resource', data: { iceType: 'Compute.Container' } },
        ],
        [
          { source: 'svc-bad', target: 'log-1' },
          { source: 'svc-good', target: 'log-1' },
        ],
      );
      mocks.state.logs.byTerminalNodeId['log-1'] = {
        status: 'no-source',
        mode: 'polling',
        source: { state: 'none' },
        entries: [],
        lastError: null,
      };
      const tree = renderSection('log-1');
      const options = findByPredicate(tree, (el) => el.type === 'option');
      const values = options.map((o) => (o.props as OptionProps).value);
      expect(values).toContain('svc-good');
      expect(values).not.toContain('svc-bad');
    });

    it('excludes inbound edges whose source node does not exist in activeCard.nodes', () => {
      seedLogNode(
        {},
        [{ id: 'svc-good', type: 'resource', data: { iceType: 'Compute.Container' } }],
        [
          { source: 'svc-good', target: 'log-1' },
          { source: 'ghost-id', target: 'log-1' }, // no matching node
        ],
      );
      mocks.state.logs.byTerminalNodeId['log-1'] = {
        status: 'no-source',
        mode: 'polling',
        source: { state: 'none' },
        entries: [],
        lastError: null,
      };
      const tree = renderSection('log-1');
      const options = findByPredicate(tree, (el) => el.type === 'option');
      const values = options.map((o) => (o.props as OptionProps).value);
      expect(values).toContain('svc-good');
      expect(values).not.toContain('ghost-id');
    });

    it('uses node.data.label when present in option text for none-state candidates', () => {
      seedLogNode(
        {},
        [{ id: 'svc-A', type: 'resource', data: { iceType: 'Compute.Container', label: 'My Worker' } }],
        [{ source: 'svc-A', target: 'log-1' }],
      );
      mocks.state.logs.byTerminalNodeId['log-1'] = {
        status: 'no-source',
        mode: 'polling',
        source: { state: 'none' },
        entries: [],
        lastError: null,
      };
      const tree = renderSection('log-1');
      const opt = findByPredicate(tree, (el) => el.type === 'option' && (el.props as OptionProps).value === 'svc-A')[0];
      expect((opt.props as OptionProps).children).toContain('My Worker');
    });

    it('falls back to nodeId.slice(0,8) for none-state candidates without data.label', () => {
      seedLogNode(
        {},
        [
          {
            id: 'longidentifier-rest',
            type: 'resource',
            data: { iceType: 'Compute.Container' }, // no label
          },
        ],
        [{ source: 'longidentifier-rest', target: 'log-1' }],
      );
      mocks.state.logs.byTerminalNodeId['log-1'] = {
        status: 'no-source',
        mode: 'polling',
        source: { state: 'none' },
        entries: [],
        lastError: null,
      };
      const tree = renderSection('log-1');
      const opt = findByPredicate(
        tree,
        (el) => el.type === 'option' && (el.props as OptionProps).value === 'longidentifier-rest',
      )[0];
      // 'longidentifier-rest'.slice(0, 8) === 'longiden'
      expect((opt.props as OptionProps).children).toContain('longiden');
    });

    it("falls back gracefully when an inbound node's data.iceType is missing in label/iceType (||'' empty fallback)", () => {
      // Node has no `data` at all → both label and iceType branches use the
      // empty-string fallback. The supported-set membership check fails on the
      // empty string, so this node is excluded — pinning the falsy-data path.
      seedLogNode(
        {},
        [{ id: 'svc-empty', type: 'resource' /* no data */ }],
        [{ source: 'svc-empty', target: 'log-1' }],
      );
      mocks.state.logs.byTerminalNodeId['log-1'] = {
        status: 'no-source',
        mode: 'polling',
        source: { state: 'none' },
        entries: [],
        lastError: null,
      };
      const tree = renderSection('log-1');
      const select = findByTestid(tree, 'monitoring-log-source-select');
      // No supported sources → no <select>, just placeholder paragraph.
      expect(select).toBeUndefined();
    });

    it('renders the no-source placeholder paragraph when none-state has no inbound supported nodes', () => {
      seedLogNode();
      mocks.state.logs.byTerminalNodeId['log-1'] = {
        status: 'no-source',
        mode: 'polling',
        source: { state: 'none' },
        entries: [],
        lastError: null,
      };
      const tree = renderSection('log-1');
      const select = findByTestid(tree, 'monitoring-log-source-select');
      expect(select).toBeUndefined();
      const para = findByPredicate(
        tree,
        (el) =>
          el.type === 'p' &&
          typeof (el.props as { children?: unknown }).children === 'string' &&
          ((el.props as { children: string }).children as string).includes('No supported source connected'),
      );
      expect(para.length).toBe(1);
    });

    it('returns no candidates when source state is none AND activeCard is missing', () => {
      // Edge case: streamState says none, but selectActiveCard returns undefined.
      mocks.state.cards.cards = []; // no card → activeCard is undefined → early return null
      const tree = renderSection('log-1');
      // The component already early-returns null because the node is missing.
      expect(tree).toBeNull();
    });
  });

  // ── Source select interactions ───────────────────────────────────────────

  describe('source select interactions', () => {
    const baseAmbiguous = {
      status: 'ambiguous' as const,
      mode: 'polling' as const,
      source: {
        state: 'ambiguous' as const,
        candidates: [{ nodeId: 'svc-A', iceType: 'Compute.Container', label: 'A' }],
      },
      entries: [],
      lastError: null,
    };

    it("placeholder option shows '— Select a source —' when no override is set", () => {
      seedLogNode();
      mocks.state.logs.byTerminalNodeId['log-1'] = baseAmbiguous;
      const tree = renderSection('log-1');
      const select = findByTestid(tree, 'monitoring-log-source-select');
      const placeholderOpt = findByPredicate(select!, (el) => el.type === 'option')[0];
      expect((placeholderOpt.props as OptionProps).children).toBe('— Select a source —');
    });

    it("placeholder option shows 'Clear override' when an override is set", () => {
      seedLogNode({ sourceNodeIdOverride: 'svc-A' });
      mocks.state.logs.byTerminalNodeId['log-1'] = baseAmbiguous;
      const tree = renderSection('log-1');
      const select = findByTestid(tree, 'monitoring-log-source-select');
      const placeholderOpt = findByPredicate(select!, (el) => el.type === 'option')[0];
      expect((placeholderOpt.props as OptionProps).children).toBe('Clear override');
    });

    it('select.value is the override when set, the sentinel when not set', () => {
      seedLogNode({ sourceNodeIdOverride: 'svc-A' });
      mocks.state.logs.byTerminalNodeId['log-1'] = baseAmbiguous;
      const tree = renderSection('log-1');
      const select = findByTestid(tree, 'monitoring-log-source-select');
      expect((select!.props as SelectProps).value).toBe('svc-A');

      seedLogNode();
      mocks.state.logs.byTerminalNodeId['log-1'] = baseAmbiguous;
      const tree2 = renderSection('log-1');
      const select2 = findByTestid(tree2, 'monitoring-log-source-select');
      // Sentinel value — not a real nodeId.
      expect((select2!.props as SelectProps).value).toBe('__ice_log_clear_override__');
    });

    it('selecting a real candidate dispatches updateCardNodeData with the override', () => {
      seedLogNode();
      mocks.state.logs.byTerminalNodeId['log-1'] = baseAmbiguous;
      const tree = renderSection('log-1');
      const select = findByTestid(tree, 'monitoring-log-source-select');
      (select!.props as SelectProps).onChange({ target: { value: 'svc-A' } });
      expect(mocks.updateCardNodeDataSpy).toHaveBeenCalledWith({
        nodeId: 'log-1',
        data: { sourceNodeIdOverride: 'svc-A' },
      });
    });

    it('selecting the sentinel clears the override (dispatches undefined)', () => {
      seedLogNode({ sourceNodeIdOverride: 'svc-A' });
      mocks.state.logs.byTerminalNodeId['log-1'] = baseAmbiguous;
      const tree = renderSection('log-1');
      const select = findByTestid(tree, 'monitoring-log-source-select');
      (select!.props as SelectProps).onChange({
        target: { value: '__ice_log_clear_override__' },
      });
      expect(mocks.updateCardNodeDataSpy).toHaveBeenCalledWith({
        nodeId: 'log-1',
        data: { sourceNodeIdOverride: undefined },
      });
    });

    it("option text is 'label · {iceType-tail}' (split('.').pop())", () => {
      seedLogNode();
      mocks.state.logs.byTerminalNodeId['log-1'] = {
        ...baseAmbiguous,
        source: {
          state: 'ambiguous',
          candidates: [{ nodeId: 'svc-A', iceType: 'Database.MongoDB', label: 'mongo' }],
        },
      };
      const tree = renderSection('log-1');
      const opt = findByPredicate(tree, (el) => el.type === 'option' && (el.props as OptionProps).value === 'svc-A')[0];
      expect((opt.props as OptionProps).children).toBe('mongo · MongoDB');
    });

    it('option text falls back to the full iceType when there is no dot to split', () => {
      seedLogNode();
      mocks.state.logs.byTerminalNodeId['log-1'] = {
        ...baseAmbiguous,
        source: {
          state: 'ambiguous',
          candidates: [{ nodeId: 'svc-A', iceType: 'NoDotIceType', label: 'svc' }],
        },
      };
      const tree = renderSection('log-1');
      const opt = findByPredicate(tree, (el) => el.type === 'option' && (el.props as OptionProps).value === 'svc-A')[0];
      expect((opt.props as OptionProps).children).toBe('svc · NoDotIceType');
    });
  });
});
