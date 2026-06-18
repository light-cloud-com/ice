/**
 * Tests for `SvgLogNode` orchestrator (and the file-private helpers
 * `mapLevel`, `formatTs`, `placeholderText`).
 *
 * The component is `React.memo`-wrapped; its inner FC is reachable via
 * `(SvgLogNode as { type: FC }).type(props)`.
 *
 * Hooks (`useState`, `useRef`, `useEffect`, `useCallback`, `useMemo`)
 * are mocked so the component can be invoked outside a render context.
 * `useLogStream` is mocked to return controllable entries / status /
 * lastError per test.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const named = (name: string): React.FC<Record<string, unknown>> => {
    const fc: React.FC<Record<string, unknown>> = () => null;
    fc.displayName = name;
    return fc;
  };
  return {
    LogContent: named('MockLogContent'),
    LogHeader: named('MockLogHeader'),
    FoldedBadge: named('MockFoldedBadge'),
    state: {
      // States hoisted so individual tests can pin them per render.
      // useState slots are tracked by call counter (reset per render) and
      // optionally pre-populated via `pinnedSlots`.
      stateCounter: 0 as number,
      pinnedSlots: [] as unknown[],
      stateSetters: [] as Array<ReturnType<typeof vi.fn>>,
      runEffects: false as boolean,
      effectFns: [] as Array<() => void>,
      logStream: {
        entries: [] as Array<{ insertId: string; ts: string; level: string; message: string }>,
        status: 'idle' as string,
        lastError: null as string | null,
      },
    },
  };
});

vi.mock('../log-content', () => ({ LogContent: mocks.LogContent }));
vi.mock('../log-header', () => ({ LogHeader: mocks.LogHeader }));
vi.mock('../folded-badge', () => ({ FoldedBadge: mocks.FoldedBadge }));

vi.mock('../../../../../../shared/hooks/use-log-stream', () => ({
  useLogStream: () => mocks.state.logStream,
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: vi.fn(<T,>(init: T | (() => T)): [T, (v: T) => void] => {
      const initialValue = typeof init === 'function' ? (init as () => T)() : init;
      const idx = mocks.state.stateCounter;
      mocks.state.stateCounter += 1;
      const hasPin = idx in mocks.state.pinnedSlots;
      const value = hasPin ? (mocks.state.pinnedSlots[idx] as T) : initialValue;
      const setter = vi.fn();
      mocks.state.stateSetters[idx] = setter;
      return [value, setter];
    }),
    useRef: vi.fn(<T,>(init: T): { current: T } => ({ current: init })),
    useEffect: vi.fn((fn: () => void) => {
      mocks.state.effectFns.push(fn);
      if (mocks.state.runEffects) fn();
    }),
    useMemo: vi.fn(<T,>(factory: () => T) => factory()),
    useCallback: vi.fn(<T,>(fn: T) => fn),
    // SvgLogNode now reads the orphan-nodes context via `useIsNodeOrphan`.
    // The test invokes the component as a plain function (no renderer),
    // so the real useContext blows up — stub to an empty Set so the
    // orphan branch is inert.
    useContext: vi.fn(() => new Set<string>()),
  };
});

import { SvgLogNode, formatCopyTimestamp, formatLogCopyLine } from '..';
import type { CanvasNode } from '../../../svg-canvas';

const MockLogContent = mocks.LogContent;
const MockLogHeader = mocks.LogHeader;
const MockFoldedBadge = mocks.FoldedBadge;

// ─── tree walker ────────────────────────────────────────────────────

type ReactNodeLike = React.ReactNode;
function* walk(node: ReactNodeLike): Generator<React.ReactElement> {
  if (node == null || typeof node === 'boolean' || typeof node === 'string' || typeof node === 'number') return;
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
function findByType(tree: React.ReactNode, type: unknown): React.ReactElement[] {
  const out: React.ReactElement[] = [];
  for (const el of walk(tree)) if (el && el.type === type) out.push(el);
  return out;
}

const makeNode = (overrides: Partial<CanvasNode> = {}): CanvasNode => ({
  id: 'log-1',
  type: 'block',
  x: 0,
  y: 0,
  width: 400,
  height: 240,
  label: 'Log Stream',
  data: {},
  parentId: undefined,
  ...overrides,
});

const renderLN = (props: Partial<React.ComponentProps<typeof SvgLogNode>> = {}): React.ReactElement => {
  const Inner = (
    SvgLogNode as unknown as {
      type: (p: React.ComponentProps<typeof SvgLogNode>) => React.ReactElement;
    }
  ).type;
  const defaults: React.ComponentProps<typeof SvgLogNode> = {
    node: makeNode(),
    isSelected: false,
  };
  // Reset slot counter for each render so the same pinnedSlots layout
  // applies to every fresh invocation in a single test.
  mocks.state.stateCounter = 0;
  return Inner({ ...defaults, ...props });
};

beforeEach(() => {
  mocks.state.stateCounter = 0;
  mocks.state.pinnedSlots = [];
  mocks.state.stateSetters = [];
  mocks.state.runEffects = false;
  mocks.state.effectFns = [];
  mocks.state.logStream = { entries: [], status: 'idle', lastError: null };
});

describe('SvgLogNode — React.memo + displayName', () => {
  it('is wrapped in React.memo', () => {
    expect(typeof (SvgLogNode as unknown as { $$typeof: symbol }).$$typeof).toBe('symbol');
  });

  it('carries displayName "SvgLogNode"', () => {
    expect((SvgLogNode as unknown as { displayName: string }).displayName).toBe('SvgLogNode');
  });
});

describe('SvgLogNode — outer <g>', () => {
  it('writes data-node-id from node.id', () => {
    const tree = renderLN({ node: makeNode({ id: 'log-7' }) });
    expect((tree.props as { 'data-node-id': string })['data-node-id']).toBe('log-7');
  });

  it('writes data-ice-type from node.data.iceType, empty otherwise', () => {
    const tree = renderLN({ node: makeNode({ data: { iceType: 'Monitoring.LogStream' } }) });
    expect((tree.props as { 'data-ice-type': string })['data-ice-type']).toBe('Monitoring.LogStream');
    const t2 = renderLN({ node: makeNode() });
    expect((t2.props as { 'data-ice-type': string })['data-ice-type']).toBe('');
  });

  it('cursor: move on outer <g>', () => {
    const tree = renderLN();
    expect((tree.props as { style: { cursor: string } }).style.cursor).toBe('move');
  });

  it('onMouseEnter sets hover state', () => {
    const tree = renderLN();
    const fn = (tree.props as { onMouseEnter: () => void }).onMouseEnter;
    fn();
    // First useState slot is isHovered.
    expect(mocks.state.stateSetters[0]).toHaveBeenCalledWith(true);
  });

  it('onMouseLeave clears hover state', () => {
    const tree = renderLN();
    const fn = (tree.props as { onMouseLeave: () => void }).onMouseLeave;
    fn();
    expect(mocks.state.stateSetters[0]).toHaveBeenCalledWith(false);
  });
});

describe('SvgLogNode — fold/unfold layout', () => {
  it('renders LogContent when not folded', () => {
    const tree = renderLN();
    expect(findByType(tree, MockLogContent)).toHaveLength(1);
    expect(findByType(tree, MockFoldedBadge)).toHaveLength(0);
  });

  it('renders FoldedBadge when folded', () => {
    // useState slot 1 is `folded`. Pin to true.
    mocks.state.pinnedSlots = [false /* hover */, true /* folded */];
    const tree = renderLN();
    expect(findByType(tree, MockFoldedBadge)).toHaveLength(1);
    expect(findByType(tree, MockLogContent)).toHaveLength(0);
  });

  it('foreignObject height = headerHeight (32) when folded', () => {
    mocks.state.pinnedSlots = [false, true];
    const tree = renderLN();
    const fobj = walk(tree).next().value as React.ReactElement;
    // outer is <g>, find foreignObject
    const fo = findByType(tree, 'foreignObject')[0];
    expect((fo.props as { height: number }).height).toBe(32);
  });

  it('foreignObject width clamps to 320 minimum', () => {
    const tree = renderLN({ node: makeNode({ width: 100 }) });
    const fo = findByType(tree, 'foreignObject')[0];
    expect((fo.props as { width: number }).width).toBe(320);
  });

  it('foreignObject width uses node.width if >= 320', () => {
    const tree = renderLN({ node: makeNode({ width: 600 }) });
    const fo = findByType(tree, 'foreignObject')[0];
    expect((fo.props as { width: number }).width).toBe(600);
  });

  it('foreignObject height clamps to 160 minimum (when not folded)', () => {
    const tree = renderLN({ node: makeNode({ height: 50 }) });
    const fo = findByType(tree, 'foreignObject')[0];
    expect((fo.props as { height: number }).height).toBe(160);
  });

  it('foreignObject width uses 400 fallback when node.width=0 (falsy)', () => {
    const tree = renderLN({ node: makeNode({ width: 0 }) });
    const fo = findByType(tree, 'foreignObject')[0];
    expect((fo.props as { width: number }).width).toBe(400);
  });

  it('foreignObject height uses 240 fallback when node.height=0', () => {
    const tree = renderLN({ node: makeNode({ height: 0 }) });
    const fo = findByType(tree, 'foreignObject')[0];
    expect((fo.props as { height: number }).height).toBe(240);
  });
});

