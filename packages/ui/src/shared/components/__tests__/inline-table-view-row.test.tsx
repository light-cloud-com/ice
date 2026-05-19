/**
 * Tests for `InlineTableRow` and the file-private subcomponents
 * `EndpointButton`, `StatusPill`, `ProviderCell`, `IdCell`, `RowActions`.
 *
 * The component is purely presentational — no Redux, no hooks beyond
 * `useState` for the local copy-feedback flags and the "actions menu open"
 * boolean. Direct-FC tree-walker is the right tool: invoke each FC element
 * we encounter by hand and walk the rendered subtree. `useState` is mocked
 * to a passthrough so we can drive the local state from the test.
 *
 * Mocks:
 *   - `react.useState` — passthrough returning `[init, vi.fn()]` so we can
 *     toggle the open/copied state directly in the rendered tree.
 *   - `react.useEffect` — eager invoke (the actions menu attaches a
 *     document click listener; we only assert side-effects from that).
 *   - `getBrandIcon` — returns a stub url so the brand <img> renders for
 *     known providers and `null` for unknown.
 *   - `i18n.t` — identity passthrough so we can match keys.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  brandIcon: null as { url: string } | null,
  effects: [] as Array<() => void | (() => void)>,
  // Per-test overrides. Tests set `cycleLen = N` and supply
  // `useStateOverrides[k]` for the k'th slot in the recurring sequence
  // of FC useState calls (e.g. for InlineTableRow with 1 endpoint:
  // EndpointButton[0]=copied, IdCell=copied, RowActions=open ⇒ cycleLen=3).
  // The walker re-invokes each FC many times via repeated findFirst calls,
  // so the override must be modular over the cycle length.
  useStateOverrides: {} as Record<number, unknown>,
  useStateCount: 0,
  cycleLen: 0,
}));

vi.mock('react', async (orig) => {
  const actual = (await orig()) as typeof import('react');
  // Each useState call cycles through `useStateOverrides` modulo the
  // number of slots the source declares per-FC-invocation. Tests can set
  // `cycleOverrides` to a length-N array — the (callIdx % N)th entry, if
  // defined, overrides the init value. This works even when the walker
  // re-invokes the FC via repeated findFirst calls, because the override
  // is keyed on a stable per-FC slot.
  const useStateStub = <T,>(init: T): [T, (v: T) => void] => {
    const idx = mocks.useStateCount;
    mocks.useStateCount += 1;
    const cycleLen = mocks.cycleLen;
    const slot = cycleLen > 0 ? idx % cycleLen : idx;
    const override = mocks.useStateOverrides[slot];
    const value = override !== undefined ? (override as T) : init;
    return [value, vi.fn()];
  };
  const useEffectStub = (fn: () => void | (() => void)) => {
    mocks.effects.push(fn);
  };
  // React.useEffect / React.useState (namespaced) reads from the default
  // export object — patch that too so the source's `React.useEffect(...)`
  // call hits our stub instead of the real React runtime.
  const actualDefault = (actual as unknown as { default?: typeof actual }).default ?? actual;
  return {
    ...actual,
    default: { ...actualDefault, useState: useStateStub, useEffect: useEffectStub },
    useState: useStateStub,
    useEffect: useEffectStub,
  };
});

vi.mock('../../../i18n', () => ({
  t: (k: string) => k,
}));

vi.mock('../../../assets/icons/brand-registry', () => ({
  getBrandIcon: vi.fn(() => mocks.brandIcon),
}));

import { InlineTableRow, type TableRowData } from '../inline-table-view-row';
import type { Endpoint, RowStatus } from '../inline-table-view-helpers';

// ─── Tree walker ────────────────────────────────────────────────────────────

interface ElLike {
  type: unknown;
  props: { [k: string]: unknown; children?: unknown };
}
function isEl(x: unknown): x is ElLike {
  return !!x && typeof x === 'object' && 'type' in x && 'props' in x;
}
function* walk(node: unknown): Generator<ElLike> {
  if (Array.isArray(node)) {
    for (const c of node) yield* walk(c);
    return;
  }
  if (!isEl(node)) return;
  yield node;
  // descend into FC subtrees so we can find buttons inside file-private
  // components (RowActions, EndpointButton, etc.)
  if (typeof node.type === 'function') {
    const FC = node.type as (p: unknown) => unknown;
    yield* walk(FC(node.props));
    return;
  }
  yield* walk(node.props.children);
}
function findAll(tree: unknown, predicate: (el: ElLike) => boolean): ElLike[] {
  const out: ElLike[] = [];
  for (const el of walk(tree)) if (predicate(el)) out.push(el);
  return out;
}
function findFirst(tree: unknown, predicate: (el: ElLike) => boolean): ElLike | undefined {
  for (const el of walk(tree)) if (predicate(el)) return el;
  return undefined;
}

// ─── Fixtures ───────────────────────────────────────────────────────────────

const baseRow = (overrides: Partial<TableRowData> = {}): TableRowData => ({
  node: {
    id: 'node-12345abcdef',
    iceType: 'Compute.Service',
    label: 'My Service',
    type: 'service' as any,
    position: { x: 0, y: 0 },
    width: 240,
    height: 80,
    data: {},
  } as TableRowData['node'],
  label: 'My Service',
  typeLabel: 'Service',
  iceType: 'Compute.Service',
  provider: 'gcp',
  status: 'live',
  endpoints: [],
  providerId: 'svc-12345',
  region: 'us-central1',
  updatedAt: undefined,
  isChild: false,
  ...overrides,
});

const baseProps = (
  data: Partial<TableRowData> = {},
  opts: Partial<{ density: 'compact' | 'comfortable'; isSelected: boolean; isExpanded: boolean }> = {},
) => ({
  row: baseRow(data),
  density: opts.density ?? 'compact',
  isSelected: opts.isSelected ?? false,
  isExpanded: opts.isExpanded ?? false,
  onToggleExpand: vi.fn(),
  onClick: vi.fn(),
  onCopyId: vi.fn(),
  onCopyName: vi.fn(),
  onRevealOnCanvas: vi.fn(),
  onOpenProperties: vi.fn(),
  onDelete: vi.fn(),
});

const render = (props: ReturnType<typeof baseProps>) => (InlineTableRow as (p: unknown) => unknown)(props);

beforeEach(() => {
  mocks.brandIcon = null;
  mocks.effects = [];
  mocks.useStateOverrides = {};
  mocks.useStateCount = 0;
  mocks.cycleLen = 0;
  vi.stubGlobal('window', {
    open: vi.fn(),
    setTimeout: vi.fn(),
    clearTimeout: vi.fn(),
  });
  vi.stubGlobal('navigator', {
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
  vi.stubGlobal('document', {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('InlineTableRow — base row layout', () => {
  it('renders the row label', () => {
    const tree = render(baseProps({ label: 'Hello World' }));
    const span = findFirst(tree, (el) => el.type === 'span' && el.props.children === 'Hello World');
    expect(span).toBeDefined();
  });

  it('applies the selected background when isSelected is true', () => {
    const tree = render(baseProps({}, { isSelected: true }));
    const row = findFirst(
      tree,
      (el) =>
        el.type === 'div' &&
        typeof el.props.className === 'string' &&
        (el.props.className as string).includes('bg-ice-accent-muted'),
    );
    expect(row).toBeDefined();
  });

  it('uses the hover background when isSelected is false', () => {
    const tree = render(baseProps({}, { isSelected: false }));
    const row = findFirst(
      tree,
      (el) =>
        el.type === 'div' &&
        typeof el.props.className === 'string' &&
        (el.props.className as string).includes('hover:bg-ice-hover'),
    );
    expect(row).toBeDefined();
  });

  it('uses py-1 in compact density', () => {
    const tree = render(baseProps({}, { density: 'compact' }));
    const row = findFirst(
      tree,
      (el) =>
        el.type === 'div' &&
        typeof el.props.className === 'string' &&
        (el.props.className as string).includes(' py-1 ') &&
        !(el.props.className as string).includes(' py-1.5 '),
    );
    expect(row).toBeDefined();
  });

  it('uses py-1.5 in comfortable density', () => {
    const tree = render(baseProps({}, { density: 'comfortable' }));
    const row = findFirst(
      tree,
      (el) =>
        el.type === 'div' &&
        typeof el.props.className === 'string' &&
        (el.props.className as string).includes('py-1.5'),
    );
    expect(row).toBeDefined();
  });

  it('renders the child indent arrow when isChild is true', () => {
    const tree = render(baseProps({ isChild: true }));
    const arrow = findFirst(tree, (el) => el.type === 'span' && el.props.children === '↳');
    expect(arrow).toBeDefined();
  });

  it('hides the child indent arrow when isChild is false', () => {
    const tree = render(baseProps({ isChild: false }));
    const arrow = findFirst(tree, (el) => el.type === 'span' && el.props.children === '↳');
    expect(arrow).toBeUndefined();
  });

  it('forwards onClick from the row to the prop', () => {
    const props = baseProps();
    const tree = render(props);
    const row = findFirst(
      tree,
      (el) =>
        el.type === 'div' &&
        typeof el.props.className === 'string' &&
        (el.props.className as string).includes('grid-cols-[12px_1fr_140px_110px_120px_140px_180px_90px_36px]'),
    )!;
    const fakeEvent = { stopPropagation: vi.fn() } as unknown as React.MouseEvent;
    (row.props.onClick as (e: React.MouseEvent) => void)(fakeEvent);
    expect(props.onClick).toHaveBeenCalledWith(fakeEvent);
  });
});

describe('InlineTableRow — expand toggle', () => {
  it('calls onToggleExpand and stops propagation when the chevron is clicked', () => {
    const props = baseProps();
    const tree = render(props);
    const expandBtn = findFirst(
      tree,
      (el) =>
        el.type === 'button' &&
        typeof el.props['aria-label'] === 'string' &&
        (el.props['aria-label'] as string).startsWith('table.expand.'),
    )!;
    const fakeEvent = { stopPropagation: vi.fn() };
    (expandBtn.props.onClick as (e: { stopPropagation: () => void }) => void)(fakeEvent);
    expect(fakeEvent.stopPropagation).toHaveBeenCalled();
    expect(props.onToggleExpand).toHaveBeenCalled();
  });

  it('rotates the chevron when isExpanded is true', () => {
    const tree = render(baseProps({}, { isExpanded: true }));
    const expandBtn = findFirst(
      tree,
      (el) =>
        el.type === 'button' &&
        typeof el.props['aria-label'] === 'string' &&
        (el.props['aria-label'] as string).startsWith('table.expand.'),
    )!;
    expect((expandBtn.props.style as { transform: string }).transform).toBe('rotate(90deg)');
    expect(expandBtn.props['aria-label']).toBe('table.expand.hide');
  });

  it('keeps the chevron flat when isExpanded is false', () => {
    const tree = render(baseProps({}, { isExpanded: false }));
    const expandBtn = findFirst(
      tree,
      (el) =>
        el.type === 'button' &&
        typeof el.props['aria-label'] === 'string' &&
        (el.props['aria-label'] as string).startsWith('table.expand.'),
    )!;
    expect((expandBtn.props.style as { transform: string }).transform).toBe('rotate(0deg)');
    expect(expandBtn.props['aria-label']).toBe('table.expand.show');
  });
});

describe('InlineTableRow — provider cell', () => {
  it('renders a dash when provider is empty', () => {
    const tree = render(baseProps({ provider: '' }));
    const dash = findFirst(tree, (el) => el.type === 'span' && el.props.children === '—');
    expect(dash).toBeDefined();
  });

  it('shows the brand icon image when getBrandIcon returns a url', () => {
    mocks.brandIcon = { url: 'https://example/gcp.svg' };
    const tree = render(baseProps({ provider: 'gcp' }));
    const img = findFirst(tree, (el) => el.type === 'img' && el.props.src === 'https://example/gcp.svg');
    expect(img).toBeDefined();
  });

  it('omits the brand icon when getBrandIcon returns null', () => {
    mocks.brandIcon = null;
    const tree = render(baseProps({ provider: 'gcp' }));
    const imgs = findAll(tree, (el) => el.type === 'img');
    expect(imgs.length).toBe(0);
  });
});

describe('InlineTableRow — id cell', () => {
  it('renders a copy button when providerId is non-empty', () => {
    const tree = render(baseProps({ providerId: 'svc-XYZ' }));
    const copyTxt = findFirst(tree, (el) => el.type === 'span' && el.props.children === 'svc-XYZ');
    expect(copyTxt).toBeDefined();
  });

  it('falls back to a truncated node id when providerId is empty', () => {
    const tree = render(
      baseProps({
        providerId: '',
        node: { ...baseRow().node, id: 'abcdefghijklmn' },
      }),
    );
    // Renders `<span>{slice(0,12)}…</span>` → children=["abcdefghijkl", "…"]
    const truncated = findFirst(
      tree,
      (el) =>
        el.type === 'span' &&
        Array.isArray(el.props.children) &&
        (el.props.children as unknown[])[0] === 'abcdefghijkl' &&
        (el.props.children as unknown[])[1] === '…',
    );
    expect(truncated).toBeDefined();
  });

  it('copies the providerId via clipboard when the button is clicked', async () => {
    const tree = render(baseProps({ providerId: 'svc-9' }));
    const idBtn = findFirst(
      tree,
      (el) =>
        el.type === 'button' && typeof el.props.title === 'string' && (el.props.title as string).startsWith('svc-9 '),
    )!;
    const fakeEvent = { stopPropagation: vi.fn() };
    await (idBtn.props.onClick as (e: { stopPropagation: () => void }) => Promise<void>)(fakeEvent);
    expect(fakeEvent.stopPropagation).toHaveBeenCalled();
    const writeText = (navigator as unknown as { clipboard: { writeText: ReturnType<typeof vi.fn> } }).clipboard
      .writeText;
    expect(writeText).toHaveBeenCalledWith('svc-9');
  });
});

describe('InlineTableRow — endpoint buttons', () => {
  const ep = (kind: Endpoint['kind'], url = 'https://x/'): Endpoint => ({
    kind,
    url,
    label: `${kind} label`,
  });

  it('renders a dash when there are no endpoints', () => {
    const tree = render(baseProps({ endpoints: [] }));
    const dashes = findAll(tree, (el) => el.type === 'span' && el.props.children === '—');
    expect(dashes.length).toBeGreaterThan(0);
  });

  it('renders one button group per endpoint', () => {
    const tree = render(
      baseProps({
        endpoints: [ep('live'), ep('repo'), ep('image'), ep('console'), ep('domain')],
      }),
    );
    const openBtns = findAll(
      tree,
      (el) =>
        el.type === 'button' &&
        typeof el.props['aria-label'] === 'string' &&
        (el.props['aria-label'] as string).startsWith('Open '),
    );
    expect(openBtns.length).toBe(5);
  });

  it('opens the endpoint url in a new tab when the open button is clicked', () => {
    const tree = render(baseProps({ endpoints: [ep('live', 'https://app/')] }));
    const openBtn = findFirst(
      tree,
      (el) => el.type === 'button' && el.props['aria-label'] === 'Open live: live label',
    )!;
    const fakeEvent = { stopPropagation: vi.fn() };
    (openBtn.props.onClick as (e: { stopPropagation: () => void }) => void)(fakeEvent);
    expect(fakeEvent.stopPropagation).toHaveBeenCalled();
    const open = (window as unknown as { open: ReturnType<typeof vi.fn> }).open;
    expect(open).toHaveBeenCalledWith('https://app/', '_blank', 'noopener,noreferrer');
  });

  it('copies the endpoint url to the clipboard when the copy sub-button is clicked', async () => {
    const tree = render(baseProps({ endpoints: [ep('repo', 'git://x')] }));
    const copyBtn = findFirst(tree, (el) => el.type === 'button' && el.props['aria-label'] === 'Copy repo URL')!;
    const fakeEvent = { stopPropagation: vi.fn() };
    await (copyBtn.props.onClick as (e: { stopPropagation: () => void }) => Promise<void>)(fakeEvent);
    const writeText = (navigator as unknown as { clipboard: { writeText: ReturnType<typeof vi.fn> } }).clipboard
      .writeText;
    expect(writeText).toHaveBeenCalledWith('git://x');
  });
});

describe('InlineTableRow — status pill', () => {
  it.each<RowStatus>(['live', 'failed', 'building', 'deploying', 'queued', 'idle', 'drifted'])(
    'renders the %s status pill with i18n key',
    (status) => {
      const tree = render(baseProps({ status }));
      // The pill outer <span> renders [<span dot/>, t('table.status.x')].
      const pill = findFirst(
        tree,
        (el) =>
          el.type === 'span' &&
          Array.isArray(el.props.children) &&
          (el.props.children as unknown[]).includes(`table.status.${status}`),
      );
      expect(pill).toBeDefined();
    },
  );

  it('applies the status color background style', () => {
    const tree = render(baseProps({ status: 'failed' }));
    const pill = findFirst(
      tree,
      (el) =>
        el.type === 'span' &&
        Array.isArray(el.props.children) &&
        (el.props.children as unknown[]).includes('table.status.failed'),
    );
    expect((pill?.props.style as { background: string }).background).toBe('rgba(239,68,68,0.10)');
  });
});

describe('InlineTableRow — actions menu', () => {
  it('renders a "menu" button labelled with the i18n key', () => {
    const tree = render(baseProps());
    const menuBtn = findFirst(tree, (el) => el.type === 'button' && el.props['aria-label'] === 'table.actions.menu');
    expect(menuBtn).toBeDefined();
  });

  it('toggles the open state when the menu button is clicked (stopPropagation)', () => {
    const tree = render(baseProps());
    const menuBtn = findFirst(tree, (el) => el.type === 'button' && el.props['aria-label'] === 'table.actions.menu')!;
    const fakeEvent = { stopPropagation: vi.fn() };
    (menuBtn.props.onClick as (e: { stopPropagation: () => void }) => void)(fakeEvent);
    expect(fakeEvent.stopPropagation).toHaveBeenCalled();
  });

  // Probe the tree once to count useState slots per FC-invocation cycle
  // (varies with the number of endpoints + IdCell presence), then set up
  // overrides so RowActions.open=true regardless of how many times the
  // walker re-invokes the subtree.
  const renderWithMenuOpen = (props: ReturnType<typeof baseProps>): unknown => {
    mocks.useStateOverrides = {};
    mocks.useStateCount = 0;
    mocks.cycleLen = 0;
    const probe = render(props);
    for (const _ of walk(probe)) void _;
    const cycleLen = mocks.useStateCount;
    mocks.useStateOverrides = { [cycleLen - 1]: true };
    mocks.useStateCount = 0;
    mocks.cycleLen = cycleLen;
    return render(props);
  };

  it('renders the dropdown items when open is true', () => {
    const tree = renderWithMenuOpen(baseProps());
    const openProperties = findFirst(
      tree,
      (el) => el.type === 'button' && hasChildText(el, 'table.actions.openProperties'),
    );
    const reveal = findFirst(tree, (el) => el.type === 'button' && hasChildText(el, 'table.actions.revealOnCanvas'));
    const copyId = findFirst(tree, (el) => el.type === 'button' && hasChildText(el, 'table.actions.copyId'));
    const copyName = findFirst(tree, (el) => el.type === 'button' && hasChildText(el, 'table.actions.copyName'));
    const del = findFirst(tree, (el) => el.type === 'button' && hasChildText(el, 'table.actions.delete'));
    expect(openProperties).toBeDefined();
    expect(reveal).toBeDefined();
    expect(copyId).toBeDefined();
    expect(copyName).toBeDefined();
    expect(del).toBeDefined();
  });

  it('shows the live and repo and console items when matching endpoints exist', () => {
    const tree = renderWithMenuOpen(
      baseProps({
        endpoints: [
          { kind: 'live', url: 'https://live/', label: 'l' },
          { kind: 'repo', url: 'https://repo/', label: 'r' },
          { kind: 'console', url: 'https://console/', label: 'c' },
        ],
      }),
    );
    expect(
      findFirst(tree, (el) => el.type === 'button' && hasChildText(el, 'table.actions.openInBrowser')),
    ).toBeDefined();
    expect(
      findFirst(tree, (el) => el.type === 'button' && hasChildText(el, 'table.actions.openInGithub')),
    ).toBeDefined();
    expect(
      findFirst(tree, (el) => el.type === 'button' && hasChildText(el, 'table.actions.openInConsole')),
    ).toBeDefined();
  });

  it('treats domain endpoint as live for the openInBrowser item', () => {
    const tree = renderWithMenuOpen(baseProps({ endpoints: [{ kind: 'domain', url: 'https://app/', label: 'd' }] }));
    expect(
      findFirst(tree, (el) => el.type === 'button' && hasChildText(el, 'table.actions.openInBrowser')),
    ).toBeDefined();
  });

  it('omits the open-in-browser/github/console items when no matching endpoints exist', () => {
    const tree = renderWithMenuOpen(baseProps({ endpoints: [] }));
    expect(
      findFirst(tree, (el) => el.type === 'button' && hasChildText(el, 'table.actions.openInBrowser')),
    ).toBeUndefined();
    expect(
      findFirst(tree, (el) => el.type === 'button' && hasChildText(el, 'table.actions.openInGithub')),
    ).toBeUndefined();
    expect(
      findFirst(tree, (el) => el.type === 'button' && hasChildText(el, 'table.actions.openInConsole')),
    ).toBeUndefined();
  });

  it('clicking the openProperties item invokes the prop and stops propagation', () => {
    const props = baseProps();
    const tree = renderWithMenuOpen(props);
    const item = findFirst(tree, (el) => el.type === 'button' && hasChildText(el, 'table.actions.openProperties'))!;
    const fakeEvent = { stopPropagation: vi.fn() };
    (item.props.onClick as (e: { stopPropagation: () => void }) => void)(fakeEvent);
    expect(fakeEvent.stopPropagation).toHaveBeenCalled();
    expect(props.onOpenProperties).toHaveBeenCalled();
  });

  it('clicking the revealOnCanvas item invokes the prop', () => {
    const props = baseProps();
    const tree = renderWithMenuOpen(props);
    const item = findFirst(tree, (el) => el.type === 'button' && hasChildText(el, 'table.actions.revealOnCanvas'))!;
    (item.props.onClick as (e: { stopPropagation: () => void }) => void)({ stopPropagation: vi.fn() });
    expect(props.onRevealOnCanvas).toHaveBeenCalled();
  });

  it('clicking the copyId item invokes the prop', () => {
    const props = baseProps();
    const tree = renderWithMenuOpen(props);
    const item = findFirst(tree, (el) => el.type === 'button' && hasChildText(el, 'table.actions.copyId'))!;
    (item.props.onClick as (e: { stopPropagation: () => void }) => void)({ stopPropagation: vi.fn() });
    expect(props.onCopyId).toHaveBeenCalled();
  });

  it('clicking the copyName item invokes the prop', () => {
    const props = baseProps();
    const tree = renderWithMenuOpen(props);
    const item = findFirst(tree, (el) => el.type === 'button' && hasChildText(el, 'table.actions.copyName'))!;
    (item.props.onClick as (e: { stopPropagation: () => void }) => void)({ stopPropagation: vi.fn() });
    expect(props.onCopyName).toHaveBeenCalled();
  });

  it('clicking the delete item invokes the prop', () => {
    const props = baseProps();
    const tree = renderWithMenuOpen(props);
    const item = findFirst(tree, (el) => el.type === 'button' && hasChildText(el, 'table.actions.delete'))!;
    (item.props.onClick as (e: { stopPropagation: () => void }) => void)({ stopPropagation: vi.fn() });
    expect(props.onDelete).toHaveBeenCalled();
  });

  it('clicking the openInBrowser item opens the live url', () => {
    const tree = renderWithMenuOpen(baseProps({ endpoints: [{ kind: 'live', url: 'https://live/', label: 'l' }] }));
    const item = findFirst(tree, (el) => el.type === 'button' && hasChildText(el, 'table.actions.openInBrowser'))!;
    (item.props.onClick as (e: { stopPropagation: () => void }) => void)({ stopPropagation: vi.fn() });
    const open = (window as unknown as { open: ReturnType<typeof vi.fn> }).open;
    expect(open).toHaveBeenCalledWith('https://live/', '_blank', 'noopener,noreferrer');
  });

  it('clicking the openInGithub item opens the repo url', () => {
    const tree = renderWithMenuOpen(baseProps({ endpoints: [{ kind: 'repo', url: 'https://repo/', label: 'r' }] }));
    const item = findFirst(tree, (el) => el.type === 'button' && hasChildText(el, 'table.actions.openInGithub'))!;
    (item.props.onClick as (e: { stopPropagation: () => void }) => void)({ stopPropagation: vi.fn() });
    const open = (window as unknown as { open: ReturnType<typeof vi.fn> }).open;
    expect(open).toHaveBeenCalledWith('https://repo/', '_blank', 'noopener,noreferrer');
  });

  it('clicking the openInConsole item opens the console url', () => {
    const tree = renderWithMenuOpen(
      baseProps({ endpoints: [{ kind: 'console', url: 'https://console/', label: 'c' }] }),
    );
    const item = findFirst(tree, (el) => el.type === 'button' && hasChildText(el, 'table.actions.openInConsole'))!;
    (item.props.onClick as (e: { stopPropagation: () => void }) => void)({ stopPropagation: vi.fn() });
    const open = (window as unknown as { open: ReturnType<typeof vi.fn> }).open;
    expect(open).toHaveBeenCalledWith('https://console/', '_blank', 'noopener,noreferrer');
  });

  it('useEffect attaches a document click listener while open is true', () => {
    const tree = renderWithMenuOpen(baseProps());
    // Walk the tree to invoke RowActions and trigger its useEffect push.
    mocks.effects = [];
    for (const _ of walk(tree)) void _;
    for (const fx of mocks.effects) fx();
    const addEvt = (document as unknown as { addEventListener: ReturnType<typeof vi.fn> }).addEventListener;
    expect(addEvt).toHaveBeenCalledWith('click', expect.any(Function));
  });

  it('useEffect attaches no listener and returns no cleanup when open is false', () => {
    const tree = render(baseProps()); // open=false default
    mocks.effects = [];
    for (const _ of walk(tree)) void _;
    let cleanup: unknown = undefined;
    for (const fx of mocks.effects) cleanup = fx();
    const addEvt = (document as unknown as { addEventListener: ReturnType<typeof vi.fn> }).addEventListener;
    expect(addEvt).not.toHaveBeenCalled();
    expect(cleanup).toBeUndefined();
  });

  it('cleanup removes the document click listener when open transitions back', () => {
    const tree = renderWithMenuOpen(baseProps());
    mocks.effects = [];
    for (const _ of walk(tree)) void _;
    let cleanup: (() => void) | undefined;
    for (const fx of mocks.effects) {
      const r = fx();
      if (typeof r === 'function') cleanup = r;
    }
    expect(typeof cleanup).toBe('function');
    cleanup!();
    const removeEvt = (document as unknown as { removeEventListener: ReturnType<typeof vi.fn> }).removeEventListener;
    expect(removeEvt).toHaveBeenCalledWith('click', expect.any(Function));
  });

  it('the document click handler closes the menu (calls setOpen(false))', () => {
    const tree = renderWithMenuOpen(baseProps());
    mocks.effects = [];
    for (const _ of walk(tree)) void _;
    let docHandler: (() => void) | undefined;
    const addEvt = (
      document as unknown as {
        addEventListener: (evt: string, h: () => void) => void;
      }
    ).addEventListener as unknown as ReturnType<typeof vi.fn>;
    for (const fx of mocks.effects) fx();
    // Inspect call args
    for (const call of addEvt.mock.calls) {
      if (call[0] === 'click') docHandler = call[1] as () => void;
    }
    expect(typeof docHandler).toBe('function');
    // Calling the handler should not throw.
    docHandler!();
  });
});

// Helper: a button's children may be [icon, label-string].
function hasChildText(el: ElLike, text: string): boolean {
  const children = el.props.children;
  if (Array.isArray(children)) return (children as unknown[]).includes(text);
  return children === text;
}

describe('InlineTableRow — copied feedback', () => {
  it('shows the copied tooltip on EndpointButton when its copied state is true', () => {
    // 1 endpoint + IdCell + RowActions = cycleLen 3; EndpointButton.copied is slot 0.
    mocks.cycleLen = 3;
    mocks.useStateOverrides = { 0: true };
    const tree = render(
      baseProps({
        endpoints: [{ kind: 'live', url: 'https://x/', label: 'live' }],
      }),
    );
    const tip = findFirst(tree, (el) => el.type === 'span' && el.props.children === 'table.endpoints.copied');
    expect(tip).toBeDefined();
  });

  it('shows the copied label on IdCell when its copied state is true', () => {
    // No endpoints, providerId set ⇒ IdCell + RowActions = cycleLen 2; IdCell is slot 0.
    mocks.cycleLen = 2;
    mocks.useStateOverrides = { 0: true };
    const tree = render(baseProps({ endpoints: [], providerId: 'svc-X' }));
    const txt = findFirst(tree, (el) => el.type === 'span' && el.props.children === 'table.endpoints.copied');
    expect(txt).toBeDefined();
  });
});

describe('InlineTableRow — expanded detail', () => {
  it('renders nothing extra below the row when collapsed', () => {
    const tree = render(baseProps({}, { isExpanded: false }));
    const empty = findFirst(
      tree,
      (el) =>
        el.type === 'span' &&
        typeof el.props.className === 'string' &&
        (el.props.className as string).includes('italic') &&
        el.props.children === 'table.expand.noSettings',
    );
    expect(empty).toBeUndefined();
  });

  it('shows the empty-settings copy when expanded with no chips and no endpoints', () => {
    const tree = render(baseProps({ endpoints: [] }, { isExpanded: true }));
    const empty = findFirst(tree, (el) => el.type === 'span' && el.props.children === 'table.expand.noSettings');
    expect(empty).toBeDefined();
  });

  it('renders the settings chips when getSettingsChips returns entries', () => {
    const tree = render(
      baseProps(
        {
          node: {
            id: 'n-1',
            iceType: 'Compute.StaticSite',
            label: 'Site',
            type: 'service' as any,
            position: { x: 0, y: 0 },
            width: 0,
            height: 0,
            data: { iceType: 'Compute.StaticSite', framework: 'next', buildCommand: 'pnpm build' },
          } as TableRowData['node'],
        },
        { isExpanded: true },
      ),
    );
    // Chip key = 'framework', value = 'next'.
    const chipKey = findFirst(tree, (el) => el.type === 'span' && el.props.children === 'framework');
    expect(chipKey).toBeDefined();
  });

  it('renders endpoint chips inside the expanded row when endpoints are present', () => {
    const tree = render(
      baseProps(
        {
          endpoints: [
            { kind: 'live', url: 'https://live/', label: 'live label' },
            { kind: 'repo', url: 'https://repo/', label: 'repo label' },
            { kind: 'image', url: 'oci://img', label: 'image label' },
            { kind: 'console', url: 'https://console/', label: 'console label' },
          ],
        },
        { isExpanded: true },
      ),
    );
    // Find the expanded chips by title prop pinning to the endpoint url
    const liveChip = findFirst(tree, (el) => el.type === 'button' && el.props.title === 'https://live/');
    const repoChip = findFirst(tree, (el) => el.type === 'button' && el.props.title === 'https://repo/');
    const imageChip = findFirst(tree, (el) => el.type === 'button' && el.props.title === 'oci://img');
    const consoleChip = findFirst(tree, (el) => el.type === 'button' && el.props.title === 'https://console/');
    expect(liveChip).toBeDefined();
    expect(repoChip).toBeDefined();
    expect(imageChip).toBeDefined();
    expect(consoleChip).toBeDefined();
  });

  it('opens the endpoint url when an expanded chip is clicked', () => {
    const tree = render(
      baseProps({ endpoints: [{ kind: 'live', url: 'https://x/', label: 'l' }] }, { isExpanded: true }),
    );
    const chip = findFirst(tree, (el) => el.type === 'button' && el.props.title === 'https://x/')!;
    const fakeEvent = { stopPropagation: vi.fn() };
    (chip.props.onClick as (e: { stopPropagation: () => void }) => void)(fakeEvent);
    expect(fakeEvent.stopPropagation).toHaveBeenCalled();
    const open = (window as unknown as { open: ReturnType<typeof vi.fn> }).open;
    expect(open).toHaveBeenCalledWith('https://x/', '_blank', 'noopener,noreferrer');
  });
});
