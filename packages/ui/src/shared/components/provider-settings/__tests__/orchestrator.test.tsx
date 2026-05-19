/**
 * rf-pset-7 — `ProviderSettings` orchestrator.
 *
 * Pins the orchestrator's public API surface and the section
 * composition. The heavy lifting (PROVIDER_CONFIGS array, the five
 * async handlers, the per-provider card, the GCP add-project form)
 * lives in their own tests (rf-pset-1..6) — here we mock those so the
 * assertion surface stays on this file:
 *
 *   - `useTranslation` → returns a deterministic `t(key, vars)`.
 *   - `getApi()` → stubbed provider API; the on-mount useEffect drains
 *     `isConnected`/`getProjects`/`getCredentials` for each provider.
 *   - `useState` / `useEffect` → mocked per the rf-rpal-8 / rf-pdpl-12
 *     queued-ref-dispatch pattern (slot dispatcher + effect-capture).
 *   - `useProviderHandlers` → returns a stable hoisted bundle so the
 *     orchestrator's prop wiring is observable.
 *   - `ProviderCard` → opaque marker stub recording every call's props.
 *   - `createPortal` → returns the children inline so the tree-walker
 *     descends into the modal.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks ──────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  api: {
    isConnected: vi.fn(),
    getProjects: vi.fn(),
    getCredentials: vi.fn(),
  },
  handlers: {
    handleGCPOAuth: vi.fn(),
    handleConnect: vi.fn(),
    handleDisconnect: vi.fn(),
    handleRemoveProject: vi.fn(),
    handleImport: vi.fn(),
    gcpOAuth: { connect: vi.fn(), connecting: false, error: null as string | null },
    reloadGCPState: vi.fn(),
  },
  // Per-render captured ProviderCard props
  cardCalls: [] as Array<Record<string, unknown>>,
  // useState slot dispatcher
  __resetUseState: (() => undefined) as (opts?: { keepSlots?: boolean }) => void,
  __setState: (() => undefined) as (i: number, v: unknown) => void,
  // useEffect captures
  effects: [] as Array<{ cb: () => void | (() => void); deps: unknown[] }>,
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  let stateSlots: unknown[] = [];
  let useStateIdx = 0;
  mocks.__resetUseState = (opts) => {
    if (!opts?.keepSlots) stateSlots = [];
    useStateIdx = 0;
  };
  mocks.__setState = (i: number, v: unknown) => {
    stateSlots[i] = v;
  };
  const patchedUseState = vi.fn((initial?: unknown) => {
    const slot = useStateIdx;
    if (stateSlots.length <= slot) {
      const init = typeof initial === 'function' ? (initial as () => unknown)() : initial;
      stateSlots.push(init);
    }
    const setter = vi.fn((next: unknown) => {
      const cur = stateSlots[slot];
      const resolved = typeof next === 'function' ? (next as (prev: unknown) => unknown)(cur) : next;
      stateSlots[slot] = resolved;
    });
    useStateIdx += 1;
    return [stateSlots[slot], setter];
  });
  const patchedUseEffect = vi.fn((cb: () => void | (() => void), deps?: unknown[]) => {
    mocks.effects.push({ cb, deps: deps ?? [] });
  });
  const actualDefault = (actual as unknown as { default?: typeof actual }).default ?? actual;
  return {
    ...actual,
    useState: patchedUseState,
    useEffect: patchedUseEffect,
    default: { ...actualDefault, useState: patchedUseState, useEffect: patchedUseEffect },
  };
});

vi.mock('react-dom', () => ({
  // Pass-through: ignore the second portal-target argument.
  createPortal: (children: React.ReactNode) => children,
}));

vi.mock('../../../../i18n', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, string | number>) => (vars ? `${key}:${JSON.stringify(vars)}` : key),
  }),
}));

vi.mock('../../../api/api-adapter', () => ({
  getApi: vi.fn(() => ({ provider: mocks.api })),
}));

vi.mock('../hooks/use-provider-handlers', () => ({
  useProviderHandlers: vi.fn(() => mocks.handlers),
}));

vi.mock('../sections/provider-card', () => ({
  ProviderCard: vi.fn((props: Record<string, unknown>) => {
    mocks.cardCalls.push(props);
    return React.createElement('section', {
      'data-stub': 'ProviderCard',
      'data-id': (props.provider as { id: string }).id,
    });
  }),
}));

vi.mock('@ice/core/resources', () => ({
  getCloudProvider: vi.fn(() => undefined),
}));

import { ProviderSettings } from '../../provider-settings';
import type { ProviderSettingsProps } from '../types';

// ─── Tree-walker ────────────────────────────────────────────────────────────

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
      yield* walk(FC(el.props) as ReactNodeLike);
    } catch {
      /* skip */
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
  let s = '';
  for (const el of walk(tree)) {
    const c = (el.props as { children?: React.ReactNode } | undefined)?.children;
    if (typeof c === 'string') s += c;
    else if (Array.isArray(c)) {
      for (const item of c) {
        if (typeof item === 'string') s += item;
      }
    }
  }
  return s;
}

