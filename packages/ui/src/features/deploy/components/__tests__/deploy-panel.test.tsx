/**
 * Tests for `DeployPanel` — orchestrator FC.
 *
 * Strategy:
 *   - Mock all sub-components as opaque markers so the walker can find
 *     them by reference equality.
 *   - Mock React hooks (`useSelector`, `useDispatch`, `useState`,
 *     `useMemo`, `useRef`, `useEffect`).
 *   - Mock the three custom hooks (`useDeployActions`, `useDeployEffects`,
 *     `useDestroyAction`).
 *
 * Coverage focus: composition, prop wiring, and the visibility-gated
 * `isOpen` short-circuit. The action dispatchers wired into props are
 * smoke-tested via callback invocation.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks ──────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  state: {
    deploy: {
      isOpen: false,
      status: 'idle',
      provider: 'gcp',
      gcpProject: 'p1',
      region: 'us-central1',
      environment: 'production',
      logs: [] as string[],
      results: [] as unknown[],
      requirements: [] as unknown[],
      requirementsLoading: false,
      deployedResources: [] as unknown[],
      plan: null as unknown,
      error: null as string | null,
      criticalAcknowledged: false,
      nodesById: {},
      dismissedWarnings: [] as string[],
    },
  },
  dispatch: vi.fn(),
  selectActiveCard: vi.fn(() => null as unknown),
  setProvider: vi.fn((p: unknown) => ({ type: 'deploy/setProvider', payload: p })),
  setGcpProject: vi.fn((p: unknown) => ({ type: 'deploy/setGcpProject', payload: p })),
  setRegion: vi.fn((p: unknown) => ({ type: 'deploy/setRegion', payload: p })),
  setEnvironment: vi.fn((p: unknown) => ({ type: 'deploy/setEnvironment', payload: p })),
  resetDeploy: vi.fn(() => ({ type: 'deploy/reset' })),
  appendLog: vi.fn((p: unknown) => ({ type: 'deploy/appendLog', payload: p })),
  analyzePreDeploy: vi.fn(() => ({ warnings: [], hasCritical: false })),
  // Sub-component markers.
  ApiErrorBanner: vi.fn((..._args: unknown[]) => null),
  DeployControls: vi.fn((..._args: unknown[]) => null),
  DeployDiagnosis: vi.fn((..._args: unknown[]) => null),
  DeployInFlightPanel: vi.fn((..._args: unknown[]) => null),
  DestroyConfirmModal: vi.fn((..._args: unknown[]) => null),
  PlanPreview: vi.fn((..._args: unknown[]) => null),
  PreDeployWarnings: vi.fn((..._args: unknown[]) => null),
  RequirementsSection: vi.fn((..._args: unknown[]) => null),
  ResultsSummary: vi.fn((..._args: unknown[]) => null),
  AuthBanner: vi.fn((..._args: unknown[]) => null),
  ConfigSection: vi.fn((..._args: unknown[]) => null),
  DeployedResourcesList: vi.fn((..._args: unknown[]) => null),
  DnsRecordsSection: vi.fn((..._args: unknown[]) => null),
  LogPanel: vi.fn((..._args: unknown[]) => null),
  StatusBadge: vi.fn((..._args: unknown[]) => null),
  PanelHeader: vi.fn((..._args: unknown[]) => null),
  // Hook returns.
  useDeployActions: vi.fn(() => ({
    fetchRequirements: vi.fn(),
    handleVerifyRequirement: vi.fn(),
    handlePlan: vi.fn(),
    handleDeploy: vi.fn(),
    handleClose: vi.fn(),
  })),
  useDeployEffects: vi.fn(() => ({ logEndRef: { current: null } })),
  useDestroyAction: vi.fn(() => ({ handleDestroyConfirm: vi.fn() })),
  // useState mock — destroyModalOpen.
  destroyModalOpenRef: { current: false },
  setDestroyModalOpenSpy: vi.fn(),
}));

vi.mock('react', async (orig) => {
  const actual = (await orig()) as typeof import('react');
  const useStateStub = <T,>(initial: T | (() => T)) => {
    void initial;
    return [mocks.destroyModalOpenRef.current as unknown as T, mocks.setDestroyModalOpenSpy as unknown];
  };
  const useEffectStub = (fn: () => void | (() => void)) => {
    fn();
  };
  const useMemoStub = <T,>(fn: () => T) => fn();
  const useCallbackStub = <T,>(fn: T) => fn;
  const useRefStub = <T,>(initial: T) => ({ current: initial });
  const actualDefault = (actual as unknown as { default?: typeof actual }).default ?? actual;
  return {
    ...actual,
    default: {
      ...actualDefault,
      useState: useStateStub,
      useEffect: useEffectStub,
      useMemo: useMemoStub,
      useCallback: useCallbackStub,
      useRef: useRefStub,
    },
    useState: useStateStub,
    useEffect: useEffectStub,
    useMemo: useMemoStub,
    useCallback: useCallbackStub,
    useRef: useRefStub,
  };
});

vi.mock('react-redux', () => ({
  useSelector: (sel: (s: unknown) => unknown) => sel(mocks.state),
  useDispatch: () => mocks.dispatch,
}));

vi.mock('../../../../i18n', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock('../banners/api-error-banner', () => ({ ApiErrorBanner: mocks.ApiErrorBanner }));
vi.mock('../deploy-controls', () => ({ DeployControls: mocks.DeployControls }));
vi.mock('../deploy-diagnosis', () => ({ DeployDiagnosis: mocks.DeployDiagnosis }));
vi.mock('../deploy-in-flight-panel', () => ({ DeployInFlightPanel: mocks.DeployInFlightPanel }));
vi.mock('../destroy-confirm-modal', () => ({ DestroyConfirmModal: mocks.DestroyConfirmModal }));
vi.mock('../plan-preview', () => ({ PlanPreview: mocks.PlanPreview }));
vi.mock('../predeploy-warnings', () => ({ PreDeployWarnings: mocks.PreDeployWarnings }));
vi.mock('../requirements-section', () => ({ RequirementsSection: mocks.RequirementsSection }));
vi.mock('../results-summary', () => ({ ResultsSummary: mocks.ResultsSummary }));
vi.mock('../sections/auth-banner', () => ({ AuthBanner: mocks.AuthBanner }));
vi.mock('../sections/config-section', () => ({ ConfigSection: mocks.ConfigSection }));
vi.mock('../sections/deployed-resources-list', () => ({
  DeployedResourcesList: mocks.DeployedResourcesList,
}));
vi.mock('../sections/dns-records-section', () => ({ DnsRecordsSection: mocks.DnsRecordsSection }));
vi.mock('../sections/log-panel', () => ({ LogPanel: mocks.LogPanel }));
vi.mock('../status-badge', () => ({ StatusBadge: mocks.StatusBadge }));
vi.mock('../../../../shared/components/ui/panel-header', () => ({ PanelHeader: mocks.PanelHeader }));

vi.mock('../../hooks/use-deploy-actions', () => ({ useDeployActions: mocks.useDeployActions }));
vi.mock('../../hooks/use-deploy-effects', () => ({ useDeployEffects: mocks.useDeployEffects }));
vi.mock('../../hooks/use-destroy-action', () => ({ useDestroyAction: mocks.useDestroyAction }));

vi.mock('../../../../store/slices/cards-slice', () => ({
  selectActiveCard: mocks.selectActiveCard,
}));

vi.mock('../../../../store/slices/deploy-slice', () => ({
  setProvider: mocks.setProvider,
  setGcpProject: mocks.setGcpProject,
  setRegion: mocks.setRegion,
  setEnvironment: mocks.setEnvironment,
  resetDeploy: mocks.resetDeploy,
  appendLog: mocks.appendLog,
}));

vi.mock('../../utils/predeploy-analysis', () => ({
  analyzePreDeploy: mocks.analyzePreDeploy,
}));

vi.mock('../../utils/provider-regions', () => ({
  PROVIDER_REGIONS: { gcp: ['us-central1', 'us-east1'], aws: ['us-east-1'] },
  PROVIDER_LABELS: { gcp: 'Google Cloud', aws: 'AWS' },
}));

import { DeployPanel } from '../deploy-panel';

// ─── Tree walker ────────────────────────────────────────────────────────────

interface ElLike {
  type: unknown;
  props: { [k: string]: unknown; children?: unknown };
}
function isEl(x: unknown): x is ElLike {
  return !!x && typeof x === 'object' && 'type' in x && 'props' in x;
}

const KNOWN_MOCKS = [
  mocks.ApiErrorBanner,
  mocks.DeployControls,
  mocks.DeployDiagnosis,
  mocks.DeployInFlightPanel,
  mocks.DestroyConfirmModal,
  mocks.PlanPreview,
  mocks.PreDeployWarnings,
  mocks.RequirementsSection,
  mocks.ResultsSummary,
  mocks.AuthBanner,
  mocks.ConfigSection,
  mocks.DeployedResourcesList,
  mocks.DnsRecordsSection,
  mocks.LogPanel,
  mocks.StatusBadge,
  mocks.PanelHeader,
] as const;

function* walk(node: unknown): Generator<ElLike> {
  if (Array.isArray(node)) {
    for (const c of node) yield* walk(c);
    return;
  }
  if (!isEl(node)) return;
  yield node;
  // For known mocks: invoke the FC once (so it records the call + props),
  // but stop descending — we don't need to walk the mock's null body.
  if ((KNOWN_MOCKS as readonly unknown[]).includes(node.type)) {
    try {
      (node.type as (p: unknown) => unknown)(node.props);
    } catch {
      /* opaque */
    }
    return;
  }
  if (typeof node.type === 'function') {
    try {
      const FC = node.type as (p: unknown) => unknown;
      yield* walk(FC(node.props));
    } catch {
      /* opaque */
    }
    return;
  }
  yield* walk(node.props.children);
}

