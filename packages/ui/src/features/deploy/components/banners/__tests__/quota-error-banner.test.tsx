/**
 * rf-pdpl-16 — QuotaErrorBanner.
 *
 * Third Layer 2 unit. The banner is a 4-state machine
 * ('idle' | 'running' | 'done' | 'failed') with three `useState` slots
 * (`state`, `report`, `errorMsg`) — extends the queued-ref-dispatch pattern
 * (cite `queued-ref-dispatch-extends-the-mutable-ref-usestate-mock-to-multi-state-fcs`)
 * to three slots. The source uses `React.useState(...)` namespace access, so
 * the mock must patch BOTH the named exports AND the default export (cite
 * `react-namespace-hook-access-requires-patching-default-export-too`).
 *
 * Direct-FC tree-walker pattern (cite
 * `tree-walker-for-react-fc-tests-must-flatten-nested-children-arrays`):
 * walks the React element tree, invoking any function `el.type` it encounters.
 * `getApi().deploy.cleanupOrphans` is mocked so the async path is observable;
 * `openExternalUrl` is mocked so the GCP-quota-link button is observable.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks ──────────────────────────────────────────────────────────
//
// Three useState slots, in declaration order: state / report / errorMsg.
// Setter spies are independent so per-state-transition calls have a verifiable
// callback target.
const mocks = vi.hoisted(() => ({
  stateRef: { current: 'idle' as 'idle' | 'running' | 'done' | 'failed' },
  reportRef: {
    current: {} as {
      deleted?: Array<{ type: string; name: string }>;
      errors?: Array<{ type: string; name: string; error: string }>;
    },
  },
  errorMsgRef: { current: '' as string },
  stateSetterSpy: vi.fn(),
  reportSetterSpy: vi.fn(),
  errorMsgSetterSpy: vi.fn(),
  cleanupOrphansSpy: vi.fn(),
  openExternalUrlSpy: vi.fn(),
}));

// Mock React's useState so the FC body runs synchronously and the three
// useState calls deal back in order from the ref queue.
//
// The source (`quota-error-banner.tsx`) accesses hooks via `React.useState(...)`
// (default import), so we patch both named AND default exports — patching only
// named leaves `React.useState` pointing at the renderer-context-bound real
// implementation, which throws "Cannot read properties of null".
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  let callIdx = 0;
  (mocks as unknown as { __resetUseState: () => void }).__resetUseState = () => {
    callIdx = 0;
  };
  const dispatch = [
    () => [mocks.stateRef.current, mocks.stateSetterSpy] as const,
    () => [mocks.reportRef.current, mocks.reportSetterSpy] as const,
    () => [mocks.errorMsgRef.current, mocks.errorMsgSetterSpy] as const,
  ];
  const patchedUseState = vi.fn(() => {
    const slot = dispatch[callIdx] ?? dispatch[dispatch.length - 1];
    callIdx += 1;
    return slot();
  });
  // Some React-types builds don't declare `default` on the namespace; cast to
  // `unknown` and back to read it without breaking `--noEmit`.
  const actualDefault = (actual as unknown as { default?: typeof actual }).default ?? actual;
  return {
    ...actual,
    useState: patchedUseState,
    default: {
      ...actualDefault,
      useState: patchedUseState,
    },
  };
});

vi.mock('../../../../../shared/api/api-adapter', () => ({
  getApi: () => ({
    deploy: {
      cleanupOrphans: mocks.cleanupOrphansSpy,
    },
  }),
}));

vi.mock('../../../utils/open-external-url', () => ({
  openExternalUrl: mocks.openExternalUrlSpy,
}));

import { QuotaErrorBanner } from '../quota-error-banner';

// ─── Tree-walker (rf-pdpl-7/-8/-9/-10/-11/-12 style) ────────────────────────

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
      // Opaque FC — skip subtree.
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

type BannerProps = {
  error: string;
  results: Array<{ error?: string }>;
  onRetryDeploy: () => void;
};

const renderBanner = (props: BannerProps): React.ReactElement => {
  (mocks as unknown as { __resetUseState: () => void }).__resetUseState();
  return (QuotaErrorBanner as unknown as (p: BannerProps) => React.ReactElement)(props);
};

const makeProps = (overrides: Partial<BannerProps> = {}): BannerProps => ({
  error: '',
  results: [],
  onRetryDeploy: vi.fn(),
  ...overrides,
});

const findButtons = (tree: React.ReactNode): React.ReactElement[] =>
  findByPredicate(tree, (el) => el.type === 'button');

const findButtonByText = (tree: React.ReactNode, text: string): React.ReactElement | undefined =>
  findButtons(tree).find((b) => collectText(b).includes(text));

// ─── Reset state between tests ──────────────────────────────────────────────

beforeEach(() => {
  mocks.stateRef.current = 'idle';
  mocks.reportRef.current = {};
  mocks.errorMsgRef.current = '';
  mocks.stateSetterSpy.mockClear();
  mocks.reportSetterSpy.mockClear();
  mocks.errorMsgSetterSpy.mockClear();
  mocks.cleanupOrphansSpy.mockReset();
  mocks.openExternalUrlSpy.mockReset();
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('QuotaErrorBanner — header copy (always rendered)', () => {
  it('renders the "GCP quota exceeded" title and explanation regardless of state', () => {
    const treeIdle = renderBanner(makeProps({ error: 'project=foo quota exceeded' }));
    expect(collectText(treeIdle)).toContain('GCP quota exceeded');
    expect(collectText(treeIdle)).toContain('default 3-backend-bucket ceiling');

    mocks.stateRef.current = 'running';
    const treeRunning = renderBanner(makeProps({ error: 'project=foo quota exceeded' }));
    expect(collectText(treeRunning)).toContain('GCP quota exceeded');

    mocks.stateRef.current = 'done';
    const treeDone = renderBanner(makeProps({ error: 'project=foo quota exceeded' }));
    expect(collectText(treeDone)).toContain('GCP quota exceeded');

    mocks.stateRef.current = 'failed';
    const treeFailed = renderBanner(makeProps({ error: 'project=foo quota exceeded' }));
    expect(collectText(treeFailed)).toContain('GCP quota exceeded');
  });
});

describe('QuotaErrorBanner — idle state', () => {
  it('renders the cleanup button with "Clean up orphaned ICE resources" label', () => {
    const tree = renderBanner(makeProps({ error: 'project=foo quota exceeded' }));
    const cleanupBtn = findButtonByText(tree, 'Clean up orphaned ICE resources');
    expect(cleanupBtn).toBeDefined();
  });

  it('renders the GCP quota-link button when projectId is extractable', () => {
    const tree = renderBanner(makeProps({ error: 'project=my-project quota exceeded' }));
    const gcpBtn = findButtonByText(tree, 'Request quota increase in GCP');
    expect(gcpBtn).toBeDefined();
  });

  it('does NOT render the GCP quota-link button when no projectId can be extracted', () => {
    const tree = renderBanner(makeProps({ error: 'no project info here' }));
    const gcpBtn = findButtonByText(tree, 'Request quota increase in GCP');
    expect(gcpBtn).toBeUndefined();
  });

  it('does NOT render running/done/failed branches in idle state', () => {
    const tree = renderBanner(makeProps({ error: 'project=foo' }));
    const text = collectText(tree);
    expect(text).not.toContain('Scanning and deleting orphaned resources');
    expect(text).not.toContain('Cleanup complete');
    expect(text).not.toContain('Cleanup failed:');
  });

  it('clicking the GCP quota-link button calls openExternalUrl with the correct GCP console URL', () => {
    const tree = renderBanner(makeProps({ error: 'project=alpha-beta quota exceeded' }));
    const gcpBtn = findButtonByText(tree, 'Request quota increase in GCP');
    expect(gcpBtn).toBeDefined();
    const onClick = (gcpBtn!.props as { onClick: () => void }).onClick;
    onClick();
    expect(mocks.openExternalUrlSpy).toHaveBeenCalledWith(
      'https://console.cloud.google.com/iam-admin/quotas?project=alpha-beta&filter=metric:BACKEND-BUCKETS-per-project',
    );
  });
});

describe('QuotaErrorBanner — projectId regex extraction', () => {
  it('extracts projectId from "project=foo" form', () => {
    const tree = renderBanner(makeProps({ error: 'project=foo' }));
    const gcpBtn = findButtonByText(tree, 'Request quota increase in GCP');
    expect(gcpBtn).toBeDefined();
    const onClick = (gcpBtn!.props as { onClick: () => void }).onClick;
    onClick();
    expect(mocks.openExternalUrlSpy.mock.calls[0][0]).toContain('project=foo&');
  });

  it('extracts projectId from "project/foo-bar" form (slash separator + hyphen)', () => {
    const tree = renderBanner(makeProps({ error: 'project/foo-bar quota exceeded' }));
    const gcpBtn = findButtonByText(tree, 'Request quota increase in GCP');
    expect(gcpBtn).toBeDefined();
    const onClick = (gcpBtn!.props as { onClick: () => void }).onClick;
    onClick();
    expect(mocks.openExternalUrlSpy.mock.calls[0][0]).toContain('project=foo-bar&');
  });

  it('returns empty projectId when no project pattern matches (no GCP-link button shown)', () => {
    const tree = renderBanner(makeProps({ error: 'completely unrelated error' }));
    const gcpBtn = findButtonByText(tree, 'Request quota increase in GCP');
    expect(gcpBtn).toBeUndefined();
  });

  it('matches case-insensitively (PROJECT=FOO)', () => {
    // The regex is /project[=/]([a-z0-9-]+)/i — case-insensitive on the prefix
    // AND on the capture group, so PROJECT=FOO still matches and captures "FOO".
    const tree = renderBanner(makeProps({ error: 'PROJECT=FOO' }));
    const gcpBtn = findButtonByText(tree, 'Request quota increase in GCP');
    expect(gcpBtn).toBeDefined();
    const onClick = (gcpBtn!.props as { onClick: () => void }).onClick;
    onClick();
    expect(mocks.openExternalUrlSpy.mock.calls[0][0]).toContain('project=FOO&');
  });
});

describe('QuotaErrorBanner — fullError join across error + results', () => {
  it('finds projectId in `error` prop alone', () => {
    const tree = renderBanner(makeProps({ error: 'project=primary' }));
    const gcpBtn = findButtonByText(tree, 'Request quota increase in GCP');
    expect(gcpBtn).toBeDefined();
    const onClick = (gcpBtn!.props as { onClick: () => void }).onClick;
    onClick();
    expect(mocks.openExternalUrlSpy.mock.calls[0][0]).toContain('project=primary&');
  });

  it('finds projectId in results[].error when error prop has none', () => {
    const tree = renderBanner(
      makeProps({
        error: 'no project',
        results: [{ error: 'project=secondary failed' }],
      }),
    );
    const gcpBtn = findButtonByText(tree, 'Request quota increase in GCP');
    expect(gcpBtn).toBeDefined();
    const onClick = (gcpBtn!.props as { onClick: () => void }).onClick;
    onClick();
    expect(mocks.openExternalUrlSpy.mock.calls[0][0]).toContain('project=secondary&');
  });

  it('takes the first match across the joined error string (error wins over results)', () => {
    const tree = renderBanner(
      makeProps({
        error: 'project=first',
        results: [{ error: 'project=second' }],
      }),
    );
    const gcpBtn = findButtonByText(tree, 'Request quota increase in GCP');
    expect(gcpBtn).toBeDefined();
    const onClick = (gcpBtn!.props as { onClick: () => void }).onClick;
    onClick();
    expect(mocks.openExternalUrlSpy.mock.calls[0][0]).toContain('project=first&');
  });

  it('filters out falsy results[].error values during the join (no crash)', () => {
    const tree = renderBanner(
      makeProps({
        error: '',
        results: [{ error: undefined }, { error: 'project=visible' }, {}],
      }),
    );
    const gcpBtn = findButtonByText(tree, 'Request quota increase in GCP');
    expect(gcpBtn).toBeDefined();
    const onClick = (gcpBtn!.props as { onClick: () => void }).onClick;
    onClick();
    expect(mocks.openExternalUrlSpy.mock.calls[0][0]).toContain('project=visible&');
  });
});

describe('QuotaErrorBanner — runCleanup happy path (idle → running → done)', () => {
  it('calls cleanupOrphans({ gcpProject }) with the extracted projectId', async () => {
    mocks.cleanupOrphansSpy.mockResolvedValue({ success: true, report: { deleted: [] } });
    const tree = renderBanner(makeProps({ error: 'project=alpha quota exceeded' }));
    const cleanupBtn = findButtonByText(tree, 'Clean up orphaned ICE resources');
    expect(cleanupBtn).toBeDefined();
    const onClick = (cleanupBtn!.props as { onClick: () => Promise<void> }).onClick;
    await onClick();
    expect(mocks.cleanupOrphansSpy).toHaveBeenCalledWith({ gcpProject: 'alpha' });
  });

  it('calls cleanupOrphans({ gcpProject: undefined }) when no projectId is extractable', async () => {
    mocks.cleanupOrphansSpy.mockResolvedValue({ success: true, report: { deleted: [] } });
    const tree = renderBanner(makeProps({ error: 'no project here' }));
    const cleanupBtn = findButtonByText(tree, 'Clean up orphaned ICE resources');
    expect(cleanupBtn).toBeDefined();
    const onClick = (cleanupBtn!.props as { onClick: () => Promise<void> }).onClick;
    await onClick();
    expect(mocks.cleanupOrphansSpy).toHaveBeenCalledWith({ gcpProject: undefined });
  });

  it('transitions state idle → running → done on success', async () => {
    mocks.cleanupOrphansSpy.mockResolvedValue({
      success: true,
      report: { deleted: [{ type: 'BackendBucket', name: 'orphan-1' }] },
    });
    const tree = renderBanner(makeProps({ error: 'project=foo' }));
    const cleanupBtn = findButtonByText(tree, 'Clean up orphaned ICE resources');
    const onClick = (cleanupBtn!.props as { onClick: () => Promise<void> }).onClick;
    await onClick();
    // Expect state transitions: setState('running') → setState('done').
    // Plus setErrorMsg('') early on running, and setReport(...) on done.
    expect(mocks.stateSetterSpy).toHaveBeenCalledWith('running');
    expect(mocks.errorMsgSetterSpy).toHaveBeenNthCalledWith(1, '');
    expect(mocks.reportSetterSpy).toHaveBeenCalledWith({
      deleted: [{ type: 'BackendBucket', name: 'orphan-1' }],
    });
    expect(mocks.stateSetterSpy).toHaveBeenCalledWith('done');
  });

  it('seeds report to {} when API response report is undefined', async () => {
    mocks.cleanupOrphansSpy.mockResolvedValue({ success: true });
    const tree = renderBanner(makeProps({ error: 'project=foo' }));
    const cleanupBtn = findButtonByText(tree, 'Clean up orphaned ICE resources');
    const onClick = (cleanupBtn!.props as { onClick: () => Promise<void> }).onClick;
    await onClick();
    expect(mocks.reportSetterSpy).toHaveBeenCalledWith({});
  });
});

describe('QuotaErrorBanner — runCleanup failure path (idle → running → failed)', () => {
  it('transitions state to failed and captures res.error when success: false', async () => {
    mocks.cleanupOrphansSpy.mockResolvedValue({ success: false, error: 'API rejected request' });
    const tree = renderBanner(makeProps({ error: 'project=foo' }));
    const cleanupBtn = findButtonByText(tree, 'Clean up orphaned ICE resources');
    const onClick = (cleanupBtn!.props as { onClick: () => Promise<void> }).onClick;
    await onClick();
    expect(mocks.errorMsgSetterSpy).toHaveBeenCalledWith('API rejected request');
    expect(mocks.stateSetterSpy).toHaveBeenCalledWith('failed');
  });

  it('falls back to "Cleanup failed" message when res.error is missing', async () => {
    mocks.cleanupOrphansSpy.mockResolvedValue({ success: false });
    const tree = renderBanner(makeProps({ error: 'project=foo' }));
    const cleanupBtn = findButtonByText(tree, 'Clean up orphaned ICE resources');
    const onClick = (cleanupBtn!.props as { onClick: () => Promise<void> }).onClick;
    await onClick();
    expect(mocks.errorMsgSetterSpy).toHaveBeenCalledWith('Cleanup failed');
    expect(mocks.stateSetterSpy).toHaveBeenCalledWith('failed');
  });

  it('captures err.message in the catch block when API throws an Error', async () => {
    mocks.cleanupOrphansSpy.mockRejectedValue(new Error('Network unreachable'));
    const tree = renderBanner(makeProps({ error: 'project=foo' }));
    const cleanupBtn = findButtonByText(tree, 'Clean up orphaned ICE resources');
    const onClick = (cleanupBtn!.props as { onClick: () => Promise<void> }).onClick;
    await onClick();
    expect(mocks.errorMsgSetterSpy).toHaveBeenCalledWith('Network unreachable');
    expect(mocks.stateSetterSpy).toHaveBeenCalledWith('failed');
  });

  it('falls back to String(err) in the catch block when err has no .message', async () => {
    mocks.cleanupOrphansSpy.mockRejectedValue('string-error');
    const tree = renderBanner(makeProps({ error: 'project=foo' }));
    const cleanupBtn = findButtonByText(tree, 'Clean up orphaned ICE resources');
    const onClick = (cleanupBtn!.props as { onClick: () => Promise<void> }).onClick;
    await onClick();
    expect(mocks.errorMsgSetterSpy).toHaveBeenCalledWith('string-error');
    expect(mocks.stateSetterSpy).toHaveBeenCalledWith('failed');
  });
});

describe('QuotaErrorBanner — running state', () => {
  it('renders the spinner copy "Scanning and deleting orphaned resources…" with the … character', () => {
    mocks.stateRef.current = 'running';
    const tree = renderBanner(makeProps({ error: 'project=foo' }));
    const text = collectText(tree);
    expect(text).toContain('Scanning and deleting orphaned resources…');
    // Verify it uses the U+2026 single character, not three ASCII dots.
    expect(text).not.toContain('Scanning and deleting orphaned resources...');
  });

  it('does NOT render idle/done/failed branches in running state', () => {
    mocks.stateRef.current = 'running';
    const tree = renderBanner(makeProps({ error: 'project=foo' }));
    expect(findButtonByText(tree, 'Clean up orphaned ICE resources')).toBeUndefined();
    expect(findButtonByText(tree, 'Retry deploy')).toBeUndefined();
    expect(findButtonByText(tree, 'Retry cleanup')).toBeUndefined();
    expect(collectText(tree)).not.toContain('Cleanup complete');
    expect(collectText(tree)).not.toContain('Cleanup failed:');
  });
});

describe('QuotaErrorBanner — done state', () => {
  it('renders "Cleanup complete — deleted 0 resources" when nothing deleted (plural empty)', () => {
    mocks.stateRef.current = 'done';
    mocks.reportRef.current = { deleted: [] };
    const tree = renderBanner(makeProps({ error: 'project=foo' }));
    const text = collectText(tree);
    expect(text).toContain('Cleanup complete — deleted 0 resources');
  });

  it('renders "Cleanup complete — deleted 1 resource" (singular) when exactly one item deleted', () => {
    mocks.stateRef.current = 'done';
    mocks.reportRef.current = { deleted: [{ type: 'BackendBucket', name: 'orphan-1' }] };
    const tree = renderBanner(makeProps({ error: 'project=foo' }));
    const text = collectText(tree);
    expect(text).toContain('Cleanup complete — deleted 1 resource');
    // Make sure it's NOT pluralized.
    expect(text).not.toContain('1 resources');
  });

  it('renders "Cleanup complete — deleted 2 resources" (plural) when two items deleted', () => {
    mocks.stateRef.current = 'done';
    mocks.reportRef.current = {
      deleted: [
        { type: 'BackendBucket', name: 'a' },
        { type: 'StorageBucket', name: 'b' },
      ],
    };
    const tree = renderBanner(makeProps({ error: 'project=foo' }));
    const text = collectText(tree);
    expect(text).toContain('Cleanup complete — deleted 2 resources');
  });

  it('renders the deleted-resources list with ✓ glyph (U+2713) and type/name format when deleted has items', () => {
    mocks.stateRef.current = 'done';
    mocks.reportRef.current = {
      deleted: [
        { type: 'BackendBucket', name: 'old-cdn' },
        { type: 'StorageBucket', name: 'old-bucket' },
      ],
    };
    const tree = renderBanner(makeProps({ error: 'project=foo' }));
    const text = collectText(tree);
    expect(text).toContain('✓');
    expect(text).toContain('BackendBucket/old-cdn');
    expect(text).toContain('StorageBucket/old-bucket');
  });

  it('does NOT render the deleted-list section when deletedCount is 0', () => {
    mocks.stateRef.current = 'done';
    mocks.reportRef.current = { deleted: [] };
    const tree = renderBanner(makeProps({ error: 'project=foo' }));
    // No ✓ glyph should appear when there are no deleted items.
    expect(collectText(tree)).not.toContain('✓');
  });

  it('falls back to empty array for deleted when report.deleted is undefined (no crash)', () => {
    mocks.stateRef.current = 'done';
    mocks.reportRef.current = {};
    const tree = renderBanner(makeProps({ error: 'project=foo' }));
    expect(collectText(tree)).toContain('deleted 0 resources');
  });

  it('renders the errors list with ✗ glyph (U+2717) when report.errors has items', () => {
    mocks.stateRef.current = 'done';
    mocks.reportRef.current = {
      deleted: [],
      errors: [
        { type: 'BackendBucket', name: 'stuck', error: 'Resource in use' },
        { type: 'UrlMap', name: 'mapped', error: 'Permission denied' },
      ],
    };
    const tree = renderBanner(makeProps({ error: 'project=foo' }));
    const text = collectText(tree);
    expect(text).toContain('✗');
    expect(text).toContain('BackendBucket/stuck: Resource in use');
    expect(text).toContain('UrlMap/mapped: Permission denied');
  });

  it('does NOT render the errors-list section when report.errors is empty or undefined', () => {
    mocks.stateRef.current = 'done';
    mocks.reportRef.current = { deleted: [{ type: 'a', name: 'b' }], errors: [] };
    const tree1 = renderBanner(makeProps({ error: 'project=foo' }));
    expect(collectText(tree1)).not.toContain('✗');

    mocks.reportRef.current = { deleted: [{ type: 'a', name: 'b' }] };
    const tree2 = renderBanner(makeProps({ error: 'project=foo' }));
    expect(collectText(tree2)).not.toContain('✗');
  });

  it('renders the "Retry deploy" button', () => {
    mocks.stateRef.current = 'done';
    mocks.reportRef.current = { deleted: [{ type: 'a', name: 'b' }] };
    const tree = renderBanner(makeProps({ error: 'project=foo' }));
    const retryBtn = findButtonByText(tree, 'Retry deploy');
    expect(retryBtn).toBeDefined();
  });

  it('clicking the "Retry deploy" button calls the onRetryDeploy prop', () => {
    mocks.stateRef.current = 'done';
    mocks.reportRef.current = { deleted: [] };
    const onRetryDeploy = vi.fn();
    const tree = renderBanner(makeProps({ error: 'project=foo', onRetryDeploy }));
    const retryBtn = findButtonByText(tree, 'Retry deploy');
    expect(retryBtn).toBeDefined();
    const onClick = (retryBtn!.props as { onClick: () => void }).onClick;
    onClick();
    expect(onRetryDeploy).toHaveBeenCalledTimes(1);
  });

  it('does NOT render idle/running/failed branches in done state', () => {
    mocks.stateRef.current = 'done';
    mocks.reportRef.current = {};
    const tree = renderBanner(makeProps({ error: 'project=foo' }));
    expect(findButtonByText(tree, 'Clean up orphaned ICE resources')).toBeUndefined();
    expect(findButtonByText(tree, 'Retry cleanup')).toBeUndefined();
    expect(collectText(tree)).not.toContain('Scanning and deleting orphaned resources');
    expect(collectText(tree)).not.toContain('Cleanup failed:');
  });
});

describe('QuotaErrorBanner — failed state', () => {
  it('renders "Cleanup failed: <errorMsg>" with the captured errorMsg', () => {
    mocks.stateRef.current = 'failed';
    mocks.errorMsgRef.current = 'Network unreachable';
    const tree = renderBanner(makeProps({ error: 'project=foo' }));
    expect(collectText(tree)).toContain('Cleanup failed: Network unreachable');
  });

  it('renders the "Retry cleanup" button (with RefreshCw icon)', () => {
    mocks.stateRef.current = 'failed';
    mocks.errorMsgRef.current = 'oops';
    const tree = renderBanner(makeProps({ error: 'project=foo' }));
    const retryBtn = findButtonByText(tree, 'Retry cleanup');
    expect(retryBtn).toBeDefined();
  });

  it('clicking "Retry cleanup" calls runCleanup again (transitions back to running)', async () => {
    mocks.stateRef.current = 'failed';
    mocks.errorMsgRef.current = 'oops';
    mocks.cleanupOrphansSpy.mockResolvedValue({ success: true, report: { deleted: [] } });
    const tree = renderBanner(makeProps({ error: 'project=foo' }));
    const retryBtn = findButtonByText(tree, 'Retry cleanup');
    expect(retryBtn).toBeDefined();
    const onClick = (retryBtn!.props as { onClick: () => Promise<void> }).onClick;
    await onClick();
    // `runCleanup` first sets state to 'running' and clears errorMsg.
    expect(mocks.stateSetterSpy).toHaveBeenCalledWith('running');
    expect(mocks.errorMsgSetterSpy).toHaveBeenNthCalledWith(1, '');
    expect(mocks.cleanupOrphansSpy).toHaveBeenCalledTimes(1);
  });

  it('does NOT render idle/running/done branches in failed state', () => {
    mocks.stateRef.current = 'failed';
    mocks.errorMsgRef.current = 'oops';
    const tree = renderBanner(makeProps({ error: 'project=foo' }));
    expect(findButtonByText(tree, 'Clean up orphaned ICE resources')).toBeUndefined();
    expect(findButtonByText(tree, 'Retry deploy')).toBeUndefined();
    expect(collectText(tree)).not.toContain('Scanning and deleting orphaned resources');
    expect(collectText(tree)).not.toContain('Cleanup complete');
  });
});
