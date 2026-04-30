/**
 * rf-pdpl-19 — DeployControls.
 *
 * Third (final) Layer 3 unit. The footer button row pulled out of
 * deploy-panel.tsx, with the cancel-fetch as part of the new component (the
 * orchestrator passes `onAppendLog(msg)` so the new module never imports
 * Redux). Direct-FC tree-walker pattern (cite
 * `tree-walker-for-react-fc-tests-must-flatten-nested-children-arrays`,
 * `vi-hoisted-for-stable-mock-identity-in-direct-fc-tree-walker-tests`,
 * `lucide-react-icons-are-forwardref-objects-not-fcs-for-tree-walker-predicates`).
 *
 * No `useState` / `useEffect` in the source — pure prop-driven — so no
 * react-namespace dual-patch is needed (cite
 * `react-namespace-hook-access-requires-patching-default-export-too`).
 *
 * `fetch` is stubbed via `vi.stubGlobal('fetch', ...)` since the cancel
 * onClick calls it directly (not via an api-adapter); `'/api/canvas/deploy/cancel'`
 * is the literal endpoint path.
 *
 * vi.mock paths are resolved RELATIVE TO THIS TEST FILE (cite
 * `vi-mock-paths-resolve-relative-to-test-file-not-source-file`): from
 * `__tests__/`, the source's `'../../../i18n'` becomes `'../../../../i18n'`
 * here.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks ──────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  // i18n stub — returns a `[t:KEY]`-shaped string so both presence and
  // absence assertions are exact.
  tSpy: vi.fn(),
  // cn passthrough — joins truthy args with single spaces, matching the real
  // util's effective output for our assertions on the className string.
  cnSpy: vi.fn(),
  // fetch stub — per-test resolution / rejection. Default resolves to a
  // 200-shape so the success branch is the path of least resistance.
  fetchSpy: vi.fn((_url: string, _init: unknown): Promise<unknown> => Promise.resolve({ ok: true })),
}));

vi.mock('../../../../i18n', () => ({
  useTranslation: () => ({ t: mocks.tSpy }),
}));

vi.mock('../../../../shared/utils/cn', () => ({
  cn: mocks.cnSpy,
}));

// `fetch` is read off the global. Stub it BEFORE importing the SUT so the
// runtime resolves to the spy.
vi.stubGlobal('fetch', mocks.fetchSpy);

import { DeployControls, type DeployControlsProps } from '../deploy-controls';

// ─── Tree-walker (rf-pdpl-7..18 style) ──────────────────────────────────────

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

// `findById` — convenience for the 5 E2E selector-id buttons.
function findById(tree: React.ReactNode, id: string): React.ReactElement | undefined {
  return findByPredicate(
    tree,
    (el) => typeof el.type === 'string' && (el.props as { id?: string }).id === id,
  )[0];
}

// `findIconByClassName` — lucide icons are forwardRef objects whose
// `el.props.className` carries the JSX-passed class. Match on the className
// substring, not on `typeof el.type === 'function'` (cite
// `lucide-react-icons-are-forwardref-objects-not-fcs-for-tree-walker-predicates`).
function findIconByClassName(tree: React.ReactNode, classFragment: string): React.ReactElement[] {
  return findByPredicate(
    tree,
    (el) =>
      typeof (el.props as { className?: string }).className === 'string' &&
      (el.props as { className: string }).className.includes(classFragment),
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const renderControls = (props: DeployControlsProps): React.ReactElement =>
  (DeployControls as unknown as (p: DeployControlsProps) => React.ReactElement)(props);

const makeProps = (overrides: Partial<DeployControlsProps> = {}): DeployControlsProps => ({
  status: 'idle',
  provider: 'gcp',
  gcpProject: 'my-project',
  gcpNodesCount: 1,
  deployedResourcesCount: 0,
  requirements: [],
  preDeployHasCritical: false,
  criticalAcknowledged: false,
  activeCardId: 'card-1',
  onPlan: vi.fn(),
  onDeploy: vi.fn(),
  onReset: vi.fn(),
  onOpenDestroyModal: vi.fn(),
  onAppendLog: vi.fn(),
  ...overrides,
});

// ─── Reset mocks ────────────────────────────────────────────────────────────

beforeEach(() => {
  mocks.tSpy.mockReset();
  mocks.tSpy.mockImplementation((key: string, _vars?: unknown) => `[t:${key}]`);
  mocks.cnSpy.mockReset();
  mocks.cnSpy.mockImplementation((...args: unknown[]) => args.filter(Boolean).join(' '));
  mocks.fetchSpy.mockReset();
  mocks.fetchSpy.mockResolvedValue({ ok: true });
});

// ─── Tests: Reset button (always rendered) ──────────────────────────────────

describe('DeployControls — Reset button', () => {
  it('always renders with id="ice-deploy-btn-cancel"', () => {
    const tree = renderControls(makeProps());
    const btn = findById(tree, 'ice-deploy-btn-cancel');
    expect(btn).toBeTruthy();
  });

  it('disabled when status === "deploying"', () => {
    const tree = renderControls(makeProps({ status: 'deploying' }));
    const btn = findById(tree, 'ice-deploy-btn-cancel')!;
    expect((btn.props as { disabled?: boolean }).disabled).toBe(true);
  });

  it('disabled when status === "destroying"', () => {
    const tree = renderControls(makeProps({ status: 'destroying' }));
    const btn = findById(tree, 'ice-deploy-btn-cancel')!;
    expect((btn.props as { disabled?: boolean }).disabled).toBe(true);
  });

  it('enabled when status === "idle"', () => {
    const tree = renderControls(makeProps({ status: 'idle' }));
    const btn = findById(tree, 'ice-deploy-btn-cancel')!;
    expect((btn.props as { disabled?: boolean }).disabled).toBe(false);
  });

  it('click → onReset()', () => {
    const onReset = vi.fn();
    const tree = renderControls(makeProps({ onReset }));
    const btn = findById(tree, 'ice-deploy-btn-cancel')!;
    const onClick = (btn.props as { onClick?: () => void }).onClick!;
    onClick();
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('title="Cannot clear while a deploy is running" when status === "deploying"', () => {
    const tree = renderControls(makeProps({ status: 'deploying' }));
    const btn = findById(tree, 'ice-deploy-btn-cancel')!;
    expect((btn.props as { title?: string }).title).toBe('Cannot clear while a deploy is running');
  });

  it('title="Cannot clear while a destroy is running" when status === "destroying"', () => {
    const tree = renderControls(makeProps({ status: 'destroying' }));
    const btn = findById(tree, 'ice-deploy-btn-cancel')!;
    expect((btn.props as { title?: string }).title).toBe('Cannot clear while a destroy is running');
  });

  it('title="Clear plan and results" otherwise', () => {
    const tree = renderControls(makeProps({ status: 'idle' }));
    const btn = findById(tree, 'ice-deploy-btn-cancel')!;
    expect((btn.props as { title?: string }).title).toBe('Clear plan and results');
  });

  it('renders translation key "deploy.buttons.reset" as the label', () => {
    renderControls(makeProps());
    expect(mocks.tSpy).toHaveBeenCalledWith('deploy.buttons.reset');
  });
});

// ─── Tests: Stop button (only when status === 'deploying') ─────────────────

describe('DeployControls — Stop button', () => {
  it('not rendered when status !== "deploying"', () => {
    const tree = renderControls(makeProps({ status: 'idle' }));
    expect(findById(tree, 'ice-deploy-btn-stop')).toBeUndefined();
  });

  it('rendered when status === "deploying"', () => {
    const tree = renderControls(makeProps({ status: 'deploying' }));
    expect(findById(tree, 'ice-deploy-btn-stop')).toBeTruthy();
  });

  it('click → fetches /api/canvas/deploy/cancel with cardId, then onAppendLog(success-msg)', async () => {
    const onAppendLog = vi.fn();
    mocks.fetchSpy.mockResolvedValueOnce({ ok: true });
    const tree = renderControls(
      makeProps({ status: 'deploying', activeCardId: 'card-42', onAppendLog }),
    );
    const btn = findById(tree, 'ice-deploy-btn-stop')!;
    const onClick = (btn.props as { onClick?: () => Promise<void> }).onClick!;
    await onClick();
    expect(mocks.fetchSpy).toHaveBeenCalledTimes(1);
    expect(mocks.fetchSpy).toHaveBeenCalledWith('/api/canvas/deploy/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ cardId: 'card-42' }),
    });
    expect(onAppendLog).toHaveBeenCalledTimes(1);
    expect(onAppendLog).toHaveBeenCalledWith(
      'Stop requested — deploy will wind down after the current resource.',
    );
  });

  it('fetch rejects with Error → onAppendLog("Cancel failed: <err.message>")', async () => {
    const onAppendLog = vi.fn();
    mocks.fetchSpy.mockRejectedValueOnce(new Error('connection refused'));
    const tree = renderControls(
      makeProps({ status: 'deploying', activeCardId: 'card-1', onAppendLog }),
    );
    const btn = findById(tree, 'ice-deploy-btn-stop')!;
    const onClick = (btn.props as { onClick?: () => Promise<void> }).onClick!;
    await onClick();
    expect(onAppendLog).toHaveBeenCalledTimes(1);
    expect(onAppendLog).toHaveBeenCalledWith('Cancel failed: connection refused');
  });

  it('fetch rejects with non-Error (string) → onAppendLog falls through to `${err}`', async () => {
    const onAppendLog = vi.fn();
    // The source uses `err?.message || err`. A bare-string rejection has no
    // `.message`, so the fallback is the string itself.
    mocks.fetchSpy.mockRejectedValueOnce('boom');
    const tree = renderControls(
      makeProps({ status: 'deploying', activeCardId: 'card-1', onAppendLog }),
    );
    const btn = findById(tree, 'ice-deploy-btn-stop')!;
    const onClick = (btn.props as { onClick?: () => Promise<void> }).onClick!;
    await onClick();
    expect(onAppendLog).toHaveBeenCalledWith('Cancel failed: boom');
  });

  it('activeCardId === null → click is no-op (no fetch, no log)', async () => {
    const onAppendLog = vi.fn();
    const tree = renderControls(
      makeProps({ status: 'deploying', activeCardId: null, onAppendLog }),
    );
    const btn = findById(tree, 'ice-deploy-btn-stop')!;
    const onClick = (btn.props as { onClick?: () => Promise<void> }).onClick!;
    await onClick();
    expect(mocks.fetchSpy).not.toHaveBeenCalled();
    expect(onAppendLog).not.toHaveBeenCalled();
  });

  it('renders the literal "Stop" label (not an i18n key)', () => {
    const tree = renderControls(makeProps({ status: 'deploying' }));
    const btn = findById(tree, 'ice-deploy-btn-stop')!;
    // The button's children include the lucide X icon and the bare string.
    const children = (btn.props as { children?: React.ReactNode }).children;
    const flat: React.ReactNode[] = Array.isArray(children) ? (children as React.ReactNode[]) : [children];
    expect(flat).toContain('Stop');
  });

  it('title="Request the in-flight deploy to stop"', () => {
    const tree = renderControls(makeProps({ status: 'deploying' }));
    const btn = findById(tree, 'ice-deploy-btn-stop')!;
    expect((btn.props as { title?: string }).title).toBe('Request the in-flight deploy to stop');
  });
});

// ─── Tests: Plan button ────────────────────────────────────────────────────

describe('DeployControls — Plan button', () => {
  it('always rendered with id="ice-deploy-btn-plan"', () => {
    const tree = renderControls(makeProps({ status: 'idle' }));
    expect(findById(tree, 'ice-deploy-btn-plan')).toBeTruthy();
  });

  it('disabled when !gcpProject', () => {
    const tree = renderControls(makeProps({ gcpProject: '' }));
    const btn = findById(tree, 'ice-deploy-btn-plan')!;
    expect((btn.props as { disabled?: boolean }).disabled).toBe(true);
  });

  it('disabled when gcpNodesCount === 0', () => {
    const tree = renderControls(makeProps({ gcpNodesCount: 0 }));
    const btn = findById(tree, 'ice-deploy-btn-plan')!;
    expect((btn.props as { disabled?: boolean }).disabled).toBe(true);
  });

  it('disabled when status === "planning"', () => {
    const tree = renderControls(makeProps({ status: 'planning' }));
    const btn = findById(tree, 'ice-deploy-btn-plan')!;
    expect((btn.props as { disabled?: boolean }).disabled).toBe(true);
  });

  it('disabled when status === "deploying"', () => {
    const tree = renderControls(makeProps({ status: 'deploying' }));
    const btn = findById(tree, 'ice-deploy-btn-plan')!;
    expect((btn.props as { disabled?: boolean }).disabled).toBe(true);
  });

  it('disabled when status === "destroying"', () => {
    const tree = renderControls(makeProps({ status: 'destroying' }));
    const btn = findById(tree, 'ice-deploy-btn-plan')!;
    expect((btn.props as { disabled?: boolean }).disabled).toBe(true);
  });

  it('disabled when status === "authenticating"', () => {
    const tree = renderControls(makeProps({ status: 'authenticating' }));
    const btn = findById(tree, 'ice-deploy-btn-plan')!;
    expect((btn.props as { disabled?: boolean }).disabled).toBe(true);
  });

  it('enabled when gcpProject is set + nodes > 0 + status === "idle"', () => {
    const tree = renderControls(makeProps({ status: 'idle', gcpProject: 'p', gcpNodesCount: 1 }));
    const btn = findById(tree, 'ice-deploy-btn-plan')!;
    expect((btn.props as { disabled?: boolean }).disabled).toBe(false);
  });

  it('click → onPlan()', () => {
    const onPlan = vi.fn();
    const tree = renderControls(makeProps({ onPlan }));
    const btn = findById(tree, 'ice-deploy-btn-plan')!;
    const onClick = (btn.props as { onClick?: () => void }).onClick!;
    onClick();
    expect(onPlan).toHaveBeenCalledTimes(1);
  });

  it('title="Select a GCP project to continue" when !gcpProject', () => {
    const tree = renderControls(makeProps({ gcpProject: '' }));
    const btn = findById(tree, 'ice-deploy-btn-plan')!;
    expect((btn.props as { title?: string }).title).toBe('Select a GCP project to continue');
  });

  it('title="Add at least one resource block to deploy" when gcpNodesCount === 0', () => {
    const tree = renderControls(makeProps({ gcpNodesCount: 0 }));
    const btn = findById(tree, 'ice-deploy-btn-plan')!;
    expect((btn.props as { title?: string }).title).toBe('Add at least one resource block to deploy');
  });

  it('title="Deploy in progress" when status === "deploying"', () => {
    const tree = renderControls(makeProps({ status: 'deploying' }));
    const btn = findById(tree, 'ice-deploy-btn-plan')!;
    expect((btn.props as { title?: string }).title).toBe('Deploy in progress');
  });

  it('title="Planning…" when status === "planning"', () => {
    const tree = renderControls(makeProps({ status: 'planning' }));
    const btn = findById(tree, 'ice-deploy-btn-plan')!;
    expect((btn.props as { title?: string }).title).toBe('Planning…');
  });

  it('title="Generate a deploy plan" when status === "idle"', () => {
    const tree = renderControls(makeProps({ status: 'idle' }));
    const btn = findById(tree, 'ice-deploy-btn-plan')!;
    expect((btn.props as { title?: string }).title).toBe('Generate a deploy plan');
  });

  it('renders Loader2 icon (animate-spin) when status === "planning"', () => {
    const tree = renderControls(makeProps({ status: 'planning' }));
    const spinning = findIconByClassName(tree, 'animate-spin');
    expect(spinning.length).toBeGreaterThanOrEqual(1);
  });

  it('renders Eye icon (no animate-spin in plan button) when status !== "planning"', () => {
    const tree = renderControls(makeProps({ status: 'idle' }));
    // The plan button's icon should be Eye, not Loader2. We assert there's no
    // animate-spin icon in the plan branch by counting all spinning icons —
    // there are no other spinners in the idle state.
    const spinning = findIconByClassName(tree, 'animate-spin');
    expect(spinning.length).toBe(0);
  });

  it('renders translation key "deploy.buttons.plan" as the label', () => {
    renderControls(makeProps());
    expect(mocks.tSpy).toHaveBeenCalledWith('deploy.buttons.plan');
  });
});

// ─── Tests: Deploy button ──────────────────────────────────────────────────

describe('DeployControls — Deploy button', () => {
  it('always rendered with id="ice-deploy-btn-apply"', () => {
    const tree = renderControls(makeProps());
    expect(findById(tree, 'ice-deploy-btn-apply')).toBeTruthy();
  });

  it('click → onDeploy()', () => {
    const onDeploy = vi.fn();
    const tree = renderControls(makeProps({ onDeploy }));
    const btn = findById(tree, 'ice-deploy-btn-apply')!;
    const onClick = (btn.props as { onClick?: () => void }).onClick!;
    onClick();
    expect(onDeploy).toHaveBeenCalledTimes(1);
  });

  // Disabled-gates: 8 sources combine via OR.
  it('disabled when !gcpProject', () => {
    const tree = renderControls(makeProps({ gcpProject: '' }));
    expect(((findById(tree, 'ice-deploy-btn-apply') as React.ReactElement).props as { disabled?: boolean }).disabled).toBe(true);
  });

  it('disabled when gcpNodesCount === 0', () => {
    const tree = renderControls(makeProps({ gcpNodesCount: 0 }));
    expect(((findById(tree, 'ice-deploy-btn-apply') as React.ReactElement).props as { disabled?: boolean }).disabled).toBe(true);
  });

  it('disabled when status === "deploying"', () => {
    const tree = renderControls(makeProps({ status: 'deploying' }));
    expect(((findById(tree, 'ice-deploy-btn-apply') as React.ReactElement).props as { disabled?: boolean }).disabled).toBe(true);
  });

  it('disabled when status === "destroying"', () => {
    const tree = renderControls(makeProps({ status: 'destroying' }));
    expect(((findById(tree, 'ice-deploy-btn-apply') as React.ReactElement).props as { disabled?: boolean }).disabled).toBe(true);
  });

  it('disabled when status === "planning"', () => {
    const tree = renderControls(makeProps({ status: 'planning' }));
    expect(((findById(tree, 'ice-deploy-btn-apply') as React.ReactElement).props as { disabled?: boolean }).disabled).toBe(true);
  });

  it('disabled when status === "authenticating"', () => {
    const tree = renderControls(makeProps({ status: 'authenticating' }));
    expect(((findById(tree, 'ice-deploy-btn-apply') as React.ReactElement).props as { disabled?: boolean }).disabled).toBe(true);
  });

  it('disabled when hasBlockingUnmet (some requirement is blocking + status !== met/verified)', () => {
    const tree = renderControls(
      makeProps({
        requirements: [
          {
            definitionId: 'req-1',
            scope: 'block',
            timing: 'before-deploy',
            blocking: true,
            title: 'DNS verified',
            result: { status: 'unmet', lastCheckedAt: '2026-04-30' },
          },
        ],
      }),
    );
    expect(((findById(tree, 'ice-deploy-btn-apply') as React.ReactElement).props as { disabled?: boolean }).disabled).toBe(true);
  });

  it('NOT blocked by met requirements', () => {
    const tree = renderControls(
      makeProps({
        requirements: [
          {
            definitionId: 'req-1',
            scope: 'block',
            timing: 'before-deploy',
            blocking: true,
            title: 'DNS verified',
            result: { status: 'met', lastCheckedAt: '2026-04-30' },
          },
        ],
      }),
    );
    expect(((findById(tree, 'ice-deploy-btn-apply') as React.ReactElement).props as { disabled?: boolean }).disabled).toBe(false);
  });

  it('NOT blocked by verified requirements', () => {
    const tree = renderControls(
      makeProps({
        requirements: [
          {
            definitionId: 'req-1',
            scope: 'block',
            timing: 'before-deploy',
            blocking: true,
            title: 'DNS verified',
            result: { status: 'verified', lastCheckedAt: '2026-04-30' },
          },
        ],
      }),
    );
    expect(((findById(tree, 'ice-deploy-btn-apply') as React.ReactElement).props as { disabled?: boolean }).disabled).toBe(false);
  });

  it('NOT blocked by non-blocking unmet requirements', () => {
    const tree = renderControls(
      makeProps({
        requirements: [
          {
            definitionId: 'req-1',
            scope: 'block',
            timing: 'before-deploy',
            blocking: false,
            title: 'DNS verified',
            result: { status: 'unmet', lastCheckedAt: '2026-04-30' },
          },
        ],
      }),
    );
    expect(((findById(tree, 'ice-deploy-btn-apply') as React.ReactElement).props as { disabled?: boolean }).disabled).toBe(false);
  });

  it('disabled when blockedByCritical (preDeployHasCritical && !criticalAcknowledged)', () => {
    const tree = renderControls(
      makeProps({ preDeployHasCritical: true, criticalAcknowledged: false }),
    );
    expect(((findById(tree, 'ice-deploy-btn-apply') as React.ReactElement).props as { disabled?: boolean }).disabled).toBe(true);
  });

  it('NOT blocked when preDeployHasCritical && criticalAcknowledged', () => {
    const tree = renderControls(
      makeProps({ preDeployHasCritical: true, criticalAcknowledged: true }),
    );
    expect(((findById(tree, 'ice-deploy-btn-apply') as React.ReactElement).props as { disabled?: boolean }).disabled).toBe(false);
  });

  it('NOT blocked when !preDeployHasCritical regardless of criticalAcknowledged', () => {
    const tree = renderControls(
      makeProps({ preDeployHasCritical: false, criticalAcknowledged: false }),
    );
    expect(((findById(tree, 'ice-deploy-btn-apply') as React.ReactElement).props as { disabled?: boolean }).disabled).toBe(false);
  });

  // Title-text: 7 branches.
  it('title="Select a GCP project to continue" when !gcpProject', () => {
    const tree = renderControls(makeProps({ gcpProject: '' }));
    const btn = findById(tree, 'ice-deploy-btn-apply')!;
    expect((btn.props as { title?: string }).title).toBe('Select a GCP project to continue');
  });

  it('title=`Add at least one ${provider.toUpperCase()} resource block to deploy` when gcpNodesCount === 0', () => {
    const tree = renderControls(makeProps({ gcpNodesCount: 0, provider: 'gcp' }));
    const btn = findById(tree, 'ice-deploy-btn-apply')!;
    expect((btn.props as { title?: string }).title).toBe(
      'Add at least one GCP resource block to deploy',
    );
  });

  it('uppercases the provider in the no-nodes title (provider="aws" → "AWS")', () => {
    const tree = renderControls(makeProps({ gcpNodesCount: 0, provider: 'aws' }));
    const btn = findById(tree, 'ice-deploy-btn-apply')!;
    expect((btn.props as { title?: string }).title).toBe(
      'Add at least one AWS resource block to deploy',
    );
  });

  it('title="Deploy in progress — click Stop to cancel" when status === "deploying"', () => {
    const tree = renderControls(makeProps({ status: 'deploying' }));
    const btn = findById(tree, 'ice-deploy-btn-apply')!;
    expect((btn.props as { title?: string }).title).toBe('Deploy in progress — click Stop to cancel');
  });

  it('title="Waiting for plan to finish" when status === "planning"', () => {
    const tree = renderControls(makeProps({ status: 'planning' }));
    const btn = findById(tree, 'ice-deploy-btn-apply')!;
    expect((btn.props as { title?: string }).title).toBe('Waiting for plan to finish');
  });

  it('title=`Blocked by N requirement(s): titles, joined` when hasBlockingUnmet', () => {
    const tree = renderControls(
      makeProps({
        requirements: [
          {
            definitionId: 'req-1',
            scope: 'block',
            timing: 'before-deploy',
            blocking: true,
            title: 'DNS verified',
            result: { status: 'unmet', lastCheckedAt: '2026-04-30' },
          },
          {
            definitionId: 'req-2',
            scope: 'block',
            timing: 'before-deploy',
            blocking: true,
            title: 'GitHub repo connected',
            result: { status: 'unknown', lastCheckedAt: '2026-04-30' },
          },
        ],
      }),
    );
    const btn = findById(tree, 'ice-deploy-btn-apply')!;
    expect((btn.props as { title?: string }).title).toBe(
      'Blocked by 2 requirement(s): DNS verified, GitHub repo connected',
    );
  });

  it('title="Deploy updated infrastructure" when deployedResourcesCount > 0 (no blockers)', () => {
    const tree = renderControls(makeProps({ deployedResourcesCount: 3 }));
    const btn = findById(tree, 'ice-deploy-btn-apply')!;
    expect((btn.props as { title?: string }).title).toBe('Deploy updated infrastructure');
  });

  it('title="Deploy to cloud" when deployedResourcesCount === 0 (no blockers)', () => {
    const tree = renderControls(makeProps({ deployedResourcesCount: 0 }));
    const btn = findById(tree, 'ice-deploy-btn-apply')!;
    expect((btn.props as { title?: string }).title).toBe('Deploy to cloud');
  });

  it('renders Loader2 icon (animate-spin) when status === "deploying"', () => {
    // status === 'deploying' makes Stop button visible too — both buttons
    // exist but only Apply has the Loader2. Stop has its own X icon.
    const tree = renderControls(makeProps({ status: 'deploying' }));
    const spinning = findIconByClassName(tree, 'animate-spin');
    expect(spinning.length).toBeGreaterThanOrEqual(1);
  });

  it('renders Play icon (no animate-spin) when status !== "deploying"', () => {
    const tree = renderControls(makeProps({ status: 'idle' }));
    const spinning = findIconByClassName(tree, 'animate-spin');
    expect(spinning.length).toBe(0);
  });

  it('label uses "deploy.buttons.updateInfrastructure" key when deployedResourcesCount > 0', () => {
    renderControls(makeProps({ deployedResourcesCount: 1 }));
    expect(mocks.tSpy).toHaveBeenCalledWith('deploy.buttons.updateInfrastructure');
    expect(mocks.tSpy).not.toHaveBeenCalledWith('deploy.buttons.deploy');
  });

  it('label uses "deploy.buttons.deploy" key when deployedResourcesCount === 0', () => {
    renderControls(makeProps({ deployedResourcesCount: 0 }));
    expect(mocks.tSpy).toHaveBeenCalledWith('deploy.buttons.deploy');
    expect(mocks.tSpy).not.toHaveBeenCalledWith('deploy.buttons.updateInfrastructure');
  });
});

// ─── Tests: Destroy button ─────────────────────────────────────────────────

describe('DeployControls — Destroy button', () => {
  it('rendered when status !== "deploying"', () => {
    const tree = renderControls(makeProps({ status: 'idle' }));
    expect(findById(tree, 'ice-deploy-btn-destroy')).toBeTruthy();
  });

  it('rendered when status === "destroying" (NOT "deploying")', () => {
    const tree = renderControls(makeProps({ status: 'destroying' }));
    expect(findById(tree, 'ice-deploy-btn-destroy')).toBeTruthy();
  });

  it('NOT rendered when status === "deploying"', () => {
    const tree = renderControls(makeProps({ status: 'deploying' }));
    expect(findById(tree, 'ice-deploy-btn-destroy')).toBeUndefined();
  });

  it('click → onOpenDestroyModal()', () => {
    const onOpenDestroyModal = vi.fn();
    const tree = renderControls(makeProps({ onOpenDestroyModal }));
    const btn = findById(tree, 'ice-deploy-btn-destroy')!;
    const onClick = (btn.props as { onClick?: () => void }).onClick!;
    onClick();
    expect(onOpenDestroyModal).toHaveBeenCalledTimes(1);
  });

  it('title="Destroy deployed resources — including orphaned leftovers from failed deploys"', () => {
    const tree = renderControls(makeProps({ status: 'idle' }));
    const btn = findById(tree, 'ice-deploy-btn-destroy')!;
    expect((btn.props as { title?: string }).title).toBe(
      'Destroy deployed resources — including orphaned leftovers from failed deploys',
    );
  });

  it('renders translation key "deploy.buttons.destroy" as the label', () => {
    renderControls(makeProps());
    expect(mocks.tSpy).toHaveBeenCalledWith('deploy.buttons.destroy');
  });
});

// ─── Tests: E2E selector preservation (the 5 critical button ids) ──────────

describe('DeployControls — E2E selector ids', () => {
  it('preserves all 5 selector ids when fully rendered (deploying state)', () => {
    const tree = renderControls(makeProps({ status: 'deploying' }));
    // Cancel + Stop + Plan + Apply ARE rendered; Destroy is NOT (status === 'deploying').
    expect(findById(tree, 'ice-deploy-btn-cancel')).toBeTruthy();
    expect(findById(tree, 'ice-deploy-btn-stop')).toBeTruthy();
    expect(findById(tree, 'ice-deploy-btn-plan')).toBeTruthy();
    expect(findById(tree, 'ice-deploy-btn-apply')).toBeTruthy();
    expect(findById(tree, 'ice-deploy-btn-destroy')).toBeUndefined();
  });

  it('preserves cancel + plan + apply + destroy when status === "idle"', () => {
    const tree = renderControls(makeProps({ status: 'idle' }));
    expect(findById(tree, 'ice-deploy-btn-cancel')).toBeTruthy();
    expect(findById(tree, 'ice-deploy-btn-stop')).toBeUndefined();
    expect(findById(tree, 'ice-deploy-btn-plan')).toBeTruthy();
    expect(findById(tree, 'ice-deploy-btn-apply')).toBeTruthy();
    expect(findById(tree, 'ice-deploy-btn-destroy')).toBeTruthy();
  });
});
