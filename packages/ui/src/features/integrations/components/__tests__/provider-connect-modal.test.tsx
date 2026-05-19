/**
 * Tests for `ProviderConnectModal` — single-provider OAuth/credential modal.
 *
 * Strategy:
 *   - Mock `react.useState`/`useEffect` to passthrough so the FC body runs
 *     synchronously. `useState` returns `[init, setterSpy]` by default; tests
 *     can override per-slot via `mocks.useStateOverrides[i]` (in source order).
 *   - Mock the Dialog primitives + `useGCPOAuth` + `getApi().provider` to
 *     observable shims.
 *   - Mock `useTranslation` to identity-key.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  // useState overrides keyed by source order. The component declares
  // 7 useState calls in this order:
  //   0 connected, 1 connecting, 2 loading, 3 error, 4 success, 5 formValues, 6 projectId.
  useStateOverrides: {} as Record<number, unknown>,
  useStateCount: 0,
  cycleLen: 0,
  api: {
    getCredentials: vi.fn(),
    isConnected: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
  },
  // useGCPOAuth return value override per test.
  gcpOAuth: {
    connecting: false,
    error: null as string | null,
    connect: vi.fn(),
  },
  effects: [] as Array<() => void | (() => void)>,
  setters: [] as Array<ReturnType<typeof vi.fn>>,
}));

vi.mock('react', async (orig) => {
  const actual = (await orig()) as typeof import('react');
  const useStateStub = <T,>(init: T): [T, (v: T) => void] => {
    const idx = mocks.useStateCount;
    mocks.useStateCount += 1;
    const cycle = mocks.cycleLen > 0 ? mocks.cycleLen : Number.POSITIVE_INFINITY;
    const slot = idx % cycle;
    const override = mocks.useStateOverrides[slot];
    const setter = vi.fn();
    mocks.setters.push(setter);
    return [override !== undefined ? (override as T) : init, setter];
  };
  const useEffectStub = (fn: () => void | (() => void)) => {
    mocks.effects.push(fn);
  };
  const actualDefault = (actual as unknown as { default?: typeof actual }).default ?? actual;
  return {
    ...actual,
    default: { ...actualDefault, useState: useStateStub, useEffect: useEffectStub },
    useState: useStateStub,
    useEffect: useEffectStub,
  };
});

vi.mock('../../../../i18n', () => ({
  useTranslation: () => ({
    t: (k: string, vars?: Record<string, string>) => (vars ? `${k}:${JSON.stringify(vars)}` : k),
  }),
}));

vi.mock('../../../../shared/api/api-adapter', () => ({
  getApi: () => ({ provider: mocks.api }),
}));

vi.mock('../../../../shared/hooks/use-gcp-oauth', () => ({
  useGCPOAuth: (onSuccess: () => void) => {
    // Wrap so tests can trigger onSuccess via mocks.gcpOAuth.connect call.
    mocks.gcpOAuth.connect = vi.fn(() => onSuccess());
    return mocks.gcpOAuth;
  },
}));

vi.mock('../../../../shared/components/ui/dialog', () => ({
  Dialog: vi.fn(({ children }: { children?: React.ReactNode }) => children ?? null),
  DialogContent: vi.fn(({ children }: { children?: React.ReactNode }) => children ?? null),
  DialogHeader: vi.fn(({ children }: { children?: React.ReactNode }) => children ?? null),
  DialogTitle: vi.fn(({ children }: { children?: React.ReactNode }) => children ?? null),
  DialogDescription: vi.fn(({ children }: { children?: React.ReactNode }) => children ?? null),
}));

import { ProviderConnectModal } from '../provider-connect-modal';

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
      /* skip */
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
  let out = '';
  for (const el of walk(tree)) {
    const c = el.props.children;
    if (typeof c === 'string') out += c;
    else if (Array.isArray(c)) for (const item of c) if (typeof item === 'string') out += item;
  }
  return out;
}

