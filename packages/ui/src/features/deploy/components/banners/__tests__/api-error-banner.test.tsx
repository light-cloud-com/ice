/**
 * rf-pdpl-17 — ApiErrorBanner.
 *
 * First Layer 3 unit. The banner is a 5-branch error router that calls
 * `classifyDeployError` (rf-pdpl-5) and dispatches to: QuotaErrorBanner
 * (rf-pdpl-16), the billing JSX, the RAPT JSX, the standard red error card,
 * or the API-not-enabled "Enable API" buttons + retry.
 *
 * Direct-FC tree-walker pattern (cite
 * `tree-walker-for-react-fc-tests-must-flatten-nested-children-arrays`):
 * walks the React element tree, invoking any function `el.type` it
 * encounters. The classifier and helper utils are mocked so each branch is
 * observable in isolation; QuotaErrorBanner is stubbed so the prop pass-
 * through is verifiable without re-running the rf-pdpl-16 state machine.
 *
 * No React.useState / React.useEffect in the source — pure prop-driven —
 * so no react-namespace dual-patch is needed (cite
 * `react-namespace-hook-access-requires-patching-default-export-too`).
 *
 * vi.mock paths are RESOLVED RELATIVE TO THIS TEST FILE (not the source);
 * the source's `'../../../../i18n'` becomes `'../../../../../i18n'` here.
 * (cite `vi-mock-paths-resolve-relative-to-test-file-not-source-file`)
 *
 * Rendered HTML entities decode to the actual Unicode character at JSX
 * parse time, so the RAPT-branch `&rarr;` becomes U+2192 in the tree, and
 * the `&amp;` in "IAM &amp; Admin" becomes a literal '&' (cite
 * `jsx-html-entities-render-as-the-actual-unicode-character-not-the-escape-sequence`).
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks ──────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  // i18n
  tSpy: vi.fn(),
  // Helpers from `../../utils/error-classification` (rf-pdpl-5)
  classifyDeployErrorSpy: vi.fn(),
  collectApiEnableUrlsSpy: vi.fn(),
  extractProjectIdFromErrorSpy: vi.fn(),
  // Helper from `../../../../shared/utils/gcp-errors`
  extractApiNameSpy: vi.fn(),
  // openExternalUrl
  openExternalUrlSpy: vi.fn(),
  // QuotaErrorBanner stub — replaced with an opaque marker FC so we can
  // verify the prop pass-through.
  quotaErrorBannerStubProps: undefined as unknown,
  // cn — passthrough that joins truthy args with spaces
  cnSpy: vi.fn(),
}));

vi.mock('../../../../../i18n', () => ({
  useTranslation: () => ({ t: mocks.tSpy }),
}));

vi.mock('../../../../../shared/utils/cn', () => ({
  cn: mocks.cnSpy,
}));

vi.mock('../../../../../shared/utils/gcp-errors', () => ({
  extractApiName: mocks.extractApiNameSpy,
}));

vi.mock('../../../utils/error-classification', () => ({
  classifyDeployError: mocks.classifyDeployErrorSpy,
  collectApiEnableUrls: mocks.collectApiEnableUrlsSpy,
  extractProjectIdFromError: mocks.extractProjectIdFromErrorSpy,
}));

vi.mock('../../../utils/open-external-url', () => ({
  openExternalUrl: mocks.openExternalUrlSpy,
}));

vi.mock('../quota-error-banner', () => ({
  QuotaErrorBanner: (props: unknown) => {
    mocks.quotaErrorBannerStubProps = props;
    return React.createElement('div', { 'data-test-id': 'quota-stub' });
  },
}));

import { ApiErrorBanner } from '../api-error-banner';

// ─── Tree-walker ────────────────────────────────────────────────────────────

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
  results: Array<{ error?: string; api_enable_url?: string }>;
  onRetryDeploy: () => void;
};

const renderBanner = (props: BannerProps): React.ReactElement =>
  (ApiErrorBanner as unknown as (p: BannerProps) => React.ReactElement)(props);

const makeProps = (overrides: Partial<BannerProps> = {}): BannerProps => ({
  error: '',
  results: [],
  onRetryDeploy: vi.fn(),
  ...overrides,
});

const findButtons = (tree: React.ReactNode): React.ReactElement[] =>
  findByPredicate(tree, (el) => el.type === 'button');

const findLinks = (tree: React.ReactNode): React.ReactElement[] =>
  findByPredicate(tree, (el) => el.type === 'a');

// ─── Reset mocks ────────────────────────────────────────────────────────────

beforeEach(() => {
  mocks.tSpy.mockReset();
  mocks.tSpy.mockImplementation((key: string) => `[t:${key}]`);
  mocks.classifyDeployErrorSpy.mockReset();
  mocks.collectApiEnableUrlsSpy.mockReset();
  mocks.collectApiEnableUrlsSpy.mockReturnValue(new Set());
  mocks.extractProjectIdFromErrorSpy.mockReset();
  mocks.extractProjectIdFromErrorSpy.mockReturnValue('');
  mocks.extractApiNameSpy.mockReset();
  mocks.extractApiNameSpy.mockReturnValue(null);
  mocks.openExternalUrlSpy.mockReset();
  mocks.cnSpy.mockReset();
  mocks.cnSpy.mockImplementation((...args: unknown[]) =>
    args.filter((a): a is string => typeof a === 'string').join(' '),
  );
  mocks.quotaErrorBannerStubProps = undefined;
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('ApiErrorBanner — quota branch', () => {
  it('renders QuotaErrorBanner when classifyDeployError returns "quota"', () => {
    mocks.classifyDeployErrorSpy.mockReturnValue('quota');
    const onRetryDeploy = vi.fn();
    const error = 'project=foo backend bucket quota exceeded';
    const results = [{ error: 'project=foo backend bucket quota' }];
    const tree = renderBanner(makeProps({ error, results, onRetryDeploy }));
    const stubs = findByPredicate(
      tree,
      (el) => (el.props as Record<string, unknown>)?.['data-test-id'] === 'quota-stub',
    );
    expect(stubs.length).toBe(1);
  });

  it('passes through error, results, onRetryDeploy props to QuotaErrorBanner verbatim', () => {
    mocks.classifyDeployErrorSpy.mockReturnValue('quota');
    const onRetryDeploy = vi.fn();
    const error = 'quota error text';
    const results = [{ error: 'r1' }, { error: 'r2' }];
    const tree = renderBanner(makeProps({ error, results, onRetryDeploy }));
    // Walk the tree so the QuotaErrorBanner stub gets invoked and captures props.
    Array.from(walk(tree));
    expect(mocks.quotaErrorBannerStubProps).toEqual({ error, results, onRetryDeploy });
  });
});

describe('ApiErrorBanner — billing branch', () => {
  beforeEach(() => {
    mocks.classifyDeployErrorSpy.mockReturnValue('billing');
    mocks.extractProjectIdFromErrorSpy.mockReturnValue('my-project-123');
  });

  it('renders the billing JSX with title and description t-keys', () => {
    const tree = renderBanner(makeProps({ error: 'billing not enabled' }));
    const text = collectText(tree);
    expect(text).toContain('[t:deploy.errors.billingTitle]');
    expect(text).toContain('[t:deploy.errors.billingDescription]');
  });

  it('clicking the open-billing button calls openExternalUrl with the GCP billing URL containing the project ID', () => {
    const tree = renderBanner(makeProps({ error: 'billing error' }));
    const buttons = findButtons(tree);
    // Find the billing button via its t-key text.
    const billingBtn = buttons.find((b) => collectText(b).includes('[t:deploy.errors.billingButton]'));
    expect(billingBtn).toBeDefined();
    const onClick = (billingBtn!.props as { onClick: () => void }).onClick;
    onClick();
    expect(mocks.openExternalUrlSpy).toHaveBeenCalledWith(
      'https://console.cloud.google.com/billing/linkedaccount?project=my-project-123',
    );
  });

  it('clicking the retry button calls onRetryDeploy', () => {
    const onRetryDeploy = vi.fn();
    const tree = renderBanner(makeProps({ error: 'billing error', onRetryDeploy }));
    const buttons = findButtons(tree);
    const retryBtn = buttons.find((b) => collectText(b).includes('[t:deploy.buttons.retryDeploy]'));
    expect(retryBtn).toBeDefined();
    const onClick = (retryBtn!.props as { onClick: () => void }).onClick;
    onClick();
    expect(onRetryDeploy).toHaveBeenCalledTimes(1);
  });

  it('calls extractProjectIdFromError with the error prop (not the joined results)', () => {
    renderBanner(makeProps({ error: 'BILLING ERROR XYZ', results: [{ error: 'noise' }] }));
    expect(mocks.extractProjectIdFromErrorSpy).toHaveBeenCalledWith('BILLING ERROR XYZ');
  });
});

describe('ApiErrorBanner — rapt (re-auth) branch', () => {
  beforeEach(() => {
    mocks.classifyDeployErrorSpy.mockReturnValue('rapt');
  });

  it('renders the title, description, fix-title, and the two option labels', () => {
    const tree = renderBanner(makeProps({ error: 'rapt required' }));
    const text = collectText(tree);
    expect(text).toContain('[t:deploy.errors.raptTitle]');
    expect(text).toContain('[t:deploy.errors.raptDescription]');
    expect(text).toContain('[t:deploy.errors.raptFixTitle]');
    expect(text).toContain('[t:deploy.errors.raptOption1]');
    expect(text).toContain('[t:deploy.errors.raptOption2]');
  });

  it('renders the British "Organisation Policies" link verbatim (NOT "Organization")', () => {
    const tree = renderBanner(makeProps({ error: 'rapt' }));
    const text = collectText(tree);
    expect(text).toContain('Organisation Policies');
    expect(text).not.toContain('Organization Policies');
  });

  it('renders the org-policies link with the iam-admin/orgpolicies href and target=_blank', () => {
    const tree = renderBanner(makeProps({ error: 'rapt' }));
    const links = findLinks(tree);
    const orgLink = links.find((a) => collectText(a).includes('Organisation Policies'));
    expect(orgLink).toBeDefined();
    expect((orgLink!.props as { href: string }).href).toBe(
      'https://console.cloud.google.com/iam-admin/orgpolicies/iam-disableServiceAccountKeyCreation',
    );
    expect((orgLink!.props as { target: string }).target).toBe('_blank');
    expect((orgLink!.props as { rel: string }).rel).toBe('noopener noreferrer');
  });

  it('renders the Google Workspace Admin link with the admin reauth href', () => {
    const tree = renderBanner(makeProps({ error: 'rapt' }));
    const links = findLinks(tree);
    const wsLink = links.find((a) => collectText(a).includes('Google Workspace Admin'));
    expect(wsLink).toBeDefined();
    expect((wsLink!.props as { href: string }).href).toBe('https://admin.google.com/ac/security/reauth');
    expect((wsLink!.props as { target: string }).target).toBe('_blank');
  });

  it('renders the Workspace-Admin link text "Google Workspace Admin → Security → Google Cloud session control" (verbatim, with U+2192 right-arrows from &rarr; entities)', () => {
    const tree = renderBanner(makeProps({ error: 'rapt' }));
    const links = findLinks(tree);
    const wsLink = links.find((a) => collectText(a).includes('Google Workspace Admin'));
    expect(wsLink).toBeDefined();
    const wsText = collectText(wsLink!);
    expect(wsText).toContain('Google Workspace Admin');
    expect(wsText).toContain('Security');
    expect(wsText).toContain('Google Cloud session control');
    // The two &rarr; entities decode to U+2192 in the rendered tree.
    expect(wsText.match(/→/g)?.length).toBe(2);
  });

  it('renders the iam.disableServiceAccountKeyCreation code snippet', () => {
    const tree = renderBanner(makeProps({ error: 'rapt' }));
    const text = collectText(tree);
    expect(text).toContain('iam.disableServiceAccountKeyCreation');
  });

  it('renders the literal U+2192 right-arrow between the org-policies code and link', () => {
    // The first → is a literal Unicode character in the source (line 87 of the
    // module: `→{' '}`), not an HTML entity. It still ends up in the tree.
    const tree = renderBanner(makeProps({ error: 'rapt' }));
    const text = collectText(tree);
    // Total → in the tree: 1 (literal between code and org-policies link)
    // + 2 (the &rarr; entities inside the workspace-admin link) = 3.
    expect(text.match(/→/g)?.length).toBe(3);
  });
});

describe('ApiErrorBanner — unknown branch (no API errors)', () => {
  beforeEach(() => {
    mocks.classifyDeployErrorSpy.mockReturnValue('unknown');
    mocks.collectApiEnableUrlsSpy.mockReturnValue(new Set());
  });

  it('renders the standard red error card containing the error text verbatim', () => {
    const tree = renderBanner(makeProps({ error: 'something exploded' }));
    const text = collectText(tree);
    expect(text).toContain('something exploded');
  });

  it('does NOT render any t-key text in the unknown branch (no buttons, no Enable API copy)', () => {
    const tree = renderBanner(makeProps({ error: 'plain error' }));
    expect(findButtons(tree)).toHaveLength(0);
    const text = collectText(tree);
    expect(text).not.toContain('[t:deploy.errors.apiNotEnabledTitle]');
    expect(text).not.toContain('[t:deploy.errors.billingTitle]');
    expect(text).not.toContain('[t:deploy.errors.raptTitle]');
  });
});

describe('ApiErrorBanner — API-not-enabled branch (hasApiErrors)', () => {
  beforeEach(() => {
    // Branch is reached when classifyDeployError !== quota/billing/rapt AND
    // collectApiEnableUrls returns a non-empty set. We simulate "unknown" + URLs.
    mocks.classifyDeployErrorSpy.mockReturnValue('unknown');
  });

  it('renders one button per enable URL', () => {
    mocks.collectApiEnableUrlsSpy.mockReturnValue(
      new Set([
        'https://console.cloud.google.com/apis/library/run.googleapis.com',
        'https://console.cloud.google.com/apis/library/compute.googleapis.com',
      ]),
    );
    const tree = renderBanner(makeProps({ error: 'API not enabled' }));
    const enableButtons = findButtons(tree).filter((b) =>
      collectText(b).includes('[t:deploy.errors.enableApi]'),
    );
    expect(enableButtons).toHaveLength(2);
  });

  it('clicking an enable-API button calls openExternalUrl with the URL', () => {
    const url = 'https://console.cloud.google.com/apis/library/run.googleapis.com';
    mocks.collectApiEnableUrlsSpy.mockReturnValue(new Set([url]));
    const tree = renderBanner(makeProps({ error: 'API not enabled' }));
    const enableBtn = findButtons(tree).find((b) =>
      collectText(b).includes('[t:deploy.errors.enableApi]'),
    );
    expect(enableBtn).toBeDefined();
    const onClick = (enableBtn!.props as { onClick: () => void }).onClick;
    onClick();
    expect(mocks.openExternalUrlSpy).toHaveBeenCalledWith(url);
  });

  it('passes { api: extractApiName(url) } as i18n format args to t("deploy.errors.enableApi")', () => {
    const url = 'https://console.cloud.google.com/apis/library/run.googleapis.com';
    mocks.collectApiEnableUrlsSpy.mockReturnValue(new Set([url]));
    mocks.extractApiNameSpy.mockReturnValue('GCP Cloud Run');
    renderBanner(makeProps({ error: 'API not enabled' }));
    expect(mocks.tSpy).toHaveBeenCalledWith('deploy.errors.enableApi', { api: 'GCP Cloud Run' });
  });

  it('falls back to "API" literal when extractApiName returns null', () => {
    mocks.collectApiEnableUrlsSpy.mockReturnValue(new Set(['https://example.com/anonymous']));
    mocks.extractApiNameSpy.mockReturnValue(null);
    renderBanner(makeProps({ error: 'API not enabled' }));
    expect(mocks.tSpy).toHaveBeenCalledWith('deploy.errors.enableApi', { api: 'API' });
  });

  it('clicking the retry button at the bottom calls onRetryDeploy', () => {
    mocks.collectApiEnableUrlsSpy.mockReturnValue(new Set(['https://example.com/api']));
    const onRetryDeploy = vi.fn();
    const tree = renderBanner(makeProps({ error: 'API not enabled', onRetryDeploy }));
    const retryBtn = findButtons(tree).find((b) =>
      collectText(b).includes('[t:deploy.buttons.retryDeploy]'),
    );
    expect(retryBtn).toBeDefined();
    const onClick = (retryBtn!.props as { onClick: () => void }).onClick;
    onClick();
    expect(onRetryDeploy).toHaveBeenCalledTimes(1);
  });

  it('calls all 6 i18n keys used in the API branch', () => {
    mocks.collectApiEnableUrlsSpy.mockReturnValue(new Set(['https://example.com/api']));
    renderBanner(makeProps({ error: 'API not enabled' }));
    const calledKeys = mocks.tSpy.mock.calls.map((c) => c[0]);
    expect(calledKeys).toContain('deploy.errors.apiNotEnabledTitle');
    expect(calledKeys).toContain('deploy.errors.apiNotEnabledHint');
    expect(calledKeys).toContain('deploy.errors.autoEnableHint');
    expect(calledKeys).toContain('deploy.errors.enableApi');
    expect(calledKeys).toContain('deploy.errors.opensConsole');
    expect(calledKeys).toContain('deploy.buttons.retryDeploy');
  });

  it('uses stable index-based keys for enable-URL buttons (key={i})', () => {
    mocks.collectApiEnableUrlsSpy.mockReturnValue(
      new Set([
        'https://example.com/a',
        'https://example.com/b',
        'https://example.com/c',
      ]),
    );
    const tree = renderBanner(makeProps({ error: 'API not enabled' }));
    const enableButtons = findButtons(tree).filter((b) =>
      collectText(b).includes('[t:deploy.errors.enableApi]'),
    );
    expect(enableButtons.map((b) => b.key)).toEqual(['0', '1', '2']);
  });

  it('renders "IAM & Admin" link with the actual ampersand character (HTML entity decoded from &amp;)', () => {
    mocks.collectApiEnableUrlsSpy.mockReturnValue(new Set(['https://example.com/api']));
    const tree = renderBanner(makeProps({ error: 'API not enabled' }));
    const links = findLinks(tree);
    const iamLink = links.find((a) => collectText(a).includes('IAM'));
    expect(iamLink).toBeDefined();
    const iamText = collectText(iamLink!);
    // The &amp; in the source decodes to a literal '&' in the rendered tree.
    expect(iamText).toContain('IAM & Admin');
    // And the literal "&amp;" entity escape is NOT present in the rendered text.
    expect(iamText).not.toContain('&amp;');
  });

  it('renders the IAM & Admin link with the iam-admin/iam href', () => {
    mocks.collectApiEnableUrlsSpy.mockReturnValue(new Set(['https://example.com/api']));
    const tree = renderBanner(makeProps({ error: 'API not enabled' }));
    const links = findLinks(tree);
    const iamLink = links.find((a) => collectText(a).includes('IAM'));
    expect(iamLink).toBeDefined();
    expect((iamLink!.props as { href: string }).href).toBe(
      'https://console.cloud.google.com/iam-admin/iam',
    );
  });
});

describe('ApiErrorBanner — branch dispatch ordering', () => {
  it('quota branch wins over hasApiErrors (quota check is first)', () => {
    mocks.classifyDeployErrorSpy.mockReturnValue('quota');
    mocks.collectApiEnableUrlsSpy.mockReturnValue(new Set(['https://example.com/api']));
    const tree = renderBanner(makeProps({ error: 'quota and api' }));
    const stubs = findByPredicate(
      tree,
      (el) => (el.props as Record<string, unknown>)?.['data-test-id'] === 'quota-stub',
    );
    expect(stubs.length).toBe(1);
    // No "Enable API" buttons in the rendered tree.
    expect(findButtons(tree).filter((b) => collectText(b).includes('[t:deploy.errors.enableApi]'))).toHaveLength(0);
  });

  it('billing branch wins over hasApiErrors', () => {
    mocks.classifyDeployErrorSpy.mockReturnValue('billing');
    mocks.collectApiEnableUrlsSpy.mockReturnValue(new Set(['https://example.com/api']));
    mocks.extractProjectIdFromErrorSpy.mockReturnValue('p1');
    const tree = renderBanner(makeProps({ error: 'billing and api' }));
    const text = collectText(tree);
    expect(text).toContain('[t:deploy.errors.billingTitle]');
    expect(text).not.toContain('[t:deploy.errors.apiNotEnabledTitle]');
  });

  it('rapt branch wins over hasApiErrors', () => {
    mocks.classifyDeployErrorSpy.mockReturnValue('rapt');
    mocks.collectApiEnableUrlsSpy.mockReturnValue(new Set(['https://example.com/api']));
    const tree = renderBanner(makeProps({ error: 'rapt and api' }));
    const text = collectText(tree);
    expect(text).toContain('[t:deploy.errors.raptTitle]');
    expect(text).not.toContain('[t:deploy.errors.apiNotEnabledTitle]');
  });
});

describe('ApiErrorBanner — calls helpers with the correct arguments', () => {
  it('calls collectApiEnableUrls(error, results) once with both props', () => {
    mocks.classifyDeployErrorSpy.mockReturnValue('unknown');
    const error = 'some error';
    const results = [{ error: 'r1', api_enable_url: 'u1' }];
    renderBanner(makeProps({ error, results }));
    expect(mocks.collectApiEnableUrlsSpy).toHaveBeenCalledWith(error, results);
  });

  it('calls classifyDeployError(error, results) with both props', () => {
    mocks.classifyDeployErrorSpy.mockReturnValue('unknown');
    const error = 'classify me';
    const results = [{ error: 'r1' }];
    renderBanner(makeProps({ error, results }));
    expect(mocks.classifyDeployErrorSpy).toHaveBeenCalledWith(error, results);
  });
});
