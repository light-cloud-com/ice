/**
 * rf-pdpl-15 — ResultsSummary.
 *
 * Second Layer 2 unit. Direct-FC tree-walker pattern (cite
 * `vi-hoisted-for-stable-mock-identity-in-direct-fc-tree-walker-tests`,
 * `tree-walker-for-react-fc-tests-must-flatten-nested-children-arrays`,
 * `lucide-react-icons-are-forwardref-objects-not-fcs-for-tree-walker-predicates`).
 *
 * Surface notes:
 *   - The component carries TWO IIFE blocks per row (primary-output and
 *     error-rendering). Each is rendered as a `Symbol(react.element)` with
 *     `el.type === Symbol(react.fragment)` (the `<>...</>` shorthand) OR as
 *     a single `div` returned from the IIFE. The walker yields these like any
 *     other element — fragments are walked transparently because their type
 *     is the React.Fragment symbol (not a function), so the walker falls
 *     through to `props.children`.
 *   - `cn` is mocked as a passthrough that joins truthy args with spaces.
 *   - `summaryCounts`, `buildResultsSummaryText`, `primaryOutput`,
 *     `openExternalUrl`, `isApiNotEnabledError`, `extractApiEnableUrl` are all
 *     mocked via hoisted spies — the test owns the inputs to those four
 *     dependencies independently of the real implementations (which have their
 *     own coverage in the rf-pdpl-4/-2 unit tests).
 *   - `navigator.clipboard.writeText` is stubbed via `vi.stubGlobal('navigator',
 *     ...)` per the dns-records-section pattern. The provider_id and primary-
 *     output paths call `writeText` SYNCHRONOUSLY without `.catch(...)`, so the
 *     spy returns a resolved promise to match runtime; the "Copy summary" path
 *     IS chained with `.catch(() => undefined)` and exercises the error-tolerant
 *     branch only when we want to. Default to resolve.
 *   - lucide icons (`CheckCircle`, `AlertCircle`, `ArrowRight`, `ExternalLink`)
 *     are forwardRef objects — predicates that gate on `typeof el.type === 'function'`
 *     filter them out. We instead match on className substrings or on the icon's
 *     `displayName` property reachable via `(el.type as { render?: { displayName?: string } }).render`.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoist all mocks for stable identity (cite
// `vi-hoisted-for-stable-mock-identity-in-direct-fc-tree-walker-tests`).
const mocks = vi.hoisted(() => ({
  // i18n
  t: vi.fn((key: string, opts?: { count?: number } & Record<string, unknown>) =>
    opts?.count != null ? `${key}:count=${opts.count}` : key,
  ),
  // utils — cn passthrough joining truthy args with spaces (matches real cn semantics for our assertions)
  cn: vi.fn((...args: unknown[]) => args.filter(Boolean).join(' ')),
  // utils/results-summary-text
  summaryCounts: vi.fn(),
  buildResultsSummaryText: vi.fn((_: unknown, opts: { errorsOnly: boolean }) =>
    opts.errorsOnly ? '<errors>' : '<summary>',
  ),
  // output-extractors
  primaryOutput: vi.fn(),
  // utils/open-external-url
  openExternalUrl: vi.fn(),
  // shared/utils/gcp-errors
  isApiNotEnabledError: vi.fn(),
  extractApiEnableUrl: vi.fn(),
  // navigator.clipboard.writeText
  writeText: vi.fn((_: string): Promise<void> => Promise.resolve()),
}));

beforeEach(() => {
  mocks.t.mockClear();
  mocks.cn.mockClear();
  mocks.summaryCounts.mockReset();
  mocks.buildResultsSummaryText.mockClear();
  mocks.primaryOutput.mockReset();
  mocks.openExternalUrl.mockReset();
  mocks.isApiNotEnabledError.mockReset();
  mocks.extractApiEnableUrl.mockReset();
  mocks.writeText.mockReset();
  mocks.writeText.mockImplementation(() => Promise.resolve());
});

vi.mock('../../../../i18n', () => ({
  useTranslation: () => ({ t: mocks.t }),
}));

vi.mock('../../../../shared/utils/cn', () => ({
  cn: mocks.cn,
}));

vi.mock('../../../../shared/utils/gcp-errors', () => ({
  isApiNotEnabledError: mocks.isApiNotEnabledError,
  extractApiEnableUrl: mocks.extractApiEnableUrl,
}));

vi.mock('../../utils/results-summary-text', () => ({
  summaryCounts: mocks.summaryCounts,
  buildResultsSummaryText: mocks.buildResultsSummaryText,
}));

vi.mock('../../output-extractors', () => ({
  primaryOutput: mocks.primaryOutput,
}));

vi.mock('../../utils/open-external-url', () => ({
  openExternalUrl: mocks.openExternalUrl,
}));

// `navigator.clipboard.writeText` lives on the global `navigator` object;
// stub it per `vi-hoisted-for-stable-mock-identity-in-direct-fc-tree-walker-tests`
// + the dns-records-section.test.tsx prior art.
vi.stubGlobal('navigator', { clipboard: { writeText: mocks.writeText } });

import { CheckCircle, AlertCircle, ExternalLink } from 'lucide-react';
import { ResultsSummary } from '../results-summary';

// ─── Tree walker (rf-pdpl-7..14 style) ──────────────────────────────────────

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
  if (typeof el.type === 'function') {
    try {
      const FC = el.type as (props: unknown) => React.ReactNode;
      const rendered = FC(el.props);
      yield* walk(rendered as ReactNodeLike);
    } catch {
      // Opaque FC — skip its subtree.
    }
    return;
  }
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

function collectText(tree: React.ReactNode): string {
  const parts: string[] = [];
  function visit(n: ReactNodeLike): void {
    if (n == null || typeof n === 'boolean') return;
    if (typeof n === 'string') {
      parts.push(n);
      return;
    }
    if (typeof n === 'number') {
      parts.push(String(n));
      return;
    }
    if (Array.isArray(n)) {
      for (const c of n) visit(c as ReactNodeLike);
      return;
    }
    const el = n as React.ReactElement;
    if (typeof el.type === 'function') {
      try {
        const FC = el.type as (props: unknown) => React.ReactNode;
        visit(FC(el.props) as ReactNodeLike);
      } catch {
        // Opaque FC.
      }
      return;
    }
    const children = (el.props as { children?: React.ReactNode } | undefined)?.children;
    if (children != null) visit(children);
  }
  visit(tree);
  return parts.join('');
}

// ─── Helpers ────────────────────────────────────────────────────────────────

type Result = {
  name: string;
  type: string;
  action: string;
  success: boolean;
  error?: string;
  api_enable_url?: string;
  provider_id?: string;
  outputs?: Record<string, unknown>;
  duration_ms?: number;
};

const renderSummary = (results: Result[]): React.ReactElement => {
  const FC = ResultsSummary as unknown as (props: { results: Result[] }) => React.ReactElement;
  return FC({ results });
};

const baseResult = (overrides: Partial<Result> = {}): Result => ({
  name: 'my-bucket',
  type: 'gcp.storage.bucket',
  action: 'create',
  success: true,
  ...overrides,
});

const setCounts = (counts: {
  succeeded: number;
  failed: number;
  totalMs: number;
  allOk: boolean;
  total?: number;
}): void => {
  mocks.summaryCounts.mockReset();
  mocks.summaryCounts.mockReturnValue({
    succeeded: counts.succeeded,
    failed: counts.failed,
    total: counts.total ?? counts.succeeded + counts.failed,
    totalMs: counts.totalMs,
    allOk: counts.allOk,
  });
};

// Lucide icons are forwardRef objects (cite
// `lucide-react-icons-are-forwardref-objects-not-fcs-for-tree-walker-predicates`).
// Match by reference equality on `el.type` against the imported icon — under
// the React/JSX runtime, `<CheckCircle ... />` produces an element whose
// `type` is the same forwardRef object the source imported. Because lucide
// re-exports `CheckCircle` and `AlertCircle` as aliases for the new
// `CircleCheckBig` and `CircleAlert` icons in v0.577, the runtime references
// the alias-target identity, but the test imports the same alias name and
// reference equality is preserved transitively.
const findIconsByRef = (tree: React.ReactNode, IconRef: unknown): React.ReactElement[] =>
  findByPredicate(tree, (el) => el.type === IconRef);

// Find buttons by their visible text.
const findButtonsByText = (tree: React.ReactNode, text: string): React.ReactElement[] =>
  findByPredicate(tree, (el) => el.type === 'button' && collectText(el).trim() === text);

// Find buttons by `title` attribute.
const findButtonsByTitle = (tree: React.ReactNode, title: string): React.ReactElement[] =>
  findByPredicate(tree, (el) => el.type === 'button' && (el.props as { title?: string }).title === title);

// ─── Header tests ───────────────────────────────────────────────────────────

describe('ResultsSummary — header', () => {
  it('renders CheckCircle + "Deploy succeeded" + emerald color when allOk=true', () => {
    setCounts({ succeeded: 2, failed: 0, totalMs: 1000, allOk: true });
    const tree = renderSummary([baseResult()]);
    const text = collectText(tree);
    expect(text).toContain('Deploy succeeded');

    const checkIcons = findIconsByRef(tree, CheckCircle);
    expect(checkIcons.length).toBeGreaterThanOrEqual(1);

    const emeraldHeader = findByPredicate(tree, (el) => {
      if (el.type !== 'span') return false;
      const className = (el.props as { className?: string }).className;
      return typeof className === 'string' && className.includes('text-emerald-700');
    });
    expect(emeraldHeader).toHaveLength(1);
    expect(collectText(emeraldHeader[0])).toBe('Deploy succeeded');
  });

  it('renders AlertCircle + "Deploy finished with errors" + red color when allOk=false', () => {
    setCounts({ succeeded: 1, failed: 1, totalMs: 1000, allOk: false });
    const tree = renderSummary([baseResult({ success: true }), baseResult({ success: false, error: 'boom' })]);
    const text = collectText(tree);
    expect(text).toContain('Deploy finished with errors');
    expect(text).not.toContain('Deploy succeeded');

    const alertIcons = findIconsByRef(tree, AlertCircle);
    expect(alertIcons.length).toBeGreaterThanOrEqual(1);

    const redHeader = findByPredicate(tree, (el) => {
      if (el.type !== 'span') return false;
      const className = (el.props as { className?: string }).className;
      return typeof className === 'string' && className.includes('text-red-700');
    });
    expect(redHeader).toHaveLength(1);
    expect(collectText(redHeader[0])).toBe('Deploy finished with errors');
  });

  it('renders total time as (totalMs / 1000).toFixed(1) + "s"', () => {
    setCounts({ succeeded: 1, failed: 0, totalMs: 4567, allOk: true });
    const tree = renderSummary([baseResult()]);
    const text = collectText(tree);
    expect(text).toContain('4.6s');
  });

  it('formats 0 ms as "0.0s"', () => {
    setCounts({ succeeded: 0, failed: 0, totalMs: 0, allOk: true });
    const tree = renderSummary([]);
    const text = collectText(tree);
    expect(text).toContain('0.0s');
  });

  it('renders the succeeded count via the deploy.progress.succeeded i18n key', () => {
    setCounts({ succeeded: 3, failed: 0, totalMs: 1000, allOk: true });
    renderSummary([baseResult()]);
    expect(mocks.t).toHaveBeenCalledWith('deploy.progress.succeeded', { count: 3 });
  });

  it('does NOT render the failed count when failed === 0', () => {
    setCounts({ succeeded: 3, failed: 0, totalMs: 1000, allOk: true });
    renderSummary([baseResult()]);
    expect(mocks.t).not.toHaveBeenCalledWith('deploy.progress.failed', expect.anything());
  });

  it('renders the failed count via the deploy.progress.failed i18n key when failed > 0', () => {
    setCounts({ succeeded: 1, failed: 2, totalMs: 1000, allOk: false });
    renderSummary([baseResult()]);
    expect(mocks.t).toHaveBeenCalledWith('deploy.progress.failed', { count: 2 });
  });
});

// ─── Copy buttons ───────────────────────────────────────────────────────────

describe('ResultsSummary — copy summary / copy errors buttons', () => {
  it('"Copy summary" button is always present', () => {
    setCounts({ succeeded: 1, failed: 0, totalMs: 1000, allOk: true });
    const tree = renderSummary([baseResult()]);
    const btns = findButtonsByText(tree, 'Copy summary');
    expect(btns).toHaveLength(1);
  });

  it('"Copy summary" click writes buildResultsSummaryText(results, { errorsOnly: false }) to the clipboard', () => {
    setCounts({ succeeded: 1, failed: 0, totalMs: 1000, allOk: true });
    const results = [baseResult()];
    const tree = renderSummary(results);
    const btn = findButtonsByText(tree, 'Copy summary')[0];
    (btn.props as { onClick: () => void }).onClick();
    expect(mocks.buildResultsSummaryText).toHaveBeenCalledWith(results, { errorsOnly: false });
    expect(mocks.writeText).toHaveBeenCalledWith('<summary>');
  });

  it('"Copy errors" button is hidden when failed === 0', () => {
    setCounts({ succeeded: 2, failed: 0, totalMs: 1000, allOk: true });
    const tree = renderSummary([baseResult()]);
    const btns = findButtonsByText(tree, 'Copy errors');
    expect(btns).toHaveLength(0);
  });

  it('"Copy errors" button is rendered when failed > 0', () => {
    setCounts({ succeeded: 1, failed: 1, totalMs: 1000, allOk: false });
    const tree = renderSummary([baseResult({ success: false, error: 'boom' })]);
    const btns = findButtonsByText(tree, 'Copy errors');
    expect(btns).toHaveLength(1);
  });

  it('"Copy errors" click writes the errorsOnly: true variant', () => {
    setCounts({ succeeded: 1, failed: 1, totalMs: 1000, allOk: false });
    const results = [baseResult({ success: false, error: 'boom' })];
    const tree = renderSummary(results);
    const btn = findButtonsByText(tree, 'Copy errors')[0];
    (btn.props as { onClick: () => void }).onClick();
    expect(mocks.buildResultsSummaryText).toHaveBeenCalledWith(results, { errorsOnly: true });
    expect(mocks.writeText).toHaveBeenCalledWith('<errors>');
  });

  it('"Copy summary" tolerates a clipboard rejection without throwing (the .catch(() => undefined) branch)', () => {
    setCounts({ succeeded: 1, failed: 0, totalMs: 1000, allOk: true });
    mocks.writeText.mockImplementationOnce(() => Promise.reject(new Error('denied')));
    const tree = renderSummary([baseResult()]);
    const btn = findButtonsByText(tree, 'Copy summary')[0];
    expect(() => (btn.props as { onClick: () => void }).onClick()).not.toThrow();
  });
});

// ─── Per-row rendering ──────────────────────────────────────────────────────

describe('ResultsSummary — per-row rendering', () => {
  it('renders a CheckCircle on a successful row', () => {
    setCounts({ succeeded: 1, failed: 0, totalMs: 1000, allOk: true });
    mocks.primaryOutput.mockReturnValue(null);
    const tree = renderSummary([baseResult({ success: true })]);
    // The header has its own CheckCircle, so we expect at least 3 (header outer
    // + header succeeded chip + row icon).
    const checks = findIconsByRef(tree, CheckCircle);
    expect(checks.length).toBeGreaterThanOrEqual(3);
  });

  it('renders an AlertCircle on a failed row', () => {
    setCounts({ succeeded: 1, failed: 1, totalMs: 1000, allOk: false });
    mocks.primaryOutput.mockReturnValue(null);
    mocks.isApiNotEnabledError.mockReturnValue(false);
    const tree = renderSummary([baseResult({ success: false, error: 'boom' })]);
    const alerts = findIconsByRef(tree, AlertCircle);
    // Header (allOk=false) renders an AlertCircle + the row's icon → at least 2.
    expect(alerts.length).toBeGreaterThanOrEqual(2);
  });

  it('renders the resource name and type', () => {
    setCounts({ succeeded: 1, failed: 0, totalMs: 1000, allOk: true });
    mocks.primaryOutput.mockReturnValue(null);
    const tree = renderSummary([baseResult({ name: 'my-bucket', type: 'gcp.storage.bucket' })]);
    const text = collectText(tree);
    expect(text).toContain('my-bucket');
    expect(text).toContain('gcp.storage.bucket');
  });

  it('renders the duration suffix when r.duration_ms is truthy', () => {
    setCounts({ succeeded: 1, failed: 0, totalMs: 1500, allOk: true });
    mocks.primaryOutput.mockReturnValue(null);
    const tree = renderSummary([baseResult({ duration_ms: 1500 })]);
    const text = collectText(tree);
    // 1500ms → 1.5s (the row's per-resource duration).
    expect(text).toContain('1.5s');
  });

  it('omits the duration suffix when r.duration_ms is undefined', () => {
    setCounts({ succeeded: 1, failed: 0, totalMs: 0, allOk: true });
    mocks.primaryOutput.mockReturnValue(null);
    const tree = renderSummary([baseResult({ duration_ms: undefined })]);
    // The header still renders "0.0s" from the (totalMs / 1000).toFixed(1) call.
    // We assert that there is exactly one ".s" pattern in the tree.
    const text = collectText(tree);
    const matches = text.match(/\d+\.\ds/g) ?? [];
    expect(matches).toEqual(['0.0s']);
  });

  it('omits the duration suffix when r.duration_ms === 0 (falsy short-circuit)', () => {
    setCounts({ succeeded: 1, failed: 0, totalMs: 0, allOk: true });
    mocks.primaryOutput.mockReturnValue(null);
    const tree = renderSummary([baseResult({ duration_ms: 0 })]);
    const text = collectText(tree);
    const matches = text.match(/\d+\.\ds/g) ?? [];
    expect(matches).toEqual(['0.0s']);
  });
});

// ─── Action chip color ──────────────────────────────────────────────────────

describe('ResultsSummary — action chip color', () => {
  const findActionChip = (tree: React.ReactNode, action: string): React.ReactElement => {
    const matches = findByPredicate(tree, (el) => el.type === 'span' && collectText(el).trim() === action);
    expect(matches).toHaveLength(1);
    return matches[0];
  };

  it('"create" → emerald color classes', () => {
    setCounts({ succeeded: 1, failed: 0, totalMs: 0, allOk: true });
    mocks.primaryOutput.mockReturnValue(null);
    const tree = renderSummary([baseResult({ action: 'create' })]);
    const chip = findActionChip(tree, 'create');
    const className = (chip.props as { className: string }).className;
    expect(className).toContain('text-emerald-600');
    expect(className).toContain('bg-emerald-50');
  });

  it('"update" → blue color classes', () => {
    setCounts({ succeeded: 1, failed: 0, totalMs: 0, allOk: true });
    mocks.primaryOutput.mockReturnValue(null);
    const tree = renderSummary([baseResult({ action: 'update' })]);
    const chip = findActionChip(tree, 'update');
    const className = (chip.props as { className: string }).className;
    expect(className).toContain('text-blue-600');
    expect(className).toContain('bg-blue-50');
  });

  it('"delete" (or any non-create/update) → red color classes', () => {
    setCounts({ succeeded: 1, failed: 0, totalMs: 0, allOk: true });
    mocks.primaryOutput.mockReturnValue(null);
    const tree = renderSummary([baseResult({ action: 'delete' })]);
    const chip = findActionChip(tree, 'delete');
    const className = (chip.props as { className: string }).className;
    expect(className).toContain('text-red-600');
    expect(className).toContain('bg-red-50');
  });
});

// ─── Provider_id row ────────────────────────────────────────────────────────

describe('ResultsSummary — provider_id row', () => {
  it('does NOT render the provider_id row when r.provider_id is undefined', () => {
    setCounts({ succeeded: 1, failed: 0, totalMs: 0, allOk: true });
    mocks.primaryOutput.mockReturnValue(null);
    const tree = renderSummary([baseResult({ provider_id: undefined })]);
    expect(mocks.t).not.toHaveBeenCalledWith('deploy.copy.copyProviderId');
    expect(mocks.t).not.toHaveBeenCalledWith('deploy.copy.copy');
  });

  it('renders the provider_id row when r.provider_id is set', () => {
    setCounts({ succeeded: 1, failed: 0, totalMs: 0, allOk: true });
    mocks.primaryOutput.mockReturnValue(null);
    const tree = renderSummary([baseResult({ provider_id: 'projects/foo/buckets/bar' })]);
    const text = collectText(tree);
    expect(text).toContain('projects/foo/buckets/bar');
    expect(mocks.t).toHaveBeenCalledWith('deploy.copy.copy');
    expect(mocks.t).toHaveBeenCalledWith('deploy.copy.copyProviderId');
  });

  it('clicking the provider_id "Copy" button writes provider_id to the clipboard', () => {
    setCounts({ succeeded: 1, failed: 0, totalMs: 0, allOk: true });
    mocks.primaryOutput.mockReturnValue(null);
    const tree = renderSummary([baseResult({ provider_id: 'projects/foo/buckets/bar' })]);
    const btn = findButtonsByTitle(tree, 'deploy.copy.copyProviderId')[0];
    expect(btn).toBeDefined();
    (btn.props as { onClick: () => void }).onClick();
    expect(mocks.writeText).toHaveBeenCalledWith('projects/foo/buckets/bar');
  });
});

// ─── Primary output IIFE ────────────────────────────────────────────────────

describe('ResultsSummary — primary output IIFE', () => {
  it('renders nothing when primaryOutput returns null', () => {
    setCounts({ succeeded: 1, failed: 0, totalMs: 0, allOk: true });
    mocks.primaryOutput.mockReturnValue(null);
    const tree = renderSummary([baseResult()]);
    // No element should carry the `Click to open · Shift+click to copy: ` title.
    const labels = findByPredicate(tree, (el) => {
      const title = (el.props as { title?: string }).title;
      return typeof title === 'string' && title.startsWith('Click to ');
    });
    expect(labels).toHaveLength(0);
  });

  it('renders the label + value when primaryOutput returns a non-null record', () => {
    setCounts({ succeeded: 1, failed: 0, totalMs: 0, allOk: true });
    mocks.primaryOutput.mockReturnValue({ label: 'URL', value: 'https://example.com' });
    const tree = renderSummary([baseResult()]);
    const text = collectText(tree);
    expect(text).toContain('URL:');
    expect(text).toContain('https://example.com');
  });

  it('does NOT render an ExternalLink button when primaryOutput.url is unset', () => {
    setCounts({ succeeded: 1, failed: 0, totalMs: 0, allOk: true });
    mocks.primaryOutput.mockReturnValue({ label: 'IP', value: '34.1.2.3' });
    const tree = renderSummary([baseResult()]);
    const externals = findIconsByRef(tree, ExternalLink);
    // Only renders if po.url is set OR the default-URL row triggers — neither here.
    expect(externals).toHaveLength(0);
  });

  it('renders an ExternalLink button when primaryOutput.url is set; clicking opens it externally', () => {
    setCounts({ succeeded: 1, failed: 0, totalMs: 0, allOk: true });
    mocks.primaryOutput.mockReturnValue({
      label: 'URL',
      value: 'https://example.com',
      url: 'https://console.example.com/path',
    });
    const tree = renderSummary([baseResult()]);
    const externals = findIconsByRef(tree, ExternalLink);
    expect(externals.length).toBeGreaterThanOrEqual(1);

    // Find the button that wraps the FIRST ExternalLink (po.url branch).
    const buttons = findByPredicate(tree, (el) => el.type === 'button');
    // The first PO-URL button is the one whose onClick calls openExternalUrl(po.url).
    let found = false;
    for (const b of buttons) {
      const click = (b.props as { onClick?: () => void }).onClick;
      if (!click) continue;
      mocks.openExternalUrl.mockClear();
      try {
        click();
      } catch {
        continue;
      }
      if (
        mocks.openExternalUrl.mock.calls.length === 1 &&
        mocks.openExternalUrl.mock.calls[0][0] === 'https://console.example.com/path'
      ) {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });
});

// ─── Primary output URL click handlers ──────────────────────────────────────

describe('ResultsSummary — URL click handlers', () => {
  it('http URL + plain click → openExternalUrl is called, clipboard is NOT', () => {
    setCounts({ succeeded: 1, failed: 0, totalMs: 0, allOk: true });
    mocks.primaryOutput.mockReturnValue({ label: 'URL', value: 'https://foo.example' });
    const tree = renderSummary([baseResult()]);
    // Find the clickable value span by its title (long-title path).
    const valueSpan = findByPredicate(tree, (el) => {
      const title = (el.props as { title?: string }).title;
      return typeof title === 'string' && title.startsWith('Click to open · Shift+click to copy: ');
    })[0];
    expect(valueSpan).toBeDefined();
    const onClick = (valueSpan.props as { onClick: (e: React.MouseEvent) => void }).onClick;
    onClick({ shiftKey: false } as React.MouseEvent);
    expect(mocks.openExternalUrl).toHaveBeenCalledWith('https://foo.example');
    expect(mocks.writeText).not.toHaveBeenCalled();
  });

  it('http URL + shift-click → clipboard.writeText is called, openExternalUrl is NOT', () => {
    setCounts({ succeeded: 1, failed: 0, totalMs: 0, allOk: true });
    mocks.primaryOutput.mockReturnValue({ label: 'URL', value: 'https://foo.example' });
    const tree = renderSummary([baseResult()]);
    const valueSpan = findByPredicate(tree, (el) => {
      const title = (el.props as { title?: string }).title;
      return typeof title === 'string' && title.startsWith('Click to open · Shift+click to copy: ');
    })[0];
    const onClick = (valueSpan.props as { onClick: (e: React.MouseEvent) => void }).onClick;
    onClick({ shiftKey: true } as React.MouseEvent);
    expect(mocks.writeText).toHaveBeenCalledWith('https://foo.example');
    expect(mocks.openExternalUrl).not.toHaveBeenCalled();
  });

  it('non-http URL + plain click → clipboard.writeText (the "Click to copy" branch)', () => {
    setCounts({ succeeded: 1, failed: 0, totalMs: 0, allOk: true });
    mocks.primaryOutput.mockReturnValue({ label: 'Bucket', value: 'gs://my-bucket' });
    const tree = renderSummary([baseResult()]);
    const valueSpan = findByPredicate(tree, (el) => {
      const title = (el.props as { title?: string }).title;
      return typeof title === 'string' && title.startsWith('Click to copy: ');
    })[0];
    expect(valueSpan).toBeDefined();
    const onClick = (valueSpan.props as { onClick: (e: React.MouseEvent) => void }).onClick;
    onClick({ shiftKey: false } as React.MouseEvent);
    expect(mocks.writeText).toHaveBeenCalledWith('gs://my-bucket');
    expect(mocks.openExternalUrl).not.toHaveBeenCalled();
  });

  it('value title uses the long form ("Click to open · Shift+click to copy:") for http URLs', () => {
    setCounts({ succeeded: 1, failed: 0, totalMs: 0, allOk: true });
    mocks.primaryOutput.mockReturnValue({ label: 'URL', value: 'https://foo.example' });
    const tree = renderSummary([baseResult()]);
    const valueSpan = findByPredicate(tree, (el) => {
      const title = (el.props as { title?: string }).title;
      return typeof title === 'string' && title === 'Click to open · Shift+click to copy: https://foo.example';
    });
    expect(valueSpan).toHaveLength(1);
  });

  it('value title uses the short form ("Click to copy:") for non-http values', () => {
    setCounts({ succeeded: 1, failed: 0, totalMs: 0, allOk: true });
    mocks.primaryOutput.mockReturnValue({ label: 'Bucket', value: 'gs://my-bucket' });
    const tree = renderSummary([baseResult()]);
    const valueSpan = findByPredicate(tree, (el) => {
      const title = (el.props as { title?: string }).title;
      return typeof title === 'string' && title === 'Click to copy: gs://my-bucket';
    });
    expect(valueSpan).toHaveLength(1);
  });
});

// ─── Default URL row ────────────────────────────────────────────────────────

describe('ResultsSummary — default_url row', () => {
  it('does NOT render a Default row when defaultUrl is unset', () => {
    setCounts({ succeeded: 1, failed: 0, totalMs: 0, allOk: true });
    mocks.primaryOutput.mockReturnValue({ label: 'URL', value: 'https://primary.example' });
    const tree = renderSummary([baseResult({ outputs: {} })]);
    const text = collectText(tree);
    expect(text).not.toContain('Default:');
  });

  it('does NOT render a Default row when defaultUrl === po.value', () => {
    setCounts({ succeeded: 1, failed: 0, totalMs: 0, allOk: true });
    mocks.primaryOutput.mockReturnValue({ label: 'URL', value: 'https://same.example' });
    const tree = renderSummary([baseResult({ outputs: { default_url: 'https://same.example' } })]);
    const text = collectText(tree);
    expect(text).not.toContain('Default:');
  });

  it('does NOT render a Default row when defaultUrl === po.url', () => {
    setCounts({ succeeded: 1, failed: 0, totalMs: 0, allOk: true });
    mocks.primaryOutput.mockReturnValue({
      label: 'URL',
      value: 'https://primary.example',
      url: 'https://default.example',
    });
    const tree = renderSummary([baseResult({ outputs: { default_url: 'https://default.example' } })]);
    const text = collectText(tree);
    expect(text).not.toContain('Default:');
  });

  it('renders a Default row when defaultUrl is set AND distinct from both po.value and po.url', () => {
    setCounts({ succeeded: 1, failed: 0, totalMs: 0, allOk: true });
    mocks.primaryOutput.mockReturnValue({
      label: 'URL',
      value: 'https://primary.example',
      url: 'https://console.example',
    });
    const tree = renderSummary([baseResult({ outputs: { default_url: 'https://default.example' } })]);
    const text = collectText(tree);
    expect(text).toContain('Default:');
    expect(text).toContain('https://default.example');
  });

  it('Default row carries an ExternalLink button that opens the default URL externally', () => {
    setCounts({ succeeded: 1, failed: 0, totalMs: 0, allOk: true });
    mocks.primaryOutput.mockReturnValue({ label: 'URL', value: 'https://primary.example' });
    const tree = renderSummary([baseResult({ outputs: { default_url: 'https://default.example' } })]);
    // Find a button whose onClick opens the default URL.
    const buttons = findByPredicate(tree, (el) => el.type === 'button');
    let found = false;
    for (const b of buttons) {
      const click = (b.props as { onClick?: () => void }).onClick;
      if (!click) continue;
      mocks.openExternalUrl.mockClear();
      try {
        click();
      } catch {
        continue;
      }
      if (
        mocks.openExternalUrl.mock.calls.length === 1 &&
        mocks.openExternalUrl.mock.calls[0][0] === 'https://default.example'
      ) {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });

  it('Default row uses the short title for non-http defaultUrls', () => {
    setCounts({ succeeded: 1, failed: 0, totalMs: 0, allOk: true });
    mocks.primaryOutput.mockReturnValue({ label: 'URL', value: 'https://primary.example' });
    const tree = renderSummary([baseResult({ outputs: { default_url: '34.1.2.3' } })]);
    // Find the Default-row clickable value span by its title.
    const valueSpan = findByPredicate(tree, (el) => {
      const title = (el.props as { title?: string }).title;
      return typeof title === 'string' && title === 'Click to copy: 34.1.2.3';
    });
    expect(valueSpan).toHaveLength(1);
  });

  it('Default row http click opens externally; shift-click copies', () => {
    setCounts({ succeeded: 1, failed: 0, totalMs: 0, allOk: true });
    mocks.primaryOutput.mockReturnValue({ label: 'URL', value: 'https://primary.example' });
    const tree = renderSummary([baseResult({ outputs: { default_url: 'https://default.example' } })]);

    // Find the Default-row clickable value span by its title.
    const valueSpan = findByPredicate(tree, (el) => {
      const title = (el.props as { title?: string }).title;
      return typeof title === 'string' && title === 'Click to open · Shift+click to copy: https://default.example';
    })[0];
    expect(valueSpan).toBeDefined();
    const onClick = (valueSpan.props as { onClick: (e: React.MouseEvent) => void }).onClick;

    mocks.openExternalUrl.mockClear();
    mocks.writeText.mockClear();
    onClick({ shiftKey: false } as React.MouseEvent);
    expect(mocks.openExternalUrl).toHaveBeenCalledWith('https://default.example');
    expect(mocks.writeText).not.toHaveBeenCalled();

    mocks.openExternalUrl.mockClear();
    mocks.writeText.mockClear();
    onClick({ shiftKey: true } as React.MouseEvent);
    expect(mocks.writeText).toHaveBeenCalledWith('https://default.example');
    expect(mocks.openExternalUrl).not.toHaveBeenCalled();
  });
});

// ─── Error IIFE ─────────────────────────────────────────────────────────────

describe('ResultsSummary — error IIFE', () => {
  it('renders nothing in the error slot when r.error is unset', () => {
    setCounts({ succeeded: 1, failed: 0, totalMs: 0, allOk: true });
    mocks.primaryOutput.mockReturnValue(null);
    const tree = renderSummary([baseResult({ error: undefined })]);
    expect(mocks.t).not.toHaveBeenCalledWith('deploy.buttons.enableApi');
    // No "[copy]" literal anywhere.
    const text = collectText(tree);
    expect(text).not.toContain('[copy]');
  });

  it('renders the "Enable API" CTA when r.api_enable_url is set (no isApiNotEnabledError check)', () => {
    setCounts({ succeeded: 1, failed: 1, totalMs: 0, allOk: false });
    mocks.primaryOutput.mockReturnValue(null);
    const tree = renderSummary([
      baseResult({
        success: false,
        error: 'PERMISSION_DENIED: API foo not enabled',
        api_enable_url: 'https://console.cloud.google.com/apis/api/foo.googleapis.com/overview?project=p',
      }),
    ]);
    expect(mocks.t).toHaveBeenCalledWith('deploy.buttons.enableApi');
    // isApiNotEnabledError should NOT have been called when api_enable_url is set
    // (short-circuit on the OR).
    expect(mocks.isApiNotEnabledError).not.toHaveBeenCalled();
  });

  it('clicking the "Enable API" button (api_enable_url path) opens the URL externally', () => {
    setCounts({ succeeded: 1, failed: 1, totalMs: 0, allOk: false });
    mocks.primaryOutput.mockReturnValue(null);
    const url = 'https://console.cloud.google.com/apis/api/foo.googleapis.com/overview?project=p';
    const tree = renderSummary([baseResult({ success: false, error: 'boom', api_enable_url: url })]);
    const btns = findByPredicate(tree, (el) => {
      if (el.type !== 'button') return false;
      return collectText(el).includes('deploy.buttons.enableApi');
    });
    expect(btns).toHaveLength(1);
    (btns[0].props as { onClick: () => void }).onClick();
    expect(mocks.openExternalUrl).toHaveBeenCalledWith(url);
  });

  it('falls back to extractApiEnableUrl when api_enable_url is unset and isApiNotEnabledError returns true', () => {
    setCounts({ succeeded: 1, failed: 1, totalMs: 0, allOk: false });
    mocks.primaryOutput.mockReturnValue(null);
    mocks.isApiNotEnabledError.mockReturnValue(true);
    mocks.extractApiEnableUrl.mockReturnValue('https://console/extracted');
    const tree = renderSummary([baseResult({ success: false, error: 'API foo not enabled' })]);
    expect(mocks.t).toHaveBeenCalledWith('deploy.buttons.enableApi');
    expect(mocks.isApiNotEnabledError).toHaveBeenCalledWith('API foo not enabled');
    expect(mocks.extractApiEnableUrl).toHaveBeenCalledWith('API foo not enabled');

    // Click should open the extracted URL.
    const btns = findByPredicate(tree, (el) => {
      if (el.type !== 'button') return false;
      return collectText(el).includes('deploy.buttons.enableApi');
    });
    expect(btns).toHaveLength(1);
    (btns[0].props as { onClick: () => void }).onClick();
    expect(mocks.openExternalUrl).toHaveBeenCalledWith('https://console/extracted');
  });

  it('falls back to the plain error block when api_enable_url is unset AND isApiNotEnabledError returns false', () => {
    setCounts({ succeeded: 1, failed: 1, totalMs: 0, allOk: false });
    mocks.primaryOutput.mockReturnValue(null);
    mocks.isApiNotEnabledError.mockReturnValue(false);
    const tree = renderSummary([baseResult({ success: false, error: 'plain failure' })]);
    const text = collectText(tree);
    expect(text).toContain('plain failure');
    expect(text).toContain('[copy]');
    expect(mocks.t).not.toHaveBeenCalledWith('deploy.buttons.enableApi');
  });

  it('"[copy]" button writes r.error to the clipboard', () => {
    setCounts({ succeeded: 1, failed: 1, totalMs: 0, allOk: false });
    mocks.primaryOutput.mockReturnValue(null);
    mocks.isApiNotEnabledError.mockReturnValue(false);
    const tree = renderSummary([baseResult({ success: false, error: 'plain failure' })]);
    const btns = findButtonsByText(tree, '[copy]');
    expect(btns).toHaveLength(1);
    (btns[0].props as { onClick: () => void }).onClick();
    expect(mocks.writeText).toHaveBeenCalledWith('plain failure');
  });

  it('the plain-error block carries title=r.error and the "Copy error" title attribute on the button', () => {
    setCounts({ succeeded: 1, failed: 1, totalMs: 0, allOk: false });
    mocks.primaryOutput.mockReturnValue(null);
    mocks.isApiNotEnabledError.mockReturnValue(false);
    const tree = renderSummary([baseResult({ success: false, error: 'plain failure' })]);
    // Outer block's title attribute equals the error.
    const blocks = findByPredicate(tree, (el) => {
      const title = (el.props as { title?: string }).title;
      return typeof title === 'string' && title === 'plain failure' && el.type === 'div';
    });
    expect(blocks).toHaveLength(1);
    // The copy button has the "Copy error" title.
    const copyBtns = findButtonsByTitle(tree, 'Copy error');
    expect(copyBtns).toHaveLength(1);
  });
});

// ─── Multi-row + ordering ───────────────────────────────────────────────────

describe('ResultsSummary — multi-row', () => {
  it('renders one row per result entry (each row has its own status icon)', () => {
    setCounts({ succeeded: 2, failed: 1, totalMs: 0, allOk: false });
    mocks.primaryOutput.mockReturnValue(null);
    mocks.isApiNotEnabledError.mockReturnValue(false);
    const tree = renderSummary([
      baseResult({ name: 'a', success: true }),
      baseResult({ name: 'b', success: true }),
      baseResult({ name: 'c', success: false, error: 'boom' }),
    ]);
    const text = collectText(tree);
    expect(text).toContain('a');
    expect(text).toContain('b');
    expect(text).toContain('c');
    // Header: allOk=false → outer AlertCircle, succeeded chip CheckCircle,
    // failed chip AlertCircle. Rows: 2× CheckCircle (success), 1× AlertCircle.
    // Totals: 3 CheckCircle, 3 AlertCircle.
    const checks = findIconsByRef(tree, CheckCircle);
    expect(checks.length).toBeGreaterThanOrEqual(3);
    const alerts = findIconsByRef(tree, AlertCircle);
    expect(alerts.length).toBeGreaterThanOrEqual(3);
  });

  it('hands the full results array (not slices) to summaryCounts and to buildResultsSummaryText on copy click', () => {
    setCounts({ succeeded: 1, failed: 1, totalMs: 0, allOk: false });
    mocks.primaryOutput.mockReturnValue(null);
    mocks.isApiNotEnabledError.mockReturnValue(false);
    const results = [baseResult({ name: 'a' }), baseResult({ name: 'b', success: false, error: 'boom' })];
    const tree = renderSummary(results);
    expect(mocks.summaryCounts).toHaveBeenCalledWith(results);

    const summaryBtn = findButtonsByText(tree, 'Copy summary')[0];
    (summaryBtn.props as { onClick: () => void }).onClick();
    expect(mocks.buildResultsSummaryText).toHaveBeenCalledWith(results, { errorsOnly: false });

    const errorsBtn = findButtonsByText(tree, 'Copy errors')[0];
    (errorsBtn.props as { onClick: () => void }).onClick();
    expect(mocks.buildResultsSummaryText).toHaveBeenCalledWith(results, { errorsOnly: true });
  });
});

// ─── Public API ─────────────────────────────────────────────────────────────

describe('ResultsSummary — public API', () => {
  it('is exported as a named React.FC', () => {
    expect(typeof ResultsSummary).toBe('function');
  });
});