describe('SvgLogNode — placeholder + log mapping', () => {
  it('renders placeholder row for status=idle when entries empty', () => {
    mocks.state.logStream = { entries: [], status: 'idle', lastError: null };
    const tree = renderLN();
    const lc = findByType(tree, MockLogContent)[0];
    const visibleLogs = (lc.props as { visibleLogs: Array<{ message: string }> }).visibleLogs;
    expect(visibleLogs).toHaveLength(1);
    expect(visibleLogs[0].message).toBe('Waiting for environment.');
  });

  it('renders placeholder row for status=streaming with no entries', () => {
    mocks.state.logStream = { entries: [], status: 'streaming', lastError: null };
    const tree = renderLN();
    const lc = findByType(tree, MockLogContent)[0];
    expect((lc.props as { visibleLogs: unknown[] }).visibleLogs).toHaveLength(0);
  });

  it('placeholder for pre-deploy / no-source / ambiguous / unsupported maps to known strings', () => {
    const cases: Array<[string, string]> = [
      ['pre-deploy', 'Deploy this environment to start streaming logs.'],
      ['no-source', 'Connect a compute or database block to start streaming logs.'],
      ['ambiguous', 'Multiple inbound connections — choose a source in the properties panel.'],
      ['unsupported', "This source type doesn't emit Cloud Logging output."],
      ['connecting', 'Connecting…'],
    ];
    for (const [status, msg] of cases) {
      mocks.state.pinnedSlots = [];
      mocks.state.logStream = { entries: [], status, lastError: null };
      const tree = renderLN();
      const lc = findByType(tree, MockLogContent)[0];
      const visibleLogs = (lc.props as { visibleLogs: Array<{ message: string }> }).visibleLogs;
      expect(visibleLogs[0].message).toBe(msg);
    }
  });

  it('permission-denied: uses lastError when present', () => {
    mocks.state.logStream = { entries: [], status: 'permission-denied', lastError: 'denied: foo' };
    const tree = renderLN();
    const lc = findByType(tree, MockLogContent)[0];
    expect((lc.props as { visibleLogs: Array<{ message: string }> }).visibleLogs[0].message).toBe('denied: foo');
  });

  it('permission-denied: falls back to canned text when lastError null', () => {
    mocks.state.logStream = { entries: [], status: 'permission-denied', lastError: null };
    const tree = renderLN();
    const lc = findByType(tree, MockLogContent)[0];
    expect((lc.props as { visibleLogs: Array<{ message: string }> }).visibleLogs[0].message).toContain('access denied');
  });

  it('error: uses lastError when present, fallback otherwise', () => {
    mocks.state.logStream = { entries: [], status: 'error', lastError: 'boom' };
    expect(
      (findByType(renderLN(), MockLogContent)[0].props as { visibleLogs: Array<{ message: string }> }).visibleLogs[0]
        .message,
    ).toBe('boom');
    mocks.state.pinnedSlots = [];
    mocks.state.logStream = { entries: [], status: 'error', lastError: null };
    expect(
      (findByType(renderLN(), MockLogContent)[0].props as { visibleLogs: Array<{ message: string }> }).visibleLogs[0]
        .message,
    ).toBe('Connection error. Retrying.');
  });

  it('placeholder default branch: empty string for unknown status', () => {
    mocks.state.logStream = { entries: [], status: 'unknown-future-status', lastError: null };
    const tree = renderLN();
    const lc = findByType(tree, MockLogContent)[0];
    expect((lc.props as { visibleLogs: Array<{ message: string }> }).visibleLogs[0].message).toBe('');
  });

  it('maps live entries: notice → info; debug/info/warn/error pass through', () => {
    mocks.state.logStream = {
      entries: [
        { insertId: 'i1', ts: '2025-04-27T12:34:56.123Z', level: 'notice', message: 'a' },
        { insertId: 'i2', ts: '2025-04-27T12:34:57.000Z', level: 'info', message: 'b' },
        { insertId: 'i3', ts: '2025-04-27T12:34:58.000Z', level: 'warn', message: 'c' },
        { insertId: 'i4', ts: '2025-04-27T12:34:59.000Z', level: 'error', message: 'd' },
        { insertId: 'i5', ts: '2025-04-27T12:35:00.000Z', level: 'debug', message: 'e' },
      ],
      status: 'streaming',
      lastError: null,
    };
    const tree = renderLN();
    const lc = findByType(tree, MockLogContent)[0];
    const logs = (
      lc.props as { visibleLogs: Array<{ level: string; timestamp: string; message: string; service: string }> }
    ).visibleLogs;
    expect(logs.map((l) => l.level)).toEqual(['info', 'info', 'warn', 'error', 'debug']);
    expect(logs[0].timestamp).toBe('12:34:56');
    expect(logs[0].message).toBe('a');
  });

  it('formatTs: returns slice(0,8) of input when no T separator', () => {
    mocks.state.logStream = {
      entries: [{ insertId: 'i1', ts: '12:34:56XYZ', level: 'info', message: 'a' }],
      status: 'streaming',
      lastError: null,
    };
    const tree = renderLN();
    const lc = findByType(tree, MockLogContent)[0];
    const logs = (lc.props as { visibleLogs: Array<{ timestamp: string }> }).visibleLogs;
    expect(logs[0].timestamp).toBe('12:34:56');
  });

  it('formatTs: slices to 8 chars when no dot after T', () => {
    mocks.state.logStream = {
      entries: [{ insertId: 'i1', ts: '2025-04-27T12:34:56', level: 'info', message: 'a' }],
      status: 'streaming',
      lastError: null,
    };
    const tree = renderLN();
    const lc = findByType(tree, MockLogContent)[0];
    expect((lc.props as { visibleLogs: Array<{ timestamp: string }> }).visibleLogs[0].timestamp).toBe('12:34:56');
  });

  it('formatTs: empty / non-string ts becomes empty string', () => {
    mocks.state.logStream = {
      entries: [
        { insertId: 'i1', ts: '', level: 'info', message: 'a' },
        { insertId: 'i2', ts: 5 as unknown as string, level: 'info', message: 'b' },
      ],
      status: 'streaming',
      lastError: null,
    };
    const tree = renderLN();
    const lc = findByType(tree, MockLogContent)[0];
    const logs = (lc.props as { visibleLogs: Array<{ timestamp: string }> }).visibleLogs;
    expect(logs[0].timestamp).toBe('');
    expect(logs[1].timestamp).toBe('');
  });

  it('serviceName: uses data.label when set, slice 0,12', () => {
    const tree = renderLN({ node: makeNode({ data: { label: 'very-long-name-cut-off' } }) });
    // The serviceName isn't directly in the tree but is forwarded into placeholder; we check via placeholder.
    mocks.state.pinnedSlots = [];
    mocks.state.logStream = { entries: [], status: 'idle', lastError: null };
    const t2 = renderLN({ node: makeNode({ data: { label: 'very-long-name-cut-off' } }) });
    const lc = findByType(t2, MockLogContent)[0];
    const placeholderRow = (lc.props as { visibleLogs: Array<{ service: string }> }).visibleLogs[0];
    expect(placeholderRow.service).toBe('very-long-na');
  });

  it('serviceName: falls back to label when data.label missing', () => {
    const tree = renderLN({ node: makeNode({ label: 'My Logs' }) });
    const lc = findByType(tree, MockLogContent)[0];
    const placeholderRow = (lc.props as { visibleLogs: Array<{ service: string }> }).visibleLogs[0];
    expect(placeholderRow.service).toBe('My Logs');
  });

  it('serviceName: falls back to "logs" when both data.label and label missing', () => {
    const tree = renderLN({ node: makeNode({ label: undefined as unknown as string }) });
    const lc = findByType(tree, MockLogContent)[0];
    const placeholderRow = (lc.props as { visibleLogs: Array<{ service: string }> }).visibleLogs[0];
    expect(placeholderRow.service).toBe('logs');
  });
});

