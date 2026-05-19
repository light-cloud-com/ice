/**
 * rf-pset-6 — `AddProjectForm` section.
 *
 * Pins the GCP add-project sub-form's per-field rendering and the
 * submit/cancel handlers. The async submit calls
 * `getApi().provider.connect(...)` and threads the result through the
 * orchestrator's setters; success and error branches are covered.
 *
 * The provider-card test file (rf-pset-5) tests the same flows
 * indirectly via the parent — this file pins the behavior on the leaf
 * directly so the form's contract is testable in isolation.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  api: { connect: vi.fn() },
}));

vi.mock('../../../api/api-adapter', () => ({
  getApi: vi.fn(() => ({ provider: mocks.api })),
}));

import { AddProjectForm, type AddProjectFormProps } from '../sections/add-project-form';
import type { ProviderConfig, ProviderRuntimeState } from '../types';

// ─── Tree-walker ───────────────────────────────────────────────────────────

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

// ─── Fixtures ─────────────────────────────────────────────────────────────

const t: AddProjectFormProps['t'] = (key, vars) => (vars ? `${key}:${JSON.stringify(vars)}` : key);

const gcpConfig: ProviderConfig = {
  id: 'gcp',
  name: 'Google Cloud Platform',
  description: 'Connect via Google OAuth or service account key',
  icon: 'gcp',
  color: 'text-blue-500',
  bgColor: 'bg-blue-100 dark:bg-blue-900/30',
  configFields: [
    {
      name: 'service_account_key',
      label: 'Service Account Key (JSON)',
      type: 'textarea',
      placeholder: '{...}',
      required: false,
    },
  ],
};

function makeProps(overrides: Partial<AddProjectFormProps> = {}): AddProjectFormProps {
  return {
    provider: gcpConfig,
    state: { connected: true, projects: [{ id: 'g1', name: 'G1' }], formValues: {} },
    connecting: null,
    t,
    onUpdateFormValue: vi.fn(),
    onShowAddProjectChange: vi.fn(),
    setProviderStates: vi.fn(),
    setError: vi.fn(),
    setSuccess: vi.fn(),
    setConnecting: vi.fn(),
    ...overrides,
  };
}

function renderForm(props: AddProjectFormProps): React.ReactElement {
  return (AddProjectForm as unknown as (p: AddProjectFormProps) => React.ReactElement)(props);
}

// ─── Tests ────────────────────────────────────────────────────────────────

beforeEach(() => {
  mocks.api.connect.mockReset();
});

describe('AddProjectForm — render', () => {
  it('renders the addAnother heading + each configField label + addButton + cancelButton', () => {
    const tree = renderForm(makeProps());
    const text = collectText(tree);
    expect(text).toContain('providerSettings.projects.addAnother');
    expect(text).toContain('Service Account Key (JSON)');
    expect(text).toContain('providerSettings.projects.addButton');
    expect(text).toContain('providerSettings.projects.cancelButton');
  });

  it('textarea field renders with rows=3 and font-mono className', () => {
    const tree = renderForm(makeProps());
    const ta = findByPredicate(
      tree,
      (el) =>
        el.type === 'textarea' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('font-mono'),
    )[0];
    expect(ta).toBeDefined();
    expect((ta.props as { rows: number }).rows).toBe(3);
  });

  it('text-type field renders an <input>, not a textarea', () => {
    const props = makeProps({
      provider: {
        ...gcpConfig,
        configFields: [{ name: 'projectId', label: 'Project ID', type: 'text', required: false }],
      },
    });
    const tree = renderForm(props);
    const inputs = findByPredicate(
      tree,
      (el) =>
        el.type === 'input' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('text-xs'),
    );
    expect(inputs.length).toBe(1);
  });

  it('field value reflects state.formValues[`new_${name}`] (defaults to "")', () => {
    const tree = renderForm(
      makeProps({
        state: {
          connected: true,
          projects: [],
          formValues: { new_service_account_key: '{"k":"v"}' },
        },
      }),
    );
    const ta = findByPredicate(tree, (el) => el.type === 'textarea')[0];
    expect((ta.props as { value: string }).value).toBe('{"k":"v"}');
  });

  it('add-button shows RefreshCw spinner when connecting === provider.id', () => {
    const tree = renderForm(makeProps({ connecting: 'gcp' }));
    const fns: string[] = [];
    for (const el of walk(tree)) {
      const dn = (el.type as { displayName?: string })?.displayName;
      if (dn) fns.push(dn);
    }
    expect(fns).toContain('RefreshCw');
  });

  it('add-button shows Plus icon when not connecting', () => {
    const tree = renderForm(makeProps({ connecting: null }));
    const fns: string[] = [];
    for (const el of walk(tree)) {
      const dn = (el.type as { displayName?: string })?.displayName;
      if (dn) fns.push(dn);
    }
    expect(fns).toContain('Plus');
    expect(fns).not.toContain('RefreshCw');
  });

  it('add-button is disabled when connecting === provider.id', () => {
    const tree = renderForm(makeProps({ connecting: 'gcp' }));
    const addBtn = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('flex-1'),
    )[0];
    expect((addBtn.props as { disabled: boolean }).disabled).toBe(true);
  });

  it('add-button is enabled when connecting is null', () => {
    const tree = renderForm(makeProps({ connecting: null }));
    const addBtn = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('flex-1'),
    )[0];
    expect((addBtn.props as { disabled: boolean }).disabled).toBe(false);
  });
});

describe('AddProjectForm — onChange', () => {
  it('textarea onChange writes new_<name> via onUpdateFormValue', () => {
    const onUpdateFormValue = vi.fn();
    const tree = renderForm(makeProps({ onUpdateFormValue }));
    const ta = findByPredicate(tree, (el) => el.type === 'textarea')[0];
    (ta.props as { onChange: (e: { target: { value: string } }) => void }).onChange({
      target: { value: 'KEY' },
    });
    expect(onUpdateFormValue).toHaveBeenCalledWith('gcp', 'new_service_account_key', 'KEY');
  });

  it('input onChange writes new_<name> via onUpdateFormValue', () => {
    const onUpdateFormValue = vi.fn();
    const props = makeProps({
      provider: {
        ...gcpConfig,
        configFields: [{ name: 'projectId', label: 'Project ID', type: 'text', required: false }],
      },
      onUpdateFormValue,
    });
    const tree = renderForm(props);
    const input = findByPredicate(tree, (el) => el.type === 'input')[0];
    (input.props as { onChange: (e: { target: { value: string } }) => void }).onChange({
      target: { value: 'pid-1' },
    });
    expect(onUpdateFormValue).toHaveBeenCalledWith('gcp', 'new_projectId', 'pid-1');
  });
});

describe('AddProjectForm — cancel', () => {
  it('cancel button onClick fires onShowAddProjectChange(null)', () => {
    const onShowAddProjectChange = vi.fn();
    const tree = renderForm(makeProps({ onShowAddProjectChange }));
    const cancelBtn = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('hover:bg-muted'),
    )[0];
    (cancelBtn.props as { onClick: () => void }).onClick();
    expect(onShowAddProjectChange).toHaveBeenCalledWith(null);
  });
});

describe('AddProjectForm — submit', () => {
  function getAddBtn(props: AddProjectFormProps): React.ReactElement {
    const tree = renderForm(props);
    const btn = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('flex-1'),
    )[0];
    expect(btn).toBeDefined();
    return btn;
  }

  it('writes setError when serviceAccountKey is missing and skips api.connect', async () => {
    const setError = vi.fn();
    const setConnecting = vi.fn();
    const btn = getAddBtn(makeProps({ setError, setConnecting, state: { ...makeProps().state, formValues: {} } }));
    await (btn.props as { onClick: () => Promise<void> }).onClick();
    expect(setError).toHaveBeenCalledWith('providerSettings.connect.serviceAccountRequired');
    expect(mocks.api.connect).not.toHaveBeenCalled();
    expect(setConnecting).not.toHaveBeenCalled();
  });

  it('success path: calls api.connect, appends new projects, resets new_*, clears form, success message', async () => {
    mocks.api.connect.mockResolvedValueOnce({
      success: true,
      projects: [
        { id: 'g2', name: 'G2' },
        { id: 'g3', name: 'G3' },
      ],
    });
    const setProviderStates = vi.fn();
    const setSuccess = vi.fn();
    const setConnecting = vi.fn();
    const onShowAddProjectChange = vi.fn();
    const props = makeProps({
      state: {
        connected: true,
        projects: [{ id: 'g1', name: 'G1' }],
        formValues: { new_serviceAccountKey: '{"k":"v"}', new_projectId: 'pid' },
      },
      setProviderStates,
      setSuccess,
      setConnecting,
      onShowAddProjectChange,
    });
    const btn = getAddBtn(props);
    await (btn.props as { onClick: () => Promise<void> }).onClick();
    expect(setConnecting).toHaveBeenNthCalledWith(1, 'gcp');
    expect(mocks.api.connect).toHaveBeenCalledWith('gcp', {
      projectId: 'pid',
      serviceAccountKey: '{"k":"v"}',
    });
    const updater = setProviderStates.mock.calls[0][0] as (prev: { gcp: ProviderRuntimeState }) => {
      gcp: ProviderRuntimeState;
    };
    const next = updater({
      gcp: {
        connected: true,
        projects: [{ id: 'g1', name: 'G1' }],
        formValues: { new_serviceAccountKey: '{"k":"v"}', new_projectId: 'pid', other: 'kept' },
      },
    });
    expect(next.gcp.projects).toEqual([
      { id: 'g1', name: 'G1' },
      { id: 'g2', name: 'G2' },
      { id: 'g3', name: 'G3' },
    ]);
    expect(next.gcp.formValues.new_projectId).toBe('');
    expect(next.gcp.formValues.new_serviceAccountKey).toBe('');
    expect(next.gcp.formValues.other).toBe('kept');
    expect(onShowAddProjectChange).toHaveBeenCalledWith(null);
    expect(setSuccess).toHaveBeenCalledWith('providerSettings.projects.addedSuccess');
    expect(setConnecting).toHaveBeenLastCalledWith(null);
  });

  it('skips state updates when result.projects is missing', async () => {
    mocks.api.connect.mockResolvedValueOnce({ success: true });
    const setProviderStates = vi.fn();
    const setError = vi.fn();
    const props = makeProps({
      state: {
        connected: true,
        projects: [{ id: 'g1', name: 'G1' }],
        formValues: { new_serviceAccountKey: '{"k":"v"}' },
      },
      setProviderStates,
      setError,
    });
    const btn = getAddBtn(props);
    await (btn.props as { onClick: () => Promise<void> }).onClick();
    expect(setProviderStates).not.toHaveBeenCalled();
    expect(setError).toHaveBeenCalledWith('providerSettings.connect.failedToAdd');
  });

  it('uses result.error when result.success is false', async () => {
    mocks.api.connect.mockResolvedValueOnce({ success: false, error: 'invalid creds' });
    const setError = vi.fn();
    const props = makeProps({
      state: {
        connected: true,
        projects: [{ id: 'g1', name: 'G1' }],
        formValues: { new_serviceAccountKey: '{"k":"v"}' },
      },
      setError,
    });
    const btn = getAddBtn(props);
    await (btn.props as { onClick: () => Promise<void> }).onClick();
    expect(setError).toHaveBeenCalledWith('invalid creds');
  });

  it('falls back to providerSettings.connect.failedToAdd when no result.error', async () => {
    mocks.api.connect.mockResolvedValueOnce({ success: false });
    const setError = vi.fn();
    const props = makeProps({
      state: {
        connected: true,
        projects: [{ id: 'g1', name: 'G1' }],
        formValues: { new_serviceAccountKey: '{"k":"v"}' },
      },
      setError,
    });
    const btn = getAddBtn(props);
    await (btn.props as { onClick: () => Promise<void> }).onClick();
    expect(setError).toHaveBeenCalledWith('providerSettings.connect.failedToAdd');
  });

  it('captures String(err) when api.connect throws', async () => {
    mocks.api.connect.mockRejectedValueOnce('crash');
    const setError = vi.fn();
    const setConnecting = vi.fn();
    const props = makeProps({
      state: {
        connected: true,
        projects: [{ id: 'g1', name: 'G1' }],
        formValues: { new_serviceAccountKey: '{"k":"v"}' },
      },
      setError,
      setConnecting,
    });
    const btn = getAddBtn(props);
    await (btn.props as { onClick: () => Promise<void> }).onClick();
    expect(setError).toHaveBeenCalledWith('crash');
    expect(setConnecting).toHaveBeenLastCalledWith(null);
  });

  it('defaults projectId to "" when formValues.new_projectId is missing', async () => {
    mocks.api.connect.mockResolvedValueOnce({ success: true, projects: [] });
    const props = makeProps({
      state: {
        connected: true,
        projects: [],
        formValues: { new_serviceAccountKey: '{"x":"y"}' },
      },
    });
    const btn = getAddBtn(props);
    await (btn.props as { onClick: () => Promise<void> }).onClick();
    expect(mocks.api.connect).toHaveBeenCalledWith('gcp', {
      projectId: '',
      serviceAccountKey: '{"x":"y"}',
    });
  });
});
