/**
 * rf-pset-4 — `useProviderHandlers` hook bundle.
 *
 * Pins the five async handlers (`handleGCPOAuth`, `handleConnect`,
 * `handleDisconnect`, `handleRemoveProject`, `handleImport`) plus the
 * GCP-OAuth wiring extracted out of the orchestrator. The test renders
 * the hook via a `Probe` FC + `renderToString` (rf-pdpl-21 pattern) and
 * mocks:
 *
 *   - `react.useEffect` — captured into a `mocks.effects` array so the
 *     OAuth-error-sync effect can be fired explicitly,
 *   - `useGCPOAuth` — returns a hoisted controller whose `connect()` is
 *     a spy and whose `error` field is mutable across renders,
 *   - `getApi()` — returns a stub provider API (isConnected, getProjects,
 *     getCredentials, connect, disconnect, import, saveCredentials).
 *
 * Coverage target: 100% on the hook module's public surface.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks ──────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  // useEffect captures
  effects: [] as Array<{ cb: () => void | (() => void); deps: unknown[] }>,
  // useGCPOAuth controller — mutable so we can flip `error` between renders
  gcp: {
    connect: vi.fn(),
    connecting: false as boolean,
    error: null as string | null,
  },
  // The reload callback supplied by the hook to useGCPOAuth — stashed here
  // so tests can fire it directly.
  capturedReload: null as null | (() => Promise<void>),
  // Provider API stubs — `vi.fn()` (no generics) so each test can rewire
  // return values without fighting vitest 4's overload narrowing on
  // `mockResolvedValueOnce`. The type-shape contract still flows through
  // the source code's import of `getApi().provider`.
  api: {
    isConnected: vi.fn(),
    getProjects: vi.fn(),
    getCredentials: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    saveCredentials: vi.fn(),
    import: vi.fn(),
  },
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  const patchedUseEffect = vi.fn((cb: () => void | (() => void), deps?: unknown[]) => {
    mocks.effects.push({ cb, deps: deps ?? [] });
  });
  return { ...actual, useEffect: patchedUseEffect };
});

vi.mock('../../../api/api-adapter', () => ({
  getApi: vi.fn(() => ({ provider: mocks.api })),
}));

vi.mock('../../../hooks/use-gcp-oauth', () => ({
  useGCPOAuth: vi.fn((reload: () => Promise<void>) => {
    mocks.capturedReload = reload;
    return mocks.gcp;
  }),
}));

vi.mock('@ice/core/resources', () => ({
  getCloudProvider: vi.fn(() => undefined),
}));

import { useProviderHandlers } from '../hooks/use-provider-handlers';
import type { ProviderStatesMap } from '../types';

// ─── Probe harness ──────────────────────────────────────────────────────────

interface ProbeProps {
  input: Parameters<typeof useProviderHandlers>[0];
  capture: (out: ReturnType<typeof useProviderHandlers>) => void;
}

const Probe: React.FC<ProbeProps> = ({ input, capture }) => {
  const out = useProviderHandlers(input);
  capture(out);
  return null;
};

interface BuildOpts {
  providerStates?: ProviderStatesMap;
  onImportComplete?: (graph: unknown) => void;
}

function buildInput(opts: BuildOpts = {}): {
  input: Parameters<typeof useProviderHandlers>[0];
  setProviderStates: ReturnType<typeof vi.fn>;
  setError: ReturnType<typeof vi.fn>;
  setSuccess: ReturnType<typeof vi.fn>;
  setConnecting: ReturnType<typeof vi.fn>;
  setImporting: ReturnType<typeof vi.fn>;
  onClose: ReturnType<typeof vi.fn>;
  t: ReturnType<typeof vi.fn>;
} {
  const setProviderStates = vi.fn();
  const setError = vi.fn();
  const setSuccess = vi.fn();
  const setConnecting = vi.fn();
  const setImporting = vi.fn();
  const onClose = vi.fn();
  const t = vi.fn((key: string, vars?: Record<string, unknown>) => (vars ? `${key}:${JSON.stringify(vars)}` : key));
  const input: Parameters<typeof useProviderHandlers>[0] = {
    t,
    providerStates: opts.providerStates ?? {},
    setProviderStates,
    setError,
    setSuccess,
    setConnecting,
    setImporting,
    onClose,
    onImportComplete: opts.onImportComplete,
  };
  return { input, setProviderStates, setError, setSuccess, setConnecting, setImporting, onClose, t };
}

function runHook(input: Parameters<typeof useProviderHandlers>[0]): ReturnType<typeof useProviderHandlers> {
  let captured: ReturnType<typeof useProviderHandlers> | null = null;
  // Invoke the FC directly (rf-pdpl-7 / rf-rpal-8 pattern). The Probe
  // closes over `captured` and writes it on render.
  (Probe as unknown as (p: ProbeProps) => React.ReactNode)({
    input,
    capture: (o) => {
      captured = o;
    },
  });
  if (!captured) throw new Error('Probe did not capture hook output');
  return captured;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  mocks.effects.length = 0;
  mocks.gcp.connect.mockReset();
  mocks.gcp.connecting = false;
  mocks.gcp.error = null;
  mocks.capturedReload = null;
  mocks.api.isConnected.mockReset();
  mocks.api.getProjects.mockReset();
  mocks.api.getCredentials.mockReset();
  mocks.api.connect.mockReset();
  mocks.api.disconnect.mockReset();
  mocks.api.saveCredentials.mockReset();
  mocks.api.import.mockReset();
});

describe('useProviderHandlers — output shape', () => {
  it('returns the five handlers, gcpOAuth controller, and reloadGCPState', () => {
    const { input } = buildInput();
    const out = runHook(input);
    expect(typeof out.handleGCPOAuth).toBe('function');
    expect(typeof out.handleConnect).toBe('function');
    expect(typeof out.handleDisconnect).toBe('function');
    expect(typeof out.handleRemoveProject).toBe('function');
    expect(typeof out.handleImport).toBe('function');
    expect(out.gcpOAuth).toBe(mocks.gcp);
    expect(typeof out.reloadGCPState).toBe('function');
  });

  it('subscribes to gcpOAuth via useGCPOAuth(reloadGCPState)', () => {
    const { input } = buildInput();
    runHook(input);
    expect(mocks.capturedReload).toBeTypeOf('function');
  });

  it('registers a useEffect for GCP OAuth error sync (deps: [gcpOAuth.error])', () => {
    const { input } = buildInput();
    runHook(input);
    expect(mocks.effects).toHaveLength(1);
    expect(mocks.effects[0].deps).toEqual([null]);
  });
});

describe('useProviderHandlers — handleGCPOAuth', () => {
  it('clears error/success and triggers gcpOAuth.connect()', () => {
    const { input, setError, setSuccess } = buildInput();
    const out = runHook(input);
    out.handleGCPOAuth();
    expect(setError).toHaveBeenCalledWith(null);
    expect(setSuccess).toHaveBeenCalledWith(null);
    expect(mocks.gcp.connect).toHaveBeenCalledTimes(1);
  });
});

describe('useProviderHandlers — OAuth-error-sync effect', () => {
  it('calls setError(error) when gcpOAuth.error is truthy', () => {
    mocks.gcp.error = 'oauth-failed';
    const { input, setError } = buildInput();
    runHook(input);
    const effect = mocks.effects[0];
    effect.cb();
    expect(setError).toHaveBeenCalledWith('oauth-failed');
  });

  it('does NOT call setError when gcpOAuth.error is null', () => {
    mocks.gcp.error = null;
    const { input, setError } = buildInput();
    runHook(input);
    const effect = mocks.effects[0];
    effect.cb();
    expect(setError).not.toHaveBeenCalled();
  });
});

describe('useProviderHandlers — reloadGCPState', () => {
  it('writes the connected-to-cloud success and re-fetches projects when isConnected', async () => {
    mocks.api.isConnected.mockResolvedValueOnce(true);
    mocks.api.getProjects.mockResolvedValueOnce([{ id: 'g1', name: 'G1' }]);
    const { input, setSuccess, setProviderStates, t } = buildInput();
    runHook(input);
    await mocks.capturedReload?.();
    expect(t).toHaveBeenCalledWith('providerSettings.connect.connectedToCloud');
    expect(setSuccess).toHaveBeenCalledWith('providerSettings.connect.connectedToCloud');
    expect(mocks.api.isConnected).toHaveBeenCalledWith('gcp');
    expect(mocks.api.getProjects).toHaveBeenCalledWith('gcp');
    // Updater fn applied to a sample prev — verifies the projects slot
    const updater = setProviderStates.mock.calls[0][0] as (prev: ProviderStatesMap) => ProviderStatesMap;
    const next = updater({ gcp: { connected: false, projects: [], formValues: { stale: 'x' } } });
    expect(next.gcp).toEqual({ connected: true, projects: [{ id: 'g1', name: 'G1' }], formValues: {} });
  });

  it('skips getProjects and uses [] when isConnected resolves false', async () => {
    mocks.api.isConnected.mockResolvedValueOnce(false);
    const { input, setProviderStates } = buildInput();
    runHook(input);
    await mocks.capturedReload?.();
    expect(mocks.api.getProjects).not.toHaveBeenCalled();
    const updater = setProviderStates.mock.calls[0][0] as (prev: ProviderStatesMap) => ProviderStatesMap;
    const next = updater({});
    expect(next.gcp.projects).toEqual([]);
    expect(next.gcp.connected).toBe(true);
  });

  it('falls back to [] when getProjects resolves null', async () => {
    mocks.api.isConnected.mockResolvedValueOnce(true);
    mocks.api.getProjects.mockResolvedValueOnce(null as unknown as Array<{ id: string; name: string }>);
    const { input, setProviderStates } = buildInput();
    runHook(input);
    await mocks.capturedReload?.();
    const updater = setProviderStates.mock.calls[0][0] as (prev: ProviderStatesMap) => ProviderStatesMap;
    const next = updater({});
    expect(next.gcp.projects).toEqual([]);
  });
});

describe('useProviderHandlers — handleConnect', () => {
  it('writes connecting/clears error+success, validates required fields, calls api.connect, and applies success', async () => {
    mocks.api.connect.mockResolvedValueOnce({
      success: true,
      projects: [{ id: 'p1', name: 'P1' }],
    });
    const { input, setConnecting, setError, setSuccess, setProviderStates, t } = buildInput({
      providerStates: {
        aws: {
          connected: false,
          projects: [],
          formValues: {
            accessKeyId: 'AKIA',
            secretAccessKey: 'SECRET',
            region: 'us-east-1',
          },
        },
      },
    });
    const out = runHook(input);
    await out.handleConnect('aws');
    expect(setConnecting).toHaveBeenNthCalledWith(1, 'aws');
    expect(setConnecting).toHaveBeenLastCalledWith(null);
    expect(setError).toHaveBeenCalledWith(null);
    expect(setSuccess).toHaveBeenCalledWith(null);
    expect(mocks.api.connect).toHaveBeenCalledWith('aws', {
      accessKeyId: 'AKIA',
      secretAccessKey: 'SECRET',
      region: 'us-east-1',
    });
    expect(t).toHaveBeenCalledWith('providerSettings.connect.connectedTo', expect.any(Object));
    // Updater applies success state
    const updater = setProviderStates.mock.calls[0][0] as (prev: ProviderStatesMap) => ProviderStatesMap;
    const next = updater({ aws: { connected: false, projects: [], formValues: { kept: 'k' } } });
    expect(next.aws.connected).toBe(true);
    expect(next.aws.projects).toEqual([{ id: 'p1', name: 'P1' }]);
    // formValues are preserved (spread)
    expect(next.aws.formValues).toEqual({ kept: 'k' });
  });

  it('throws and captures err.message when a required field is missing', async () => {
    const { input, setError } = buildInput({
      providerStates: { aws: { connected: false, projects: [], formValues: {} } },
    });
    const out = runHook(input);
    await out.handleConnect('aws');
    expect(setError).toHaveBeenCalledWith('Access Key ID is required');
    expect(mocks.api.connect).not.toHaveBeenCalled();
  });

  it('uses [] when result.projects is undefined', async () => {
    mocks.api.connect.mockResolvedValueOnce({ success: true });
    const { input, setProviderStates } = buildInput({
      providerStates: {
        aws: {
          connected: false,
          projects: [],
          formValues: {
            accessKeyId: 'AKIA',
            secretAccessKey: 'SECRET',
            region: 'us-east-1',
          },
        },
      },
    });
    const out = runHook(input);
    await out.handleConnect('aws');
    const updater = setProviderStates.mock.calls[0][0] as (prev: ProviderStatesMap) => ProviderStatesMap;
    const next = updater({ aws: { connected: false, projects: [], formValues: {} } });
    expect(next.aws.projects).toEqual([]);
  });

  it('throws Connection failed when result.success is false and result.error is missing', async () => {
    mocks.api.connect.mockResolvedValueOnce({ success: false });
    const { input, setError } = buildInput({
      providerStates: {
        aws: {
          connected: false,
          projects: [],
          formValues: {
            accessKeyId: 'AKIA',
            secretAccessKey: 'SECRET',
            region: 'us-east-1',
          },
        },
      },
    });
    const out = runHook(input);
    await out.handleConnect('aws');
    expect(setError).toHaveBeenCalledWith('Connection failed');
  });

  it('uses result.error when result.success is false', async () => {
    mocks.api.connect.mockResolvedValueOnce({ success: false, error: 'bad creds' });
    const { input, setError } = buildInput({
      providerStates: {
        aws: {
          connected: false,
          projects: [],
          formValues: {
            accessKeyId: 'AKIA',
            secretAccessKey: 'SECRET',
            region: 'us-east-1',
          },
        },
      },
    });
    const out = runHook(input);
    await out.handleConnect('aws');
    expect(setError).toHaveBeenCalledWith('bad creds');
  });

  it('extracts err.response.data.error first when api.connect throws an axios-like error', async () => {
    mocks.api.connect.mockRejectedValueOnce({
      response: { data: { error: 'axios-error', message: 'axios-message' } },
      message: 'top-message',
    });
    const { input, setError } = buildInput({
      providerStates: {
        aws: {
          connected: false,
          projects: [],
          formValues: {
            accessKeyId: 'AKIA',
            secretAccessKey: 'SECRET',
            region: 'us-east-1',
          },
        },
      },
    });
    const out = runHook(input);
    await out.handleConnect('aws');
    expect(setError).toHaveBeenCalledWith('axios-error');
  });

  it('falls back to err.response.data.message when err.response.data.error missing', async () => {
    mocks.api.connect.mockRejectedValueOnce({
      response: { data: { message: 'axios-message' } },
      message: 'top-message',
    });
    const { input, setError } = buildInput({
      providerStates: {
        aws: {
          connected: false,
          projects: [],
          formValues: {
            accessKeyId: 'AKIA',
            secretAccessKey: 'SECRET',
            region: 'us-east-1',
          },
        },
      },
    });
    const out = runHook(input);
    await out.handleConnect('aws');
    expect(setError).toHaveBeenCalledWith('axios-message');
  });

  it('falls back to err.message when no axios payload', async () => {
    mocks.api.connect.mockRejectedValueOnce(new Error('plain'));
    const { input, setError } = buildInput({
      providerStates: {
        aws: {
          connected: false,
          projects: [],
          formValues: {
            accessKeyId: 'AKIA',
            secretAccessKey: 'SECRET',
            region: 'us-east-1',
          },
        },
      },
    });
    const out = runHook(input);
    await out.handleConnect('aws');
    expect(setError).toHaveBeenCalledWith('plain');
  });

  it('falls back to String(err) when err has no message field', async () => {
    mocks.api.connect.mockRejectedValueOnce('raw-string');
    const { input, setError } = buildInput({
      providerStates: {
        aws: {
          connected: false,
          projects: [],
          formValues: {
            accessKeyId: 'AKIA',
            secretAccessKey: 'SECRET',
            region: 'us-east-1',
          },
        },
      },
    });
    const out = runHook(input);
    await out.handleConnect('aws');
    expect(setError).toHaveBeenCalledWith('raw-string');
  });

  it('handles unknown providerId by skipping the field-validation loop', async () => {
    mocks.api.connect.mockResolvedValueOnce({ success: true, projects: [] });
    const { input, t } = buildInput({
      providerStates: { unknown: { connected: false, projects: [], formValues: {} } },
    });
    const out = runHook(input);
    await out.handleConnect('unknown');
    // The success message uses providerId fallback when config?.name is undefined
    expect(t).toHaveBeenCalledWith(
      'providerSettings.connect.connectedTo',
      expect.objectContaining({ name: 'unknown' }),
    );
  });

  it('treats empty providerStates entry as empty formValues object', async () => {
    mocks.api.connect.mockResolvedValueOnce({ success: true });
    const { input } = buildInput();
    const out = runHook(input);
    await out.handleConnect('aws');
    // First required field "Access Key ID" missing -> error path
    expect(mocks.api.connect).not.toHaveBeenCalled();
  });
});

describe('useProviderHandlers — handleDisconnect', () => {
  it('calls api.disconnect, clears state for the provider, and writes success', async () => {
    mocks.api.disconnect.mockResolvedValueOnce(undefined);
    const { input, setSuccess, setProviderStates, t } = buildInput();
    const out = runHook(input);
    await out.handleDisconnect('gcp');
    expect(mocks.api.disconnect).toHaveBeenCalledWith('gcp');
    expect(t).toHaveBeenCalledWith('providerSettings.connect.disconnectedSuccess');
    expect(setSuccess).toHaveBeenCalledWith('providerSettings.connect.disconnectedSuccess');
    const updater = setProviderStates.mock.calls[0][0] as (prev: ProviderStatesMap) => ProviderStatesMap;
    const next = updater({ gcp: { connected: true, projects: [{ id: 'p', name: 'P' }], formValues: { x: 'y' } } });
    expect(next.gcp).toEqual({ connected: false, projects: [], formValues: {} });
  });

  it('captures Error.message when api.disconnect throws an Error', async () => {
    mocks.api.disconnect.mockRejectedValueOnce(new Error('boom'));
    const { input, setError } = buildInput();
    const out = runHook(input);
    await out.handleDisconnect('gcp');
    expect(setError).toHaveBeenCalledWith('boom');
  });

  it('captures String(err) when api.disconnect throws a non-Error', async () => {
    mocks.api.disconnect.mockRejectedValueOnce('crash');
    const { input, setError } = buildInput();
    const out = runHook(input);
    await out.handleDisconnect('gcp');
    expect(setError).toHaveBeenCalledWith('crash');
  });
});

describe('useProviderHandlers — handleRemoveProject', () => {
  it('filters the project out of state, persists remaining projects, and writes success', async () => {
    mocks.api.saveCredentials.mockResolvedValueOnce(undefined);
    const { input, setSuccess, setProviderStates, t } = buildInput({
      providerStates: {
        gcp: {
          connected: true,
          projects: [
            { id: 'p1', name: 'P1' },
            { id: 'p2', name: 'P2' },
          ],
          formValues: { service_account_key: '{}' },
        },
      },
    });
    const out = runHook(input);
    await out.handleRemoveProject('gcp', 'p1');
    const updater = setProviderStates.mock.calls[0][0] as (prev: ProviderStatesMap) => ProviderStatesMap;
    const next = updater({
      gcp: {
        connected: true,
        projects: [
          { id: 'p1', name: 'P1' },
          { id: 'p2', name: 'P2' },
        ],
        formValues: { service_account_key: '{}' },
      },
    });
    expect(next.gcp.projects).toEqual([{ id: 'p2', name: 'P2' }]);
    // saveCredentials uses the prior providerStates (not the new map)
    expect(mocks.api.saveCredentials).toHaveBeenCalledWith('gcp', {
      service_account_key: '{}',
      _projects: JSON.stringify([{ id: 'p2', name: 'P2' }]),
    });
    expect(t).toHaveBeenCalledWith('providerSettings.projects.removed');
    expect(setSuccess).toHaveBeenCalledWith('providerSettings.projects.removed');
  });

  it('captures err.message when saveCredentials throws an Error', async () => {
    mocks.api.saveCredentials.mockRejectedValueOnce(new Error('save-fail'));
    const { input, setError } = buildInput({
      providerStates: { gcp: { connected: true, projects: [{ id: 'p1', name: 'P1' }], formValues: {} } },
    });
    const out = runHook(input);
    await out.handleRemoveProject('gcp', 'p1');
    expect(setError).toHaveBeenCalledWith('save-fail');
  });

  it('captures String(err) when saveCredentials throws a non-Error', async () => {
    mocks.api.saveCredentials.mockRejectedValueOnce('save-bad');
    const { input, setError } = buildInput({
      providerStates: { gcp: { connected: true, projects: [{ id: 'p1', name: 'P1' }], formValues: {} } },
    });
    const out = runHook(input);
    await out.handleRemoveProject('gcp', 'p1');
    expect(setError).toHaveBeenCalledWith('save-bad');
  });

  it('falls back to [] when providerStates entry is missing entirely', async () => {
    mocks.api.saveCredentials.mockResolvedValueOnce(undefined);
    const { input } = buildInput();
    const out = runHook(input);
    await out.handleRemoveProject('gcp', 'p1');
    expect(mocks.api.saveCredentials).toHaveBeenCalledWith('gcp', {
      _projects: JSON.stringify([]),
    });
  });
});

describe('useProviderHandlers — handleImport', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('clears status, writes importing key, fires success path, calls onImportComplete, then onClose after 1500ms', async () => {
    mocks.api.import.mockResolvedValueOnce({
      success: true,
      graph: { nodes: [{ id: 'n1' }, { id: 'n2' }] },
    });
    const onImportComplete = vi.fn();
    const { input, setError, setSuccess, setImporting, onClose, t } = buildInput({
      onImportComplete,
    });
    const out = runHook(input);
    await out.handleImport('gcp', 'p1');
    expect(setImporting).toHaveBeenNthCalledWith(1, 'gcp-p1');
    expect(setError).toHaveBeenCalledWith(null);
    expect(setSuccess).toHaveBeenCalledWith(null);
    expect(mocks.api.import).toHaveBeenCalledWith('gcp', 'p1');
    expect(t).toHaveBeenCalledWith(
      'providerSettings.import.success',
      expect.objectContaining({ count: 2, projectId: 'p1' }),
    );
    expect(onImportComplete).toHaveBeenCalledWith({ nodes: [{ id: 'n1' }, { id: 'n2' }] });
    expect(setImporting).toHaveBeenLastCalledWith(null);
    expect(onClose).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1500);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('uses count: 0 when result.graph is missing', async () => {
    mocks.api.import.mockResolvedValueOnce({ success: true });
    const { input, t } = buildInput();
    const out = runHook(input);
    await out.handleImport('gcp', 'p1');
    expect(t).toHaveBeenCalledWith(
      'providerSettings.import.success',
      expect.objectContaining({ count: 0, projectId: 'p1' }),
    );
  });

  it('skips onImportComplete when not provided but still schedules onClose', async () => {
    mocks.api.import.mockResolvedValueOnce({ success: true, graph: { nodes: [] } });
    const { input, onClose } = buildInput();
    const out = runHook(input);
    await out.handleImport('gcp', 'p1');
    vi.advanceTimersByTime(1500);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('throws Import failed on result.success === false with no error', async () => {
    mocks.api.import.mockResolvedValueOnce({ success: false });
    const { input, setError } = buildInput();
    const out = runHook(input);
    await out.handleImport('gcp', 'p1');
    expect(setError).toHaveBeenCalledWith('Import failed');
  });

  it('uses result.error when success false', async () => {
    mocks.api.import.mockResolvedValueOnce({ success: false, error: 'rate-limit' });
    const { input, setError } = buildInput();
    const out = runHook(input);
    await out.handleImport('gcp', 'p1');
    expect(setError).toHaveBeenCalledWith('rate-limit');
  });

  it('captures err.message when api.import throws an Error', async () => {
    mocks.api.import.mockRejectedValueOnce(new Error('boom'));
    const { input, setError } = buildInput();
    const out = runHook(input);
    await out.handleImport('gcp', 'p1');
    expect(setError).toHaveBeenCalledWith('boom');
  });

  it('captures String(err) when api.import throws a non-Error', async () => {
    mocks.api.import.mockRejectedValueOnce('crash');
    const { input, setError } = buildInput();
    const out = runHook(input);
    await out.handleImport('gcp', 'p1');
    expect(setError).toHaveBeenCalledWith('crash');
  });
});