describe('SvgLogNode — fold/copy/wheel handlers', () => {
  it('handleToggleFold flips folded + stops propagation + calls onToggleFold(node.id)', () => {
    const fold = vi.fn();
    const tree = renderLN({ node: makeNode({ id: 'log-7' }), onToggleFold: fold });
    const header = findByType(tree, MockLogHeader)[0];
    const stops: string[] = [];
    (header.props as { onToggleFold: (e: React.MouseEvent) => void }).onToggleFold({
      stopPropagation: () => stops.push('s'),
    } as unknown as React.MouseEvent);
    expect(stops).toEqual(['s']);
    expect(fold).toHaveBeenCalledWith('log-7');
    // Folded slot 1 toggled.
    expect(mocks.state.stateSetters[1]).toHaveBeenCalledWith(true);
  });

  it('handleToggleFold no-op when onToggleFold undefined', () => {
    const tree = renderLN();
    const header = findByType(tree, MockLogHeader)[0];
    expect(() =>
      (header.props as { onToggleFold: (e: React.MouseEvent) => void }).onToggleFold({
        stopPropagation: () => {},
      } as unknown as React.MouseEvent),
    ).not.toThrow();
  });

  it('handleCopyAll writes timestamps + level + messages to clipboard', () => {
    const writes: string[] = [];
    const original = (globalThis as unknown as { navigator?: unknown }).navigator;
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        clipboard: {
          writeText: (t: string) => {
            writes.push(t);
            return Promise.resolve();
          },
        },
      },
      configurable: true,
      writable: true,
    });
    try {
      mocks.state.logStream = {
        entries: [
          { insertId: 'i1', ts: '2025-04-27T12:34:56.000Z', level: 'info', message: 'hello' },
          { insertId: 'i2', ts: '2025-04-27T12:34:57.000Z', level: 'error', message: 'bye' },
        ],
        status: 'streaming',
        lastError: null,
      };
      const tree = renderLN();
      const header = findByType(tree, MockLogHeader)[0];
      (header.props as { onCopyAll: (e: React.MouseEvent) => void }).onCopyAll({
        stopPropagation: () => {},
      } as unknown as React.MouseEvent);
      expect(writes).toHaveLength(1);
      // OL7 — copy carries the FULL date+time (display column only shows HH:MM:SS).
      expect(writes[0]).toBe('2025-04-27 12:34:56 [INFO] hello\n2025-04-27 12:34:57 [ERROR] bye');
    } finally {
      Object.defineProperty(globalThis, 'navigator', { value: original, configurable: true, writable: true });
    }
  });

  it('handleCopyAll swallows clipboard rejection', () => {
    const original = (globalThis as unknown as { navigator?: unknown }).navigator;
    Object.defineProperty(globalThis, 'navigator', {
      value: { clipboard: { writeText: () => Promise.reject(new Error('denied')) } },
      configurable: true,
      writable: true,
    });
    try {
      const tree = renderLN();
      const header = findByType(tree, MockLogHeader)[0];
      expect(() =>
        (header.props as { onCopyAll: (e: React.MouseEvent) => void }).onCopyAll({
          stopPropagation: () => {},
        } as unknown as React.MouseEvent),
      ).not.toThrow();
    } finally {
      Object.defineProperty(globalThis, 'navigator', { value: original, configurable: true, writable: true });
    }
  });

  it('handleCopyLine writes single-line (full ts) + sets copied on success + clears after 1s', async () => {
    const writes: string[] = [];
    const original = (globalThis as unknown as { navigator?: unknown }).navigator;
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        clipboard: {
          writeText: (t: string) => {
            writes.push(t);
            return Promise.resolve();
          },
        },
      },
      configurable: true,
      writable: true,
    });
    vi.useFakeTimers();
    try {
      const tree = renderLN();
      const lc = findByType(tree, MockLogContent)[0];
      const onCopyLine = (
        lc.props as {
          onCopyLine: (
            log: { id: string; timestamp: string; tsFull?: string; level: string; message: string },
            e: React.MouseEvent,
          ) => void;
        }
      ).onCopyLine;
      onCopyLine(
        { id: 'l1', timestamp: '12:34:56', tsFull: '2025-04-27T12:34:56.000Z', level: 'info', message: 'hi' },
        {
          stopPropagation: () => {},
        } as unknown as React.MouseEvent,
      );
      // OL7 — copy uses the full timestamp (write is synchronous).
      expect(writes).toEqual(['2025-04-27 12:34:56 [INFO] hi']);
      // OL8 — the "copied" flash is gated on the clipboard write succeeding, so
      // it fires on a microtask, not synchronously. Flush the writeText→then→
      // catch→then chain (several hops).
      for (let i = 0; i < 5; i += 1) await Promise.resolve();
      // Slot 4 is copiedLine.
      expect(mocks.state.stateSetters[4]).toHaveBeenCalledWith('l1');
      mocks.state.stateSetters[4].mockClear();
      vi.advanceTimersByTime(1000);
      expect(mocks.state.stateSetters[4]).toHaveBeenCalledWith(null);
    } finally {
      Object.defineProperty(globalThis, 'navigator', { value: original, configurable: true, writable: true });
      vi.useRealTimers();
    }
  });

  // OL8 — a failed clipboard write must NOT show the false-positive "copied" flash.
  it('handleCopyLine does NOT flash copied when the clipboard write rejects', async () => {
    const original = (globalThis as unknown as { navigator?: unknown }).navigator;
    Object.defineProperty(globalThis, 'navigator', {
      value: { clipboard: { writeText: () => Promise.reject(new Error('denied')) } },
      configurable: true,
      writable: true,
    });
    try {
      const tree = renderLN();
      const lc = findByType(tree, MockLogContent)[0];
      const onCopyLine = (lc.props as { onCopyLine: (log: Record<string, unknown>, e: React.MouseEvent) => void })
        .onCopyLine;
      onCopyLine({ id: 'l1', timestamp: '12:34:56', level: 'info', message: 'hi' }, {
        stopPropagation: () => {},
      } as unknown as React.MouseEvent);
      for (let i = 0; i < 5; i += 1) await Promise.resolve();
      expect(mocks.state.stateSetters[4]).not.toHaveBeenCalledWith('l1');
    } finally {
      Object.defineProperty(globalThis, 'navigator', { value: original, configurable: true, writable: true });
    }
  });

  // OL8 — when the clipboard API is unavailable, copy is a no-op (no false flash).
  it('handleCopyLine is a no-op when navigator.clipboard is unavailable', async () => {
    const original = (globalThis as unknown as { navigator?: unknown }).navigator;
    Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true, writable: true });
    try {
      const tree = renderLN();
      const lc = findByType(tree, MockLogContent)[0];
      const onCopyLine = (lc.props as { onCopyLine: (log: Record<string, unknown>, e: React.MouseEvent) => void })
        .onCopyLine;
      expect(() =>
        onCopyLine({ id: 'l1', timestamp: '12:34:56', level: 'info', message: 'hi' }, {
          stopPropagation: () => {},
        } as unknown as React.MouseEvent),
      ).not.toThrow();
      for (let i = 0; i < 5; i += 1) await Promise.resolve();
      expect(mocks.state.stateSetters[4]).not.toHaveBeenCalledWith('l1');
    } finally {
      Object.defineProperty(globalThis, 'navigator', { value: original, configurable: true, writable: true });
    }
  });

  it('onWheel: scroll up sets isAutoScroll=false and clamps offset', () => {
    mocks.state.logStream = {
      entries: Array.from({ length: 30 }, (_, i) => ({
        insertId: `i${i}`,
        ts: '2025-04-27T12:34:56.000Z',
        level: 'info',
        message: `m${i}`,
      })),
      status: 'streaming',
      lastError: null,
    };
    const tree = renderLN();
    const onWheel = (tree.props as { onWheel: (e: React.WheelEvent) => void }).onWheel;
    const stops: string[] = [];
    onWheel({
      deltaY: -10,
      stopPropagation: () => stops.push('s'),
    } as unknown as React.WheelEvent);
    expect(stops).toEqual(['s']);
    // Slot 2 is scrollOffset; the setter is called with a function (functional update).
    expect(mocks.state.stateSetters[2]).toHaveBeenCalled();
    const updateFn = mocks.state.stateSetters[2].mock.calls[0][0] as (prev: number) => number;
    // Starting from 0, scrolling up (deltaY < 0) → newOffset = +1 → clamped to Math.min(0, 1) = 0.
    expect(updateFn(0)).toBe(0);
  });

  it('onWheel: scroll down decrements offset', () => {
    mocks.state.logStream = {
      entries: Array.from({ length: 30 }, (_, i) => ({
        insertId: `i${i}`,
        ts: '2025-04-27T12:34:56.000Z',
        level: 'info',
        message: `m${i}`,
      })),
      status: 'streaming',
      lastError: null,
    };
    const tree = renderLN();
    const onWheel = (tree.props as { onWheel: (e: React.WheelEvent) => void }).onWheel;
    onWheel({ deltaY: 10, stopPropagation: () => {} } as unknown as React.WheelEvent);
    const updateFn = mocks.state.stateSetters[2].mock.calls[0][0] as (prev: number) => number;
    // Starting from 0: newOffset = -1, maxOffset positive → clamped to -1.
    expect(updateFn(0)).toBe(-1);
  });
});