function findFirst(tree: unknown, pred: (el: ElLike) => boolean): ElLike | undefined {
  for (const el of walk(tree)) if (pred(el)) return el;
  return undefined;
}

function findAll(tree: unknown, pred: (el: ElLike) => boolean): ElLike[] {
  const out: ElLike[] = [];
  for (const el of walk(tree)) if (pred(el)) out.push(el);
  return out;
}

const renderPanel = (): React.ReactElement | null => {
  const tree = (DeployPanel as unknown as () => React.ReactElement | null)();
  // Walk to invoke nested FCs so mock components record their props.
  if (tree) void [...walk(tree)];
  return tree;
};

beforeEach(() => {
  mocks.state.deploy = {
    isOpen: true,
    status: 'idle',
    provider: 'gcp',
    gcpProject: 'p1',
    region: 'us-central1',
    environment: 'production',
    logs: [],
    results: [],
    requirements: [],
    requirementsLoading: false,
    deployedResources: [],
    plan: null,
    error: null,
    criticalAcknowledged: false,
    nodesById: {},
    dismissedWarnings: [],
  };
  mocks.dispatch.mockReset();
  mocks.selectActiveCard.mockReset();
  mocks.selectActiveCard.mockReturnValue(null);
  mocks.setProvider.mockClear();
  mocks.setGcpProject.mockClear();
  mocks.setRegion.mockClear();
  mocks.setEnvironment.mockClear();
  mocks.resetDeploy.mockClear();
  mocks.appendLog.mockClear();
  mocks.analyzePreDeploy.mockClear();
  for (const m of KNOWN_MOCKS) (m as unknown as ReturnType<typeof vi.fn>).mockClear();
  mocks.useDeployActions.mockClear();
  mocks.useDeployEffects.mockClear();
  mocks.useDestroyAction.mockClear();
  mocks.destroyModalOpenRef.current = false;
  mocks.setDestroyModalOpenSpy.mockReset();
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('DeployPanel — visibility', () => {
  it('returns null when state.deploy.isOpen is false', () => {
    mocks.state.deploy.isOpen = false;
    const tree = renderPanel();
    expect(tree).toBeNull();
  });

  it('renders the panel container when isOpen=true', () => {
    const tree = renderPanel();
    expect(tree).not.toBeNull();
    const outer = tree as ElLike;
    expect((outer.props as { id?: string }).id).toBe('ice-deploy-panel');
  });
});

describe('DeployPanel — composition', () => {
  it('renders ConfigSection, DeployControls, and PanelHeader (always)', () => {
    renderPanel();
    expect(mocks.ConfigSection).toHaveBeenCalled();
    expect(mocks.DeployControls).toHaveBeenCalled();
    expect(mocks.PanelHeader).toHaveBeenCalled();
  });

  it('renders AuthBanner only when status === "authenticating"', () => {
    mocks.state.deploy.status = 'authenticating';
    renderPanel();
    expect(mocks.AuthBanner).toHaveBeenCalled();
  });

  it('does NOT render AuthBanner when status !== authenticating', () => {
    mocks.state.deploy.status = 'idle';
    renderPanel();
    expect(mocks.AuthBanner).not.toHaveBeenCalled();
  });

  it('renders DeployedResourcesList only when there are deployed resources and idle', () => {
    mocks.state.deploy.deployedResources = [{ id: 'r1' }];
    mocks.state.deploy.status = 'idle';
    renderPanel();
    expect(mocks.DeployedResourcesList).toHaveBeenCalled();
  });

  it('does NOT render DeployedResourcesList when status is not idle', () => {
    mocks.state.deploy.deployedResources = [{ id: 'r1' }];
    mocks.state.deploy.status = 'deploying';
    renderPanel();
    expect(mocks.DeployedResourcesList).not.toHaveBeenCalled();
  });

  it('renders RequirementsSection when requirements present', () => {
    mocks.state.deploy.requirements = [{ definitionId: 'd1' }];
    renderPanel();
    expect(mocks.RequirementsSection).toHaveBeenCalled();
  });

  it('renders RequirementsSection when requirementsLoading', () => {
    mocks.state.deploy.requirementsLoading = true;
    renderPanel();
    expect(mocks.RequirementsSection).toHaveBeenCalled();
  });

  it('renders PlanPreview when deploy.plan is set', () => {
    mocks.state.deploy.plan = { changes: [] };
    renderPanel();
    expect(mocks.PlanPreview).toHaveBeenCalled();
  });

  it('renders PreDeployWarnings only when status="planned" and an activeCard exists', () => {
    mocks.state.deploy.status = 'planned';
    mocks.selectActiveCard.mockReturnValue({ id: 'c1', name: 'C', nodes: [], edges: [] });
    renderPanel();
    expect(mocks.PreDeployWarnings).toHaveBeenCalled();
    expect(mocks.analyzePreDeploy).toHaveBeenCalled();
  });

  it('does NOT render PreDeployWarnings when no active card', () => {
    mocks.state.deploy.status = 'planned';
    mocks.selectActiveCard.mockReturnValue(null);
    renderPanel();
    expect(mocks.PreDeployWarnings).not.toHaveBeenCalled();
  });

  it('renders ApiErrorBanner + DeployDiagnosis when error is set', () => {
    mocks.state.deploy.error = 'Permission denied';
    renderPanel();
    expect(mocks.ApiErrorBanner).toHaveBeenCalled();
    expect(mocks.DeployDiagnosis).toHaveBeenCalled();
  });

  it('renders LogPanel when logs.length > 0', () => {
    mocks.state.deploy.logs = ['log1'];
    renderPanel();
    expect(mocks.LogPanel).toHaveBeenCalled();
  });

  it('renders DeployInFlightPanel when status === deploying', () => {
    mocks.state.deploy.status = 'deploying';
    renderPanel();
    expect(mocks.DeployInFlightPanel).toHaveBeenCalled();
  });

  it('renders DeployInFlightPanel when status === destroying', () => {
    mocks.state.deploy.status = 'destroying';
    renderPanel();
    expect(mocks.DeployInFlightPanel).toHaveBeenCalled();
  });

  it('renders ResultsSummary when results exist + status not in deploying/destroying', () => {
    mocks.state.deploy.results = [{ name: 'r1' }];
    mocks.state.deploy.status = 'success';
    renderPanel();
    expect(mocks.ResultsSummary).toHaveBeenCalled();
  });

  it('does NOT render ResultsSummary when status is deploying', () => {
    mocks.state.deploy.results = [{ name: 'r1' }];
    mocks.state.deploy.status = 'deploying';
    renderPanel();
    expect(mocks.ResultsSummary).not.toHaveBeenCalled();
  });
});

describe('DeployPanel — destroy modal', () => {
  it('does NOT render DestroyConfirmModal when destroyModalOpen=false', () => {
    mocks.destroyModalOpenRef.current = false;
    renderPanel();
    expect(mocks.DestroyConfirmModal).not.toHaveBeenCalled();
  });

  it('does NOT render DestroyConfirmModal when no active card', () => {
    mocks.destroyModalOpenRef.current = true;
    mocks.selectActiveCard.mockReturnValue(null);
    renderPanel();
    expect(mocks.DestroyConfirmModal).not.toHaveBeenCalled();
  });

  it('renders DestroyConfirmModal when destroyModalOpen=true and active card exists', () => {
    mocks.destroyModalOpenRef.current = true;
    mocks.selectActiveCard.mockReturnValue({ id: 'c1', name: 'My Card', nodes: [], edges: [] });
    renderPanel();
    expect(mocks.DestroyConfirmModal).toHaveBeenCalled();
  });

  it('DestroyConfirmModal onCancel calls setDestroyModalOpen(false)', () => {
    mocks.destroyModalOpenRef.current = true;
    mocks.selectActiveCard.mockReturnValue({ id: 'c1', name: 'My Card', nodes: [], edges: [] });
    renderPanel();
    const props = mocks.DestroyConfirmModal.mock.calls[0][0] as { onCancel: () => void };
    props.onCancel();
    expect(mocks.setDestroyModalOpenSpy).toHaveBeenCalledWith(false);
  });
});

describe('DeployPanel — config wiring', () => {
  it('onProviderChange dispatches setProvider', () => {
    renderPanel();
    const props = mocks.ConfigSection.mock.calls[0][0] as { onProviderChange: (v: string) => void };
    props.onProviderChange('aws');
    expect(mocks.setProvider).toHaveBeenCalledWith('aws');
  });

  it('onProviderChange also dispatches setRegion when current region not in new provider', () => {
    mocks.state.deploy.region = 'eu-west-3'; // not in aws fixture
    renderPanel();
    const props = mocks.ConfigSection.mock.calls[0][0] as { onProviderChange: (v: string) => void };
    props.onProviderChange('aws');
    expect(mocks.setRegion).toHaveBeenCalledWith('us-east-1');
  });

  it('onProviderChange does NOT dispatch setRegion when region is valid for new provider', () => {
    mocks.state.deploy.region = 'us-east1'; // gcp has us-east1
    renderPanel();
    const props = mocks.ConfigSection.mock.calls[0][0] as { onProviderChange: (v: string) => void };
    props.onProviderChange('gcp');
    expect(mocks.setRegion).not.toHaveBeenCalled();
  });

  it('onProjectChange dispatches setGcpProject', () => {
    renderPanel();
    const props = mocks.ConfigSection.mock.calls[0][0] as { onProjectChange: (v: string) => void };
    props.onProjectChange('proj-2');
    expect(mocks.setGcpProject).toHaveBeenCalledWith('proj-2');
  });

  it('onRegionChange dispatches setRegion', () => {
    renderPanel();
    const props = mocks.ConfigSection.mock.calls[0][0] as { onRegionChange: (v: string) => void };
    props.onRegionChange('us-east1');
    expect(mocks.setRegion).toHaveBeenCalledWith('us-east1');
  });

  it('onEnvironmentChange dispatches setEnvironment', () => {
    renderPanel();
    const props = mocks.ConfigSection.mock.calls[0][0] as { onEnvironmentChange: (v: string) => void };
    props.onEnvironmentChange('staging');
    expect(mocks.setEnvironment).toHaveBeenCalledWith('staging');
  });
});

describe('DeployPanel — controls wiring', () => {
  it('onReset dispatches resetDeploy', () => {
    renderPanel();
    const props = mocks.DeployControls.mock.calls[0][0] as { onReset: () => void };
    props.onReset();
    expect(mocks.resetDeploy).toHaveBeenCalled();
  });

  it('onAppendLog dispatches appendLog', () => {
    renderPanel();
    const props = mocks.DeployControls.mock.calls[0][0] as { onAppendLog: (msg: string) => void };
    props.onAppendLog('a log line');
    expect(mocks.appendLog).toHaveBeenCalledWith('a log line');
  });

  it('onOpenDestroyModal flips destroyModalOpen', () => {
    renderPanel();
    const props = mocks.DeployControls.mock.calls[0][0] as { onOpenDestroyModal: () => void };
    props.onOpenDestroyModal();
    expect(mocks.setDestroyModalOpenSpy).toHaveBeenCalledWith(true);
  });
});

describe('DeployPanel — canvas summary', () => {
  it('renders the active card name', () => {
    mocks.selectActiveCard.mockReturnValue({ id: 'c1', name: 'My Card', nodes: [], edges: [] });
    const tree = renderPanel();
    const text = collectText(tree);
    expect(text).toContain('My Card');
  });

  it('renders deploy.card.untitled when no active card', () => {
    mocks.selectActiveCard.mockReturnValue(null);
    const tree = renderPanel();
    const text = collectText(tree);
    expect(text).toContain('deploy.card.untitled');
  });

  it('renders the provider node count + label', () => {
    mocks.selectActiveCard.mockReturnValue({
      id: 'c1',
      name: 'C',
      nodes: [
        { id: 'n1', type: 'resource', data: { provider: 'gcp' } },
        { id: 'n2', type: 'resource', data: { provider: 'gcp' } },
      ],
      edges: [],
    });
    const tree = renderPanel();
    const text = collectText(tree);
    expect(text).toContain('2 deployable resource');
    expect(text).toContain('Google Cloud');
  });

  it('shows "skipped" suffix when some resources have a different provider', () => {
    mocks.selectActiveCard.mockReturnValue({
      id: 'c1',
      name: 'C',
      nodes: [
        { id: 'n1', type: 'resource', data: { provider: 'gcp' } },
        { id: 'n2', type: 'resource', data: { provider: 'aws' } },
      ],
      edges: [],
    });
    const tree = renderPanel();
    const text = collectText(tree);
    expect(text).toContain('1 skipped');
  });

  it('singularises "deployable resource" when exactly 1', () => {
    mocks.selectActiveCard.mockReturnValue({
      id: 'c1',
      name: 'C',
      nodes: [{ id: 'n1', type: 'resource', data: { provider: 'gcp' } }],
      edges: [],
    });
    const tree = renderPanel();
    const text = collectText(tree);
    expect(text).toContain('1 deployable resource ');
    expect(text).not.toContain('1 deployable resources');
  });

  it('falls back to provider id when label is missing', () => {
    mocks.state.deploy.provider = 'unknown-provider' as 'gcp';
    mocks.selectActiveCard.mockReturnValue({
      id: 'c1',
      name: 'C',
      nodes: [],
      edges: [],
    });
    const tree = renderPanel();
    const text = collectText(tree);
    expect(text).toContain('unknown-provider');
  });

  it('uses provider id in the "skipped" suffix when label is missing AND there are non-matching resources', () => {
    mocks.state.deploy.provider = 'unknown-provider' as 'gcp';
    mocks.selectActiveCard.mockReturnValue({
      id: 'c1',
      name: 'C',
      nodes: [
        { id: 'n1', type: 'resource', data: { provider: 'gcp' } },
        { id: 'n2', type: 'resource', data: { provider: 'aws' } },
      ],
      edges: [],
    });
    const tree = renderPanel();
    const text = collectText(tree);
    // Both occurrences of fallback (line 156 + 160) collapse to 'unknown-provider'.
    expect(text).toContain('skipped');
    expect(text).toContain('unknown-provider');
  });
});

// Helper appended last to keep imports tidy.
function collectText(tree: unknown): string {
  let s = '';
  for (const el of walk(tree)) {
    const c = el.props.children;
    if (typeof c === 'string') s += c;
    else if (typeof c === 'number') s += String(c);
    else if (Array.isArray(c)) {
      for (const item of c) {
        if (typeof item === 'string') s += item;
        else if (typeof item === 'number') s += String(item);
      }
    }
  }
  return s;
}

// suppress unused-import lint
void findFirst;
void findAll;
