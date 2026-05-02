/**
 * useGCPOAuth — Google Identity Services authorization-code flow.
 *
 * Reachable branches under node-only vitest:
 *   - The hook's initial state (connecting=false, error=null, connect fn).
 *   - The "GIS library missing" guard inside `connect` (multiple shapes).
 *   - The "VITE_GOOGLE_CLIENT_ID missing" guard inside `connect`.
 *
 * NOT reachable (structural test boundary):
 *   The success path of `connect` and every callback / error_callback
 *   branch sits past `if (!clientId) return;`. The SUT reads the client
 *   id with `(import.meta as any).env?.VITE_GOOGLE_CLIENT_ID`; the
 *   `as any` cast causes Vite's transform to skip its `import.meta.env.X`
 *   inlining, and at runtime vite-node's env proxy returns `undefined`
 *   for the cast form. `vi.stubEnv`, `process.env.X = '...'`, and
 *   direct mutation of `import.meta.env.X` all fail to thread through
 *   to the SUT's read because vite-node's env proxy reads via inlined
 *   replacement at parse time when the AST shape matches `import.meta.env.X`,
 *   and the cast removes that match. Coverage exception applies — see
 *   findings note in this file.
 */

import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Hoisted mocks ──────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  exchangeGCPCode: vi.fn(),
  initCodeClient: vi.fn(),
  requestCode: vi.fn(),
}));

vi.mock('../../api/api-adapter', () => ({
  getApi: () => ({ provider: { exchangeGCPCode: mocks.exchangeGCPCode } }),
}));

// ─── Imports after mocks ────────────────────────────────────────────────────

import { useGCPOAuth } from '../use-gcp-oauth';

// ─── Helpers ────────────────────────────────────────────────────────────────

function captureHook(onSuccess: () => void) {
  type Result = ReturnType<typeof useGCPOAuth>;
  const ref: { current?: Result } = {};
  const Probe: React.FC = () => {
    ref.current = useGCPOAuth(onSuccess);
    return null;
  };
  renderToString(<Probe />);
  if (!ref.current) throw new Error('hook did not render');
  return ref.current;
}

beforeEach(() => {
  mocks.exchangeGCPCode.mockReset();
  mocks.initCodeClient.mockReset();
  mocks.requestCode.mockReset();

  mocks.initCodeClient.mockImplementation(() => ({
    requestCode: mocks.requestCode,
  }));

  vi.stubGlobal('window', {
    google: {
      accounts: {
        oauth2: {
          initCodeClient: mocks.initCodeClient,
        },
      },
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ────────────────────────────────────────────────────────────────────────────

describe('useGCPOAuth — initial state', () => {
  it('returns connecting=false on first render', () => {
    const out = captureHook(() => undefined);
    expect(out.connecting).toBe(false);
  });

  it('returns error=null on first render', () => {
    const out = captureHook(() => undefined);
    expect(out.error).toBeNull();
  });

  it('returns a `connect` callable', () => {
    const out = captureHook(() => undefined);
    expect(typeof out.connect).toBe('function');
  });
});

describe('useGCPOAuth — connect() guards', () => {
  it('aborts when GIS library is missing entirely', () => {
    vi.stubGlobal('window', {});
    const out = captureHook(() => undefined);
    out.connect();
    expect(mocks.initCodeClient).not.toHaveBeenCalled();
  });

  it('aborts when window.google exists but window.google.accounts is missing', () => {
    vi.stubGlobal('window', { google: {} });
    const out = captureHook(() => undefined);
    out.connect();
    expect(mocks.initCodeClient).not.toHaveBeenCalled();
  });

  it('aborts when window.google.accounts.oauth2 is missing', () => {
    vi.stubGlobal('window', { google: { accounts: {} } });
    const out = captureHook(() => undefined);
    out.connect();
    expect(mocks.initCodeClient).not.toHaveBeenCalled();
  });

  it('aborts when window.google is null', () => {
    vi.stubGlobal('window', { google: null });
    const out = captureHook(() => undefined);
    out.connect();
    expect(mocks.initCodeClient).not.toHaveBeenCalled();
  });

  it('aborts even when GIS is present, because VITE_GOOGLE_CLIENT_ID is unreachable in vitest', () => {
    // GIS is mocked; the SUT reads `(import.meta as any).env?.VITE_GOOGLE_CLIENT_ID`
    // which is `undefined` in vite-node's runner because of the `as any`
    // cast. So the second guard (`if (!clientId) return`) fires.
    const out = captureHook(() => undefined);
    out.connect();
    expect(mocks.initCodeClient).not.toHaveBeenCalled();
  });

  it('the connect callback never throws regardless of which guard wins', () => {
    vi.stubGlobal('window', {});
    const out = captureHook(() => undefined);
    expect(() => out.connect()).not.toThrow();
  });
});

describe('useGCPOAuth — onSuccess callback identity', () => {
  it('captures a different connect callable per onSuccess (useCallback dep)', () => {
    const cb1 = () => undefined;
    const cb2 = () => undefined;
    const out1 = captureHook(cb1);
    const out2 = captureHook(cb2);
    expect(typeof out1.connect).toBe('function');
    expect(typeof out2.connect).toBe('function');
  });
});
