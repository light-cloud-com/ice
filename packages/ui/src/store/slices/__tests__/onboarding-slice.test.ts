/**
 * Reducer + thunk tests for onboarding-slice.
 *
 * Covers every synchronous action plus the four async-thunk lifecycle
 * branches. Thunks themselves are also driven end-to-end with axios
 * mocked at the module boundary so the request body / response
 * mapping path is exercised.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  axiosGet: vi.fn(),
  axiosPut: vi.fn(),
}));

vi.mock('../../../shared/api/axios-instance', () => ({
  default: {
    get: (...args: unknown[]) => mocks.axiosGet(...args),
    put: (...args: unknown[]) => mocks.axiosPut(...args),
  },
}));

import onboardingReducer, {
  setStep,
  setDefaultProvider,
  setDefaultRegion,
  setTeamMode,
  setTeamName,
  setInviteCode,
  addInviteEmail,
  removeInviteEmail,
  setCloudConnected,
  setGithubConnected,
  setProjectName,
  setSelectedTemplateId,
  resetOnboarding,
  fetchOnboardingStatus,
  saveOnboardingStep,
  completeOnboarding,
  skipOnboarding,
  type OnboardingState,
} from '../onboarding-slice';
import { configureStore } from '@reduxjs/toolkit';

beforeEach(() => {
  mocks.axiosGet.mockReset();
  mocks.axiosPut.mockReset();
});

function init(): OnboardingState {
  return onboardingReducer(undefined, { type: '@@INIT' });
}

describe('onboarding-slice — initial state', () => {
  it('seeds step=1, no provider/team, all flags false', () => {
    expect(init()).toEqual({
      currentStep: 1,
      completed: false,
      loading: false,
      defaultProvider: null,
      defaultRegion: null,
      teamMode: null,
      teamName: '',
      inviteEmails: [],
      cloudConnected: false,
      githubConnected: false,
      projectName: '',
      selectedTemplateId: null,
    });
  });
});

describe('synchronous reducers', () => {
  it('setStep writes the step value verbatim', () => {
    const s = onboardingReducer(init(), setStep(2));
    expect(s.currentStep).toBe(2);
  });

  it('setDefaultProvider / setDefaultRegion', () => {
    let s = onboardingReducer(init(), setDefaultProvider('gcp'));
    s = onboardingReducer(s, setDefaultRegion('us-central1'));
    expect(s.defaultProvider).toBe('gcp');
    expect(s.defaultRegion).toBe('us-central1');
  });

  it('setTeamMode and setTeamName', () => {
    let s = onboardingReducer(init(), setTeamMode('create'));
    s = onboardingReducer(s, setTeamName('Acme'));
    expect(s.teamMode).toBe('create');
    expect(s.teamName).toBe('Acme');
  });

  it('setInviteCode mutates an ad-hoc field on state', () => {
    const s = onboardingReducer(init(), setInviteCode('XYZ-123'));
    expect((s as unknown as { inviteCode: string }).inviteCode).toBe('XYZ-123');
  });

  describe('addInviteEmail', () => {
    it('appends a trimmed email', () => {
      const s = onboardingReducer(init(), addInviteEmail('  alice@x.com  '));
      expect(s.inviteEmails).toEqual(['alice@x.com']);
    });

    it('skips empty / whitespace-only payloads', () => {
      let s = onboardingReducer(init(), addInviteEmail(''));
      s = onboardingReducer(s, addInviteEmail('   '));
      expect(s.inviteEmails).toEqual([]);
    });

    it('dedupes duplicate emails', () => {
      let s = onboardingReducer(init(), addInviteEmail('a@x'));
      s = onboardingReducer(s, addInviteEmail('a@x'));
      expect(s.inviteEmails).toEqual(['a@x']);
    });
  });

  it('removeInviteEmail removes by index', () => {
    let s = onboardingReducer(init(), addInviteEmail('a@x'));
    s = onboardingReducer(s, addInviteEmail('b@x'));
    s = onboardingReducer(s, removeInviteEmail(0));
    expect(s.inviteEmails).toEqual(['b@x']);
  });

  it('connection flags', () => {
    let s = onboardingReducer(init(), setCloudConnected(true));
    s = onboardingReducer(s, setGithubConnected(true));
    expect(s.cloudConnected).toBe(true);
    expect(s.githubConnected).toBe(true);
    s = onboardingReducer(s, setCloudConnected(false));
    expect(s.cloudConnected).toBe(false);
  });

  it('setProjectName + setSelectedTemplateId', () => {
    let s = onboardingReducer(init(), setProjectName('My Project'));
    s = onboardingReducer(s, setSelectedTemplateId('template-1'));
    expect(s.projectName).toBe('My Project');
    expect(s.selectedTemplateId).toBe('template-1');

    s = onboardingReducer(s, setSelectedTemplateId(null));
    expect(s.selectedTemplateId).toBeNull();
  });

  it('resetOnboarding restores initial state', () => {
    let s = onboardingReducer(init(), setStep(3));
    s = onboardingReducer(s, setProjectName('mid-flight'));
    s = onboardingReducer(s, addInviteEmail('a@x'));
    s = onboardingReducer(s, resetOnboarding());
    expect(s).toEqual(init());
  });
});

describe('fetchOnboardingStatus lifecycle', () => {
  it('flips loading on pending', () => {
    const s = onboardingReducer(init(), fetchOnboardingStatus.pending('r-1', undefined));
    expect(s.loading).toBe(true);
  });

  it('writes profile fields on fulfilled and clamps step into [1, 3]', () => {
    const payload = {
      onboarding_completed: true,
      onboarding_step: 2,
      default_provider: 'aws',
      default_region: 'eu-west-1',
    };
    const s = onboardingReducer(init(), fetchOnboardingStatus.fulfilled(payload, 'r-1', undefined));
    expect(s.loading).toBe(false);
    expect(s.completed).toBe(true);
    expect(s.currentStep).toBe(2);
    expect(s.defaultProvider).toBe('aws');
    expect(s.defaultRegion).toBe('eu-west-1');
  });

  it('clamps oversized step back to the max (3)', () => {
    const payload = {
      onboarding_completed: false,
      onboarding_step: 99,
      default_provider: null,
      default_region: null,
    };
    const s = onboardingReducer(init(), fetchOnboardingStatus.fulfilled(payload, 'r-1', undefined));
    expect(s.currentStep).toBe(3);
  });

  it('clamps zero/negative step up to 1', () => {
    const payload = {
      onboarding_completed: false,
      onboarding_step: 0,
      default_provider: null,
      default_region: null,
    };
    const s = onboardingReducer(init(), fetchOnboardingStatus.fulfilled(payload, 'r-1', undefined));
    expect(s.currentStep).toBe(1);
  });

  it('clears loading on rejected', () => {
    let s = onboardingReducer(init(), fetchOnboardingStatus.pending('r-1', undefined));
    s = onboardingReducer(s, fetchOnboardingStatus.rejected(new Error('boom'), 'r-1', undefined));
    expect(s.loading).toBe(false);
  });
});

describe('completeOnboarding / skipOnboarding lifecycle', () => {
  it('completeOnboarding.fulfilled flips completed=true', () => {
    const s = onboardingReducer(init(), completeOnboarding.fulfilled({}, 'r-1', undefined));
    expect(s.completed).toBe(true);
  });

  it('skipOnboarding.fulfilled flips completed=true', () => {
    const s = onboardingReducer(init(), skipOnboarding.fulfilled({}, 'r-1', undefined));
    expect(s.completed).toBe(true);
  });
});

describe('thunks (axios mocked at module boundary)', () => {
  function makeStore() {
    return configureStore({ reducer: { onboarding: onboardingReducer } });
  }

  it('fetchOnboardingStatus() GETs /onboarding/status', async () => {
    mocks.axiosGet.mockResolvedValue({
      data: {
        onboarding_completed: false,
        onboarding_step: 1,
        default_provider: null,
        default_region: null,
      },
    });
    const store = makeStore();
    await store.dispatch(fetchOnboardingStatus() as any);
    expect(mocks.axiosGet).toHaveBeenCalledWith('/onboarding/status');
    expect(store.getState().onboarding.loading).toBe(false);
  });

  it('saveOnboardingStep() PUTs /onboarding/step with the supplied body', async () => {
    mocks.axiosPut.mockResolvedValue({ data: {} });
    const store = makeStore();
    await store.dispatch(saveOnboardingStep({ step: 2, defaultProvider: 'gcp' }) as any);
    expect(mocks.axiosPut).toHaveBeenCalledWith('/onboarding/step', {
      step: 2,
      defaultProvider: 'gcp',
    });
  });

  it('completeOnboarding() PUTs /onboarding/complete', async () => {
    mocks.axiosPut.mockResolvedValue({ data: {} });
    const store = makeStore();
    await store.dispatch(completeOnboarding() as any);
    expect(mocks.axiosPut).toHaveBeenCalledWith('/onboarding/complete');
    expect(store.getState().onboarding.completed).toBe(true);
  });

  it('skipOnboarding() PUTs /onboarding/skip', async () => {
    mocks.axiosPut.mockResolvedValue({ data: {} });
    const store = makeStore();
    await store.dispatch(skipOnboarding() as any);
    expect(mocks.axiosPut).toHaveBeenCalledWith('/onboarding/skip');
    expect(store.getState().onboarding.completed).toBe(true);
  });
});