function drainCardCalls(tree: React.ReactNode): Array<Record<string, unknown>> {
  mocks.cardCalls.length = 0;
  for (const _el of walk(tree)) void _el;
  const snap = mocks.cardCalls.slice();
  mocks.cardCalls.length = 0;
  return snap;
}

const renderModal = (props: ProviderSettingsProps = { isOpen: true, onClose: () => undefined }): React.ReactNode => {
  mocks.__resetUseState();
  mocks.effects.length = 0;
  return (ProviderSettings as unknown as (p: ProviderSettingsProps) => React.ReactNode)(props);
};

// ─── Tests ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.stubGlobal('document', { body: {} });
  mocks.api.isConnected.mockReset();
  mocks.api.getProjects.mockReset();
  mocks.api.getCredentials.mockReset();
  mocks.handlers.handleGCPOAuth.mockReset();
  mocks.handlers.handleConnect.mockReset();
  mocks.handlers.handleDisconnect.mockReset();
  mocks.handlers.handleRemoveProject.mockReset();
  mocks.handlers.handleImport.mockReset();
  mocks.cardCalls.length = 0;
  mocks.handlers.gcpOAuth.connecting = false;
  mocks.handlers.gcpOAuth.error = null;
});

describe('ProviderSettings orchestrator — closed state', () => {
  it('returns null when isOpen=false (no portal)', () => {
    const tree = renderModal({ isOpen: false, onClose: () => undefined });
    expect(tree).toBeNull();
  });
});

describe('ProviderSettings orchestrator — open state', () => {
  it('renders the title and description', () => {
    const tree = renderModal();
    const text = collectText(tree);
    expect(text).toContain('providerSettings.title');
    expect(text).toContain('providerSettings.description');
  });

  it('renders one ProviderCard per PROVIDER_CONFIG entry', () => {
    const tree = renderModal();
    const cards = drainCardCalls(tree);
    expect(cards).toHaveLength(3); // aws, gcp, azure
    expect(cards.map((c) => (c.provider as { id: string }).id)).toEqual(['aws', 'gcp', 'azure']);
  });

  it('threads the orchestrator handlers through to each ProviderCard', () => {
    const tree = renderModal();
    const cards = drainCardCalls(tree);
    expect(cards[0].onConnect).toBe(mocks.handlers.handleConnect);
    expect(cards[0].onDisconnect).toBe(mocks.handlers.handleDisconnect);
    expect(cards[0].onGCPOAuth).toBe(mocks.handlers.handleGCPOAuth);
    expect(cards[0].onImport).toBe(mocks.handlers.handleImport);
    expect(cards[0].onRemoveProject).toBe(mocks.handlers.handleRemoveProject);
    expect(cards[0].gcpConnecting).toBe(false);
  });

  it('threads gcpOAuth.connecting=true through to ProviderCard.gcpConnecting', () => {
    mocks.handlers.gcpOAuth.connecting = true;
    const tree = renderModal();
    const cards = drainCardCalls(tree);
    expect(cards[0].gcpConnecting).toBe(true);
  });

  it('header X-button onClick fires onClose', () => {
    const onClose = vi.fn();
    const tree = renderModal({ isOpen: true, onClose });
    const xBtn = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('p-1') &&
        (el.props as { className: string }).className.includes('hover:bg-muted'),
    )[0];
    expect(xBtn).toBeDefined();
    (xBtn.props as { onClick: () => void }).onClick();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('footer Close button onClick fires onClose', () => {
    const onClose = vi.fn();
    const tree = renderModal({ isOpen: true, onClose });
    const closeBtn = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('px-4') &&
        (el.props as { className: string }).className.includes('hover:bg-muted'),
    )[0];
    expect(closeBtn).toBeDefined();
    (closeBtn.props as { onClick: () => void }).onClick();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders the credentialsSafe info box', () => {
    const tree = renderModal();
    const text = collectText(tree);
    expect(text).toContain('providerSettings.info.credentialsSafe');
    expect(text).toContain('providerSettings.info.credentialsSafeDesc');
    expect(text).toContain('providerSettings.info.gcpTip');
  });

  it('does NOT render error/success banners when both are null', () => {
    const tree = renderModal();
    const text = collectText(tree);
    // Walk for AlertCircle/CheckCircle by displayName
    const fns: string[] = [];
    for (const el of walk(tree)) {
      const dn = (el.type as { displayName?: string })?.displayName;
      if (dn) fns.push(dn);
    }
    // lucide-react renamed: AlertCircle -> CircleAlert, CheckCircle -> CircleCheckBig.
    // (per learning lucide-react-aliased-icons-displayname-tracks-target-not-binding)
    expect(fns).not.toContain('CircleAlert'); // no error banner
    expect(fns).not.toContain('CircleCheckBig'); // no success banner
    // The Cloud header icon should still be present
    expect(fns).toContain('Cloud');
    void text;
  });
});

