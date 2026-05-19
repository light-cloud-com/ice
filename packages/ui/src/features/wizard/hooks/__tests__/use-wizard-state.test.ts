/**
 * use-wizard-state hook unit tests.
 *
 * Pure-logic hook — patches react.useState to a controllable stub so we
 * can drive setState calls directly and snapshot the next state. No
 * jsdom; we treat the hook as `(initial state, setState spy) -> object`
 * and inspect the object returned by each call.
 *
 * The hook also wraps every mutator in `useCallback`. We patch that to a
 * passthrough so each render returns a fresh, callable function.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  state: null as unknown,
  setState: vi.fn(),
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  const useState = vi.fn(<T>(init: T | (() => T)): [T, (v: T | ((prev: T) => T)) => void] => {
    const initial = typeof init === 'function' ? (init as () => T)() : init;
    if (mocks.state === null) mocks.state = initial;
    return [mocks.state as T, mocks.setState];
  });
  const useCallback = vi.fn(<T>(fn: T): T => fn);
  return { ...actual, useState, useCallback };
});

import { useWizardState, type WizardState, type WizardEnvironment } from '../use-wizard-state';

beforeEach(() => {
  mocks.state = null;
  mocks.setState.mockReset();
});

// Helper: invoke setState's reducer arg with an explicit current state and
// inspect what it returns.
const driveReducer = <T>(prev: T): T => {
  const args = mocks.setState.mock.calls[mocks.setState.mock.calls.length - 1];
  const reducer = args[0] as (s: T) => T;
  return reducer(prev);
};

describe('useWizardState — initial state', () => {
  it('starts at step 1 with empty project name + provider aws', () => {
    const out = useWizardState();
    expect(out.state.step).toBe(1);
    expect(out.state.projectName).toBe('');
    expect(out.state.projectDescription).toBe('');
    expect(out.state.provider).toBe('aws');
    expect(out.state.selectedTemplateId).toBeNull();
    expect(out.state.searchQuery).toBe('');
  });

  it('seeds 4 environments with production+staging enabled', () => {
    const out = useWizardState();
    expect(out.state.environments).toHaveLength(4);
    expect(out.state.environments[0].type).toBe('production');
    expect(out.state.environments[0].enabled).toBe(true);
    expect(out.state.environments[1].type).toBe('staging');
    expect(out.state.environments[1].enabled).toBe(true);
    expect(out.state.environments[2].type).toBe('development');
    expect(out.state.environments[2].enabled).toBe(false);
    expect(out.state.environments[3].type).toBe('pr');
    expect(out.state.environments[3].enabled).toBe(false);
  });
});

describe('useWizardState — navigation', () => {
  const baseState: WizardState = {
    step: 1,
    projectName: '',
    projectDescription: '',
    provider: 'aws',
    environments: [],
    selectedTemplateId: null,
    searchQuery: '',
  };

  it('goNext increments step', () => {
    const out = useWizardState();
    out.goNext();
    const next = driveReducer({ ...baseState, step: 2 });
    expect(next.step).toBe(3);
  });

  it('goNext clamps at 4', () => {
    const out = useWizardState();
    out.goNext();
    const next = driveReducer({ ...baseState, step: 4 });
    expect(next.step).toBe(4);
  });

  it('goBack decrements step', () => {
    const out = useWizardState();
    out.goBack();
    const next = driveReducer({ ...baseState, step: 3 });
    expect(next.step).toBe(2);
  });

  it('goBack clamps at 1', () => {
    const out = useWizardState();
    out.goBack();
    const next = driveReducer({ ...baseState, step: 1 });
    expect(next.step).toBe(1);
  });

  it('goToStep jumps to the given step', () => {
    const out = useWizardState();
    out.goToStep(3);
    const next = driveReducer({ ...baseState });
    expect(next.step).toBe(3);
  });

  it('goToStep clamps below 1', () => {
    const out = useWizardState();
    out.goToStep(-5);
    const next = driveReducer({ ...baseState });
    expect(next.step).toBe(1);
  });

  it('goToStep clamps above 4', () => {
    const out = useWizardState();
    out.goToStep(99);
    const next = driveReducer({ ...baseState });
    expect(next.step).toBe(4);
  });
});

describe('useWizardState — step 1 setters', () => {
  const baseState: WizardState = {
    step: 1,
    projectName: '',
    projectDescription: '',
    provider: 'aws',
    environments: [],
    selectedTemplateId: null,
    searchQuery: '',
  };

  it('setProjectName updates projectName', () => {
    const out = useWizardState();
    out.setProjectName('My App');
    const next = driveReducer(baseState);
    expect(next.projectName).toBe('My App');
  });

  it('setProjectDescription updates projectDescription', () => {
    const out = useWizardState();
    out.setProjectDescription('a thing');
    const next = driveReducer(baseState);
    expect(next.projectDescription).toBe('a thing');
  });

  it('setProvider updates provider', () => {
    const out = useWizardState();
    out.setProvider('gcp');
    const next = driveReducer(baseState);
    expect(next.provider).toBe('gcp');
  });
});

describe('useWizardState — step 2 setters', () => {
  const envs: WizardEnvironment[] = [
    { enabled: true, type: 'production', name: 'P', region: 'us-east1', securityLevel: 'standard' },
    { enabled: false, type: 'staging', name: 'S', region: 'us-east1', securityLevel: 'basic' },
  ];

  it('toggleEnvironment flips the enabled flag at the given index', () => {
    const out = useWizardState();
    out.toggleEnvironment(0);
    const next = driveReducer({
      step: 2,
      projectName: '',
      projectDescription: '',
      provider: 'aws' as const,
      environments: envs,
      selectedTemplateId: null,
      searchQuery: '',
    });
    expect(next.environments[0].enabled).toBe(false);
    expect(next.environments[1].enabled).toBe(false);
  });

  it('setEnvironmentRegion sets the region at the given index', () => {
    const out = useWizardState();
    out.setEnvironmentRegion(1, 'europe-west1');
    const next = driveReducer({
      step: 2,
      projectName: '',
      projectDescription: '',
      provider: 'aws' as const,
      environments: envs,
      selectedTemplateId: null,
      searchQuery: '',
    });
    expect(next.environments[0].region).toBe('us-east1');
    expect(next.environments[1].region).toBe('europe-west1');
  });

  it('setEnvironmentSecurity sets the security level at the given index', () => {
    const out = useWizardState();
    out.setEnvironmentSecurity(0, 'strict');
    const next = driveReducer({
      step: 2,
      projectName: '',
      projectDescription: '',
      provider: 'aws' as const,
      environments: envs,
      selectedTemplateId: null,
      searchQuery: '',
    });
    expect(next.environments[0].securityLevel).toBe('strict');
    expect(next.environments[1].securityLevel).toBe('basic');
  });

  it('setAllSecurityLevel updates every environment to the given level', () => {
    const out = useWizardState();
    out.setAllSecurityLevel('compliance');
    const next = driveReducer({
      step: 2,
      projectName: '',
      projectDescription: '',
      provider: 'aws' as const,
      environments: envs,
      selectedTemplateId: null,
      searchQuery: '',
    });
    expect(next.environments.every((e: WizardEnvironment) => e.securityLevel === 'compliance')).toBe(true);
  });

  it('applyEnvironmentPresets enables matching presets and disables others', () => {
    const out = useWizardState();
    out.applyEnvironmentPresets([{ type: 'production', region: 'eu-west1', securityLevel: 'strict' }]);
    const next = driveReducer({
      step: 2,
      projectName: '',
      projectDescription: '',
      provider: 'aws' as const,
      environments: envs,
      selectedTemplateId: null,
      searchQuery: '',
    });
    expect(next.environments[0].enabled).toBe(true);
    expect(next.environments[0].region).toBe('eu-west1');
    expect(next.environments[0].securityLevel).toBe('strict');
    expect(next.environments[1].enabled).toBe(false);
  });
});

describe('useWizardState — step 3 setters', () => {
  const baseState: WizardState = {
    step: 3,
    projectName: '',
    projectDescription: '',
    provider: 'aws',
    environments: [],
    selectedTemplateId: null,
    searchQuery: '',
  };

  it('setSelectedTemplateId sets the template id', () => {
    const out = useWizardState();
    out.setSelectedTemplateId('tmpl-1');
    const next = driveReducer(baseState);
    expect(next.selectedTemplateId).toBe('tmpl-1');
  });

  it('setSelectedTemplateId can clear the template id (null)', () => {
    const out = useWizardState();
    out.setSelectedTemplateId(null);
    const next = driveReducer({ ...baseState, selectedTemplateId: 'tmpl-1' });
    expect(next.selectedTemplateId).toBeNull();
  });

  it('setSearchQuery updates the searchQuery', () => {
    const out = useWizardState();
    out.setSearchQuery('aws lambda');
    const next = driveReducer(baseState);
    expect(next.searchQuery).toBe('aws lambda');
  });
});

describe('useWizardState — validation', () => {
  it('step1Valid is true only when projectName has non-whitespace content', () => {
    mocks.state = {
      step: 1,
      projectName: 'OK',
      projectDescription: '',
      provider: 'aws',
      environments: [],
      selectedTemplateId: null,
      searchQuery: '',
    };
    expect(useWizardState().validation.step1Valid).toBe(true);
  });

  it('step1Valid is false for whitespace-only project name', () => {
    mocks.state = {
      step: 1,
      projectName: '   ',
      projectDescription: '',
      provider: 'aws',
      environments: [],
      selectedTemplateId: null,
      searchQuery: '',
    };
    expect(useWizardState().validation.step1Valid).toBe(false);
  });

  it('step2Valid is true when at least one environment is enabled', () => {
    mocks.state = {
      step: 2,
      projectName: '',
      projectDescription: '',
      provider: 'aws',
      environments: [
        { enabled: false, type: 'production', name: 'P', region: 'us-east1', securityLevel: 'basic' },
        { enabled: true, type: 'staging', name: 'S', region: 'us-east1', securityLevel: 'basic' },
      ],
      selectedTemplateId: null,
      searchQuery: '',
    };
    expect(useWizardState().validation.step2Valid).toBe(true);
  });

  it('step2Valid is false when no environment is enabled', () => {
    mocks.state = {
      step: 2,
      projectName: '',
      projectDescription: '',
      provider: 'aws',
      environments: [{ enabled: false, type: 'production', name: 'P', region: 'us-east1', securityLevel: 'basic' }],
      selectedTemplateId: null,
      searchQuery: '',
    };
    expect(useWizardState().validation.step2Valid).toBe(false);
  });

  it('step3Valid is always true (blank canvas allowed)', () => {
    mocks.state = {
      step: 3,
      projectName: '',
      projectDescription: '',
      provider: 'aws',
      environments: [],
      selectedTemplateId: null,
      searchQuery: '',
    };
    expect(useWizardState().validation.step3Valid).toBe(true);
  });
});

describe('useWizardState — canProceed', () => {
  it('is true at step 4 regardless of state', () => {
    mocks.state = {
      step: 4,
      projectName: '',
      projectDescription: '',
      provider: 'aws',
      environments: [],
      selectedTemplateId: null,
      searchQuery: '',
    };
    expect(useWizardState().canProceed).toBe(true);
  });

  it('mirrors stepXValid for the active step', () => {
    mocks.state = {
      step: 1,
      projectName: '',
      projectDescription: '',
      provider: 'aws',
      environments: [],
      selectedTemplateId: null,
      searchQuery: '',
    };
    expect(useWizardState().canProceed).toBe(false);

    mocks.state = {
      step: 2,
      projectName: '',
      projectDescription: '',
      provider: 'aws',
      environments: [{ enabled: true, type: 'production', name: 'P', region: 'us-east1', securityLevel: 'basic' }],
      selectedTemplateId: null,
      searchQuery: '',
    };
    expect(useWizardState().canProceed).toBe(true);
  });
});

describe('useWizardState — reset', () => {
  it('reset replaces state with the initial constants', () => {
    const out = useWizardState();
    out.reset();
    const replacement = mocks.setState.mock.calls[mocks.setState.mock.calls.length - 1][0] as WizardState;
    expect(replacement.step).toBe(1);
    expect(replacement.projectName).toBe('');
    expect(replacement.environments).toHaveLength(4);
    expect(replacement.selectedTemplateId).toBeNull();
  });
});
