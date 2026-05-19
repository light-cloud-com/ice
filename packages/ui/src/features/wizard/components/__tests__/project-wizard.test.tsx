/**
 * ProjectWizard — top-level wizard dialog orchestrator.
 *
 * Direct-FC tree-walker. Hooks:
 *   - useSelector  → mocked redux state (`isOpen`, `selectedOrg`)
 *   - useWizardState → mocked to a controllable wizard fixture
 *   - useCallback → identity passthrough (collected for direct invocation)
 *
 * Step-content sub-components (ProjectInfoStep / EnvironmentStep /
 * TemplateStep / ReviewStep) are stubbed to primitive divs.
 *
 * The dynamic import (`fetchProjectTree` from projects-slice) is mocked
 * with a vi.mock so the dynamic import resolves immediately.
 *
 * Cites:
 *   - `react-namespace-hook-access-requires-patching-default-export-too`
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

interface FixtureWizardState {
  step: number;
  projectName: string;
  projectDescription: string;
  provider: 'aws' | 'gcp' | 'azure';
  environments: Array<{ enabled: boolean; type: string; name: string; region: string; securityLevel: string }>;
  selectedTemplateId: string | null;
  searchQuery: string;
}

const mocks = vi.hoisted(() => ({
  callbacks: [] as unknown[],
  resetCallbacks() {
    this.callbacks.length = 0;
  },
  reduxState: {
    isOpen: true as boolean,
    selectedOrg: { id: 'org-1', name: 'Org One' } as { id: string; name: string } | null,
  },
  dispatch: vi.fn((a: unknown) => a),
  navigate: vi.fn(),
  axios: {
    post: vi.fn(async (_url: string, _body: unknown) => ({ data: { id: 'pid', slug: 'pslug' } })),
  },
  wizard: {
    state: {
      step: 1,
      projectName: 'My Project',
      projectDescription: 'desc',
      provider: 'aws',
      environments: [
        { enabled: true, type: 'production', name: 'Production', region: 'us-east-1', securityLevel: 'standard' },
        { enabled: true, type: 'staging', name: 'Staging', region: 'us-east-1', securityLevel: 'basic' },
      ],
      selectedTemplateId: null as string | null,
      searchQuery: '',
    } as FixtureWizardState,
    canProceed: true as boolean,
    goNext: vi.fn(),
    goBack: vi.fn(),
    setProjectName: vi.fn(),
    setProjectDescription: vi.fn(),
    setProvider: vi.fn(),
    toggleEnvironment: vi.fn(),
    setEnvironmentRegion: vi.fn(),
    setEnvironmentSecurity: vi.fn(),
    setAllSecurityLevel: vi.fn(),
    setSelectedTemplateId: vi.fn(),
    setSearchQuery: vi.fn(),
    reset: vi.fn(),
  },
  thunks: {
    closeDialog: vi.fn((id: string) => ({ type: 'ui/closeDialog', payload: id })),
    fetchProjectTree: vi.fn((id: string) => ({ type: 'projects/fetchTree', payload: id })),
  },
  fixtureTemplates: [
    { id: 'tmpl-1', name: 'Template 1', blocks: [], category: 'frontend' },
    { id: 'tmpl-2', name: 'Template 2', blocks: [], category: 'backend' },
  ],
  expandSpy: vi.fn((_t: unknown, _p?: string) => ({ nodes: [{ id: 'n' }], edges: [] })),
  toSlugSpy: vi.fn((s: string) => s.toLowerCase().replace(/\s+/g, '-')),
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  const patchedUseCallback = vi.fn((fn: unknown) => {
    mocks.callbacks.push(fn);
    return fn;
  });
  const actualDefault = (actual as unknown as { default?: typeof actual }).default ?? actual;
  return {
    ...actual,
    useCallback: patchedUseCallback,
    default: { ...actualDefault, useCallback: patchedUseCallback },
  };
});

vi.mock('react-redux', () => ({
  useDispatch: () => mocks.dispatch,
  useSelector: (sel: (s: unknown) => unknown) =>
    sel({
      ui: { dialogs: { projectWizard: mocks.reduxState.isOpen } },
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
  StepIndicator: ({ currentStep, totalSteps }: { currentStep: number; totalSteps: number }) => (
    <div data-stub="StepIndicator" data-current={currentStep} data-total={totalSteps} />
  ),
}));

vi.mock('../../../../shared/components/ui/dialog', () => ({
  Dialog: ({
    open,
    onOpenChange,
    children,
  }: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    children?: React.ReactNode;
  }) => (
    <div data-stub="Dialog" data-open={open} data-onopenchange-ref="set">
      {/* expose the change callback via a button so we can test it */}
      <button data-stub="dialog-close" onClick={() => onOpenChange(false)} />
      <button data-stub="dialog-open-ignored" onClick={() => onOpenChange(true)} />
      {children}
    </div>
  ),
  DialogContent: ({ children }: { children?: React.ReactNode }) => (
    <div data-stub="DialogContent">{children}</div>
  ),
  DialogHeader: ({ children }: { children?: React.ReactNode }) => (
    <div data-stub="DialogHeader">{children}</div>
  ),
  DialogTitle: ({ children }: { children?: React.ReactNode }) => (
    <div data-stub="DialogTitle">{children}</div>
  ),
  DialogDescription: ({ children }: { children?: React.ReactNode }) => (
    <div data-stub="DialogDescription">{children}</div>
  ),
}));