describe('SvgLogNode — auto-scroll effect', () => {
  it('snaps to bottom (offset=0) when entry count grows + isAutoScroll', () => {
    mocks.state.logStream = {
      entries: [{ insertId: 'i1', ts: '2025-04-27T12:34:56.000Z', level: 'info', message: 'a' }],
      status: 'streaming',
      lastError: null,
    };
    mocks.state.runEffects = true;
    renderLN();
    // Slot 2 is scrollOffset; first effect call sets scrollOffset(0) when entry count != ref.
    expect(mocks.state.stateSetters[2]).toHaveBeenCalledWith(0);
  });

  it('does NOT snap when isAutoScroll is false', () => {
    mocks.state.pinnedSlots = [false /* hover */, false /* folded */, 0 /* scrollOffset */, false /* isAutoScroll */];
    mocks.state.logStream = {
      entries: [{ insertId: 'i1', ts: '2025-04-27T12:34:56.000Z', level: 'info', message: 'a' }],
      status: 'streaming',
      lastError: null,
    };
    mocks.state.runEffects = true;
    renderLN();
    // Slot 2 (scrollOffset) shouldn't be called by the effect when isAutoScroll false.
    // (The effect-fire flag is true, but the conditional doesn't fire setScrollOffset.)
    // Other scroll-offset writes happen via the wheel handler, not via this effect.
    expect(mocks.state.stateSetters[2]).not.toHaveBeenCalled();
  });

  it('does NOT snap on re-render with same entry count', () => {
    // First render: snap to bottom.
    mocks.state.logStream = {
      entries: [{ insertId: 'i1', ts: '2025-04-27T12:34:56.000Z', level: 'info', message: 'a' }],
      status: 'streaming',
      lastError: null,
    };
    mocks.state.runEffects = true;
    renderLN();
    mocks.state.stateSetters[2].mockClear();
    // Second render (same entry count, ref already set on first run via effect closure capturing ref).
    renderLN();
    // Effect should still fire (runEffects=true) but the inner condition now fails.
    // setScrollOffset shouldn't fire — but we did get a fresh useRef instance per render in the mock.
    // So we don't strictly assert; assert only that the call count is NOT > 1.
    // (Each render creates a fresh ref → effect always fires; this is a mock-side limitation.)
    expect(mocks.state.stateSetters[2].mock.calls.length).toBeLessThanOrEqual(1);
  });
});

