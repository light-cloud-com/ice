/**
 * Tests for `DeployDiagnosis` — direct-FC tree-walker.
 *
 * Strategy: state-driven. The component reads `state.deploy.diagnosis`
 * which has 4 statuses: idle, loading, error, loaded. Each renders a
 * different surface. The handleDiagnose callback fires `dispatch(...)`
 * and a `fetch` request — we mock `fetch` and the dynamic store
 * import to drive the success/error/network branches.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  state: {
    deploy: {
      diagnosis: { status: 'idle' as 'idle' | 'loading' | 'error' | 'loaded', result: null, error: null },
      provider: 'gcp',
      region: 'us-central1',
    },
    integrations: {
      integrations: {
        anthropic: { status: 'connected' as 'connected' | 'disconnected' | 'connecting' | 'error' },
      },
    },
  },
  dispatch: vi.fn(),
  startDiagnosis: vi.fn(() => ({ type: 'deploy/startDiagnosis' })),
  setDiagnosis: vi.fn((p: unknown) => ({ type: 'deploy/setDiagnosis', payload: p })),
  diagnosisError: vi.fn((p: unknown) => ({ type: 'deploy/diagnosisError', payload: p })),
  clearDiagnosis: vi.fn(() => ({ type: 'deploy/clearDiagnosis' })),
  getAccessToken: vi.fn(() => 'tok-123'),
  serializeCanvas: vi.fn(() => ({ canvas: 'serialised' })),
  storeGetState: vi.fn(() => ({ x: 1 })),
  fetchSpy: vi.fn(),
}));

vi.mock('react', async (orig) => {
  const actual = (await orig()) as typeof import('react');
  return {
    ...actual,
    useCallback: vi.fn(<T,>(fn: T) => fn),
    // Tree-walker tests invoke the FC directly outside the React fiber
    // runtime, so the real `useState` triggers "Invalid hook call". Stub
    // it as a plain identity-returning pair — the showAnthropicModal
    // state added for BYOK awareness doesn't matter for these tests.
    useState: vi.fn(<T,>(init: T) => [init, vi.fn()] as const),
  };
});

vi.mock('react-redux', () => ({
  useDispatch: () => mocks.dispatch,
  useSelector: (sel: (s: unknown) => unknown) => sel(mocks.state),
}));

vi.mock('../../../../shared/api/axios-instance', () => ({
  getAccessToken: mocks.getAccessToken,
}));

vi.mock('../../../../store/slices/deploy-slice', () => ({
  startDiagnosis: mocks.startDiagnosis,
  setDiagnosis: mocks.setDiagnosis,
  diagnosisError: mocks.diagnosisError,
  clearDiagnosis: mocks.clearDiagnosis,
}));

vi.mock('../../../ai/utils/serialize-canvas', () => ({
  serializeCanvas: mocks.serializeCanvas,
}));

vi.mock('../../../integrations/components/anthropic-connect-modal', () => ({
  AnthropicConnectModal: vi.fn(() => null),
}));

vi.mock('../../../../i18n', () => ({
  useTranslation: () => ({
    // Tree-walker tests assert against literal strings, so resolve i18n
    // keys to the same English copy the bundle ships with.
    t: (k: string) => {
      const map: Record<string, string> = {
        'ai.diagnosis.diagnoseWithAi': 'Diagnose with AI',
        'ai.diagnosis.connectToDiagnose': 'Connect Claude to diagnose',
        'ai.diagnosis.connectToDiagnoseTooltip': 'Add an Anthropic API key to enable AI deploy diagnosis',
      };
      return map[k] ?? k;
    },
  }),
}));

vi.mock('../../../../store', () => ({
  store: { getState: mocks.storeGetState },
}));

vi.stubGlobal('fetch', mocks.fetchSpy);

import { DeployDiagnosis } from '../deploy-diagnosis';

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
  if (typeof node.type === 'function') {
    try {
      const FC = node.type as (p: unknown) => unknown;
      yield* walk(FC(node.props));
    } catch {
      /* opaque */
    }
    return;
  }
  yield* walk(node.props.children);
}