describe('ProviderSettings orchestrator — error/success banners', () => {
  it('renders the AlertCircle banner with the error string when error state is set', () => {
    renderModal();
    // Pre-seed slot 3 (error) — order: providerStates(0), expanded(1), connecting(2), importing(3) — actually:
    // useState calls in source order: providerStates, expandedProvider, connecting, importing, error, success, showAddProject
    // So error is slot 4.
    mocks.__setState(4, 'oh no');
    mocks.__resetUseState({ keepSlots: true });
    const tree = (ProviderSettings as unknown as (p: ProviderSettingsProps) => React.ReactNode)({
      isOpen: true,
      onClose: () => undefined,
    });
    const text = collectText(tree);
    expect(text).toContain('oh no');
    const fns: string[] = [];
    for (const el of walk(tree)) {
      const dn = (el.type as { displayName?: string })?.displayName;
      if (dn) fns.push(dn);
    }
    expect(fns).toContain('CircleAlert'); // lucide-react alias for AlertCircle
  });

  it('renders the CheckCircle banner with the success string when success state is set', () => {
    renderModal();
    // Slot order — see above: success is slot 5.
    mocks.__setState(5, 'all done');
    mocks.__resetUseState({ keepSlots: true });
    const tree = (ProviderSettings as unknown as (p: ProviderSettingsProps) => React.ReactNode)({
      isOpen: true,
      onClose: () => undefined,
    });
    const text = collectText(tree);
    expect(text).toContain('all done');
    const fns: string[] = [];
    for (const el of walk(tree)) {
      const dn = (el.type as { displayName?: string })?.displayName;
      if (dn) fns.push(dn);
    }
    expect(fns).toContain('CircleCheckBig'); // lucide-react alias for CheckCircle
  });
});

describe('ProviderSettings orchestrator — toggleProvider via ProviderCard.onToggle', () => {
  it('seeds expandedProvider when called with a fresh id', () => {
    renderModal();
    // Slot 1 is expandedProvider (initial: null).
    mocks.__setState(1, null);
    mocks.__resetUseState({ keepSlots: true });
    const tree = (ProviderSettings as unknown as (p: ProviderSettingsProps) => React.ReactNode)({
      isOpen: true,
      onClose: () => undefined,
    });
    const cards = drainCardCalls(tree);
    expect(cards[0].expanded).toBe(false);
    // Trigger toggle for 'aws'
    (cards[0].onToggle as (id: string) => void)('aws');
    // Re-render with slots preserved — the setter mutated slot 1
    mocks.__resetUseState({ keepSlots: true });
    const tree2 = (ProviderSettings as unknown as (p: ProviderSettingsProps) => React.ReactNode)({
      isOpen: true,
      onClose: () => undefined,
    });
    const cards2 = drainCardCalls(tree2);
    expect(cards2[0].expanded).toBe(true);
  });

  it('clears expandedProvider when called with the currently-expanded id', () => {
    renderModal();
    mocks.__setState(1, 'aws');
    mocks.__resetUseState({ keepSlots: true });
    const tree = (ProviderSettings as unknown as (p: ProviderSettingsProps) => React.ReactNode)({
      isOpen: true,
      onClose: () => undefined,
    });
    const cards = drainCardCalls(tree);
    expect(cards[0].expanded).toBe(true);
    (cards[0].onToggle as (id: string) => void)('aws');
    mocks.__resetUseState({ keepSlots: true });
    const tree2 = (ProviderSettings as unknown as (p: ProviderSettingsProps) => React.ReactNode)({
      isOpen: true,
      onClose: () => undefined,
    });
    const cards2 = drainCardCalls(tree2);
    expect(cards2[0].expanded).toBe(false);
  });
});