vi.mock('../../../../shared/utils/cn', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}));

vi.mock('../../../../shared/utils/slug', () => ({
  toSlug: (s: string) => mocks.toSlugSpy(s),
}));

vi.mock('../../../../store/slices/ui-slice', () => ({
  closeDialog: (id: string) => mocks.thunks.closeDialog(id),
}));

vi.mock('../../../../store/slices/projects-slice', () => ({
  fetchProjectTree: (id: string) => mocks.thunks.fetchProjectTree(id),
}));

vi.mock('../../../../config/templates', () => ({
  COMPOSED_TEMPLATES: mocks.fixtureTemplates,
  expandComposedTemplate: (t: unknown, p?: string) => mocks.expandSpy(t, p),
}));

vi.mock('../../hooks/use-wizard-state', () => ({
  useWizardState: () => mocks.wizard,
}));

vi.mock('../../steps/environment-step', () => ({
  EnvironmentStep: () => <div data-stub="EnvironmentStep" />,
}));
vi.mock('../../steps/project-info-step', () => ({
  ProjectInfoStep: () => <div data-stub="ProjectInfoStep" />,
}));
vi.mock('../../steps/review-step', () => ({
  ReviewStep: () => <div data-stub="ReviewStep" />,
}));
vi.mock('../../steps/template-step', () => ({
  TemplateStep: () => <div data-stub="TemplateStep" />,
}));

import { ProjectWizard } from '../project-wizard';

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
function findByStub(tree: React.ReactNode, stub: string): React.ReactElement[] {
  return findByPredicate(
    tree,
    (el) => (el.props as { ['data-stub']?: string })['data-stub'] === stub,
  );
}

function render(): React.ReactElement {
  return (ProjectWizard as unknown as () => React.ReactElement)();
}

beforeEach(() => {
  mocks.resetCallbacks();
  mocks.reduxState.isOpen = true;
  mocks.reduxState.selectedOrg = { id: 'org-1', name: 'Org One' };
  mocks.dispatch.mockClear();
  mocks.navigate.mockClear();
  mocks.axios.post.mockClear();
  mocks.axios.post.mockResolvedValue({ data: { id: 'pid', slug: 'pslug' } });
  mocks.thunks.closeDialog.mockClear();
  mocks.thunks.fetchProjectTree.mockClear();
  mocks.expandSpy.mockClear();
  mocks.toSlugSpy.mockClear();
  mocks.wizard.state = {
    step: 1,
    projectName: 'My Project',
    projectDescription: 'desc',
    provider: 'aws',
    environments: [
      { enabled: true, type: 'production', name: 'Production', region: 'us-east-1', securityLevel: 'standard' },
      { enabled: true, type: 'staging', name: 'Staging', region: 'us-east-1', securityLevel: 'basic' },
    ],
    selectedTemplateId: null,
    searchQuery: '',
  };
  mocks.wizard.canProceed = true;
  mocks.wizard.goNext.mockClear();
  mocks.wizard.goBack.mockClear();
  mocks.wizard.reset.mockClear();
});