function findAll(tree: unknown, pred: (el: ElLike) => boolean): ElLike[] {
  const out: ElLike[] = [];
  for (const el of walk(tree)) if (pred(el)) out.push(el);
  return out;
}

function findFirst(tree: unknown, pred: (el: ElLike) => boolean): ElLike | undefined {
  for (const el of walk(tree)) if (pred(el)) return el;
  return undefined;
}

function collectText(tree: unknown): string {
  let s = '';
  for (const el of walk(tree)) {
    const c = el.props.children;
    if (typeof c === 'string') s += c;
    else if (typeof c === 'number') s += String(c);
    else if (Array.isArray(c)) {
      for (const item of c) {
        if (typeof item === 'string') s += item;
        else if (typeof item === 'number') s += String(item);
      }
    }
  }
  return s;
}

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

const render = (props: { error: string; results: Array<{ name?: string; type?: string; action?: string; error?: string }> }): React.ReactElement | null =>
  (DeployDiagnosis as unknown as (p: typeof props) => React.ReactElement | null)(props);

beforeEach(() => {
  mocks.state.deploy.diagnosis = { status: 'idle', result: null, error: null };
  mocks.state.deploy.provider = 'gcp';
  mocks.state.deploy.region = 'us-central1';
  mocks.dispatch.mockReset();
  mocks.startDiagnosis.mockClear();
  mocks.setDiagnosis.mockClear();
  mocks.diagnosisError.mockClear();
  mocks.clearDiagnosis.mockClear();
  mocks.getAccessToken.mockReset();
  mocks.getAccessToken.mockReturnValue('tok-123');
  mocks.serializeCanvas.mockReset();
  mocks.serializeCanvas.mockReturnValue({ canvas: 'serialised' });
  mocks.storeGetState.mockReset();
  mocks.storeGetState.mockReturnValue({ x: 1 });
  mocks.fetchSpy.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('DeployDiagnosis — idle status', () => {
  it('renders a "Diagnose with AI" button', () => {
    const tree = render({ error: 'oops', results: [] });
    const text = collectText(tree);
    expect(text).toContain('Diagnose with AI');
  });

  it('the button onClick invokes handleDiagnose, dispatching startDiagnosis', async () => {
    mocks.fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ diagnosis: 'ok', suggestedFixes: ['fix1'] }),
    });
    const tree = render({ error: 'oops', results: [{ name: 'r', type: 't', action: 'a', error: 'e' }] });
    const btn = findFirst(tree, (el) => el.type === 'button')!;
    const onClick = (btn.props as { onClick: () => Promise<void> }).onClick;
    await onClick();
    await flush();
    expect(mocks.startDiagnosis).toHaveBeenCalled();
    expect(mocks.dispatch).toHaveBeenCalledWith({ type: 'deploy/startDiagnosis' });
    expect(mocks.fetchSpy).toHaveBeenCalled();
  });

  it('handleDiagnose dispatches setDiagnosis with payload on 2xx', async () => {
    mocks.fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ diagnosis: 'try X', suggestedFixes: ['f1', 'f2'] }),
    });
    const tree = render({ error: 'e', results: [] });
    const btn = findFirst(tree, (el) => el.type === 'button')!;
    const onClick = (btn.props as { onClick: () => Promise<void> }).onClick;
    await onClick();
    await flush();
    expect(mocks.setDiagnosis).toHaveBeenCalledWith({
      diagnosis: 'try X',
      suggestedFixes: ['f1', 'f2'],
    });
  });

  it('falls back to a default diagnosis string when response.diagnosis is missing', async () => {
    mocks.fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    const tree = render({ error: 'e', results: [] });
    const btn = findFirst(tree, (el) => el.type === 'button')!;
    await ((btn.props as { onClick: () => Promise<void> }).onClick)();
    await flush();
    expect(mocks.setDiagnosis).toHaveBeenCalledWith({
      diagnosis: 'No explanation returned.',
      suggestedFixes: [],
    });
  });

  it('coerces a non-array suggestedFixes to []', async () => {
    mocks.fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ diagnosis: 'd', suggestedFixes: 'not-array' }),
    });
    const tree = render({ error: 'e', results: [] });
    const btn = findFirst(tree, (el) => el.type === 'button')!;
    await ((btn.props as { onClick: () => Promise<void> }).onClick)();
    await flush();
    const arg = mocks.setDiagnosis.mock.calls[0][0] as { suggestedFixes: unknown[] };
    expect(arg.suggestedFixes).toEqual([]);
  });

  it('on non-OK response, dispatches diagnosisError with the parsed message', async () => {
    mocks.fetchSpy.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => JSON.stringify({ message: 'server error' }),
    });
    const tree = render({ error: 'e', results: [] });
    const btn = findFirst(tree, (el) => el.type === 'button')!;
    await ((btn.props as { onClick: () => Promise<void> }).onClick)();
    await flush();
    expect(mocks.diagnosisError).toHaveBeenCalledWith('server error');
  });

  it('on non-OK response with un-parseable body, falls back to a generic message', async () => {
    mocks.fetchSpy.mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => 'plain text body, not JSON',
    });
    const tree = render({ error: 'e', results: [] });
    const btn = findFirst(tree, (el) => el.type === 'button')!;
    await ((btn.props as { onClick: () => Promise<void> }).onClick)();
    await flush();
    expect(mocks.diagnosisError).toHaveBeenCalledWith('Diagnosis failed (503)');
  });

  it('on non-OK response with JSON missing message field, falls back to generic', async () => {
    mocks.fetchSpy.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({}),
    });
    const tree = render({ error: 'e', results: [] });
    const btn = findFirst(tree, (el) => el.type === 'button')!;
    await ((btn.props as { onClick: () => Promise<void> }).onClick)();
    await flush();
    expect(mocks.diagnosisError).toHaveBeenCalledWith('Diagnosis failed (400)');
  });

  it('omits the Authorization header when no token', async () => {
    mocks.getAccessToken.mockReturnValue(null as unknown as string);
    mocks.fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ diagnosis: 'ok' }),
    });
    const tree = render({ error: 'e', results: [] });
    const btn = findFirst(tree, (el) => el.type === 'button')!;
    await ((btn.props as { onClick: () => Promise<void> }).onClick)();
    await flush();
    const init = mocks.fetchSpy.mock.calls[0][1] as { headers: Record<string, string> };
    expect(init.headers.Authorization).toBeUndefined();
    expect(init.headers['Content-Type']).toBe('application/json');
  });

  it('includes the Authorization header when token is set', async () => {
    mocks.fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ diagnosis: 'ok' }),
    });
    const tree = render({ error: 'e', results: [] });
    const btn = findFirst(tree, (el) => el.type === 'button')!;
    await ((btn.props as { onClick: () => Promise<void> }).onClick)();
    await flush();
    const init = mocks.fetchSpy.mock.calls[0][1] as { headers: Record<string, string> };
    expect(init.headers.Authorization).toBe('Bearer tok-123');
  });

  it('handles fetch network rejection by dispatching diagnosisError(err.message)', async () => {
    mocks.fetchSpy.mockRejectedValue(new Error('network failed'));
    const tree = render({ error: 'e', results: [] });
    const btn = findFirst(tree, (el) => el.type === 'button')!;
    await ((btn.props as { onClick: () => Promise<void> }).onClick)();
    await flush();
    expect(mocks.diagnosisError).toHaveBeenCalledWith('network failed');
  });

  it('handles a thrown non-Error value by falling back to a generic message', async () => {
    mocks.fetchSpy.mockRejectedValue('oops');
    const tree = render({ error: 'e', results: [] });
    const btn = findFirst(tree, (el) => el.type === 'button')!;
    await ((btn.props as { onClick: () => Promise<void> }).onClick)();
    await flush();
    expect(mocks.diagnosisError).toHaveBeenCalledWith('Diagnosis failed');
  });

  it('coerces missing result fields to empty strings in the request body', async () => {
    mocks.fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ diagnosis: 'ok' }),
    });
    const tree = render({
      error: 'e',
      results: [{ /* nothing set */ }] as Array<{ name?: string; type?: string; action?: string; error?: string }>,
    });
    const btn = findFirst(tree, (el) => el.type === 'button')!;
    await ((btn.props as { onClick: () => Promise<void> }).onClick)();
    await flush();
    const init = mocks.fetchSpy.mock.calls[0][1] as { body: string };
    const parsedBody = JSON.parse(init.body);
    expect(parsedBody.resourceResults[0]).toEqual({ name: '', type: '', action: '', error: undefined });
  });

  it('handles undefined results array by passing through []', async () => {
    mocks.fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ diagnosis: 'ok' }),
    });
    const tree = render({
      error: 'e',
      results: undefined as unknown as Array<{ name?: string }>,
    });
    const btn = findFirst(tree, (el) => el.type === 'button')!;
    await ((btn.props as { onClick: () => Promise<void> }).onClick)();
    await flush();
    const init = mocks.fetchSpy.mock.calls[0][1] as { body: string };
    const parsedBody = JSON.parse(init.body);
    expect(parsedBody.resourceResults).toEqual([]);
  });
});

