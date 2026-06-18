/**
 * rf-pdpl-18 — ConfigSection.
 *
 * Second Layer 3 unit. The first rf-pdpl section module that uses BOTH
 * `useState` (×3: `providerConnected`, `connectedProjects`, `authType`) AND
 * `useEffect` (×1) to fetch the provider's connection / project list /
 * credentials on mount and on every provider-change.
 *
 * Test patterns reused (cite paired learnings):
 *  - `react-namespace-hook-access-requires-patching-default-export-too` — the
 *    source uses `React.useState(...)` / `React.useEffect(...)` (default
 *    namespace), so the `vi.mock('react', ...)` factory must patch BOTH the
 *    named exports AND the default export.
 *  - `queued-ref-dispatch-extends-the-mutable-ref-usestate-mock-to-multi-state-fcs`
 *    — three `useState` slots dealt out by `callIdx` from a queue of refs +
 *    setter spies; `__resetUseState()` resets the counter per render.
 *  - `dynamic-import-of-api-adapter-needs-a-direct-vi-mock-on-the-target-module`
 *    — note that `getApi` here is a STATIC import in the source, but the same
 *    direct-mock-on-target-module rule applies: a `vi.mock('.../api-adapter',
 *    ...)` wins for both static and dynamic resolution.
 *  - `vi-mock-paths-resolve-relative-to-test-file-not-source-file` — paths
 *    here are 5-up from `__tests__/` (sections/__tests__ → sections →
 *    components → deploy → features → src/...).
 *
 * Direct-FC tree-walker pattern (cite
 * `tree-walker-for-react-fc-tests-must-flatten-nested-children-arrays`).
 * The source renders only HTML elements + lucide icons + a stubbed IceSelect,
 * so the walker only needs the array-flatten and element-recursion branches.
 *
 * IceSelect is mocked with an opaque marker FC that captures its props onto a
 * hoisted slot per call site (project + region) — this lets us assert prop
 * pass-through (value/onChange/options/disabled) without re-rendering Radix's
 * full primitive surface.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks ──────────────────────────────────────────────────────────
//
// Three useState slots in declaration order:
//   0: providerConnected (bool, initial false)
//   1: connectedProjects (array, initial [])
//   2: authType         (string|null, initial null)
//
// Each ref + setter spy is independent so per-slot setter calls are
// individually assertable (e.g., setProviderConnected(true) is captured by
// `providerConnectedSetterSpy` and not the others).
const mocks = vi.hoisted(() => ({
  providerConnectedRef: { current: false as boolean },
  connectedProjectsRef: { current: [] as Array<{ id: string; name: string }> },
  authTypeRef: { current: null as string | null },
  providerConnectedSetterSpy: vi.fn(),
  connectedProjectsSetterSpy: vi.fn(),
  authTypeSetterSpy: vi.fn(),

  // useEffect callbacks/cleanups/deps captured for introspection.
  effectCallbacks: [] as Array<() => void | (() => void)>,
  effectCleanups: [] as Array<(() => void) | void>,
  effectDeps: [] as unknown[][],

  // i18n.
  tSpy: vi.fn(),

  // getApi — three provider methods, exposed as Vitest spies so each test
  // can drive them with mockResolvedValueOnce / mockRejectedValueOnce.
  isConnectedSpy: vi.fn(),
  getProjectsSpy: vi.fn(),
  getCredentialsSpy: vi.fn(),

  // IceSelect stub — captures props onto a per-callsite slot (project /
  // region) via a unique key. The component is rendered twice in a single
  // FC body (project block when connectedProjects.length > 0, and the
  // always-on region block), so we need to disambiguate.
  iceSelectCalls: [] as Array<unknown>,
}));

// Mock React's useState / useEffect.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  let callIdx = 0;
  (mocks as unknown as { __resetUseState: () => void }).__resetUseState = () => {
    callIdx = 0;
  };
  const dispatch = [
    () => [mocks.providerConnectedRef.current, mocks.providerConnectedSetterSpy] as const,
    () => [mocks.connectedProjectsRef.current, mocks.connectedProjectsSetterSpy] as const,
    () => [mocks.authTypeRef.current, mocks.authTypeSetterSpy] as const,
  ];
  const patchedUseState = vi.fn((_initial?: unknown) => {
    const slot = dispatch[callIdx] ?? dispatch[dispatch.length - 1];
    callIdx += 1;
    return slot();
  });
  const patchedUseEffect = vi.fn((cb: () => void | (() => void), deps?: unknown[]) => {
    mocks.effectCallbacks.push(cb);
    mocks.effectDeps.push(deps ?? []);
    const cleanup = cb();
    mocks.effectCleanups.push(cleanup);
  });
  // React types may not declare `default` on the namespace; cast through
  // `unknown` to read it without breaking `--noEmit`.
  const actualDefault = (actual as unknown as { default?: typeof actual }).default ?? actual;
  return {
    ...actual,
    useState: patchedUseState,
    useEffect: patchedUseEffect,
    default: {
      ...actualDefault,
      useState: patchedUseState,
      useEffect: patchedUseEffect,
    },
  };
});

// vi.mock paths from `sections/__tests__/` are 5-up to reach
// `packages/ui/src/`.
vi.mock('../../../../../i18n', () => ({
  useTranslation: () => ({ t: mocks.tSpy }),
}));

// `getApi()` returns an object with a `provider` namespace; each method is
// a Vitest spy so per-test resolutions / rejections are direct.
vi.mock('../../../../../shared/api/api-adapter', () => ({
  getApi: () => ({
    provider: {
      isConnected: mocks.isConnectedSpy,
      getProjects: mocks.getProjectsSpy,
      getCredentials: mocks.getCredentialsSpy,
    },
  }),
}));

// IceSelect stub — opaque marker FC that captures its props.
vi.mock('../../../../../shared/components/ui/ice-select', () => ({
  IceSelect: (props: unknown) => {
    mocks.iceSelectCalls.push(props);
    return React.createElement('div', { 'data-test-id': 'ice-select-stub' });
  },
}));

// provider-regions: the values we care about are PROVIDER_REGIONS.gcp / .aws
// for the fallback test, PROVIDER_LABELS for the connected/disconnected
// banner labels and the read-only chip, and PROVIDER_PROJECT_LABELS for the
// project field's label + placeholder. Mock with a small fixture so the
// test owns the truth.
vi.mock('../../../utils/provider-regions', () => ({
  PROVIDER_REGIONS: {
    gcp: ['us-central1', 'us-east1'],
    aws: ['us-east-1', 'eu-west-1'],
  },
  PROVIDER_LABELS: {
    gcp: 'Google Cloud',
    aws: 'Amazon Web Services',
  },
  PROVIDER_PROJECT_LABELS: {
    gcp: { label: 'Project ID', placeholder: 'my-gcp-project' },
    aws: { label: 'Account', placeholder: '123456789012' },
  },
}));

import { ConfigSection } from '../config-section';

// ─── Tree-walker (rf-pdpl-7..12 style) ──────────────────────────────────────

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

type SectionProps = {
  provider: string;
  gcpProject: string;
  region: string;
  environment: string;
  disabled: boolean;
  authError?: boolean;
  projectId?: string;
  onProviderChange: (v: string) => void;
  onProjectChange: (v: string) => void;
  onRegionChange: (v: string) => void;
  onEnvironmentChange: (v: string) => void;
};

const renderSection = (props: SectionProps): React.ReactElement => {
  (mocks as unknown as { __resetUseState: () => void }).__resetUseState();
  // Wipe the IceSelect call recorder before each render so every test sees a
  // clean slate.
  mocks.iceSelectCalls.length = 0;
  return (ConfigSection as unknown as (p: SectionProps) => React.ReactElement)(props);
};

// Walk the tree once to invoke nested FCs (the mocked IceSelect at the
// project + region call sites) and snapshot their captured props in a
// stable-order list. The walker invokes the IceSelect mock as a side-
// effect and pushes to `mocks.iceSelectCalls`. We CLEAR before walking and
// SNAPSHOT after so subsequent `findByPredicate` / `collectText` calls
// (which re-walk and re-invoke FCs) do not pollute the snapshot.
const drainIceSelectCalls = (tree: React.ReactNode): unknown[] => {
  mocks.iceSelectCalls.length = 0;

  for (const _el of walk(tree)) {
    // pass — walking is the side-effect.
  }
  const snapshot = [...mocks.iceSelectCalls];
  // Re-clear so subsequent walks don't append onto our snapshot's source.
  mocks.iceSelectCalls.length = 0;
  return snapshot;
};

const makeProps = (overrides: Partial<SectionProps> = {}): SectionProps => ({
  provider: 'gcp',
  gcpProject: '',
  region: 'us-central1',
  environment: 'production',
  disabled: false,
  projectId: undefined,
  onProviderChange: vi.fn(),
  onProjectChange: vi.fn(),
  onRegionChange: vi.fn(),
  onEnvironmentChange: vi.fn(),
  ...overrides,
});

// ─── Reset mocks ────────────────────────────────────────────────────────────

beforeEach(() => {
  mocks.providerConnectedRef.current = false;
  mocks.connectedProjectsRef.current = [];
  mocks.authTypeRef.current = null;
  mocks.providerConnectedSetterSpy.mockReset();
  mocks.connectedProjectsSetterSpy.mockReset();
  mocks.authTypeSetterSpy.mockReset();

  mocks.effectCallbacks.length = 0;
  mocks.effectCleanups.length = 0;
  mocks.effectDeps.length = 0;

  mocks.tSpy.mockReset();
  mocks.tSpy.mockImplementation((key: string, _vars?: unknown) => `[t:${key}]`);

  mocks.isConnectedSpy.mockReset();
  mocks.isConnectedSpy.mockResolvedValue(false);
  mocks.getProjectsSpy.mockReset();
  mocks.getProjectsSpy.mockResolvedValue([]);
  mocks.getCredentialsSpy.mockReset();
  mocks.getCredentialsSpy.mockResolvedValue(null);

  mocks.iceSelectCalls.length = 0;
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('ConfigSection — useEffect: fetch on mount', () => {
  it('calls isConnected with the provider on mount and registers the effect with [provider] deps', async () => {
    mocks.isConnectedSpy.mockResolvedValueOnce(false);
    renderSection(makeProps({ provider: 'gcp' }));

    // useEffect was registered exactly once with [provider] in the deps list.
    expect(mocks.effectDeps.length).toBe(1);
    expect(mocks.effectDeps[0]).toEqual(['gcp']);

    // Allow the IIFE inside the effect to settle.
    await new Promise((r) => setTimeout(r, 0));
    expect(mocks.isConnectedSpy).toHaveBeenCalledTimes(1);
    expect(mocks.isConnectedSpy).toHaveBeenCalledWith('gcp');
  });

  it('isConnected=true → setProviderConnected(true), then getProjects + getCredentials', async () => {
    mocks.isConnectedSpy.mockResolvedValueOnce(true);
    mocks.getProjectsSpy.mockResolvedValueOnce([{ id: 'proj-a', name: 'Project A' }]);
    mocks.getCredentialsSpy.mockResolvedValueOnce({ auth_type: 'oauth' });
    renderSection(makeProps({ provider: 'gcp' }));

    // Two ticks: first await for isConnected, second for the chained
    // getProjects + getCredentials.
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    expect(mocks.providerConnectedSetterSpy).toHaveBeenCalledWith(true);
    expect(mocks.getProjectsSpy).toHaveBeenCalledWith('gcp');
    expect(mocks.connectedProjectsSetterSpy).toHaveBeenCalledWith([{ id: 'proj-a', name: 'Project A' }]);
    expect(mocks.getCredentialsSpy).toHaveBeenCalledWith('gcp');
    expect(mocks.authTypeSetterSpy).toHaveBeenCalledWith('oauth');
  });

  it('isConnected=true and getProjects returns null → connectedProjects defaults to []', async () => {
    mocks.isConnectedSpy.mockResolvedValueOnce(true);
    // The source code does `setConnectedProjects(projects || [])`, so a
    // null/undefined response from getProjects must coalesce to [].
    mocks.getProjectsSpy.mockResolvedValueOnce(null as unknown as Array<{ id: string; name: string }>);
    mocks.getCredentialsSpy.mockResolvedValueOnce({ auth_type: 'service_account' });
    renderSection(makeProps({ provider: 'gcp' }));

    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    expect(mocks.connectedProjectsSetterSpy).toHaveBeenCalledWith([]);
  });

  it('isConnected=true and getCredentials returns null → authType set to null', async () => {
    mocks.isConnectedSpy.mockResolvedValueOnce(true);
    mocks.getProjectsSpy.mockResolvedValueOnce([]);
    mocks.getCredentialsSpy.mockResolvedValueOnce(null);
    renderSection(makeProps({ provider: 'gcp' }));

    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    // The source: `setAuthType(creds?.auth_type || null)` → optional
    // chain on null returns undefined, then `|| null` falls through to null.
    expect(mocks.authTypeSetterSpy).toHaveBeenCalledWith(null);
  });

  it('isConnected=false → setProviderConnected(false), connectedProjects=[], authType=null; no getProjects/getCredentials calls', async () => {
    mocks.isConnectedSpy.mockResolvedValueOnce(false);
    renderSection(makeProps({ provider: 'gcp' }));

    await new Promise((r) => setTimeout(r, 0));

    expect(mocks.providerConnectedSetterSpy).toHaveBeenCalledWith(false);
    expect(mocks.connectedProjectsSetterSpy).toHaveBeenCalledWith([]);
    expect(mocks.authTypeSetterSpy).toHaveBeenCalledWith(null);
    expect(mocks.getProjectsSpy).not.toHaveBeenCalled();
    expect(mocks.getCredentialsSpy).not.toHaveBeenCalled();
  });

  it('isConnected throws → catch block sets providerConnected=false + connectedProjects=[]', async () => {
    mocks.isConnectedSpy.mockRejectedValueOnce(new Error('network down'));
    renderSection(makeProps({ provider: 'gcp' }));

    await new Promise((r) => setTimeout(r, 0));

    expect(mocks.providerConnectedSetterSpy).toHaveBeenCalledWith(false);
    expect(mocks.connectedProjectsSetterSpy).toHaveBeenCalledWith([]);
    // authType is NOT touched in the catch block (load-bearing source detail).
    expect(mocks.authTypeSetterSpy).not.toHaveBeenCalled();
    // No getProjects or getCredentials calls when isConnected throws.
    expect(mocks.getProjectsSpy).not.toHaveBeenCalled();
    expect(mocks.getCredentialsSpy).not.toHaveBeenCalled();
  });

  it('useEffect re-fires when provider prop changes', async () => {
    // First render with provider='gcp'.
    renderSection(makeProps({ provider: 'gcp' }));
    expect(mocks.effectDeps.length).toBe(1);
    expect(mocks.effectDeps[0]).toEqual(['gcp']);

    // Second render with provider='aws' — same effect callback, new deps.
    renderSection(makeProps({ provider: 'aws' }));
    expect(mocks.effectDeps.length).toBe(2);
    expect(mocks.effectDeps[1]).toEqual(['aws']);

    await new Promise((r) => setTimeout(r, 0));

    // The second invocation should have called isConnected with 'aws'.
    expect(mocks.isConnectedSpy.mock.calls).toEqual([['gcp'], ['aws']]);
  });
});

describe('ConfigSection — connection-status banner', () => {
  it('providerConnected=true + authType=null → renders CheckCircle, connected text without auth-type suffix', () => {
    mocks.providerConnectedRef.current = true;
    mocks.authTypeRef.current = null;
    const tree = renderSection(makeProps({ provider: 'gcp' }));

    // Reference equality on the icon: CheckCircle is rendered exactly once.
    const checkIcons = findByPredicate(tree, (el) => {
      // Reference-equality check via lucide-react (cite
      // `lucide-react-aliased-icons-displayname-tracks-target-not-binding`).
      return el.type !== null && typeof el.type === 'object';
    });
    // Easier: look up via class name.
    const emerald = findByPredicate(
      tree,
      (el) =>
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('text-emerald-500'),
    );
    expect(emerald.length).toBe(1); // The CheckCircle icon.
    expect(checkIcons.length).toBeGreaterThanOrEqual(1);

    const text = collectText(tree);
    expect(mocks.tSpy).toHaveBeenCalledWith('deploy.status.connected', { provider: 'Google Cloud' });
    // The translation stub returns `[t:KEY]`, so the connected line includes
    // `[t:deploy.status.connected]` and NO ' via Google OAuth' / ' via
    // Service Account' suffix when authType is null.
    expect(text).toContain('[t:deploy.status.connected]');
    expect(text).not.toContain(' via Google OAuth');
    expect(text).not.toContain(' via Service Account');
    // The not-connected branch should NOT render — assert no AlertCircle
    // amber pill is present.
    const amber = findByPredicate(
      tree,
      (el) =>
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('text-amber-500'),
    );
    expect(amber.length).toBe(0);
  });

  it("authType='oauth' → connected text includes ' via Google OAuth' suffix", () => {
    mocks.providerConnectedRef.current = true;
    mocks.authTypeRef.current = 'oauth';
    const tree = renderSection(makeProps({ provider: 'gcp' }));
    const text = collectText(tree);
    expect(text).toContain(' via Google OAuth');
    expect(text).not.toContain(' via Service Account');
  });

  it("authType='service_account' → connected text includes ' via Service Account' suffix", () => {
    mocks.providerConnectedRef.current = true;
    mocks.authTypeRef.current = 'service_account';
    const tree = renderSection(makeProps({ provider: 'gcp' }));
    const text = collectText(tree);
    expect(text).toContain(' via Service Account');
    expect(text).not.toContain(' via Google OAuth');
  });

  it('authType is some other unknown string → no suffix appended', () => {
    mocks.providerConnectedRef.current = true;
    mocks.authTypeRef.current = 'mystery-auth';
    const tree = renderSection(makeProps({ provider: 'gcp' }));
    const text = collectText(tree);
    expect(text).not.toContain(' via Google OAuth');
    expect(text).not.toContain(' via Service Account');
  });

  // DE7 — an active reauth/RAPT failure suppresses the green pill even though
  // the cached connection still reads as "connected".
  it('authError=true suppresses the green pill and shows the reconnect warning', () => {
    mocks.providerConnectedRef.current = true;
    mocks.authTypeRef.current = 'oauth';
    const tree = renderSection(makeProps({ provider: 'gcp', authError: true }));

    // No green connected pill…
    const emerald = findByPredicate(
      tree,
      (el) =>
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('text-emerald-500'),
    );
    expect(emerald.length).toBe(0);
    // …an amber warning instead, with the reauth-needed copy.
    const amber = findByPredicate(
      tree,
      (el) =>
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('text-amber-500'),
    );
    expect(amber.length).toBe(1);
    expect(mocks.tSpy).toHaveBeenCalledWith('deploy.status.reauthNeeded', { provider: 'Google Cloud' });
    expect(mocks.tSpy).not.toHaveBeenCalledWith('deploy.status.connected', { provider: 'Google Cloud' });
  });

  it('providerConnected=false → renders AlertCircle, not-connected text; no green banner', () => {
    mocks.providerConnectedRef.current = false;
    mocks.authTypeRef.current = null;
    const tree = renderSection(makeProps({ provider: 'gcp' }));

    const amber = findByPredicate(
      tree,
      (el) =>
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('text-amber-500'),
    );
    expect(amber.length).toBe(1); // AlertCircle.

    const emerald = findByPredicate(
      tree,
      (el) =>
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('text-emerald-500'),
    );
    expect(emerald.length).toBe(0);

    expect(mocks.tSpy).toHaveBeenCalledWith('deploy.status.notConnected', { provider: 'Google Cloud' });
  });

  it('unknown provider falls back to bare provider string in the banner label', () => {
    mocks.providerConnectedRef.current = true;
    renderSection(makeProps({ provider: 'mystery-cloud' }));
    // PROVIDER_LABELS['mystery-cloud'] is undefined → fall through to the
    // bare provider id.
    expect(mocks.tSpy).toHaveBeenCalledWith('deploy.status.connected', { provider: 'mystery-cloud' });
  });
});

describe('ConfigSection — provider read-only chip', () => {
  it('provider known to PROVIDER_LABELS → chip shows the label', () => {
    const tree = renderSection(makeProps({ provider: 'gcp' }));
    const text = collectText(tree);
    expect(text).toContain('Google Cloud');
  });

  it('provider unknown to PROVIDER_LABELS but truthy → chip shows the bare id', () => {
    const tree = renderSection(makeProps({ provider: 'mystery-cloud' }));
    const text = collectText(tree);
    // The PROVIDER_LABELS mock has no `mystery-cloud` key → falls through to
    // the bare provider id.
    expect(text).toContain('mystery-cloud');
  });

  it("provider is empty string → chip shows the literal 'Not set'", () => {
    const tree = renderSection(makeProps({ provider: '' }));
    const text = collectText(tree);
    expect(text).toContain('Not set');
  });
});

describe('ConfigSection — Project field branching', () => {
  it('connectedProjects empty → text input fallback with id="ice-deploy-input-project"', () => {
    mocks.connectedProjectsRef.current = [];
    const tree = renderSection(makeProps({ provider: 'gcp', gcpProject: 'my-project' }));

    // Drain IceSelect calls FIRST so `findByPredicate` (which re-walks) does
    // not pollute the count assertion below.
    const iceSelectCalls = drainIceSelectCalls(tree);
    const inputs = findByPredicate(
      tree,
      (el) => el.type === 'input' && (el.props as { id?: string }).id === 'ice-deploy-input-project',
    );
    expect(inputs.length).toBe(1);
    expect((inputs[0]!.props as { value?: string }).value).toBe('my-project');
    expect((inputs[0]!.props as { type?: string }).type).toBe('text');
    expect((inputs[0]!.props as { placeholder?: string }).placeholder).toBe('my-gcp-project');
    // No IceSelect for the project field — only one IceSelect is rendered
    // (the region one).
    expect(iceSelectCalls.length).toBe(1);
  });

  it('text input onChange forwards value to onProjectChange', () => {
    mocks.connectedProjectsRef.current = [];
    const onProjectChange = vi.fn();
    const tree = renderSection(makeProps({ onProjectChange }));
    const input = findByPredicate(
      tree,
      (el) => el.type === 'input' && (el.props as { id?: string }).id === 'ice-deploy-input-project',
    )[0]!;
    const onChange = (input.props as { onChange?: (e: { target: { value: string } }) => void }).onChange!;
    onChange({ target: { value: 'new-project-name' } });
    expect(onProjectChange).toHaveBeenCalledWith('new-project-name');
  });

  it('connectedProjects non-empty → IceSelect with options mapped from id/name', () => {
    mocks.connectedProjectsRef.current = [
      { id: 'proj-1', name: 'Production' },
      { id: 'proj-2', name: 'Staging' },
    ];
    const tree = renderSection(makeProps({ provider: 'gcp', gcpProject: 'proj-1' }));

    // Two IceSelect calls — project + region. The first push is the project
    // call (declaration order in the JSX).
    const calls = drainIceSelectCalls(tree);
    expect(calls.length).toBe(2);
    const projectCall = calls[0] as {
      value: string;
      onChange: (v: string) => void;
      options: Array<{ value: string; label: string }>;
      disabled: boolean;
    };
    expect(projectCall.value).toBe('proj-1');
    expect(projectCall.disabled).toBe(false);
    expect(projectCall.options).toEqual([
      { value: 'proj-1', label: 'Production' },
      { value: 'proj-2', label: 'Staging' },
    ]);
  });

  it('IceSelect options use `name || id` fallback when name is empty/missing', () => {
    mocks.connectedProjectsRef.current = [
      { id: 'proj-with-name', name: 'Production' },
      { id: 'proj-no-name', name: '' as unknown as string },
    ];
    const tree = renderSection(makeProps({ provider: 'gcp' }));
    const calls = drainIceSelectCalls(tree);
    const projectCall = calls[0] as {
      options: Array<{ value: string; label: string }>;
    };
    expect(projectCall.options).toEqual([
      { value: 'proj-with-name', label: 'Production' },
      // name === '' → falsy → fall through to id.
      { value: 'proj-no-name', label: 'proj-no-name' },
    ]);
  });

  it('IceSelect onChange forwards directly to onProjectChange (no wrapping)', () => {
    mocks.connectedProjectsRef.current = [{ id: 'proj-1', name: 'Production' }];
    const onProjectChange = vi.fn();
    const tree = renderSection(makeProps({ onProjectChange }));
    const calls = drainIceSelectCalls(tree);
    const projectCall = calls[0] as { onChange: (v: string) => void };
    projectCall.onChange('proj-2');
    expect(onProjectChange).toHaveBeenCalledWith('proj-2');
  });

  it('disabled prop propagates to text input fallback', () => {
    mocks.connectedProjectsRef.current = [];
    const tree = renderSection(makeProps({ disabled: true }));
    const input = findByPredicate(
      tree,
      (el) => el.type === 'input' && (el.props as { id?: string }).id === 'ice-deploy-input-project',
    )[0]!;
    expect((input.props as { disabled?: boolean }).disabled).toBe(true);
  });

  it('disabled prop propagates to project IceSelect', () => {
    mocks.connectedProjectsRef.current = [{ id: 'proj-1', name: 'Production' }];
    const tree = renderSection(makeProps({ disabled: true }));
    const calls = drainIceSelectCalls(tree);
    const projectCall = calls[0] as { disabled: boolean };
    expect(projectCall.disabled).toBe(true);
  });
});

describe('ConfigSection — Region field', () => {
  it('region IceSelect always renders with options from PROVIDER_REGIONS[provider]', () => {
    const tree = renderSection(makeProps({ provider: 'gcp', region: 'us-central1' }));

    // Only one IceSelect — the region one (connectedProjects is empty).
    const calls = drainIceSelectCalls(tree);
    expect(calls.length).toBe(1);
    const regionCall = calls[0] as {
      value: string;
      options: string[];
      allowEmpty: boolean;
    };
    expect(regionCall.value).toBe('us-central1');
    expect(regionCall.options).toEqual(['us-central1', 'us-east1']);
    expect(regionCall.allowEmpty).toBe(false);
  });

  it('region IceSelect uses PROVIDER_REGIONS[aws] for aws provider', () => {
    const tree = renderSection(makeProps({ provider: 'aws', region: 'eu-west-1' }));
    const calls = drainIceSelectCalls(tree);
    const regionCall = calls[0] as { options: string[] };
    expect(regionCall.options).toEqual(['us-east-1', 'eu-west-1']);
  });

  it('unknown provider → falls back to PROVIDER_REGIONS.gcp', () => {
    const tree = renderSection(makeProps({ provider: 'mystery-cloud', region: 'us-central1' }));
    const calls = drainIceSelectCalls(tree);
    const regionCall = calls[0] as { options: string[] };
    // PROVIDER_REGIONS['mystery-cloud'] is undefined → falls through to
    // PROVIDER_REGIONS.gcp.
    expect(regionCall.options).toEqual(['us-central1', 'us-east1']);
  });

  it('region IceSelect onChange forwards directly to onRegionChange', () => {
    const onRegionChange = vi.fn();
    const tree = renderSection(makeProps({ onRegionChange }));
    const calls = drainIceSelectCalls(tree);
    const regionCall = calls[0] as { onChange: (v: string) => void };
    regionCall.onChange('us-east1');
    expect(onRegionChange).toHaveBeenCalledWith('us-east1');
  });

  it('disabled prop propagates to region IceSelect', () => {
    const tree = renderSection(makeProps({ disabled: true }));
    const calls = drainIceSelectCalls(tree);
    const regionCall = calls[0] as { disabled: boolean };
    expect(regionCall.disabled).toBe(true);
  });
});

describe('ConfigSection — labels via translation + project meta', () => {
  it('translation keys used for the three column labels', () => {
    renderSection(makeProps({ provider: 'gcp' }));
    expect(mocks.tSpy).toHaveBeenCalledWith('deploy.config.providerLabel');
    expect(mocks.tSpy).toHaveBeenCalledWith('deploy.config.regionLabel');
    // The project label comes from PROVIDER_PROJECT_LABELS[provider].label
    // (NOT from i18n), so it is rendered as the literal 'Project ID'.
  });

  it('PROVIDER_PROJECT_LABELS[gcp].label is rendered as the project label', () => {
    const tree = renderSection(makeProps({ provider: 'gcp' }));
    const text = collectText(tree);
    expect(text).toContain('Project ID');
  });

  it('project field placeholder comes from PROVIDER_PROJECT_LABELS[provider].placeholder when text input is shown', () => {
    mocks.connectedProjectsRef.current = [];
    const tree = renderSection(makeProps({ provider: 'aws' }));
    const input = findByPredicate(
      tree,
      (el) => el.type === 'input' && (el.props as { id?: string }).id === 'ice-deploy-input-project',
    )[0]!;
    expect((input.props as { placeholder?: string }).placeholder).toBe('123456789012');
  });

  it('selectProject placeholder used when IceSelect is shown', () => {
    mocks.connectedProjectsRef.current = [{ id: 'p1', name: 'P1' }];
    const tree = renderSection(makeProps({ provider: 'gcp' }));
    const calls = drainIceSelectCalls(tree);
    const projectCall = calls[0] as { placeholder?: string };
    expect(projectCall.placeholder).toBe('[t:deploy.config.selectProject]');
  });

  it("unknown provider's project meta falls back to PROVIDER_PROJECT_LABELS.gcp", () => {
    mocks.connectedProjectsRef.current = [];
    const tree = renderSection(makeProps({ provider: 'mystery-cloud' }));
    const text = collectText(tree);
    // gcp's label is 'Project ID' / placeholder is 'my-gcp-project'.
    expect(text).toContain('Project ID');
    const input = findByPredicate(
      tree,
      (el) => el.type === 'input' && (el.props as { id?: string }).id === 'ice-deploy-input-project',
    )[0]!;
    expect((input.props as { placeholder?: string }).placeholder).toBe('my-gcp-project');
  });
});