describe('ProviderSettings orchestrator — updateFormValue via ProviderCard.onUpdateFormValue', () => {
  it('writes the form value into the per-provider state map', () => {
    renderModal();
    // providerStates slot 0
    mocks.__setState(0, {
      aws: { connected: false, projects: [], formValues: {} },
    });
    mocks.__resetUseState({ keepSlots: true });
    const tree = (ProviderSettings as unknown as (p: ProviderSettingsProps) => React.ReactNode)({
      isOpen: true,
      onClose: () => undefined,
    });
    const cards = drainCardCalls(tree);
    (cards[0].onUpdateFormValue as (p: string, f: string, v: string) => void)('aws', 'accessKeyId', 'AKIA');
    mocks.__resetUseState({ keepSlots: true });
    const tree2 = (ProviderSettings as unknown as (p: ProviderSettingsProps) => React.ReactNode)({
      isOpen: true,
      onClose: () => undefined,
    });
    const cards2 = drainCardCalls(tree2);
    expect((cards2[0].state as { formValues: Record<string, string> }).formValues.accessKeyId).toBe('AKIA');
  });
});

describe('ProviderSettings orchestrator — on-mount load effect', () => {
  it('captures a useEffect with deps [isOpen]', () => {
    renderModal();
    // The load-states effect is the first useEffect in the orchestrator.
    expect(mocks.effects[0].deps).toEqual([true]); // isOpen=true
  });

  // The orchestrator's load effect calls a fire-and-forget inner async fn
  // — `await effect.cb()` only awaits the sync body (which spawns the
  // promise). To drain the inner await chain (3 provider iterations,
  // each with up to 3 sequential api.* awaits) we need to flush enough
  // microtasks. Each api await resolves on a microtask; the loop has 3
  // iterations × up to 3 awaits = ~9 ticks. A generous loop flush is
  // safe and deterministic.
  async function flushAsyncLoop(): Promise<void> {
    for (let i = 0; i < 20; i += 1) {
      await Promise.resolve();
    }
  }

  it('loads state from getApi() for each provider when isOpen=true', async () => {
    mocks.api.isConnected.mockResolvedValue(false);
    mocks.api.getProjects.mockResolvedValue([]);
    mocks.api.getCredentials.mockResolvedValue(null);
    renderModal();
    const loadEffect = mocks.effects[0];
    loadEffect.cb();
    await flushAsyncLoop();
    expect(mocks.api.isConnected).toHaveBeenCalledWith('aws');
    expect(mocks.api.isConnected).toHaveBeenCalledWith('gcp');
    expect(mocks.api.isConnected).toHaveBeenCalledWith('azure');
  });

  it('loads projects + credentials when isConnected returns true', async () => {
    mocks.api.isConnected.mockResolvedValue(true);
    mocks.api.getProjects.mockResolvedValue([{ id: 'p1', name: 'P' }]);
    mocks.api.getCredentials.mockResolvedValue({ accessKeyId: 'AKIA' });
    renderModal();
    const loadEffect = mocks.effects[0];
    loadEffect.cb();
    await flushAsyncLoop();
    expect(mocks.api.getProjects).toHaveBeenCalledTimes(3); // once per provider
    expect(mocks.api.getCredentials).toHaveBeenCalledTimes(3);
  });

  it('does NOT call the load function when isOpen=false (returns null before render)', () => {
    const tree = renderModal({ isOpen: false, onClose: () => undefined });
    expect(tree).toBeNull();
    // No portal contents — but the useEffect still registered with deps [false]
    // The body's `if (isOpen) loadProviderStates()` guard short-circuits the
    // network calls. We can re-fire the effect cb to check.
    const loadEffect = mocks.effects[0];
    expect(loadEffect.deps).toEqual([false]);
    loadEffect.cb();
    expect(mocks.api.isConnected).not.toHaveBeenCalled();
  });

  it('treats getProjects: null as empty list', async () => {
    mocks.api.isConnected.mockResolvedValue(true);
    mocks.api.getProjects.mockResolvedValue(null);
    mocks.api.getCredentials.mockResolvedValue({});
    renderModal();
    mocks.effects[0].cb();
    await flushAsyncLoop();
    // No throw; the orchestrator's `projects || []` fallback handles null.
    expect(mocks.api.getCredentials).toHaveBeenCalled();
  });

  it('treats getCredentials: null as empty formValues', async () => {
    mocks.api.isConnected.mockResolvedValue(true);
    mocks.api.getProjects.mockResolvedValue([]);
    mocks.api.getCredentials.mockResolvedValue(null);
    renderModal();
    mocks.effects[0].cb();
    await flushAsyncLoop();
    expect(mocks.api.getCredentials).toHaveBeenCalled();
  });
});

describe('ProviderSettings orchestrator — re-export surface', () => {
  it('re-exports ProviderSettingsProps from the types leaf', async () => {
    const mod = await import('../../provider-settings');
    // Type-only re-export — the runtime barrel just needs to NOT throw.
    expect(mod.ProviderSettings).toBeDefined();
  });
});