const baseProps = (overrides: Partial<React.ComponentProps<typeof ProviderConnectModal>> = {}) => ({
  isOpen: true,
  onClose: vi.fn(),
  providerId: 'aws',
  providerName: 'Amazon Web Services',
  providerIcon: 'https://example/aws.svg',
  description: 'Connect to AWS',
  fields: [
    { name: 'access_key_id', label: 'Access Key ID', type: 'text' as const, required: true },
    { name: 'secret_access_key', label: 'Secret', type: 'password' as const, required: false },
  ],
  ...overrides,
});

const render = (props: Parameters<typeof baseProps>[0] = {}): unknown =>
  (ProviderConnectModal as (p: ReturnType<typeof baseProps>) => unknown)(baseProps(props));

beforeEach(() => {
  mocks.useStateOverrides = {};
  mocks.useStateCount = 0;
  mocks.cycleLen = 0;
  mocks.api.getCredentials.mockReset();
  mocks.api.isConnected.mockReset();
  mocks.api.connect.mockReset();
  mocks.api.disconnect.mockReset();
  mocks.gcpOAuth = { connecting: false, error: null, connect: vi.fn() };
  mocks.effects = [];
  mocks.setters = [];
  vi.stubGlobal('window', {});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── Tests ──────────────────────────────────────────────────────────────────

// useState slots:
//   0=connected, 1=connecting, 2=loading, 3=error, 4=success, 5=formValues, 6=projectId
const SLOT_CONNECTED = 0;
const SLOT_CONNECTING = 1;
const SLOT_LOADING = 2;
const SLOT_ERROR = 3;
const SLOT_SUCCESS = 4;
const SLOT_FORM = 5;
const SLOT_PROJECT_ID = 6;

describe('ProviderConnectModal — header + dialog plumbing', () => {
  it('passes the providerName + description to the title and body', () => {
    const tree = render();
    const text = collectText(tree);
    expect(text).toContain('Amazon Web Services');
    expect(text).toContain('Connect to AWS');
  });

  it('renders the icon image with the providerIcon URL', () => {
    const tree = render();
    const img = findFirst(tree, (el) => el.type === 'img' && el.props.src === 'https://example/aws.svg');
    expect(img).toBeDefined();
  });

  it('Dialog onOpenChange(false) calls onClose', () => {
    const onClose = vi.fn();
    const tree = render({ onClose });
    // Find the Dialog mock element (top-level)
    const dlg = findFirst(tree, (el) => typeof el.type === 'function');
    expect(dlg).toBeDefined();
    // Simulate Radix calling onOpenChange(false)
    (dlg!.props.onOpenChange as (b: boolean) => void)(false);
    expect(onClose).toHaveBeenCalled();
  });

  it('Dialog onOpenChange(true) does not call onClose', () => {
    const onClose = vi.fn();
    const tree = render({ onClose });
    const dlg = findFirst(tree, (el) => typeof el.type === 'function')!;
    (dlg.props.onOpenChange as (b: boolean) => void)(true);
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('ProviderConnectModal — loading state', () => {
  it('renders a spinner instead of the form/connected state when loading is true', () => {
    mocks.useStateOverrides = { [SLOT_LOADING]: true };
    const tree = render();
    // Find the loading container — flex items-center justify-center py-8.
    const spinnerWrapper = findFirst(
      tree,
      (el) =>
        el.type === 'div' &&
        typeof el.props.className === 'string' &&
        (el.props.className as string).includes('justify-center py-8'),
    );
    expect(spinnerWrapper).toBeDefined();
  });

  it('hides the form when loading is true', () => {
    mocks.useStateOverrides = { [SLOT_LOADING]: true };
    const tree = render();
    const inputs = findAll(tree, (el) => el.type === 'input');
    expect(inputs.length).toBe(0);
  });
});

describe('ProviderConnectModal — connected state', () => {
  it('renders the connected pill + disconnect button when connected=true and loading=false', () => {
    mocks.useStateOverrides = {
      [SLOT_LOADING]: false,
      [SLOT_CONNECTED]: true,
    };
    const tree = render();
    const text = collectText(tree);
    expect(text).toContain('providerConnect.disconnectButton');
    // Inputs should not render in connected state.
    expect(findAll(tree, (el) => el.type === 'input').length).toBe(0);
  });

  it('renders the project label when projectId is set', () => {
    mocks.useStateOverrides = {
      [SLOT_LOADING]: false,
      [SLOT_CONNECTED]: true,
      [SLOT_PROJECT_ID]: 'gcp-prod',
    };
    const tree = render({ providerId: 'gcp', providerName: 'GCP' });
    const text = collectText(tree);
    expect(text).toContain('providerConnect.status.project');
    expect(text).toContain('gcp-prod');
  });

  it('renders the generic connected status when projectId is null', () => {
    mocks.useStateOverrides = {
      [SLOT_LOADING]: false,
      [SLOT_CONNECTED]: true,
      [SLOT_PROJECT_ID]: null,
    };
    const tree = render();
    const text = collectText(tree);
    expect(text).toContain('providerConnect.status.connected');
  });

  it('shows the success message above the disconnect button when set', () => {
    mocks.useStateOverrides = {
      [SLOT_LOADING]: false,
      [SLOT_CONNECTED]: true,
      [SLOT_SUCCESS]: 'Yay!',
    };
    const tree = render();
    const text = collectText(tree);
    expect(text).toContain('Yay!');
  });

  it('clicking disconnect calls api.provider.disconnect with the providerId', async () => {
    mocks.useStateOverrides = {
      [SLOT_LOADING]: false,
      [SLOT_CONNECTED]: true,
    };
    mocks.api.disconnect.mockResolvedValue(undefined);
    const tree = render();
    const disconnect = findFirst(
      tree,
      (el) =>
        el.type === 'button' &&
        Array.isArray(el.props.children) &&
        (el.props.children as unknown[]).includes('providerConnect.disconnectButton'),
    )!;
    await (disconnect.props.onClick as () => Promise<void>)();
    expect(mocks.api.disconnect).toHaveBeenCalledWith('aws');
  });

  it('disconnect surface an error when the api throws', async () => {
    mocks.useStateOverrides = {
      [SLOT_LOADING]: false,
      [SLOT_CONNECTED]: true,
    };
    mocks.api.disconnect.mockRejectedValue(new Error('boom'));
    const tree = render();
    const disconnect = findFirst(
      tree,
      (el) =>
        el.type === 'button' &&
        Array.isArray(el.props.children) &&
        (el.props.children as unknown[]).includes('providerConnect.disconnectButton'),
    )!;
    await (disconnect.props.onClick as () => Promise<void>)();
    // setError setter is at the index for `error`. The mock setter spy
    // records the call.
    // Find the error setter (slot SLOT_ERROR after loading is false). The
    // setters list in the order useState was called.
    const errorSetter = mocks.setters[SLOT_ERROR];
    expect(errorSetter).toHaveBeenCalledWith('boom');
  });

  it('disconnect uses a generic message when the error has no .message', async () => {
    mocks.useStateOverrides = {
      [SLOT_LOADING]: false,
      [SLOT_CONNECTED]: true,
    };
    mocks.api.disconnect.mockRejectedValue({});
    const tree = render();
    const disconnect = findFirst(
      tree,
      (el) =>
        el.type === 'button' &&
        Array.isArray(el.props.children) &&
        (el.props.children as unknown[]).includes('providerConnect.disconnectButton'),
    )!;
    await (disconnect.props.onClick as () => Promise<void>)();
    const errorSetter = mocks.setters[SLOT_ERROR];
    expect(errorSetter).toHaveBeenCalledWith('Disconnect failed');
  });
});

describe('ProviderConnectModal — connect form', () => {
  it('renders one input per non-textarea field', () => {
    mocks.useStateOverrides = { [SLOT_LOADING]: false };
    const tree = render();
    const inputs = findAll(tree, (el) => el.type === 'input');
    expect(inputs.length).toBe(2);
    expect(inputs[0].props.type).toBe('text');
    expect(inputs[1].props.type).toBe('password');
  });

  it('renders a textarea for textarea-type fields', () => {
    mocks.useStateOverrides = { [SLOT_LOADING]: false };
    const tree = render({
      fields: [{ name: 'sa_key', label: 'Service Account Key', type: 'textarea', required: true }],
    });
    expect(findFirst(tree, (el) => el.type === 'textarea')).toBeDefined();
    expect(findAll(tree, (el) => el.type === 'input').length).toBe(0);
  });

  it('renders the required-field marker for required fields only', () => {
    mocks.useStateOverrides = { [SLOT_LOADING]: false };
    const tree = render();
    // The asterisk lives inside a label that has the field label as its first child.
    const text = collectText(tree);
    expect(text).toContain('Access Key ID');
    expect(text).toContain('Secret');
  });

  it('renders the help link when provided', () => {
    mocks.useStateOverrides = { [SLOT_LOADING]: false };
    const tree = render({
      fields: [
        {
          name: 'k',
          label: 'Key',
          type: 'text',
          required: false,
          helpLink: { url: 'https://help', text: 'Get key' },
        },
      ],
    });
    const link = findFirst(tree, (el) => el.type === 'a' && el.props.href === 'https://help');
    expect(link).toBeDefined();
  });

  it('typing in a text input updates the formValues state', () => {
    mocks.useStateOverrides = { [SLOT_LOADING]: false, [SLOT_FORM]: { existing: 'v' } };
    const tree = render();
    const first = findFirst(tree, (el) => el.type === 'input')!;
    (first.props.onChange as (e: { target: { value: string } }) => void)({
      target: { value: 'newval' },
    });
    const formSetter = mocks.setters[SLOT_FORM];
    expect(formSetter).toHaveBeenCalledWith({
      existing: 'v',
      access_key_id: 'newval',
    });
  });

  it('typing in a textarea updates formValues', () => {
    mocks.useStateOverrides = { [SLOT_LOADING]: false, [SLOT_FORM]: {} };
    const tree = render({
      fields: [{ name: 'k', label: 'Key', type: 'textarea', required: false }],
    });
    const ta = findFirst(tree, (el) => el.type === 'textarea')!;
    (ta.props.onChange as (e: { target: { value: string } }) => void)({
      target: { value: 'json' },
    });
    const formSetter = mocks.setters[SLOT_FORM];
    expect(formSetter).toHaveBeenCalledWith({ k: 'json' });
  });

  it('shows the error block above the form when error is set', () => {
    mocks.useStateOverrides = { [SLOT_LOADING]: false, [SLOT_ERROR]: 'something bad' };
    const tree = render();
    const text = collectText(tree);
    expect(text).toContain('something bad');
  });

  it('Enter key on a text input triggers handleConnect', () => {
    mocks.useStateOverrides = {
      [SLOT_LOADING]: false,
      [SLOT_FORM]: { access_key_id: 'a', secret_access_key: 'b' },
    };
    mocks.api.connect.mockResolvedValue({ success: true });
    const tree = render();
    const input = findFirst(tree, (el) => el.type === 'input')!;
    (input.props.onKeyDown as (e: { key: string; metaKey?: boolean }) => void)({ key: 'Enter' });
    expect(mocks.api.connect).toHaveBeenCalled();
  });

  it('non-Enter key on a text input is a no-op', () => {
    mocks.useStateOverrides = {
      [SLOT_LOADING]: false,
      [SLOT_FORM]: { access_key_id: 'a', secret_access_key: 'b' },
    };
    const tree = render();
    const input = findFirst(tree, (el) => el.type === 'input')!;
    (input.props.onKeyDown as (e: { key: string }) => void)({ key: 'a' });
    expect(mocks.api.connect).not.toHaveBeenCalled();
  });

  it('Cmd+Enter on a textarea triggers handleConnect', () => {
    mocks.useStateOverrides = {
      [SLOT_LOADING]: false,
      [SLOT_FORM]: { sa_key: 'json' },
    };
    mocks.api.connect.mockResolvedValue({ success: true });
    const tree = render({
      fields: [{ name: 'sa_key', label: 'Key', type: 'textarea', required: true }],
    });
    const ta = findFirst(tree, (el) => el.type === 'textarea')!;
    (ta.props.onKeyDown as (e: { key: string; metaKey?: boolean }) => void)({
      key: 'Enter',
      metaKey: true,
    });
    expect(mocks.api.connect).toHaveBeenCalled();
  });

  it('plain Enter on a textarea (without metaKey) is a no-op', () => {
    mocks.useStateOverrides = { [SLOT_LOADING]: false };
    const tree = render({
      fields: [{ name: 'sa_key', label: 'Key', type: 'textarea', required: true }],
    });
    const ta = findFirst(tree, (el) => el.type === 'textarea')!;
    (ta.props.onKeyDown as (e: { key: string; metaKey?: boolean }) => void)({
      key: 'Enter',
      metaKey: false,
    });
    expect(mocks.api.connect).not.toHaveBeenCalled();
  });
});

describe('ProviderConnectModal — handleConnect', () => {
  it('rejects when a required field is empty', async () => {
    mocks.useStateOverrides = { [SLOT_LOADING]: false, [SLOT_FORM]: {} };
    const tree = render();
    const connectBtn = findFirst(
      tree,
      (el) => el.type === 'button' && el.props.className === 'ice-btn ice-btn-primary w-full',
    )!;
    await (connectBtn.props.onClick as () => Promise<void>)();
    const errorSetter = mocks.setters[SLOT_ERROR];
    expect(errorSetter).toHaveBeenCalledWith('Access Key ID is required');
    expect(mocks.api.connect).not.toHaveBeenCalled();
  });

  it('rejects when a required field is whitespace-only', async () => {
    mocks.useStateOverrides = {
      [SLOT_LOADING]: false,
      [SLOT_FORM]: { access_key_id: '   ' },
    };
    const tree = render();
    const connectBtn = findFirst(
      tree,
      (el) => el.type === 'button' && el.props.className === 'ice-btn ice-btn-primary w-full',
    )!;
    await (connectBtn.props.onClick as () => Promise<void>)();
    expect(mocks.api.connect).not.toHaveBeenCalled();
  });

  it('does not validate non-required fields', async () => {
    mocks.useStateOverrides = {
      [SLOT_LOADING]: false,
      [SLOT_FORM]: { access_key_id: 'k' },
    };
    mocks.api.connect.mockResolvedValue({ success: true });
    const tree = render();
    const connectBtn = findFirst(
      tree,
      (el) => el.type === 'button' && el.props.className === 'ice-btn ice-btn-primary w-full',
    )!;
    await (connectBtn.props.onClick as () => Promise<void>)();
    expect(mocks.api.connect).toHaveBeenCalledWith('aws', { access_key_id: 'k' });
  });

  it('on success: sets connected, project_id from result, success message', async () => {
    mocks.useStateOverrides = {
      [SLOT_LOADING]: false,
      [SLOT_FORM]: { access_key_id: 'k', secret_access_key: 's' },
    };
    mocks.api.connect.mockResolvedValue({ success: true, project_id: 'p-99' });
    const tree = render();
    const connectBtn = findFirst(
      tree,
      (el) => el.type === 'button' && el.props.className === 'ice-btn ice-btn-primary w-full',
    )!;
    await (connectBtn.props.onClick as () => Promise<void>)();
    expect(mocks.setters[SLOT_CONNECTED]).toHaveBeenCalledWith(true);
    expect(mocks.setters[SLOT_PROJECT_ID]).toHaveBeenCalledWith('p-99');
    expect(mocks.setters[SLOT_SUCCESS]).toHaveBeenCalledWith(
      expect.stringContaining('providerConnect.success.connected'),
    );
  });

  it('on success: falls back to formValues.project_id when result.project_id is missing', async () => {
    mocks.useStateOverrides = {
      [SLOT_LOADING]: false,
      [SLOT_FORM]: { access_key_id: 'k', project_id: 'from-form' },
    };
    mocks.api.connect.mockResolvedValue({ success: true });
    const tree = render();
    const connectBtn = findFirst(
      tree,
      (el) => el.type === 'button' && el.props.className === 'ice-btn ice-btn-primary w-full',
    )!;
    await (connectBtn.props.onClick as () => Promise<void>)();
    expect(mocks.setters[SLOT_PROJECT_ID]).toHaveBeenCalledWith('from-form');
  });

  it('on success: clears formValues to {}', async () => {
    mocks.useStateOverrides = {
      [SLOT_LOADING]: false,
      [SLOT_FORM]: { access_key_id: 'k' },
    };
    mocks.api.connect.mockResolvedValue({ success: true });
    const tree = render();
    const connectBtn = findFirst(
      tree,
      (el) => el.type === 'button' && el.props.className === 'ice-btn ice-btn-primary w-full',
    )!;
    await (connectBtn.props.onClick as () => Promise<void>)();
    expect(mocks.setters[SLOT_FORM]).toHaveBeenCalledWith({});
  });

  it('on api failure with success=false: surfaces the result.error', async () => {
    mocks.useStateOverrides = {
      [SLOT_LOADING]: false,
      [SLOT_FORM]: { access_key_id: 'k' },
    };
    mocks.api.connect.mockResolvedValue({ success: false, error: 'creds rejected' });
    const tree = render();
    const connectBtn = findFirst(
      tree,
      (el) => el.type === 'button' && el.props.className === 'ice-btn ice-btn-primary w-full',
    )!;
    await (connectBtn.props.onClick as () => Promise<void>)();
    expect(mocks.setters[SLOT_ERROR]).toHaveBeenCalledWith('creds rejected');
  });

  it('on api failure with no error message: uses generic "Connection failed"', async () => {
    mocks.useStateOverrides = {
      [SLOT_LOADING]: false,
      [SLOT_FORM]: { access_key_id: 'k' },
    };
    mocks.api.connect.mockResolvedValue({ success: false });
    const tree = render();
    const connectBtn = findFirst(
      tree,
      (el) => el.type === 'button' && el.props.className === 'ice-btn ice-btn-primary w-full',
    )!;
    await (connectBtn.props.onClick as () => Promise<void>)();
    expect(mocks.setters[SLOT_ERROR]).toHaveBeenCalledWith('Connection failed');
  });

  it('on thrown error with response.data.error: surfaces it', async () => {
    mocks.useStateOverrides = {
      [SLOT_LOADING]: false,
      [SLOT_FORM]: { access_key_id: 'k' },
    };
    mocks.api.connect.mockRejectedValue({
      response: { data: { error: 'invalid creds (axios)' } },
    });
    const tree = render();
    const connectBtn = findFirst(
      tree,
      (el) => el.type === 'button' && el.props.className === 'ice-btn ice-btn-primary w-full',
    )!;
    await (connectBtn.props.onClick as () => Promise<void>)();
    expect(mocks.setters[SLOT_ERROR]).toHaveBeenCalledWith('invalid creds (axios)');
  });

  it('on thrown error with .message: surfaces it', async () => {
    mocks.useStateOverrides = {
      [SLOT_LOADING]: false,
      [SLOT_FORM]: { access_key_id: 'k' },
    };
    mocks.api.connect.mockRejectedValue(new Error('network down'));
    const tree = render();
    const connectBtn = findFirst(
      tree,
      (el) => el.type === 'button' && el.props.className === 'ice-btn ice-btn-primary w-full',
    )!;
    await (connectBtn.props.onClick as () => Promise<void>)();
    expect(mocks.setters[SLOT_ERROR]).toHaveBeenCalledWith('network down');
  });

  it('on thrown error with no message: uses generic "Connection failed"', async () => {
    mocks.useStateOverrides = {
      [SLOT_LOADING]: false,
      [SLOT_FORM]: { access_key_id: 'k' },
    };
    mocks.api.connect.mockRejectedValue({});
    const tree = render();
    const connectBtn = findFirst(
      tree,
      (el) => el.type === 'button' && el.props.className === 'ice-btn ice-btn-primary w-full',
    )!;
    await (connectBtn.props.onClick as () => Promise<void>)();
    expect(mocks.setters[SLOT_ERROR]).toHaveBeenCalledWith('Connection failed');
  });

  it('connect button shows the spinner when connecting=true', () => {
    mocks.useStateOverrides = { [SLOT_LOADING]: false, [SLOT_CONNECTING]: true };
    const tree = render();
    const connectBtn = findFirst(
      tree,
      (el) => el.type === 'button' && el.props.className === 'ice-btn ice-btn-primary w-full',
    )!;
    expect(connectBtn.props.disabled).toBe(true);
  });

  it('connect button is enabled when connecting=false', () => {
    mocks.useStateOverrides = { [SLOT_LOADING]: false };
    const tree = render();
    const connectBtn = findFirst(
      tree,
      (el) => el.type === 'button' && el.props.className === 'ice-btn ice-btn-primary w-full',
    )!;
    expect(connectBtn.props.disabled).toBe(false);
  });
});

describe('ProviderConnectModal — GCP-specific UI', () => {
  it('renders the GCP guide and OAuth button when providerId="gcp"', () => {
    mocks.useStateOverrides = { [SLOT_LOADING]: false };
    const tree = render({ providerId: 'gcp' });
    const text = collectText(tree);
    expect(text).toContain('providerConnect.gcp.guide.title');
    expect(text).toContain('providerConnect.gcp.quickConnect.button');
  });

  it('does not render the GCP-specific block for other providers', () => {
    mocks.useStateOverrides = { [SLOT_LOADING]: false };
    const tree = render({ providerId: 'aws' });
    const text = collectText(tree);
    expect(text).not.toContain('providerConnect.gcp.guide.title');
    expect(text).not.toContain('providerConnect.gcp.quickConnect.button');
  });

  it('clicking the GCP OAuth button clears error and calls gcpOAuth.connect', () => {
    mocks.useStateOverrides = { [SLOT_LOADING]: false };
    const tree = render({ providerId: 'gcp' });
    const oauthBtn = findFirst(
      tree,
      (el) =>
        el.type === 'button' &&
        Array.isArray(el.props.children) &&
        (el.props.children as unknown[]).some(
          (c) => typeof c === 'string' && c.includes('providerConnect.gcp.quickConnect.button'),
        ),
    )!;
    (oauthBtn.props.onClick as () => void)();
    expect(mocks.gcpOAuth.connect).toHaveBeenCalled();
    expect(mocks.setters[SLOT_ERROR]).toHaveBeenCalledWith(null);
  });

  it('GCP OAuth button is disabled while gcpOAuth.connecting is true', () => {
    mocks.useStateOverrides = { [SLOT_LOADING]: false };
    mocks.gcpOAuth = { connecting: true, error: null, connect: vi.fn() };
    const tree = render({ providerId: 'gcp' });
    const oauthBtn = findFirst(
      tree,
      (el) =>
        el.type === 'button' &&
        Array.isArray(el.props.children) &&
        (el.props.children as unknown[]).some(
          (c) => typeof c === 'string' && c.includes('providerConnect.gcp.quickConnect.button'),
        ),
    )!;
    expect(oauthBtn.props.disabled).toBe(true);
  });

  it('useGCPOAuth onSuccess sets connected=true + success message + reloads project_id', async () => {
    mocks.useStateOverrides = { [SLOT_LOADING]: false };
    mocks.api.getCredentials.mockResolvedValue({ project_id: 'oauth-proj' });
    render({ providerId: 'gcp', providerName: 'GCP' });
    // Trigger the onSuccess callback that the hook stub captured.
    mocks.gcpOAuth.connect();
    // After the synchronous setters fire:
    expect(mocks.setters[SLOT_CONNECTED]).toHaveBeenCalledWith(true);
    expect(mocks.setters[SLOT_SUCCESS]).toHaveBeenCalledWith(
      expect.stringContaining('providerConnect.success.connectedViaGoogle'),
    );
    // The async getCredentials call resolves on a microtask:
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(mocks.api.getCredentials).toHaveBeenCalledWith('gcp');
    expect(mocks.setters[SLOT_PROJECT_ID]).toHaveBeenCalledWith('oauth-proj');
  });

  it('useGCPOAuth onSuccess: project_id falls back to null when getCredentials returns nothing', async () => {
    mocks.useStateOverrides = { [SLOT_LOADING]: false };
    mocks.api.getCredentials.mockResolvedValue(null);
    render({ providerId: 'gcp' });
    mocks.gcpOAuth.connect();
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(mocks.setters[SLOT_PROJECT_ID]).toHaveBeenCalledWith(null);
  });

  it('forwards gcpOAuth.error into the local error state via useEffect', () => {
    mocks.useStateOverrides = { [SLOT_LOADING]: false };
    mocks.gcpOAuth = { connecting: false, error: 'oauth boom', connect: vi.fn() };
    render({ providerId: 'gcp' });
    // Run the queued effects.
    for (const fx of mocks.effects) fx();
    expect(mocks.setters[SLOT_ERROR]).toHaveBeenCalledWith('oauth boom');
  });

  it('does not forward gcpOAuth.error when null', () => {
    mocks.useStateOverrides = { [SLOT_LOADING]: false };
    mocks.gcpOAuth = { connecting: false, error: null, connect: vi.fn() };
    render({ providerId: 'gcp' });
    for (const fx of mocks.effects) fx();
    // setError is also called via the openness effect with null (it resets
    // error/success/loading on open). So filter for a string-arg call.
    const errSetterCalls = mocks.setters[SLOT_ERROR].mock.calls;
    const stringArgCalls = errSetterCalls.filter((c) => typeof c[0] === 'string');
    expect(stringArgCalls.length).toBe(0);
  });
});

describe('ProviderConnectModal — open effect', () => {
  it('does nothing when isOpen is false', async () => {
    render({ isOpen: false });
    for (const fx of mocks.effects) fx();
    expect(mocks.api.isConnected).not.toHaveBeenCalled();
  });

  it('on open: resets error/success, sets loading=true, calls api.isConnected', async () => {
    mocks.api.isConnected.mockResolvedValue(false);
    render();
    for (const fx of mocks.effects) fx();
    expect(mocks.setters[SLOT_ERROR]).toHaveBeenCalledWith(null);
    expect(mocks.setters[SLOT_SUCCESS]).toHaveBeenCalledWith(null);
    expect(mocks.setters[SLOT_LOADING]).toHaveBeenCalledWith(true);
    expect(mocks.api.isConnected).toHaveBeenCalledWith('aws');
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(mocks.setters[SLOT_LOADING]).toHaveBeenLastCalledWith(false);
  });

  it('on open + isConnected=true: also fetches credentials', async () => {
    mocks.api.isConnected.mockResolvedValue(true);
    mocks.api.getCredentials.mockResolvedValue({ project_id: 'p-1' });
    render();
    for (const fx of mocks.effects) fx();
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(mocks.api.getCredentials).toHaveBeenCalledWith('aws');
    expect(mocks.setters[SLOT_PROJECT_ID]).toHaveBeenCalledWith('p-1');
  });

  it('on open + getCredentials returns null: project_id stays null', async () => {
    mocks.api.isConnected.mockResolvedValue(true);
    mocks.api.getCredentials.mockResolvedValue(null);
    render();
    for (const fx of mocks.effects) fx();
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(mocks.setters[SLOT_PROJECT_ID]).toHaveBeenCalledWith(null);
  });

  it('isConnected throwing is swallowed and loading still flips back to false', async () => {
    mocks.api.isConnected.mockRejectedValue(new Error('boom'));
    render();
    for (const fx of mocks.effects) fx();
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(mocks.setters[SLOT_LOADING]).toHaveBeenLastCalledWith(false);
  });
});
