/**
 * Tests for `deploy/reducers/hydrate.ts` — hydrateDeployFromHistory.
 *
 * Critical preservation: the non-terminal status guard. If a future
 * refactor drops the early return, hydrating an in-flight DB row would
 * yank the live deploy back to a stale completion state. The tests below
 * pin both the guard (input must distinguish guard-fired from happy-path)
 * and the partial → 'error' mapping.
 *
 * @see rf-dslice-13
 */

import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { hydrateReducers } from '../hydrate';
import type { DeployResourceResult, DeployState } from '../../types';
import type { PayloadAction } from '@reduxjs/toolkit';

function makeState(overrides: Partial<DeployState> = {}): DeployState {
  return {
    isOpen: false,
    provider: 'gcp',
    gcpProject: '',
    region: 'us-central1',
    environment: 'development',
    status: 'idle',
    error: null,
    plan: null,
    logs: [],
    results: [],
    nodesById: {},
    history: [],
    deployedResources: [],
    driftByNode: {},
    driftCheckLoading: false,
    requirements: [],
    requirementsLoading: false,
    diagnosis: { status: 'idle', result: null, error: null },
    dismissedWarnings: [],
    criticalAcknowledged: false,
    ...overrides,
  };
}

type Payload = {
  cardId: string;
  status: string;
  results?: DeployResourceResult[];
  error?: string | null;
  duration_ms?: number | null;
  environment?: string | null;
};

describe('hydrateDeployFromHistory', () => {
  it('is a no-op when status is non-completed (RISK-pin: guard fires)', () => {
    // Critical input: an in-flight status that should NOT trigger
    // hydration. Input includes a `results` payload that would
    // otherwise overwrite live state if the guard were dropped.
    const before = makeState({
      status: 'deploying',
      results: [{ name: 'live', type: 't', action: 'create', success: true }],
    });
    const next = produce(before, (draft) => {
      hydrateReducers.hydrateDeployFromHistory(draft, {
        type: 'deploy/hydrateDeployFromHistory',
        payload: {
          cardId: 'c1',
          status: 'deploying', // Not in completed list — must early-return.
          results: [{ name: 'stale', type: 't', action: 'create', success: false }],
        },
      } as PayloadAction<Payload>);
    });
    // Status NOT changed; results NOT overwritten — guard fired.
    expect(next.status).toBe('deploying');
    expect(next.results).toHaveLength(1);
    expect(next.results[0].name).toBe('live');
  });

  it.each(['queued', 'planning', 'authenticating', 'idle', 'unknown-status'])(
    "is a no-op when status='%s' (not in the completed list)",
    (status) => {
      const before = makeState({ status: 'deploying' });
      const next = produce(before, (draft) => {
        hydrateReducers.hydrateDeployFromHistory(draft, {
          type: 'deploy/hydrateDeployFromHistory',
          payload: { cardId: 'c1', status },
        } as PayloadAction<Payload>);
      });
      expect(next.status).toBe('deploying');
    },
  );

  it("maps DB status='success' → slice status='success'", () => {
    const next = produce(makeState({ status: 'idle' }), (draft) => {
      hydrateReducers.hydrateDeployFromHistory(draft, {
        type: 'deploy/hydrateDeployFromHistory',
        payload: { cardId: 'c1', status: 'success' },
      } as PayloadAction<Payload>);
    });
    expect(next.status).toBe('success');
  });

  it.each(['partial', 'failed', 'cancelled'])(
    "maps DB status='%s' → slice status='error' (red header)",
    (dbStatus) => {
      const next = produce(makeState({ status: 'idle' }), (draft) => {
        hydrateReducers.hydrateDeployFromHistory(draft, {
          type: 'deploy/hydrateDeployFromHistory',
          payload: { cardId: 'c1', status: dbStatus },
        } as PayloadAction<Payload>);
      });
      expect(next.status).toBe('error');
    },
  );

  it('writes lastResetCardId to suppress the setActiveCard reset', () => {
    const next = produce(makeState(), (draft) => {
      hydrateReducers.hydrateDeployFromHistory(draft, {
        type: 'deploy/hydrateDeployFromHistory',
        payload: { cardId: 'c1', status: 'success' },
      } as PayloadAction<Payload>);
    });
    expect(next.lastResetCardId).toBe('c1');
  });

  it('writes results from payload (Array.isArray check)', () => {
    const results = [{ name: 'a', type: 't', action: 'create' as const, success: true }];
    const next = produce(makeState(), (draft) => {
      hydrateReducers.hydrateDeployFromHistory(draft, {
        type: 'deploy/hydrateDeployFromHistory',
        payload: { cardId: 'c1', status: 'success', results },
      } as PayloadAction<Payload>);
    });
    expect(next.results).toEqual(results);
  });

  it('coerces non-array results to []', () => {
    const next = produce(makeState(), (draft) => {
      hydrateReducers.hydrateDeployFromHistory(draft, {
        type: 'deploy/hydrateDeployFromHistory',
        payload: {
          cardId: 'c1',
          status: 'success',
          // Older response shape: number instead of array.
          results: 7 as unknown as DeployResourceResult[],
        },
      } as PayloadAction<Payload>);
    });
    expect(next.results).toEqual([]);
  });

  it("writes a known environment value", () => {
    const next = produce(makeState({ environment: 'development' }), (draft) => {
      hydrateReducers.hydrateDeployFromHistory(draft, {
        type: 'deploy/hydrateDeployFromHistory',
        payload: { cardId: 'c1', status: 'success', environment: 'production' },
      } as PayloadAction<Payload>);
    });
    expect(next.environment).toBe('production');
  });

  it("ignores an unknown environment value (whitelist guard)", () => {
    const next = produce(makeState({ environment: 'development' }), (draft) => {
      hydrateReducers.hydrateDeployFromHistory(draft, {
        type: 'deploy/hydrateDeployFromHistory',
        payload: { cardId: 'c1', status: 'success', environment: 'fictional' },
      } as PayloadAction<Payload>);
    });
    expect(next.environment).toBe('development');
  });

  it('appends a duration log entry when duration_ms is a number', () => {
    const next = produce(makeState({ logs: [] }), (draft) => {
      hydrateReducers.hydrateDeployFromHistory(draft, {
        type: 'deploy/hydrateDeployFromHistory',
        payload: { cardId: 'c1', status: 'success', duration_ms: 12_345 },
      } as PayloadAction<Payload>);
    });
    expect(next.logs).toHaveLength(1);
  });

  it('does NOT append a duration log when duration_ms is null', () => {
    const next = produce(makeState({ logs: ['kept'] }), (draft) => {
      hydrateReducers.hydrateDeployFromHistory(draft, {
        type: 'deploy/hydrateDeployFromHistory',
        payload: { cardId: 'c1', status: 'success', duration_ms: null },
      } as PayloadAction<Payload>);
    });
    expect(next.logs).toEqual(['kept']);
  });

  it('writes error from payload (or null on undefined)', () => {
    const next = produce(makeState(), (draft) => {
      hydrateReducers.hydrateDeployFromHistory(draft, {
        type: 'deploy/hydrateDeployFromHistory',
        payload: { cardId: 'c1', status: 'failed', error: 'boom' },
      } as PayloadAction<Payload>);
    });
    expect(next.error).toBe('boom');
  });
});
