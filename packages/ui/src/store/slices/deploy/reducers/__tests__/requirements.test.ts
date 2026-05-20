/**
 * Tests for `deploy/reducers/requirements.ts` — four block-requirements reducers.
 *
 * @see rf-dslice-10
 */

import { produce } from 'immer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { requirementsReducers } from '../requirements';
import type { DeployState, ResolvedRequirementState } from '../../types';
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

function makeReq(definitionId: string, nodeId?: string): ResolvedRequirementState {
  return {
    definitionId,
    scope: 'block',
    timing: 'before-deploy',
    blocking: true,
    title: 'T',
    result: { status: 'unknown', lastCheckedAt: '' },
    nodeId,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-04-30T00:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('startRequirementsFetch', () => {
  it('flips requirementsLoading to true', () => {
    const next = produce(makeState(), (draft) => {
      requirementsReducers.startRequirementsFetch(draft);
    });
    expect(next.requirementsLoading).toBe(true);
  });
});

describe('setRequirements', () => {
  it('replaces requirements, stamps fetchedAt, turns off loading', () => {
    const reqs = [makeReq('dns-1', 'n1'), makeReq('cert-2', 'n2')];
    const next = produce(makeState({ requirementsLoading: true }), (draft) => {
      requirementsReducers.setRequirements(draft, {
        type: 'deploy/setRequirements',
        payload: reqs,
      } as PayloadAction<ResolvedRequirementState[]>);
    });
    expect(next.requirements).toEqual(reqs);
    expect(next.requirementsLoading).toBe(false);
    expect(next.requirementsFetchedAt).toBe('2026-04-30T00:00:00.000Z');
  });
});

describe('updateRequirement', () => {
  it('replaces by composite key (definitionId, nodeId)', () => {
    const r1 = makeReq('dns', 'n1');
    const r2 = makeReq('dns', 'n2'); // same definitionId, different node
    const updated = { ...r2, result: { status: 'verified' as const, lastCheckedAt: '' } };
    const next = produce(makeState({ requirements: [r1, r2] }), (draft) => {
      requirementsReducers.updateRequirement(draft, {
        type: 'deploy/updateRequirement',
        payload: updated,
      } as PayloadAction<ResolvedRequirementState>);
    });
    expect(next.requirements).toHaveLength(2);
    expect(next.requirements[0]).toEqual(r1);
    expect(next.requirements[1].result.status).toBe('verified');
  });

  it('pushes when no matching composite key exists', () => {
    const r1 = makeReq('dns', 'n1');
    const newReq = makeReq('cert', 'n3');
    const next = produce(makeState({ requirements: [r1] }), (draft) => {
      requirementsReducers.updateRequirement(draft, {
        type: 'deploy/updateRequirement',
        payload: newReq,
      } as PayloadAction<ResolvedRequirementState>);
    });
    expect(next.requirements).toHaveLength(2);
    expect(next.requirements[1]).toEqual(newReq);
  });
});

describe('clearRequirements', () => {
  it('resets all three fields', () => {
    const next = produce(
      makeState({
        requirements: [makeReq('dns', 'n1')],
        requirementsLoading: true,
        requirementsFetchedAt: 'past',
      }),
      (draft) => {
        requirementsReducers.clearRequirements(draft);
      },
    );
    expect(next.requirements).toEqual([]);
    expect(next.requirementsLoading).toBe(false);
    expect(next.requirementsFetchedAt).toBeUndefined();
  });
});