describe('DeployDiagnosis — loading status', () => {
  it('renders the "Analyzing error..." copy with no buttons', () => {
    mocks.state.deploy.diagnosis = { status: 'loading', result: null, error: null };
    const tree = render({ error: 'e', results: [] });
    const text = collectText(tree);
    expect(text).toContain('Analyzing error...');
    const btns = findAll(tree, (el) => el.type === 'button');
    expect(btns).toHaveLength(0);
  });
});

describe('DeployDiagnosis — error status', () => {
  it('renders "Diagnosis failed: <error>" + a Dismiss button', () => {
    mocks.state.deploy.diagnosis = { status: 'error', result: null, error: 'rate-limited' };
    const tree = render({ error: 'e', results: [] });
    const text = collectText(tree);
    expect(text).toContain('Diagnosis failed:');
    expect(text).toContain('rate-limited');
    expect(text).toContain('Dismiss');
  });

  it('clicking Dismiss dispatches clearDiagnosis()', () => {
    mocks.state.deploy.diagnosis = { status: 'error', result: null, error: 'x' };
    const tree = render({ error: 'e', results: [] });
    const btn = findFirst(
      tree,
      (el) => el.type === 'button' && (el.props as { children?: unknown }).children === 'Dismiss',
    )!;
    const onClick = (btn.props as { onClick: () => void }).onClick;
    onClick();
    expect(mocks.clearDiagnosis).toHaveBeenCalled();
  });
});