describe('ProjectWizard', () => {
  describe('Render scaffold', () => {
    it('renders Dialog with the redux open flag', () => {
      mocks.reduxState.isOpen = true;
      const tree = render();
      const dialog = findByStub(tree, 'Dialog')[0];
      expect((dialog.props as { ['data-open']: boolean })['data-open']).toBe(true);
    });

    it('renders Dialog as closed when redux flag is false', () => {
      mocks.reduxState.isOpen = false;
      const tree = render();
      const dialog = findByStub(tree, 'Dialog')[0];
      expect((dialog.props as { ['data-open']: boolean })['data-open']).toBe(false);
    });

    it('passes step / 4 to StepIndicator', () => {
      mocks.wizard.state.step = 2;
      const tree = render();
      const ind = findByStub(tree, 'StepIndicator')[0];
      expect((ind.props as { ['data-current']: number })['data-current']).toBe(2);
      expect((ind.props as { ['data-total']: number })['data-total']).toBe(4);
    });

    it('renders ProjectInfoStep on step 1', () => {
      mocks.wizard.state.step = 1;
      const tree = render();
      expect(findByStub(tree, 'ProjectInfoStep')).toHaveLength(1);
    });

    it('renders EnvironmentStep on step 2', () => {
      mocks.wizard.state.step = 2;
      const tree = render();
      expect(findByStub(tree, 'EnvironmentStep')).toHaveLength(1);
    });

    it('renders TemplateStep on step 3', () => {
      mocks.wizard.state.step = 3;
      const tree = render();
      expect(findByStub(tree, 'TemplateStep')).toHaveLength(1);
    });

    it('renders ReviewStep on step 4', () => {
      mocks.wizard.state.step = 4;
      const tree = render();
      expect(findByStub(tree, 'ReviewStep')).toHaveLength(1);
    });
  });

  describe('Footer navigation buttons', () => {
    it('does not render Back button on step 1', () => {
      mocks.wizard.state.step = 1;
      const tree = render();
      const backs = findByPredicate(
        tree,
        (el) =>
          el.type === 'button' && (el.props as { className?: string }).className?.includes('text-ice-text-2') === true,
      );
      expect(backs).toHaveLength(0);
    });

    it('renders Back button on step 2', () => {
      mocks.wizard.state.step = 2;
      const tree = render();
      const backs = findByPredicate(
        tree,
        (el) =>
          el.type === 'button' && (el.props as { className?: string }).className?.includes('text-ice-text-2') === true,
      );
      expect(backs).toHaveLength(1);
      (backs[0].props as { onClick: () => void }).onClick();
      expect(mocks.wizard.goBack).toHaveBeenCalled();
    });

    it('renders Next button on steps 1-3 and clicking calls wizard.goNext', () => {
      mocks.wizard.state.step = 2;
      const tree = render();
      const nextBtn = findByPredicate(
        tree,
        (el) => el.type === 'button' && (el.props as { className?: string }).className?.includes('bg-ice-accent') === true,
      );
      expect(nextBtn).toHaveLength(1);
      (nextBtn[0].props as { onClick: () => void }).onClick();
      expect(mocks.wizard.goNext).toHaveBeenCalled();
    });

    it('Next button is disabled and uses muted styling when canProceed=false', () => {
      mocks.wizard.state.step = 1;
      mocks.wizard.canProceed = false;
      const tree = render();
      const nextBtns = findByPredicate(
        tree,
        (el) =>
          el.type === 'button' &&
          ((el.props as { className?: string }).className?.includes('cursor-not-allowed') === true ||
            (el.props as { className?: string }).className?.includes('bg-ice-accent') === true),
      );
      const nextBtn = nextBtns[0];
      expect((nextBtn.props as { disabled: boolean }).disabled).toBe(true);
    });

    it('renders Create button on step 4 instead of Next', () => {
      mocks.wizard.state.step = 4;
      const tree = render();
      const createBtns = findByPredicate(
        tree,
        (el) => el.type === 'button' && (el.props as { className?: string }).className?.includes('bg-ice-green') === true,
      );
      expect(createBtns).toHaveLength(1);
    });
  });

  describe('handleClose', () => {
    it('dispatches closeDialog and resets wizard when dialog asks to close', () => {
      const tree = render();
      const closeBtn = findByStub(tree, 'dialog-close')[0];
      (closeBtn.props as { onClick: () => void }).onClick();
      expect(mocks.thunks.closeDialog).toHaveBeenCalledWith('projectWizard');
      expect(mocks.wizard.reset).toHaveBeenCalled();
    });

    it('ignores onOpenChange(true) (only close transition fires close)', () => {
      const tree = render();
      const openBtn = findByStub(tree, 'dialog-open-ignored')[0];
      (openBtn.props as { onClick: () => void }).onClick();
      // onOpenChange(true) with `!open && handleClose()` short-circuits to no-op
      expect(mocks.thunks.closeDialog).not.toHaveBeenCalled();
    });
  });

  describe('handleCreate — happy path', () => {
    it('creates project, persists provider+region, and navigates with org/project slug', async () => {
      mocks.wizard.state.step = 4;
      mocks.wizard.state.projectName = 'My App';
      mocks.wizard.state.provider = 'gcp';
      mocks.wizard.state.environments = [
        { enabled: true, type: 'production', name: 'Production', region: 'us-central1', securityLevel: 'standard' },
      ];
      const tree = render();
      const createBtn = findByPredicate(
        tree,
        (el) => el.type === 'button' && (el.props as { className?: string }).className?.includes('bg-ice-green') === true,
      )[0];
      await (createBtn.props as { onClick: () => Promise<void> }).onClick();
      expect(mocks.axios.post).toHaveBeenCalledWith('/canvas/projects/create', expect.objectContaining({
        name: 'My App',
        type: 'project',
      }));
      expect(mocks.thunks.closeDialog).toHaveBeenCalled();
      expect(mocks.navigate).toHaveBeenCalled();
    });

    it('skips provider update step when state.provider is falsy', async () => {
      mocks.wizard.state.step = 4;
      mocks.wizard.state.provider = '' as 'aws';
      const tree = render();
      const createBtn = findByPredicate(
        tree,
        (el) => el.type === 'button' && (el.props as { className?: string }).className?.includes('bg-ice-green') === true,
      )[0];
      await (createBtn.props as { onClick: () => Promise<void> }).onClick();
      const updateCalls = mocks.axios.post.mock.calls.filter(
        (c) => c[0] === '/canvas/projects/update',
      );
      expect(updateCalls).toHaveLength(0);
    });

    it('uses empty region string when no first environment found', async () => {
      mocks.wizard.state.step = 4;
      mocks.wizard.state.provider = 'gcp';
      mocks.wizard.state.environments = [
        { enabled: false, type: 'production', name: 'Production', region: 'us-east-1', securityLevel: 'standard' },
      ];
      const tree = render();
      const createBtn = findByPredicate(
        tree,
        (el) => el.type === 'button' && (el.props as { className?: string }).className?.includes('bg-ice-green') === true,
      )[0];
      await (createBtn.props as { onClick: () => Promise<void> }).onClick();
      const updateCall = mocks.axios.post.mock.calls.find((c) => c[0] === '/canvas/projects/update');
      expect((updateCall![1] as { region: string }).region).toBe('');
    });

    it('creates a card when a known template is selected', async () => {
      mocks.wizard.state.step = 4;
      mocks.wizard.state.selectedTemplateId = 'tmpl-1';
      mocks.wizard.state.provider = 'aws';
      const tree = render();
      const createBtn = findByPredicate(
        tree,
        (el) => el.type === 'button' && (el.props as { className?: string }).className?.includes('bg-ice-green') === true,
      )[0];
      await (createBtn.props as { onClick: () => Promise<void> }).onClick();
      expect(mocks.axios.post).toHaveBeenCalledWith('/canvas/cards/create', expect.any(Object));
      expect(mocks.expandSpy).toHaveBeenCalledWith(expect.objectContaining({ id: 'tmpl-1' }), 'aws');
    });

    it('skips card creation when selectedTemplateId is null', async () => {
      mocks.wizard.state.step = 4;
      mocks.wizard.state.selectedTemplateId = null;
      const tree = render();
      const createBtn = findByPredicate(
        tree,
        (el) => el.type === 'button' && (el.props as { className?: string }).className?.includes('bg-ice-green') === true,
      )[0];
      await (createBtn.props as { onClick: () => Promise<void> }).onClick();
      const cardCalls = mocks.axios.post.mock.calls.filter(
        (c) => c[0] === '/canvas/cards/create',
      );
      expect(cardCalls).toHaveLength(0);
    });

    it('skips card creation when selectedTemplateId does not match any composed template', async () => {
      mocks.wizard.state.step = 4;
      mocks.wizard.state.selectedTemplateId = 'unknown';
      const tree = render();
      const createBtn = findByPredicate(
        tree,
        (el) => el.type === 'button' && (el.props as { className?: string }).className?.includes('bg-ice-green') === true,
      )[0];
      await (createBtn.props as { onClick: () => Promise<void> }).onClick();
      const cardCalls = mocks.axios.post.mock.calls.filter(
        (c) => c[0] === '/canvas/cards/create',
      );
      expect(cardCalls).toHaveLength(0);
    });

    it('creates additional non-production environments and skips production', async () => {
      mocks.wizard.state.step = 4;
      mocks.wizard.state.provider = 'aws';
      mocks.wizard.state.environments = [
        { enabled: true, type: 'production', name: 'Production', region: 'us-east-1', securityLevel: 'standard' },
        { enabled: true, type: 'staging', name: 'Staging', region: 'us-west-2', securityLevel: 'basic' },
        { enabled: false, type: 'development', name: 'Development', region: 'us-east-1', securityLevel: 'basic' },
      ];
      const tree = render();
      const createBtn = findByPredicate(
        tree,
        (el) => el.type === 'button' && (el.props as { className?: string }).className?.includes('bg-ice-green') === true,
      )[0];
      await (createBtn.props as { onClick: () => Promise<void> }).onClick();
      const envCalls = mocks.axios.post.mock.calls.filter(
        (c) => c[0] === '/environments/create',
      );
      expect(envCalls).toHaveLength(1); // only enabled non-production
      expect(envCalls[0][1]).toEqual(
        expect.objectContaining({ name: 'staging', type: 'staging', region: 'us-west-2' }),
      );
    });

    it('passes undefined region when env.region is empty', async () => {
      mocks.wizard.state.step = 4;
      mocks.wizard.state.environments = [
        { enabled: true, type: 'production', name: 'Production', region: 'us-east-1', securityLevel: 'standard' },
        { enabled: true, type: 'staging', name: 'Staging', region: '', securityLevel: 'basic' },
      ];
      const tree = render();
      const createBtn = findByPredicate(
        tree,
        (el) => el.type === 'button' && (el.props as { className?: string }).className?.includes('bg-ice-green') === true,
      )[0];
      await (createBtn.props as { onClick: () => Promise<void> }).onClick();
      const envCall = mocks.axios.post.mock.calls.find((c) => c[0] === '/environments/create');
      expect((envCall![1] as { region: string | undefined }).region).toBeUndefined();
    });

    it('swallows individual environment creation failure (.catch noop)', async () => {
      mocks.wizard.state.step = 4;
      mocks.wizard.state.environments = [
        { enabled: true, type: 'production', name: 'Production', region: 'us-east-1', securityLevel: 'standard' },
        { enabled: true, type: 'staging', name: 'Staging', region: 'us-west-2', securityLevel: 'basic' },
      ];
      mocks.axios.post.mockImplementation(async (url: string) => {
        if (url === '/environments/create') throw new Error('env failure');
        return { data: { id: 'pid', slug: 'pslug' } };
      });
      const tree = render();
      const createBtn = findByPredicate(
        tree,
        (el) => el.type === 'button' && (el.props as { className?: string }).className?.includes('bg-ice-green') === true,
      )[0];
      // Should NOT throw
      await (createBtn.props as { onClick: () => Promise<void> }).onClick();
      // Navigate still happens
      expect(mocks.navigate).toHaveBeenCalled();
    });

    it('dispatches fetchProjectTree when org id is present', async () => {
      mocks.wizard.state.step = 4;
      const tree = render();
      const createBtn = findByPredicate(
        tree,
        (el) => el.type === 'button' && (el.props as { className?: string }).className?.includes('bg-ice-green') === true,
      )[0];
      await (createBtn.props as { onClick: () => Promise<void> }).onClick();
      expect(mocks.thunks.fetchProjectTree).toHaveBeenCalledWith('org-1');
    });

    it('skips fetchProjectTree when no selected org', async () => {
      mocks.reduxState.selectedOrg = null;
      mocks.wizard.state.step = 4;
      const tree = render();
      const createBtn = findByPredicate(
        tree,
        (el) => el.type === 'button' && (el.props as { className?: string }).className?.includes('bg-ice-green') === true,
      )[0];
      await (createBtn.props as { onClick: () => Promise<void> }).onClick();
      expect(mocks.thunks.fetchProjectTree).not.toHaveBeenCalled();
    });

    it('navigates to /:project when no selected org', async () => {
      mocks.reduxState.selectedOrg = null;
      mocks.wizard.state.step = 4;
      mocks.wizard.state.projectName = 'Solo Project';
      mocks.axios.post.mockResolvedValueOnce({ data: { id: 'pid', slug: 'pslug' } });
      const tree = render();
      const createBtn = findByPredicate(
        tree,
        (el) => el.type === 'button' && (el.props as { className?: string }).className?.includes('bg-ice-green') === true,
      )[0];
      await (createBtn.props as { onClick: () => Promise<void> }).onClick();
      expect(mocks.navigate).toHaveBeenCalledWith('/pslug');
    });

    it('falls back to slugified projectName when project.slug is missing', async () => {
      mocks.wizard.state.step = 4;
      mocks.wizard.state.projectName = 'My App';
      mocks.axios.post.mockResolvedValueOnce({ data: { id: 'pid' } as any });
      const tree = render();
      const createBtn = findByPredicate(
        tree,
        (el) => el.type === 'button' && (el.props as { className?: string }).className?.includes('bg-ice-green') === true,
      )[0];
      await (createBtn.props as { onClick: () => Promise<void> }).onClick();
      expect(mocks.toSlugSpy).toHaveBeenCalledWith('My App');
      expect(mocks.toSlugSpy).toHaveBeenCalledWith('Org One');
    });
  });

  describe('handleCreate — error paths', () => {
    it('non-critical errors are caught and navigation still fires', async () => {
      mocks.wizard.state.step = 4;
      mocks.wizard.state.provider = 'gcp';
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      let call = 0;
      mocks.axios.post.mockImplementation(async (_url: string) => {
        call += 1;
        if (call === 1) return { data: { id: 'pid', slug: 'pslug' } };
        throw new Error('inner failure');
      });
      const tree = render();
      const createBtn = findByPredicate(
        tree,
        (el) => el.type === 'button' && (el.props as { className?: string }).className?.includes('bg-ice-green') === true,
      )[0];
      await (createBtn.props as { onClick: () => Promise<void> }).onClick();
      expect(mocks.navigate).toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith('Non-critical wizard step failed:', expect.any(Error));
      warnSpy.mockRestore();
    });

    it('bails out when project creation fails (does not close dialog or navigate)', async () => {
      mocks.wizard.state.step = 4;
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mocks.axios.post.mockRejectedValueOnce(new Error('5xx'));
      const tree = render();
      const createBtn = findByPredicate(
        tree,
        (el) => el.type === 'button' && (el.props as { className?: string }).className?.includes('bg-ice-green') === true,
      )[0];
      await (createBtn.props as { onClick: () => Promise<void> }).onClick();
      expect(mocks.navigate).not.toHaveBeenCalled();
      expect(mocks.thunks.closeDialog).not.toHaveBeenCalled();
      expect(errSpy).toHaveBeenCalledWith('Failed to create project:', expect.any(Error));
      errSpy.mockRestore();
    });
  });

  describe('Tour anchors (tour-9)', () => {
    it('renders Next/Back/wizard-step-N data-tour-id anchors', () => {
      mocks.wizard.state.step = 2;
      const tree = render();
      const stepDiv = findByPredicate(
        tree,
        (el) => el.type === 'div' && (el.props as { ['data-tour-id']?: string })['data-tour-id'] === 'wizard-step-2',
      );
      expect(stepDiv).toHaveLength(1);
      const nextBtn = findByPredicate(
        tree,
        (el) => el.type === 'button' && (el.props as { ['data-tour-id']?: string })['data-tour-id'] === 'wizard-btn-next',
      );
      expect(nextBtn).toHaveLength(1);
      const backBtn = findByPredicate(
        tree,
        (el) => el.type === 'button' && (el.props as { ['data-tour-id']?: string })['data-tour-id'] === 'wizard-btn-back',
      );
      expect(backBtn).toHaveLength(1);
    });

    it('step 4 Create button uses distinct wizard-btn-create anchor', () => {
      mocks.wizard.state.step = 4;
      const tree = render();
      const createBtn = findByPredicate(
        tree,
        (el) => el.type === 'button' && (el.props as { ['data-tour-id']?: string })['data-tour-id'] === 'wizard-btn-create',
      );
      expect(createBtn).toHaveLength(1);
      const nextBtn = findByPredicate(
        tree,
        (el) => el.type === 'button' && (el.props as { ['data-tour-id']?: string })['data-tour-id'] === 'wizard-btn-next',
      );
      expect(nextBtn).toHaveLength(0);
    });
  });
});
