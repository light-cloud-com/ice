/**
 * OnboardingPage — 3-step onboarding flow orchestrator.
 *
 * Direct-FC tree-walker. No useState (the hook does navigation work via
 * dispatch + useCallback only). useEffect calls (2): completed-redirect,
 * fetchProfile+fetchOnboardingStatus on mount.
 *
 * The complex bit is `handleFinish` which posts to axios up to 4 times
 * conditional on (provider, template) and then dispatches completion +
 * navigates. We mock the axios singleton to a controllable handler.
 *
 * The step-content `<ConnectCloudStep />` etc. children are stubbed to
 * primitive divs so we never invoke their real bodies.
 *
 * Cites:
 *   - `react-namespace-hook-access-requires-patching-default-export-too`
 *   - `vi-hoisted-must-include-large-fixture-arrays-when-vi-mock-factory-references-them`
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

interface FixtureTemplate {
  id: string;
  name: string;
  blocks: string[];
  category: string;
}

const mocks = vi.hoisted(() => ({
  effects: [] as Array<{ cb: () => void | (() => void); deps: unknown[] }>,
  callbacks: [] as unknown[],
  resetEffects() {
    this.effects.length = 0;
  },
  resetCallbacks() {
    this.callbacks.length = 0;
  },
  reduxState: {
    currentStep: 1 as number,
    completed: false as boolean,
    defaultProvider: null as string | null,
    defaultRegion: null as string | null,
    projectName: '' as string,
    selectedTemplateId: null as string | null,
    selectedOrg: null as { id: string; name: string } | null,
  },
  dispatch: vi.fn((a: unknown) => {
    if (a && typeof a === 'object' && 'unwrap' in (a as Record<string, unknown>)) return a;
    return Promise.resolve(a);
  }),
  navigate: vi.fn(),
  axios: {
    post: vi.fn(async (_url: string, _body: unknown): Promise<{ data: any }> => ({ data: { id: 'new-project-1', slug: 'my-project' } })),
  },
  thunks: {
    setStep: vi.fn((s: number) => ({ type: 'onboarding/setStep', payload: s })),
    fetchOnboardingStatus: vi.fn(() => ({ type: 'onboarding/fetchStatus' })),
    saveOnboardingStep: vi.fn((p: unknown) => ({ type: 'onboarding/saveStep', payload: p })),
    completeOnboarding: vi.fn(() => ({ type: 'onboarding/complete' })),
    skipOnboarding: vi.fn(() => ({ type: 'onboarding/skip' })),
    fetchProfile: vi.fn(() => ({ type: 'account/fetchProfile' })),
  },
  fixtureTemplates: [
    { id: 'tmpl-1', name: 'Template 1', blocks: [], category: 'frontend' },
    { id: 'tmpl-2', name: 'Template 2', blocks: [], category: 'backend' },
  ] as FixtureTemplate[],
  expandSpy: vi.fn((_t: unknown, _p?: string) => ({ nodes: [{ id: 'n1' }], edges: [{ id: 'e1' }] })),
  toSlugSpy: vi.fn((s: string) => s.toLowerCase().replace(/\s+/g, '-')),
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  const patchedUseEffect = vi.fn((cb: () => void | (() => void), deps?: unknown[]) => {
    mocks.effects.push({ cb, deps: deps ?? [] });
  });
  const patchedUseCallback = vi.fn((fn: unknown) => {
    mocks.callbacks.push(fn);
    return fn;
  });
  const actualDefault = (actual as unknown as { default?: typeof actual }).default ?? actual;
  return {
    ...actual,
    useEffect: patchedUseEffect,
    useCallback: patchedUseCallback,
    default: { ...actualDefault, useEffect: patchedUseEffect, useCallback: patchedUseCallback },
  };
});

vi.mock('react-redux', () => ({
  useDispatch: () => mocks.dispatch,
  useSelector: (sel: (s: unknown) => unknown) =>
    sel({
      onboarding: {
        currentStep: mocks.reduxState.currentStep,
        completed: mocks.reduxState.completed,
        defaultProvider: mocks.reduxState.defaultProvider,
        defaultRegion: mocks.reduxState.defaultRegion,
        projectName: mocks.reduxState.projectName,
        selectedTemplateId: mocks.reduxState.selectedTemplateId,
      },
      account: { selectedOrg: mocks.reduxState.selectedOrg },
    }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock('../../../../i18n', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock('../../../../shared/api/axios-instance', () => ({
  default: {
    post: (u: string, b: unknown) => mocks.axios.post(u, b),
  },
}));

vi.mock('../../../../shared/components/step-indicator', () => ({
  StepIndicator: ({ currentStep, totalSteps, labels }: { currentStep: number; totalSteps: number; labels: string[] }) => (
    <div
      data-stub="StepIndicator"
      data-current={currentStep}
      data-total={totalSteps}
      data-labels={labels.join(',')}
    />
  ),
}));

vi.mock('../../../../shared/utils/slug', () => ({
  toSlug: (s: string) => mocks.toSlugSpy(s),
}));

vi.mock('../../../../store/slices/account-slice', () => ({
  fetchProfile: () => mocks.thunks.fetchProfile(),
}));

vi.mock('../../../../store/slices/onboarding-slice', () => ({
  setStep: (s: number) => mocks.thunks.setStep(s),
  fetchOnboardingStatus: () => mocks.thunks.fetchOnboardingStatus(),
  saveOnboardingStep: (p: unknown) => mocks.thunks.saveOnboardingStep(p),
  completeOnboarding: () => mocks.thunks.completeOnboarding(),
  skipOnboarding: () => mocks.thunks.skipOnboarding(),
}));

vi.mock('../../../../config/templates', () => ({
  QUICK_STARTS: [],
  COMPOSED_TEMPLATES: mocks.fixtureTemplates,
  expandComposedTemplate: (t: unknown, p?: string) => mocks.expandSpy(t, p),
}));

vi.mock('../../../../assets/logo', () => ({
  Logo: ({ height }: { height: number }) => <span data-stub="Logo" data-height={height} />,
}));

vi.mock('../connect-cloud-step', () => ({
  ConnectCloudStep: () => <div data-stub="ConnectCloudStep" />,
}));

vi.mock('../connect-github-step', () => ({
  ConnectGithubStep: () => <div data-stub="ConnectGithubStep" />,
}));

vi.mock('../first-project-step', () => ({
  FirstProjectStep: () => <div data-stub="FirstProjectStep" />,
}));

import { OnboardingPage } from '../onboarding-page';

// ── tree walker ──────────────────────────────────────────────────────────────
type ReactNodeLike = React.ReactNode;
function* walk(node: ReactNodeLike): Generator<React.ReactElement> {
  if (node == null || typeof node === 'boolean' || typeof node === 'string' || typeof node === 'number') return;
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
function findByPredicate(
  tree: React.ReactNode,
  predicate: (el: React.ReactElement) => boolean,
): React.ReactElement[] {
  const out: React.ReactElement[] = [];
  for (const el of walk(tree)) {
    if (el && predicate(el)) out.push(el);
  }
  return out;
}
function findById(tree: React.ReactNode, id: string): React.ReactElement | undefined {
  return findByPredicate(tree, (el) => (el.props as { id?: string }).id === id)[0];
}
function findByStub(tree: React.ReactNode, stub: string): React.ReactElement[] {
  return findByPredicate(
    tree,
    (el) => (el.props as { ['data-stub']?: string })['data-stub'] === stub,
  );
}

function render(): React.ReactElement {
  return (OnboardingPage as unknown as () => React.ReactElement)();
}

beforeEach(() => {
  mocks.resetEffects();
  mocks.resetCallbacks();
  mocks.reduxState.currentStep = 1;
  mocks.reduxState.completed = false;
  mocks.reduxState.defaultProvider = null;
  mocks.reduxState.defaultRegion = null;
  mocks.reduxState.projectName = '';
  mocks.reduxState.selectedTemplateId = null;
  mocks.reduxState.selectedOrg = null;
  mocks.dispatch.mockClear();
  mocks.navigate.mockClear();
  mocks.axios.post.mockClear();
  mocks.axios.post.mockResolvedValue({ data: { id: 'new-project-1', slug: 'my-project' } });
  mocks.thunks.setStep.mockClear();
  mocks.thunks.fetchOnboardingStatus.mockClear();
  mocks.thunks.saveOnboardingStep.mockClear();
  mocks.thunks.completeOnboarding.mockClear();
  mocks.thunks.skipOnboarding.mockClear();
  mocks.thunks.fetchProfile.mockClear();
  mocks.expandSpy.mockClear();
  mocks.toSlugSpy.mockClear();
});

describe('OnboardingPage', () => {
  describe('Render shell', () => {
    it('renders the Logo, StepIndicator, and current step content for step 1', () => {
      const tree = render();
      expect(findByStub(tree, 'Logo')).toHaveLength(1);
      expect(findByStub(tree, 'StepIndicator')).toHaveLength(1);
      expect(findByStub(tree, 'ConnectCloudStep')).toHaveLength(1);
    });

    it('renders the GitHub step for currentStep=2', () => {
      mocks.reduxState.currentStep = 2;
      const tree = render();
      expect(findByStub(tree, 'ConnectGithubStep')).toHaveLength(1);
      expect(findByStub(tree, 'ConnectCloudStep')).toHaveLength(0);
    });

    it('renders the first-project step for currentStep=3', () => {
      mocks.reduxState.currentStep = 3;
      const tree = render();
      expect(findByStub(tree, 'FirstProjectStep')).toHaveLength(1);
    });

    it('falls back to ConnectCloudStep for unknown step values', () => {
      mocks.reduxState.currentStep = 99;
      const tree = render();
      expect(findByStub(tree, 'ConnectCloudStep')).toHaveLength(1);
    });

    it('passes currentStep / totalSteps / labels to StepIndicator', () => {
      mocks.reduxState.currentStep = 2;
      const tree = render();
      const ind = findByStub(tree, 'StepIndicator')[0];
      expect((ind.props as { ['data-current']: number })['data-current']).toBe(2);
      expect((ind.props as { ['data-total']: number })['data-total']).toBe(3);
      expect((ind.props as { ['data-labels']: string })['data-labels']).toBe(
        'onboarding.nav.stepCloud,onboarding.nav.stepGitHub,onboarding.nav.stepProject',
      );
    });
  });

  describe('Navigation buttons — gating', () => {
    it('renders no Back button on step 1', () => {
      const tree = render();
      expect(findById(tree, 'ice-onboarding-nav-btn-back')).toBeUndefined();
    });

    it('renders the Back button on step 2 and 3', () => {
      mocks.reduxState.currentStep = 2;
      const tree2 = render();
      expect(findById(tree2, 'ice-onboarding-nav-btn-back')).toBeDefined();
      mocks.reduxState.currentStep = 3;
      const tree3 = render();
      expect(findById(tree3, 'ice-onboarding-nav-btn-back')).toBeDefined();
    });

    it('renders the Skip per-step button when currentStep < TOTAL_STEPS', () => {
      mocks.reduxState.currentStep = 1;
      const tree = render();
      expect(findById(tree, 'ice-onboarding-nav-btn-skip')).toBeDefined();
    });

    it('hides the per-step Skip button on the final step', () => {
      mocks.reduxState.currentStep = 3;
      const tree = render();
      expect(findById(tree, 'ice-onboarding-nav-btn-skip')).toBeUndefined();
    });

    it('renders the "continue" Next button when not on final step', () => {
      const tree = render();
      const next = findById(tree, 'ice-onboarding-nav-btn-next')!;
      expect((next.props as { className: string }).className).toContain('bg-ice-accent');
    });

    it('renders the "createAndStart" Next button on the final step', () => {
      mocks.reduxState.currentStep = 3;
      const tree = render();
      const next = findById(tree, 'ice-onboarding-nav-btn-next')!;
      expect((next.props as { className: string }).className).toContain('bg-ice-green');
    });
  });

  describe('Effect: completed redirect', () => {
    it('redirects to / when completed becomes true', () => {
      mocks.reduxState.completed = true;
      render();
      // first effect = completed redirect
      mocks.effects[0].cb();
      expect(mocks.navigate).toHaveBeenCalledWith('/', { replace: true });
    });

    it('does not redirect when not completed', () => {
      mocks.reduxState.completed = false;
      render();
      mocks.effects[0].cb();
      expect(mocks.navigate).not.toHaveBeenCalled();
    });
  });

  describe('Effect: mount fetch', () => {
    it('dispatches fetchProfile and fetchOnboardingStatus on mount', () => {
      render();
      // second effect = mount fetch
      mocks.effects[1].cb();
      expect(mocks.thunks.fetchProfile).toHaveBeenCalled();
      expect(mocks.thunks.fetchOnboardingStatus).toHaveBeenCalled();
    });
  });

  describe('goNext flow', () => {
    it('on step 1: dispatches saveOnboardingStep with provider/region and increments step', async () => {
      mocks.reduxState.currentStep = 1;
      mocks.reduxState.defaultProvider = 'aws';
      mocks.reduxState.defaultRegion = 'us-east-1';
      const tree = render();
      const next = findById(tree, 'ice-onboarding-nav-btn-next')!;
      await (next.props as { onClick: () => Promise<void> }).onClick();
      expect(mocks.thunks.saveOnboardingStep).toHaveBeenCalledWith({
        step: 2,
        defaultProvider: 'aws',
        defaultRegion: 'us-east-1',
      });
      expect(mocks.thunks.setStep).toHaveBeenCalledWith(2);
    });

    it('on step 1 with null provider/region: passes undefined for both', async () => {
      mocks.reduxState.currentStep = 1;
      const tree = render();
      const next = findById(tree, 'ice-onboarding-nav-btn-next')!;
      await (next.props as { onClick: () => Promise<void> }).onClick();
      expect(mocks.thunks.saveOnboardingStep).toHaveBeenCalledWith({
        step: 2,
        defaultProvider: undefined,
        defaultRegion: undefined,
      });
    });

    it('on step 2: dispatches saveOnboardingStep({step:3}) and increments to 3', async () => {
      mocks.reduxState.currentStep = 2;
      const tree = render();
      const next = findById(tree, 'ice-onboarding-nav-btn-next')!;
      await (next.props as { onClick: () => Promise<void> }).onClick();
      expect(mocks.thunks.saveOnboardingStep).toHaveBeenCalledWith({ step: 3 });
      expect(mocks.thunks.setStep).toHaveBeenCalledWith(3);
    });

    it('on step 3: invokes handleFinish and does not call setStep', async () => {
      mocks.reduxState.currentStep = 3;
      const tree = render();
      const next = findById(tree, 'ice-onboarding-nav-btn-next')!;
      await (next.props as { onClick: () => Promise<void> }).onClick();
      expect(mocks.thunks.completeOnboarding).toHaveBeenCalled();
      expect(mocks.thunks.setStep).not.toHaveBeenCalled();
    });
  });

  describe('goBack flow', () => {
    it('clamps step at 1 (does not underflow)', () => {
      mocks.reduxState.currentStep = 1;
      const tree = render();
      // Back button isn't rendered at step 1, but goBack callback is
      // accessible via the captured callbacks list
      // callbacks[0]=handleFinish, [1]=goNext, [2]=goBack, [3]=handleSkipStep, [4]=handleSkipAll
      const goBack = mocks.callbacks[2] as () => void;
      goBack();
      expect(mocks.thunks.setStep).toHaveBeenCalledWith(1);
    });

    it('decrements step from 3 to 2', () => {
      mocks.reduxState.currentStep = 3;
      const tree = render();
      const back = findById(tree, 'ice-onboarding-nav-btn-back')!;
      (back.props as { onClick: () => void }).onClick();
      expect(mocks.thunks.setStep).toHaveBeenCalledWith(2);
    });
  });

  describe('handleSkipStep', () => {
    it('dispatches setStep + saveOnboardingStep with the next step value', () => {
      mocks.reduxState.currentStep = 1;
      const tree = render();
      const skip = findById(tree, 'ice-onboarding-nav-btn-skip')!;
      (skip.props as { onClick: () => void }).onClick();
      expect(mocks.thunks.setStep).toHaveBeenCalledWith(2);
      expect(mocks.thunks.saveOnboardingStep).toHaveBeenCalledWith({ step: 2 });
    });

    it('on the final step calls handleFinish (early-returns before setStep)', () => {
      mocks.reduxState.currentStep = 3;
      render();
      // Per-step skip button not rendered at final step, but the callback is captured.
      // callbacks[3] = handleSkipStep
      const handleSkipStep = mocks.callbacks[3] as () => void;
      handleSkipStep();
      expect(mocks.thunks.setStep).not.toHaveBeenCalled();
    });
  });

  describe('handleSkipAll', () => {
    it('dispatches skipOnboarding then fetchProfile then navigates home', async () => {
      const tree = render();
      const headerSkip = findByPredicate(
        tree,
        (el) => el.type === 'button' && (el.props as { className?: string }).className?.includes('skipSetup') === false &&
          (el.props as { className?: string }).className?.includes('text-ice-text-3') === true,
      )[0];
      await (headerSkip.props as { onClick: () => Promise<void> }).onClick();
      expect(mocks.thunks.skipOnboarding).toHaveBeenCalled();
      expect(mocks.thunks.fetchProfile).toHaveBeenCalled();
      expect(mocks.navigate).toHaveBeenCalledWith('/', { replace: true });
    });

    it('does NOT append tour=canvas-tour when "Skip all" is used (skip means bypass guided onboarding)', async () => {
      const tree = render();
      const headerSkip = findByPredicate(
        tree,
        (el) => el.type === 'button' && (el.props as { className?: string }).className?.includes('skipSetup') === false &&
          (el.props as { className?: string }).className?.includes('text-ice-text-3') === true,
      )[0];
      await (headerSkip.props as { onClick: () => Promise<void> }).onClick();
      const navUrl = mocks.navigate.mock.calls.at(-1)?.[0] as string;
      expect(navUrl).not.toContain('tour=canvas-tour');
      expect(navUrl).toBe('/');
    });
  });

  describe('handleFinish — happy path', () => {
    it('creates project, completes onboarding, and navigates to org/project slug with tour param', async () => {
      mocks.reduxState.currentStep = 3;
      mocks.reduxState.projectName = 'My Cool App';
      mocks.reduxState.selectedOrg = { id: 'org-1', name: 'My Org' };
      const tree = render();
      const next = findById(tree, 'ice-onboarding-nav-btn-next')!;
      await (next.props as { onClick: () => Promise<void> }).onClick();
      expect(mocks.axios.post).toHaveBeenCalledWith('/canvas/projects/create', {
        name: 'My Cool App',
        type: 'project',
        organisationId: 'org-1',
      });
      expect(mocks.thunks.completeOnboarding).toHaveBeenCalled();
      expect(mocks.navigate).toHaveBeenCalledWith('/my-org/my-project?tour=canvas-tour', { replace: true });
    });

    it('appends ?tour=canvas-tour to the post-create redirect URL', async () => {
      mocks.reduxState.currentStep = 3;
      mocks.reduxState.projectName = 'Tour App';
      mocks.reduxState.selectedOrg = { id: 'org-1', name: 'Org' };
      const tree = render();
      const next = findById(tree, 'ice-onboarding-nav-btn-next')!;
      await (next.props as { onClick: () => Promise<void> }).onClick();
      const navUrl = mocks.navigate.mock.calls.at(-1)?.[0] as string;
      expect(navUrl).toContain('?tour=canvas-tour');
    });

    it('uses "My Project" default when projectName is blank', async () => {
      mocks.reduxState.currentStep = 3;
      mocks.reduxState.projectName = '   ';
      const tree = render();
      const next = findById(tree, 'ice-onboarding-nav-btn-next')!;
      await (next.props as { onClick: () => Promise<void> }).onClick();
      expect(mocks.axios.post).toHaveBeenCalledWith('/canvas/projects/create', {
        name: 'My Project',
        type: 'project',
        organisationId: undefined,
      });
    });

    it('also saves provider+region when provider is set', async () => {
      mocks.reduxState.currentStep = 3;
      mocks.reduxState.defaultProvider = 'gcp';
      mocks.reduxState.defaultRegion = 'us-central1';
      const tree = render();
      const next = findById(tree, 'ice-onboarding-nav-btn-next')!;
      await (next.props as { onClick: () => Promise<void> }).onClick();
      expect(mocks.axios.post).toHaveBeenCalledWith('/canvas/projects/update', {
        projectId: 'new-project-1',
        provider: 'gcp',
        region: 'us-central1',
      });
    });

    it('passes empty region when provider set but region missing', async () => {
      mocks.reduxState.currentStep = 3;
      mocks.reduxState.defaultProvider = 'gcp';
      mocks.reduxState.defaultRegion = null;
      const tree = render();
      const next = findById(tree, 'ice-onboarding-nav-btn-next')!;
      await (next.props as { onClick: () => Promise<void> }).onClick();
      expect(mocks.axios.post).toHaveBeenCalledWith('/canvas/projects/update', {
        projectId: 'new-project-1',
        provider: 'gcp',
        region: '',
      });
    });

    it('skips provider update when provider is null', async () => {
      mocks.reduxState.currentStep = 3;
      mocks.reduxState.defaultProvider = null;
      const tree = render();
      const next = findById(tree, 'ice-onboarding-nav-btn-next')!;
      await (next.props as { onClick: () => Promise<void> }).onClick();
      const updateCalls = mocks.axios.post.mock.calls.filter(
        (c) => c[0] === '/canvas/projects/update',
      );
      expect(updateCalls).toHaveLength(0);
    });

    it('expands template + creates a card when a template is selected', async () => {
      mocks.reduxState.currentStep = 3;
      mocks.reduxState.selectedTemplateId = 'tmpl-1';
      mocks.reduxState.defaultProvider = 'aws';
      mocks.axios.post
        .mockResolvedValueOnce({ data: { id: 'pid', slug: 'pslug' } }) // create project
        .mockResolvedValueOnce({ data: {} }) // update provider
        .mockResolvedValueOnce({ data: { id: 'card-1' } }) // create card
        .mockResolvedValueOnce({ data: {} }); // update card
      const tree = render();
      const next = findById(tree, 'ice-onboarding-nav-btn-next')!;
      await (next.props as { onClick: () => Promise<void> }).onClick();
      expect(mocks.expandSpy).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'tmpl-1' }),
        'aws',
      );
      expect(mocks.axios.post).toHaveBeenCalledWith('/canvas/cards/create', expect.any(Object));
      expect(mocks.axios.post).toHaveBeenCalledWith('/canvas/cards/update', expect.any(Object));
    });

    it('expands template with undefined provider when provider is null', async () => {
      mocks.reduxState.currentStep = 3;
      mocks.reduxState.selectedTemplateId = 'tmpl-1';
      mocks.reduxState.defaultProvider = null;
      mocks.axios.post
        .mockResolvedValueOnce({ data: { id: 'pid', slug: 'pslug' } })
        .mockResolvedValueOnce({ data: { id: 'card-1' } })
        .mockResolvedValueOnce({ data: {} });
      const tree = render();
      const next = findById(tree, 'ice-onboarding-nav-btn-next')!;
      await (next.props as { onClick: () => Promise<void> }).onClick();
      expect(mocks.expandSpy).toHaveBeenCalledWith(expect.objectContaining({ id: 'tmpl-1' }), undefined);
    });

    it('skips card creation when selectedTemplateId is null', async () => {
      mocks.reduxState.currentStep = 3;
      mocks.reduxState.selectedTemplateId = null;
      const tree = render();
      const next = findById(tree, 'ice-onboarding-nav-btn-next')!;
      await (next.props as { onClick: () => Promise<void> }).onClick();
      const cardCalls = mocks.axios.post.mock.calls.filter(
        (c) => c[0] === '/canvas/cards/create' || c[0] === '/canvas/cards/update',
      );
      expect(cardCalls).toHaveLength(0);
    });

    it('skips card creation when selectedTemplateId does not match any template', async () => {
      mocks.reduxState.currentStep = 3;
      mocks.reduxState.selectedTemplateId = 'unknown-tmpl';
      const tree = render();
      const next = findById(tree, 'ice-onboarding-nav-btn-next')!;
      await (next.props as { onClick: () => Promise<void> }).onClick();
      const cardCalls = mocks.axios.post.mock.calls.filter(
        (c) => c[0] === '/canvas/cards/create' || c[0] === '/canvas/cards/update',
      );
      expect(cardCalls).toHaveLength(0);
    });

    it('navigates with empty orgSlug when no selectedOrg', async () => {
      mocks.reduxState.currentStep = 3;
      mocks.reduxState.projectName = 'Solo';
      mocks.reduxState.selectedOrg = null;
      const tree = render();
      const next = findById(tree, 'ice-onboarding-nav-btn-next')!;
      await (next.props as { onClick: () => Promise<void> }).onClick();
      expect(mocks.navigate).toHaveBeenCalledWith('//my-project?tour=canvas-tour', { replace: true });
    });

    it('falls back to slugified name when project.slug is missing', async () => {
      mocks.reduxState.currentStep = 3;
      mocks.reduxState.projectName = 'My App';
      mocks.reduxState.selectedOrg = { id: 'org-1', name: 'Org' };
      mocks.axios.post.mockResolvedValueOnce({ data: { id: 'p1' } }); // no slug
      const tree = render();
      const next = findById(tree, 'ice-onboarding-nav-btn-next')!;
      await (next.props as { onClick: () => Promise<void> }).onClick();
      // toSlug called with name "My App"
      expect(mocks.toSlugSpy).toHaveBeenCalledWith('My App');
    });
  });

  describe('handleFinish — error path', () => {
    it('navigates to / and still completes onboarding when project creation fails', async () => {
      mocks.reduxState.currentStep = 3;
      mocks.axios.post.mockRejectedValueOnce(new Error('boom'));
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const tree = render();
      const next = findById(tree, 'ice-onboarding-nav-btn-next')!;
      await (next.props as { onClick: () => Promise<void> }).onClick();
      expect(mocks.thunks.completeOnboarding).toHaveBeenCalled();
      expect(mocks.thunks.fetchProfile).toHaveBeenCalled();
      expect(mocks.navigate).toHaveBeenCalledWith('/', { replace: true });
      errorSpy.mockRestore();
    });
  });
});