describe('DeployDiagnosis — loaded status', () => {
  it('renders the diagnosis result + suggested fixes', () => {
    mocks.state.deploy.diagnosis = {
      status: 'loaded',
      result: { diagnosis: 'You forgot X', suggestedFixes: ['fix1', 'fix2'] },
      error: null,
    };
    const tree = render({ error: 'e', results: [] });
    const text = collectText(tree);
    expect(text).toContain('You forgot X');
    expect(text).toContain('fix1');
    expect(text).toContain('fix2');
  });

  it('does NOT render the fixes <ul> when there are none', () => {
    mocks.state.deploy.diagnosis = {
      status: 'loaded',
      result: { diagnosis: 'd', suggestedFixes: [] },
      error: null,
    };
    const tree = render({ error: 'e', results: [] });
    const uls = findAll(tree, (el) => el.type === 'ul');
    expect(uls).toHaveLength(0);
  });

  it('renders one <li> per suggested fix', () => {
    mocks.state.deploy.diagnosis = {
      status: 'loaded',
      result: { diagnosis: 'd', suggestedFixes: ['a', 'b', 'c'] },
      error: null,
    };
    const tree = render({ error: 'e', results: [] });
    const lis = findAll(tree, (el) => el.type === 'li');
    expect(lis).toHaveLength(3);
  });

  it('clicking the Dismiss button dispatches clearDiagnosis', () => {
    mocks.state.deploy.diagnosis = {
      status: 'loaded',
      result: { diagnosis: 'd', suggestedFixes: [] },
      error: null,
    };
    const tree = render({ error: 'e', results: [] });
    const btn = findFirst(
      tree,
      (el) => el.type === 'button' && (el.props as { children?: unknown }).children === 'Dismiss',
    )!;
    const onClick = (btn.props as { onClick: () => void }).onClick;
    onClick();
    expect(mocks.clearDiagnosis).toHaveBeenCalled();
  });
});