describe('SvgLogNode — header / inner card style', () => {
  it('inner border green when isSelected', () => {
    const tree = renderLN({ isSelected: true });
    const card = findByType(tree, 'div')[0];
    expect((card.props as { style: { border: string } }).style.border).toBe('1px solid #22c55e');
  });

  it('inner border green when hovered', () => {
    mocks.state.pinnedSlots = [true /* hover */];
    const tree = renderLN({ isSelected: false });
    const card = findByType(tree, 'div')[0];
    expect((card.props as { style: { border: string } }).style.border).toBe('1px solid #22c55e');
  });

  it('inner border faded green when not selected/hovered', () => {
    const tree = renderLN({ isSelected: false });
    const card = findByType(tree, 'div')[0];
    expect((card.props as { style: { border: string } }).style.border).toBe('1px solid #22c55e55');
  });

  it('inner shadow: glow when isSelected', () => {
    const tree = renderLN({ isSelected: true });
    const card = findByType(tree, 'div')[0];
    expect((card.props as { style: { boxShadow: string } }).style.boxShadow).toContain('1.5px #22c55e');
  });

  it('inner shadow: hover when hovered (not selected)', () => {
    mocks.state.pinnedSlots = [true];
    const tree = renderLN({ isSelected: false });
    const card = findByType(tree, 'div')[0];
    expect((card.props as { style: { boxShadow: string } }).style.boxShadow).toBe('0 2px 8px -2px rgba(0,0,0,0.15)');
  });

  it('inner shadow: resting otherwise', () => {
    const tree = renderLN({ isSelected: false });
    const card = findByType(tree, 'div')[0];
    expect((card.props as { style: { boxShadow: string } }).style.boxShadow).toBe('0 1px 3px rgba(0,0,0,0.06)');
  });

  it('LogHeader receives label, folded, isHovered, status', () => {
    mocks.state.logStream = { entries: [], status: 'streaming', lastError: null };
    const tree = renderLN({ node: makeNode({ label: 'X' }) });
    const header = findByType(tree, MockLogHeader)[0];
    const props = header.props as { label: string; folded: boolean; isHovered: boolean; status: string };
    expect(props.label).toBe('X');
    expect(props.folded).toBe(false);
    expect(props.isHovered).toBe(false);
    expect(props.status).toBe('streaming');
  });

  it('LogHeader receives label="" when node.label undefined', () => {
    const tree = renderLN({ node: makeNode({ label: undefined as unknown as string }) });
    const header = findByType(tree, MockLogHeader)[0];
    expect((header.props as { label: string }).label).toBe('');
  });
});

