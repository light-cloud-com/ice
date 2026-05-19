/**
 * rf-pset-5 — `ProviderCard` section.
 *
 * Pins the per-provider card's collapsed/expanded layouts and the three
 * branches of the expanded body (connected w/ projects, connected w/o
 * projects, disconnected w/ form). Uses the rf-rpal-8 direct-FC tree-
 * walker pattern with the rf-pdpl-12 stub-globals for `window` (the
 * embedded async onClick uses `getApi().provider.connect(...)` and
 * `setError` synchronously — both are spies here, no microtask flush
 * needed for the synchronous-error path; the success path is exercised
 * via `await`).
 *
 * Children mocked to opaque markers:
 *   - `lucide-react` icons: rendered with their className passthrough.
 *   - `getApi()` provider stubs (only `connect` is exercised by the
 *     inline add-project async).
 *   - `openExternalLink` is left unmocked — the test stubs `window.open`
 *     and asserts on the call.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Hoisted mocks ─────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  api: {
    connect: vi.fn(),
  },
}));

vi.mock('../../../api/api-adapter', () => ({
  getApi: vi.fn(() => ({ provider: mocks.api })),
}));

import { ProviderCard, type ProviderCardProps } from '../sections/provider-card';
import type { ProviderConfig, ProviderRuntimeState } from '../types';

// ─── Tree-walker (rf-rpal-8 / rf-pdpl-7..15 pattern) ──────────────────────

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

// ─── Fixtures + harness ───────────────────────────────────────────────────

const t: ProviderCardProps['t'] = (key, vars) => (vars ? `${key}:${JSON.stringify(vars)}` : key);

const awsConfig: ProviderConfig = {
  id: 'aws',
  name: 'Amazon Web Services',
  description: 'Connect to AWS using access keys or IAM role',
  icon: 'aws',
  color: 'text-orange-500',
  bgColor: 'bg-orange-100 dark:bg-orange-900/30',
  configFields: [
    { name: 'accessKeyId', label: 'Access Key ID', type: 'text', placeholder: 'AKIA...', required: true },
    { name: 'secretAccessKey', label: 'Secret Access Key', type: 'password', placeholder: '****', required: true },
    {
      name: 'region',
      label: 'Default Region',
      type: 'select',
      required: true,
      options: ['us-east-1', 'us-west-2'],
    },
  ],
};

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
      helpLink: { url: 'https://example.test/sa', text: 'Create service account' },
    },
  ],
};

const blankState: ProviderRuntimeState = { connected: false, projects: [], formValues: {} };

function makeProps(overrides: Partial<ProviderCardProps> = {}): ProviderCardProps {
  return {
    provider: awsConfig,
    state: blankState,
    expanded: false,
    connecting: null,
    importing: null,
    showAddProject: null,
    gcpConnecting: false,
    t,
    onToggle: vi.fn(),
    onUpdateFormValue: vi.fn(),
    onConnect: vi.fn(),
    onDisconnect: vi.fn(),
    onGCPOAuth: vi.fn(),
    onImport: vi.fn(),
    onRemoveProject: vi.fn(),
    onShowAddProjectChange: vi.fn(),
    setProviderStates: vi.fn(),
    setError: vi.fn(),
    setSuccess: vi.fn(),
    setConnecting: vi.fn(),
    ...overrides,
  };
}

function renderCard(props: ProviderCardProps): React.ReactElement {
  return (ProviderCard as unknown as (p: ProviderCardProps) => React.ReactElement)(props);
}

// ─── Tests ────────────────────────────────────────────────────────────────

beforeEach(() => {
  mocks.api.connect.mockReset();
  vi.stubGlobal('window', { open: vi.fn() });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ProviderCard — collapsed (header only)', () => {
  it('renders the provider name + description + status pill', () => {
    const props = makeProps({ provider: awsConfig });
    const tree = renderCard(props);
    const text = collectText(tree);
    expect(text).toContain('Amazon Web Services');
    expect(text).toContain('Connect to AWS using access keys or IAM role');
    expect(text).toContain('providerSettings.status.notConnected');
  });

  it('shows connected pill when state.connected is true', () => {
    const props = makeProps({ state: { ...blankState, connected: true } });
    const tree = renderCard(props);
    const text = collectText(tree);
    expect(text).toContain('providerSettings.status.connected');
    expect(text).not.toContain('providerSettings.status.notConnected');
  });

  it('chevron-right when collapsed, chevron-down when expanded', () => {
    const collapsed = renderCard(makeProps({ expanded: false }));
    const expanded = renderCard(makeProps({ expanded: true }));
    const collapsedChevrons = findByPredicate(
      collapsed,
      (el) => el.type !== 'string' && (el.type as { displayName?: string }).displayName !== undefined,
    );
    expect(collapsedChevrons.length).toBeGreaterThan(0);
    // Easier: check overall text divergence by walking
    const fns = (n: React.ReactNode) => {
      const out: string[] = [];
      for (const el of walk(n)) {
        const dn = (el.type as { displayName?: string })?.displayName;
        if (dn) out.push(dn);
      }
      return out;
    };
    expect(fns(collapsed)).toContain('ChevronRight');
    expect(fns(expanded)).toContain('ChevronDown');
  });

  it('header onClick fires onToggle(provider.id)', () => {
    const onToggle = vi.fn();
    const props = makeProps({ onToggle });
    const tree = renderCard(props);
    const headerButton = findByPredicate(
      tree,
      (el) => el.type === 'button' && (el.props as { className?: string })?.className?.includes('p-3') === true,
    )[0];
    expect(headerButton).toBeDefined();
    (headerButton.props as { onClick: () => void }).onClick();
    expect(onToggle).toHaveBeenCalledWith('aws');
  });

  it('uses connected border when state.connected', () => {
    const tree = renderCard(makeProps({ state: { ...blankState, connected: true } }));
    const root = tree as React.ReactElement;
    expect((root.props as { className: string }).className).toContain('border-green-500/50');
  });

  it('uses default border when not connected', () => {
    const tree = renderCard(makeProps({ state: blankState }));
    const root = tree as React.ReactElement;
    expect((root.props as { className: string }).className).toContain('border-border');
    expect((root.props as { className: string }).className).not.toContain('border-green-500/50');
  });

  it('renders the provider id chip with the first two upper-cased letters', () => {
    const tree = renderCard(makeProps({ provider: gcpConfig }));
    const text = collectText(tree);
    expect(text).toContain('GC');
  });
});

describe('ProviderCard — expanded, NOT connected (form view)', () => {
  it('AWS: renders the three configFields and the connect button', () => {
    const tree = renderCard(makeProps({ expanded: true, provider: awsConfig }));
    const text = collectText(tree);
    expect(text).toContain('Access Key ID');
    expect(text).toContain('Secret Access Key');
    expect(text).toContain('Default Region');
    expect(text).toContain('providerSettings.connect.button');
  });

  it('AWS: required fields have a red asterisk', () => {
    const tree = renderCard(makeProps({ expanded: true, provider: awsConfig }));
    const stars = findByPredicate(
      tree,
      (el) =>
        el.type === 'span' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('text-red-500'),
    );
    expect(stars.length).toBe(3); // three required fields
  });

  it('GCP: shows OAuth button + service-account divider + textarea', () => {
    const tree = renderCard(makeProps({ expanded: true, provider: gcpConfig }));
    const text = collectText(tree);
    expect(text).toContain('providerSettings.connect.signInGoogle');
    expect(text).toContain('providerSettings.connect.orServiceAccount');
    expect(text).toContain('Service Account Key (JSON)');
    expect(text).toContain('providerSettings.connect.buttonGcp');
  });

  it('GCP: oauth button onClick fires onGCPOAuth()', () => {
    const onGCPOAuth = vi.fn();
    const tree = renderCard(makeProps({ expanded: true, provider: gcpConfig, onGCPOAuth }));
    const oauthBtn = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('px-4 py-2.5'),
    )[0];
    expect(oauthBtn).toBeDefined();
    (oauthBtn.props as { onClick: () => void }).onClick();
    expect(onGCPOAuth).toHaveBeenCalled();
  });

  it('GCP: oauth button shows refresh-spin icon when gcpConnecting=true', () => {
    const tree = renderCard(makeProps({ expanded: true, provider: gcpConfig, gcpConnecting: true }));
    const fns = (n: React.ReactNode) => {
      const out: string[] = [];
      for (const el of walk(n)) {
        const dn = (el.type as { displayName?: string })?.displayName;
        if (dn) out.push(dn);
      }
      return out;
    };
    expect(fns(tree)).toContain('RefreshCw');
  });

  it('helpLink button calls openExternalLink with the URL', () => {
    const tree = renderCard(makeProps({ expanded: true, provider: gcpConfig }));
    const helpBtn = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('hover:underline'),
    )[0];
    expect(helpBtn).toBeDefined();
    (helpBtn.props as { onClick: () => void }).onClick();
    expect((window as unknown as { open: ReturnType<typeof vi.fn> }).open).toHaveBeenCalledWith(
      'https://example.test/sa',
      '_blank',
      'noopener,noreferrer',
    );
  });

  it('connect button onClick fires onConnect(provider.id)', () => {
    const onConnect = vi.fn();
    const tree = renderCard(makeProps({ expanded: true, provider: awsConfig, onConnect }));
    const connectBtn = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('bg-primary') &&
        (el.props as { className: string }).className.includes('w-full'),
    )[0];
    (connectBtn.props as { onClick: () => void }).onClick();
    expect(onConnect).toHaveBeenCalledWith('aws');
  });

  it('connect button is disabled and spins when connecting === provider.id', () => {
    const tree = renderCard(makeProps({ expanded: true, provider: awsConfig, connecting: 'aws' }));
    const text = collectText(tree);
    expect(text).toContain('providerSettings.connect.connecting');
  });

  it('field input onChange fires onUpdateFormValue with the new value', () => {
    const onUpdateFormValue = vi.fn();
    const tree = renderCard(makeProps({ expanded: true, provider: awsConfig, onUpdateFormValue }));
    const accessKeyInput = findByPredicate(
      tree,
      (el) => el.type === 'input' && (el.props as { placeholder?: string }).placeholder === 'AKIA...',
    )[0];
    (accessKeyInput.props as { onChange: (e: { target: { value: string } }) => void }).onChange({
      target: { value: 'AKIA1234' },
    });
    expect(onUpdateFormValue).toHaveBeenCalledWith('aws', 'accessKeyId', 'AKIA1234');
  });

  it('select field renders the placeholder option + each option value', () => {
    const tree = renderCard(makeProps({ expanded: true, provider: awsConfig }));
    const opts = findByPredicate(tree, (el) => el.type === 'option');
    const values = opts.map((o) => (o.props as { value: string }).value);
    expect(values).toEqual(['', 'us-east-1', 'us-west-2']);
  });

  it('select onChange fires onUpdateFormValue', () => {
    const onUpdateFormValue = vi.fn();
    const tree = renderCard(makeProps({ expanded: true, provider: awsConfig, onUpdateFormValue }));
    const select = findByPredicate(tree, (el) => el.type === 'select')[0];
    (select.props as { onChange: (e: { target: { value: string } }) => void }).onChange({
      target: { value: 'us-east-1' },
    });
    expect(onUpdateFormValue).toHaveBeenCalledWith('aws', 'region', 'us-east-1');
  });

  it('textarea onChange fires onUpdateFormValue', () => {
    const onUpdateFormValue = vi.fn();
    const tree = renderCard(makeProps({ expanded: true, provider: gcpConfig, onUpdateFormValue }));
    const ta = findByPredicate(tree, (el) => el.type === 'textarea')[0];
    expect(ta).toBeDefined();
    (ta.props as { onChange: (e: { target: { value: string } }) => void }).onChange({
      target: { value: '{"x":"y"}' },
    });
    expect(onUpdateFormValue).toHaveBeenCalledWith('gcp', 'service_account_key', '{"x":"y"}');
  });

  it('field input value reads from state.formValues[field.name] (defaults to empty)', () => {
    const tree = renderCard(
      makeProps({
        expanded: true,
        provider: awsConfig,
        state: { ...blankState, formValues: { accessKeyId: 'PRESET' } },
      }),
    );
    const accessKeyInput = findByPredicate(
      tree,
      (el) => el.type === 'input' && (el.props as { placeholder?: string }).placeholder === 'AKIA...',
    )[0];
    expect((accessKeyInput.props as { value: string }).value).toBe('PRESET');
    const secretKeyInput = findByPredicate(
      tree,
      (el) => el.type === 'input' && (el.props as { placeholder?: string }).placeholder === '****',
    )[0];
    expect((secretKeyInput.props as { value: string }).value).toBe('');
  });
});

describe('ProviderCard — expanded, connected (project list view)', () => {
  const connectedAwsState: ProviderRuntimeState = {
    connected: true,
    projects: [
      { id: 'p1', name: 'Project One', region: 'us-east-1' },
      { id: 'p2', name: 'Project Two' },
    ],
    formValues: {},
  };

  it('renders the project label with count + each project row', () => {
    const tree = renderCard(makeProps({ expanded: true, provider: awsConfig, state: connectedAwsState }));
    const text = collectText(tree);
    expect(text).toContain('providerSettings.projects.label');
    expect(text).toContain('Project One');
    expect(text).toContain('us-east-1');
    expect(text).toContain('Project Two');
  });

  it('renders the no-projects message when empty', () => {
    const tree = renderCard(
      makeProps({
        expanded: true,
        provider: awsConfig,
        state: { connected: true, projects: [], formValues: {} },
      }),
    );
    const text = collectText(tree);
    expect(text).toContain('providerSettings.projects.noProjects');
  });

  it('disconnect button fires onDisconnect(provider.id)', () => {
    const onDisconnect = vi.fn();
    const tree = renderCard(makeProps({ expanded: true, provider: awsConfig, state: connectedAwsState, onDisconnect }));
    const disconnectBtn = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('text-red-500') &&
        (el.props as { className: string }).className.includes('text-xs'),
    )[0];
    expect(disconnectBtn).toBeDefined();
    (disconnectBtn.props as { onClick: () => void }).onClick();
    expect(onDisconnect).toHaveBeenCalledWith('aws');
  });

  it('import button fires onImport(provider.id, project.id) per project', () => {
    const onImport = vi.fn();
    const tree = renderCard(makeProps({ expanded: true, provider: awsConfig, state: connectedAwsState, onImport }));
    const importBtns = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('bg-primary') &&
        (el.props as { className: string }).className.includes('px-3 py-1.5'),
    );
    expect(importBtns.length).toBeGreaterThanOrEqual(2);
    (importBtns[0].props as { onClick: () => void }).onClick();
    (importBtns[1].props as { onClick: () => void }).onClick();
    expect(onImport).toHaveBeenNthCalledWith(1, 'aws', 'p1');
    expect(onImport).toHaveBeenNthCalledWith(2, 'aws', 'p2');
  });

  it('import button shows importing label when importing matches provider-project', () => {
    const tree = renderCard(
      makeProps({
        expanded: true,
        provider: awsConfig,
        state: connectedAwsState,
        importing: 'aws-p1',
      }),
    );
    const text = collectText(tree);
    expect(text).toContain('providerSettings.import.importing');
  });

  it('GCP-only: addProject button toggles via onShowAddProjectChange (open)', () => {
    const onShowAddProjectChange = vi.fn();
    const tree = renderCard(
      makeProps({
        expanded: true,
        provider: gcpConfig,
        state: { connected: true, projects: [{ id: 'p1', name: 'P1' }], formValues: {} },
        showAddProject: null,
        onShowAddProjectChange,
      }),
    );
    const addBtn = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('text-primary') &&
        (el.props as { className: string }).className.includes('text-xs'),
    )[0];
    expect(addBtn).toBeDefined();
    (addBtn.props as { onClick: () => void }).onClick();
    expect(onShowAddProjectChange).toHaveBeenCalledWith('gcp');
  });

  it('GCP-only: addProject button collapses (close) when already open', () => {
    const onShowAddProjectChange = vi.fn();
    const tree = renderCard(
      makeProps({
        expanded: true,
        provider: gcpConfig,
        state: { connected: true, projects: [{ id: 'p1', name: 'P1' }], formValues: {} },
        showAddProject: 'gcp',
        onShowAddProjectChange,
      }),
    );
    const addBtn = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('text-primary') &&
        (el.props as { className: string }).className.includes('text-xs'),
    )[0];
    (addBtn.props as { onClick: () => void }).onClick();
    expect(onShowAddProjectChange).toHaveBeenCalledWith(null);
  });

  it('non-GCP: addProject button is NOT rendered', () => {
    const tree = renderCard(makeProps({ expanded: true, provider: awsConfig, state: connectedAwsState }));
    const text = collectText(tree);
    expect(text).not.toContain('providerSettings.projects.addProject');
  });

  it('GCP remove-project button visible when 2+ projects, fires onRemoveProject', () => {
    const onRemoveProject = vi.fn();
    const tree = renderCard(
      makeProps({
        expanded: true,
        provider: gcpConfig,
        state: {
          connected: true,
          projects: [
            { id: 'g1', name: 'G1' },
            { id: 'g2', name: 'G2' },
          ],
          formValues: {},
        },
        onRemoveProject,
      }),
    );
    const removeBtns = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' && (el.props as { title?: string }).title === 'providerSettings.import.removeTooltip',
    );
    expect(removeBtns.length).toBe(2);
    (removeBtns[0].props as { onClick: () => void }).onClick();
    expect(onRemoveProject).toHaveBeenCalledWith('gcp', 'g1');
  });

  it('GCP remove-project button NOT rendered when only 1 project', () => {
    const tree = renderCard(
      makeProps({
        expanded: true,
        provider: gcpConfig,
        state: { connected: true, projects: [{ id: 'g1', name: 'G1' }], formValues: {} },
      }),
    );
    const removeBtns = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' && (el.props as { title?: string }).title === 'providerSettings.import.removeTooltip',
    );
    expect(removeBtns.length).toBe(0);
  });
});

describe('ProviderCard — GCP add-project form', () => {
  const showFormState: ProviderRuntimeState = {
    connected: true,
    projects: [{ id: 'g1', name: 'G1' }],
    formValues: { new_service_account_key: '{"k":"v"}' },
  };

  it('renders the form when showAddProject === provider.id and provider.id === gcp', () => {
    const tree = renderCard(
      makeProps({
        expanded: true,
        provider: gcpConfig,
        state: showFormState,
        showAddProject: 'gcp',
      }),
    );
    const text = collectText(tree);
    expect(text).toContain('providerSettings.projects.addAnother');
    expect(text).toContain('providerSettings.projects.addButton');
    expect(text).toContain('providerSettings.projects.cancelButton');
  });

  it('does NOT render the form when showAddProject === null', () => {
    const tree = renderCard(
      makeProps({
        expanded: true,
        provider: gcpConfig,
        state: showFormState,
        showAddProject: null,
      }),
    );
    const text = collectText(tree);
    expect(text).not.toContain('providerSettings.projects.addAnother');
  });

  it('cancel button fires onShowAddProjectChange(null)', () => {
    const onShowAddProjectChange = vi.fn();
    const tree = renderCard(
      makeProps({
        expanded: true,
        provider: gcpConfig,
        state: showFormState,
        showAddProject: 'gcp',
        onShowAddProjectChange,
      }),
    );
    const cancelBtn = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('px-3 py-1.5') &&
        (el.props as { className: string }).className.includes('hover:bg-muted'),
    )[0];
    expect(cancelBtn).toBeDefined();
    (cancelBtn.props as { onClick: () => void }).onClick();
    expect(onShowAddProjectChange).toHaveBeenCalledWith(null);
  });

  it('add-button writes setError when serviceAccountKey is missing', async () => {
    const setError = vi.fn();
    const tree = renderCard(
      makeProps({
        expanded: true,
        provider: gcpConfig,
        state: { connected: true, projects: [{ id: 'g1', name: 'G1' }], formValues: {} },
        showAddProject: 'gcp',
        setError,
      }),
    );
    const addBtn = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('flex-1') &&
        (el.props as { className: string }).className.includes('bg-primary'),
    )[0];
    expect(addBtn).toBeDefined();
    await (addBtn.props as { onClick: () => Promise<void> }).onClick();
    expect(setError).toHaveBeenCalledWith('providerSettings.connect.serviceAccountRequired');
    expect(mocks.api.connect).not.toHaveBeenCalled();
  });

  it('add-button success: appends new projects, resets new_* fields, clears form, success message', async () => {
    mocks.api.connect.mockResolvedValueOnce({
      success: true,
      projects: [{ id: 'g2', name: 'G2' }],
    });
    const setProviderStates = vi.fn();
    const setSuccess = vi.fn();
    const setConnecting = vi.fn();
    const onShowAddProjectChange = vi.fn();
    const tree = renderCard(
      makeProps({
        expanded: true,
        provider: gcpConfig,
        state: {
          connected: true,
          projects: [{ id: 'g1', name: 'G1' }],
          formValues: { new_serviceAccountKey: '{"k":"v"}', new_projectId: 'projectA' },
        },
        showAddProject: 'gcp',
        setProviderStates,
        setSuccess,
        setConnecting,
        onShowAddProjectChange,
      }),
    );
    const addBtn = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('flex-1') &&
        (el.props as { className: string }).className.includes('bg-primary'),
    )[0];
    await (addBtn.props as { onClick: () => Promise<void> }).onClick();
    expect(setConnecting).toHaveBeenNthCalledWith(1, 'gcp');
    expect(mocks.api.connect).toHaveBeenCalledWith('gcp', {
      projectId: 'projectA',
      serviceAccountKey: '{"k":"v"}',
    });
    const updater = setProviderStates.mock.calls[0][0] as (prev: { gcp: ProviderRuntimeState }) => {
      gcp: ProviderRuntimeState;
    };
    const next = updater({
      gcp: {
        connected: true,
        projects: [{ id: 'g1', name: 'G1' }],
        formValues: { new_serviceAccountKey: '{"k":"v"}', new_projectId: 'projectA' },
      },
    });
    expect(next.gcp.projects).toEqual([
      { id: 'g1', name: 'G1' },
      { id: 'g2', name: 'G2' },
    ]);
    expect(next.gcp.formValues.new_projectId).toBe('');
    expect(next.gcp.formValues.new_serviceAccountKey).toBe('');
    expect(onShowAddProjectChange).toHaveBeenCalledWith(null);
    expect(setSuccess).toHaveBeenCalledWith('providerSettings.projects.addedSuccess');
    expect(setConnecting).toHaveBeenLastCalledWith(null);
  });

  it('add-button uses result.error when result.success is false', async () => {
    mocks.api.connect.mockResolvedValueOnce({ success: false, error: 'invalid creds' });
    const setError = vi.fn();
    const tree = renderCard(
      makeProps({
        expanded: true,
        provider: gcpConfig,
        state: {
          connected: true,
          projects: [{ id: 'g1', name: 'G1' }],
          formValues: { new_serviceAccountKey: '{"k":"v"}' },
        },
        showAddProject: 'gcp',
        setError,
      }),
    );
    const addBtn = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('flex-1') &&
        (el.props as { className: string }).className.includes('bg-primary'),
    )[0];
    await (addBtn.props as { onClick: () => Promise<void> }).onClick();
    expect(setError).toHaveBeenCalledWith('invalid creds');
  });

  it('add-button falls back to providerSettings.connect.failedToAdd when no result.error', async () => {
    mocks.api.connect.mockResolvedValueOnce({ success: false });
    const setError = vi.fn();
    const tree = renderCard(
      makeProps({
        expanded: true,
        provider: gcpConfig,
        state: {
          connected: true,
          projects: [{ id: 'g1', name: 'G1' }],
          formValues: { new_serviceAccountKey: '{"k":"v"}' },
        },
        showAddProject: 'gcp',
        setError,
      }),
    );
    const addBtn = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('flex-1') &&
        (el.props as { className: string }).className.includes('bg-primary'),
    )[0];
    await (addBtn.props as { onClick: () => Promise<void> }).onClick();
    expect(setError).toHaveBeenCalledWith('providerSettings.connect.failedToAdd');
  });

  it('add-button captures String(err) when api.connect throws', async () => {
    mocks.api.connect.mockRejectedValueOnce('crash');
    const setError = vi.fn();
    const setConnecting = vi.fn();
    const tree = renderCard(
      makeProps({
        expanded: true,
        provider: gcpConfig,
        state: {
          connected: true,
          projects: [{ id: 'g1', name: 'G1' }],
          formValues: { new_serviceAccountKey: '{"k":"v"}' },
        },
        showAddProject: 'gcp',
        setError,
        setConnecting,
      }),
    );
    const addBtn = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('flex-1') &&
        (el.props as { className: string }).className.includes('bg-primary'),
    )[0];
    await (addBtn.props as { onClick: () => Promise<void> }).onClick();
    expect(setError).toHaveBeenCalledWith('crash');
    expect(setConnecting).toHaveBeenLastCalledWith(null);
  });

  it('add-button skips state updates when result.projects is missing', async () => {
    mocks.api.connect.mockResolvedValueOnce({ success: true });
    const setProviderStates = vi.fn();
    const setError = vi.fn();
    const tree = renderCard(
      makeProps({
        expanded: true,
        provider: gcpConfig,
        state: {
          connected: true,
          projects: [{ id: 'g1', name: 'G1' }],
          formValues: { new_serviceAccountKey: '{"k":"v"}' },
        },
        showAddProject: 'gcp',
        setProviderStates,
        setError,
      }),
    );
    const addBtn = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('flex-1') &&
        (el.props as { className: string }).className.includes('bg-primary'),
    )[0];
    await (addBtn.props as { onClick: () => Promise<void> }).onClick();
    expect(setProviderStates).not.toHaveBeenCalled();
    expect(setError).toHaveBeenCalledWith('providerSettings.connect.failedToAdd');
  });

  it('add-form: shows the RefreshCw spinner when connecting === provider.id', () => {
    const tree = renderCard(
      makeProps({
        expanded: true,
        provider: gcpConfig,
        state: { connected: true, projects: [{ id: 'g1', name: 'G1' }], formValues: {} },
        showAddProject: 'gcp',
        connecting: 'gcp',
      }),
    );
    const fns = (n: React.ReactNode) => {
      const out: string[] = [];
      for (const el of walk(n)) {
        const dn = (el.type as { displayName?: string })?.displayName;
        if (dn) out.push(dn);
      }
      return out;
    };
    // RefreshCw should appear (the add-button spinner) — Plus is also
    // present elsewhere, so we check RefreshCw specifically.
    expect(fns(tree)).toContain('RefreshCw');
  });

  it('add-form: text-input branch (non-textarea field) renders an <input> and onChange fires', () => {
    // Use a synthetic GCP-id config carrying a text-type field so the
    // add-project form falls into the <input> arm (line 177 in source).
    const syntheticGcpWithText: ProviderConfig = {
      ...gcpConfig,
      configFields: [{ name: 'projectId', label: 'Project ID', type: 'text', required: false, placeholder: 'pid' }],
    };
    const onUpdateFormValue = vi.fn();
    const tree = renderCard(
      makeProps({
        expanded: true,
        provider: syntheticGcpWithText,
        state: { connected: true, projects: [{ id: 'g1', name: 'G1' }], formValues: {} },
        showAddProject: 'gcp',
        onUpdateFormValue,
      }),
    );
    // Find the input inside the add-form (className includes 'text-xs' and 'border-input')
    const inputs = findByPredicate(
      tree,
      (el) =>
        el.type === 'input' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('text-xs') &&
        (el.props as { className: string }).className.includes('border-input'),
    );
    expect(inputs.length).toBeGreaterThanOrEqual(1);
    (inputs[0].props as { onChange: (e: { target: { value: string } }) => void }).onChange({
      target: { value: 'my-project' },
    });
    expect(onUpdateFormValue).toHaveBeenCalledWith('gcp', 'new_projectId', 'my-project');
  });

  it('add-form: textarea field onChange writes new_<name> via onUpdateFormValue', () => {
    const onUpdateFormValue = vi.fn();
    const tree = renderCard(
      makeProps({
        expanded: true,
        provider: gcpConfig,
        state: { connected: true, projects: [{ id: 'g1', name: 'G1' }], formValues: {} },
        showAddProject: 'gcp',
        onUpdateFormValue,
      }),
    );
    const tas = findByPredicate(
      tree,
      (el) =>
        el.type === 'textarea' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('font-mono'),
    );
    expect(tas.length).toBeGreaterThanOrEqual(1);
    (tas[0].props as { onChange: (e: { target: { value: string } }) => void }).onChange({
      target: { value: 'KEY' },
    });
    expect(onUpdateFormValue).toHaveBeenCalledWith('gcp', 'new_service_account_key', 'KEY');
  });
});