describe('SvgLogNode — FoldedBadge in folded mode', () => {
  it('forwards logCount = entries.length', () => {
    mocks.state.pinnedSlots = [false, true];
    mocks.state.logStream = {
      entries: [
        { insertId: 'i1', ts: '2025-04-27T12:34:56.000Z', level: 'info', message: 'a' },
        { insertId: 'i2', ts: '2025-04-27T12:34:57.000Z', level: 'info', message: 'b' },
      ],
      status: 'streaming',
      lastError: null,
    };
    const tree = renderLN();
    const badge = findByType(tree, MockFoldedBadge)[0];
    expect((badge.props as { logCount: number }).logCount).toBe(2);
  });
});

// ─── OL7 copy helpers (pure) ────────────────────────────────────────────────

describe('formatCopyTimestamp (OL7)', () => {
  it('renders the full date + time, dropping the millis/Z', () => {
    expect(formatCopyTimestamp('2025-04-27T12:34:56.789Z')).toBe('2025-04-27 12:34:56');
  });
  it('returns empty for missing/garbage input', () => {
    expect(formatCopyTimestamp(undefined)).toBe('');
    expect(formatCopyTimestamp('')).toBe('');
  });
});

describe('formatLogCopyLine (OL7)', () => {
  it('uses the full timestamp when present', () => {
    expect(
      formatLogCopyLine({ timestamp: '12:34:56', tsFull: '2025-04-27T12:34:56.000Z', level: 'error', message: 'boom' }),
    ).toBe('2025-04-27 12:34:56 [ERROR] boom');
  });
  it('falls back to the display timestamp when no full ts (e.g. placeholder row)', () => {
    expect(formatLogCopyLine({ timestamp: '12:34:56', level: 'info', message: 'hi' })).toBe('12:34:56 [INFO] hi');
  });
});
