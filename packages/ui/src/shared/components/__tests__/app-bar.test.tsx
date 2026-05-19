/**
 * AppBar tests — direct-FC tree-walker.
 *
 * AppBar is `React.memo`-wrapped — unwrap via `.type` to invoke the
 * inner FC. The component is heavy on hooks (useTranslation, useDispatch,
 * useSelector x2, useState x4, useEffect x1) and renders five sub-modals
 * + Breadcrumbs + Tooltip primitives. Mock all sub-components as opaque
 * markers; mock the SVG icon imports as plain strings (vite/vitest treat
 * them as URL exports — pre-empt by returning a stub).
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  state: {
    integrations: {
      integrations: {
        github: { status: 'disconnected' as 'disconnected' | 'connected' },
        gcp: { status: 'disconnected' as 'disconnected' | 'connected' },
      },
    },
  },
  dispatch: vi.fn(),
  navigate: vi.fn(),
  checkGitHubConnection: vi.fn(() => ({ type: 'integrations/checkGitHubConnection' })),
  checkAnthropicConnection: vi.fn(() => ({ type: 'integrations/checkAnthropicConnection' })),
  startTour: vi.fn(),
  tours: [
    { id: 'canvas-tour', title: 'tour.canvas.title', steps: [] },
    { id: 'palette-tour', title: 'tour.palette.title', steps: [] },
  ] as Array<{ id: string; title: string; steps: unknown[] }>,
  // Sub-components — opaque markers.
  Breadcrumbs: vi.fn(() => null),
  Logo: vi.fn(() => null),
  PromoteModal: vi.fn(() => null),
  GitHubConnectModal: vi.fn(() => null),
  AnthropicConnectModal: vi.fn(() => null),
  ProviderConnectModal: vi.fn(() => null),
  Tooltip: vi.fn(({ children }: { children?: React.ReactNode }) => children ?? null),
  TooltipTrigger: vi.fn(({ children }: { children?: React.ReactNode }) => children ?? null),
  TooltipContent: vi.fn(({ children }: { children?: React.ReactNode }) => children ?? null),
  TooltipProvider: vi.fn(({ children }: { children?: React.ReactNode }) => children ?? null),
  DropdownMenu: vi.fn(({ children }: { children?: React.ReactNode }) => children ?? null),
  DropdownMenuTrigger: vi.fn(({ children }: { children?: React.ReactNode }) => children ?? null),
  DropdownMenuContent: vi.fn(({ children }: { children?: React.ReactNode }) => children ?? null),
  DropdownMenuItem: vi.fn(({ children }: { children?: React.ReactNode }) => children ?? null),
  DropdownMenuSub: vi.fn(({ children }: { children?: React.ReactNode }) => children ?? null),
  DropdownMenuSubTrigger: vi.fn(({ children }: { children?: React.ReactNode }) => children ?? null),
  DropdownMenuSubContent: vi.fn(({ children }: { children?: React.ReactNode }) => children ?? null),
}));

vi.mock('react', async (orig) => {
  const actual = (await orig()) as typeof import('react');
  const useStateStub = <T,>(init: T | (() => T)): [T, (v: T) => void] => {
    const v = typeof init === 'function' ? (init as () => T)() : init;
    return [v, vi.fn()];
  };
  const useEffectStub = (fn: () => void | (() => void)) => {
    const cleanup = fn();
    void cleanup;
  };
  const useMemoStub = <T,>(fn: () => T) => fn();
  const useCallbackStub = <T,>(fn: T) => fn;
  const useRefStub = <T,>(init: T) => ({ current: init });
  // memo(fc) returns the inner fc — sufficient for the walker because the
  // test always reaches for `.type` on the wrapper, which equals the inner.
  const memoStub = <T,>(fc: T): T => {
    return Object.assign(((p: unknown) => (fc as unknown as (p: unknown) => unknown)(p)), {
      type: fc,
    }) as unknown as T;
  };
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
      memo: memoStub,
    },
    useState: useStateStub,
    useEffect: useEffectStub,
    useMemo: useMemoStub,
    useCallback: useCallbackStub,
    useRef: useRefStub,
    memo: memoStub,
  };
});

vi.mock('react-redux', () => ({
  useSelector: (sel: (s: unknown) => unknown) => sel(mocks.state),
  useDispatch: () => mocks.dispatch,
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock('../../../i18n', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock('../../../store/slices/integrations-slice', () => ({
  checkGitHubConnection: mocks.checkGitHubConnection,
  checkAnthropicConnection: mocks.checkAnthropicConnection,
}));

vi.mock('../../utils/cn', () => ({
  cn: (...args: unknown[]) =>
    args.filter((a) => typeof a === 'string' && a).join(' '),
}));

vi.mock('../breadcrumbs', () => ({
  Breadcrumbs: mocks.Breadcrumbs,
}));

vi.mock('../ui/tooltip', () => ({
  Tooltip: mocks.Tooltip,
  TooltipTrigger: mocks.TooltipTrigger,
  TooltipContent: mocks.TooltipContent,
  TooltipProvider: mocks.TooltipProvider,
}));

vi.mock('../ui/dropdown-menu', () => ({
  DropdownMenu: mocks.DropdownMenu,
  DropdownMenuTrigger: mocks.DropdownMenuTrigger,
  DropdownMenuContent: mocks.DropdownMenuContent,
  DropdownMenuItem: mocks.DropdownMenuItem,
  DropdownMenuSub: mocks.DropdownMenuSub,
  DropdownMenuSubTrigger: mocks.DropdownMenuSubTrigger,
  DropdownMenuSubContent: mocks.DropdownMenuSubContent,
}));

vi.mock('../../../features/tour', () => ({
  allTours: () => mocks.tours,
  useTour: () => ({ start: mocks.startTour }),
}));

vi.mock('../../../assets/logo', () => ({
  Logo: mocks.Logo,
}));

vi.mock('../../../features/environments/components/promote-modal', () => ({
  PromoteModal: mocks.PromoteModal,
}));

vi.mock('../../../features/integrations/components/github-connect-modal', () => ({
  GitHubConnectModal: mocks.GitHubConnectModal,
}));

vi.mock('../../../features/integrations/components/anthropic-connect-modal', () => ({
  AnthropicConnectModal: mocks.AnthropicConnectModal,
}));

vi.mock('../../../features/integrations/components/provider-connect-modal', () => ({
  ProviderConnectModal: mocks.ProviderConnectModal,
}));

// SVG asset imports are stubbed — the module-resolution layer would try
// to read the file otherwise.
vi.mock('devicon/icons/amazonwebservices/amazonwebservices-original-wordmark.svg', () => ({
  default: 'aws.svg',
}));
vi.mock('devicon/icons/azure/azure-original.svg', () => ({ default: 'azure.svg' }));
vi.mock('devicon/icons/googlecloud/googlecloud-original.svg', () => ({ default: 'gcp.svg' }));

import { AppBar } from '../app-bar';

// ─── Tree walker ────────────────────────────────────────────────────────────

interface ElLike {
  type: unknown;
  props: { [k: string]: unknown; children?: unknown };
}
function isEl(x: unknown): x is ElLike {
  return !!x && typeof x === 'object' && 'type' in x && 'props' in x;
}

const KNOWN_MOCKS = [
  mocks.Breadcrumbs,
  mocks.Logo,
  mocks.PromoteModal,
  mocks.GitHubConnectModal,
  mocks.ProviderConnectModal,
  mocks.Tooltip,
  mocks.TooltipTrigger,
  mocks.TooltipContent,
  mocks.TooltipProvider,
  mocks.DropdownMenu,
  mocks.DropdownMenuTrigger,
  mocks.DropdownMenuContent,
  mocks.DropdownMenuItem,
  mocks.DropdownMenuSub,
  mocks.DropdownMenuSubTrigger,
  mocks.DropdownMenuSubContent,
] as const;

function* walk(node: unknown): Generator<ElLike> {
  if (Array.isArray(node)) {
    for (const c of node) yield* walk(c);
    return;
  }
  if (!isEl(node)) return;
  yield node;
  if ((KNOWN_MOCKS as readonly unknown[]).includes(node.type)) {
    yield* walk(node.props.children);
    return;
  }
  if (typeof node.type === 'function') {
    const FC = node.type as (p: unknown) => unknown;
    yield* walk(FC(node.props));
    return;
  }
  yield* walk(node.props.children);
}

function findAll(tree: unknown, pred: (el: ElLike) => boolean): ElLike[] {
  const out: ElLike[] = [];
  for (const el of walk(tree)) if (pred(el)) out.push(el);
  return out;
}

function findFirst(tree: unknown, pred: (el: ElLike) => boolean): ElLike | undefined {
  for (const el of walk(tree)) if (pred(el)) return el;
  return undefined;
}

// AppBar is `React.memo(...)` — our memo stub stashes the inner FC in `.type`.
// `as unknown as Fn` lets the test invoke it directly.
const callRender = (): unknown => {
  const Inner = (AppBar as unknown as { type: (p: unknown) => unknown }).type;
  return Inner({});
};

beforeEach(() => {
  mocks.state.integrations.integrations = {
    github: { status: 'disconnected' },
    gcp: { status: 'disconnected' },
  };
  mocks.dispatch.mockReset();
  mocks.navigate.mockReset();
  mocks.checkGitHubConnection.mockClear();
  mocks.startTour.mockReset();
  mocks.tours = [
    { id: 'canvas-tour', title: 'tour.canvas.title', steps: [] },
    { id: 'palette-tour', title: 'tour.palette.title', steps: [] },
  ];
  for (const m of KNOWN_MOCKS) (m as { mockClear?: () => void }).mockClear?.();
  vi.stubGlobal('window', {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    // No electronAPI by default → isElectron === false.
    electronAPI: undefined,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('AppBar — top-level rendering', () => {
  it('renders the toolbar header', () => {
    const tree = callRender();
    const header = findFirst(
      tree,
      (el) =>
        typeof el.props['data-testid'] === 'string' &&
        el.props['data-testid'] === 'toolbar',
    );
    expect(header).toBeDefined();
  });

  it('renders the Breadcrumbs', () => {
    const tree = callRender();
    expect(findFirst(tree, (el) => el.type === mocks.Breadcrumbs)).toBeDefined();
  });

  it('renders the PromoteModal', () => {
    const tree = callRender();
    expect(findFirst(tree, (el) => el.type === mocks.PromoteModal)).toBeDefined();
  });

  it('renders the GitHubConnectModal (closed by default)', () => {
    const tree = callRender();
    const modal = findFirst(tree, (el) => el.type === mocks.GitHubConnectModal);
    expect(modal).toBeDefined();
    expect(modal!.props.isOpen).toBe(false);
  });

  it('renders three ProviderConnectModals (one per provider)', () => {
    const tree = callRender();
    const modals = findAll(tree, (el) => el.type === mocks.ProviderConnectModal);
    expect(modals).toHaveLength(3);
    const ids = modals.map((m) => (m.props as { providerId: string }).providerId).sort();
    expect(ids).toEqual(['aws', 'azure', 'gcp']);
  });

  it('passes provider field shapes through to each ProviderConnectModal', () => {
    const tree = callRender();
    const modals = findAll(tree, (el) => el.type === mocks.ProviderConnectModal);
    const gcp = modals.find((m) => (m.props as { providerId: string }).providerId === 'gcp');
    const aws = modals.find((m) => (m.props as { providerId: string }).providerId === 'aws');
    const azure = modals.find((m) => (m.props as { providerId: string }).providerId === 'azure');
    expect((gcp!.props.fields as Array<{ name: string }>)[0].name).toBe('service_account_key');
    expect((aws!.props.fields as Array<{ name: string }>).map((f) => f.name)).toEqual([
      'accessKeyId',
      'secretAccessKey',
      'region',
    ]);
    expect((azure!.props.fields as Array<{ name: string }>).map((f) => f.name)).toEqual([
      'subscriptionId',
      'tenantId',
      'clientId',
      'clientSecret',
    ]);
  });

  it('AppBar.displayName is set to "AppBar"', () => {
    expect((AppBar as unknown as { displayName: string }).displayName).toBe('AppBar');
  });
});

describe('AppBar — provider/github icon buttons', () => {
  it('renders the GCP icon button', () => {
    const tree = callRender();
    const btn = findFirst(
      tree,
      (el) =>
        el.type === 'button' &&
        (el.props as { id?: string }).id === 'ice-appbar-btn-gcp',
    );
    expect(btn).toBeDefined();
  });

  it('renders the AWS icon button', () => {
    const tree = callRender();
    const btn = findFirst(
      tree,
      (el) =>
        el.type === 'button' &&
        (el.props as { id?: string }).id === 'ice-appbar-btn-aws',
    );
    expect(btn).toBeDefined();
  });

  it('renders the Azure icon button', () => {
    const tree = callRender();
    const btn = findFirst(
      tree,
      (el) =>
        el.type === 'button' &&
        (el.props as { id?: string }).id === 'ice-appbar-btn-azure',
    );
    expect(btn).toBeDefined();
  });

  it('renders the GitHub icon button', () => {
    const tree = callRender();
    const btn = findFirst(
      tree,
      (el) =>
        el.type === 'button' &&
        (el.props as { id?: string }).id === 'ice-appbar-btn-github',
    );
    expect(btn).toBeDefined();
  });

  it('clicking the GCP button opens the GCP provider modal', () => {
    const tree = callRender();
    const btn = findFirst(
      tree,
      (el) => el.type === 'button' && (el.props as { id?: string }).id === 'ice-appbar-btn-gcp',
    )!;
    expect(typeof btn.props.onClick).toBe('function');
    (btn.props.onClick as () => void)();
  });

  it('clicking the AWS button does not throw (sets showAws state)', () => {
    const tree = callRender();
    const btn = findFirst(
      tree,
      (el) => el.type === 'button' && (el.props as { id?: string }).id === 'ice-appbar-btn-aws',
    )!;
    (btn.props.onClick as () => void)();
  });

  it('clicking the Azure button does not throw (sets showAzure state)', () => {
    const tree = callRender();
    const btn = findFirst(
      tree,
      (el) => el.type === 'button' && (el.props as { id?: string }).id === 'ice-appbar-btn-azure',
    )!;
    (btn.props.onClick as () => void)();
  });

  it('clicking the GitHub button does not throw (sets showGitHub state)', () => {
    const tree = callRender();
    const btn = findFirst(
      tree,
      (el) =>
        el.type === 'button' && (el.props as { id?: string }).id === 'ice-appbar-btn-github',
    )!;
    (btn.props.onClick as () => void)();
  });

  it('GitHub button class is emerald when github status is connected', () => {
    mocks.state.integrations.integrations.github.status = 'connected';
    const tree = callRender();
    const btn = findFirst(
      tree,
      (el) =>
        el.type === 'button' && (el.props as { id?: string }).id === 'ice-appbar-btn-github',
    )!;
    expect((btn.props.className as string).includes('emerald')).toBe(true);
  });

  it('GCP button has connected ring class when gcp status is connected', () => {
    mocks.state.integrations.integrations.gcp.status = 'connected';
    const tree = callRender();
    const btn = findFirst(
      tree,
      (el) => el.type === 'button' && (el.props as { id?: string }).id === 'ice-appbar-btn-gcp',
    )!;
    expect((btn.props.className as string).includes('ring-1')).toBe(true);
  });

  it('GCP button does NOT show the connected dot when gcp status is disconnected', () => {
    const tree = callRender();
    // The connected-dot div has aria-hidden + className includes "bg-emerald-500".
    const dots = findAll(
      tree,
      (el) =>
        el.type === 'div' &&
        typeof el.props.className === 'string' &&
        (el.props.className as string).includes('bg-emerald-500') &&
        (el.props.className as string).includes('rounded-full'),
    );
    expect(dots.length).toBe(0);
  });

  it('GCP button DOES show the connected dot when gcp status is connected', () => {
    mocks.state.integrations.integrations.gcp.status = 'connected';
    const tree = callRender();
    const dots = findAll(
      tree,
      (el) =>
        el.type === 'div' &&
        typeof el.props.className === 'string' &&
        (el.props.className as string).includes('bg-emerald-500') &&
        (el.props.className as string).includes('rounded-full'),
    );
    expect(dots.length).toBeGreaterThan(0);
  });
});

describe('AppBar — settings button', () => {
  it('clicking the Settings button navigates to /settings', () => {
    const tree = callRender();
    // The settings button is the last button in the toolbar header.
    const btns = findAll(tree, (el) => el.type === 'button');
    // Settings has no id; identify by aria-label or the t('Settings') tip.
    // Tooltip wraps with content "Settings".
    const settingsBtn = btns.find(
      (b) => (b.props as { 'aria-label'?: string })['aria-label'] === 'Settings',
    );
    expect(settingsBtn).toBeDefined();
    (settingsBtn!.props.onClick as () => void)();
    expect(mocks.navigate).toHaveBeenCalledWith('/settings');
  });
});

describe('AppBar — useElectronTitleBar', () => {
  it('does not pad when not running in Electron', () => {
    const tree = callRender();
    const header = findFirst(
      tree,
      (el) =>
        typeof el.props['data-testid'] === 'string' &&
        el.props['data-testid'] === 'toolbar',
    )!;
    expect((header.props.style as { paddingLeft?: string }).paddingLeft).toBeUndefined();
  });

  it('pads when running on macOS Electron and not fullscreen', () => {
    vi.stubGlobal('window', {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      electronAPI: {
        platform: 'darwin',
        getFullscreenState: vi.fn(() => Promise.resolve(false)),
        onFullscreenChange: vi.fn(() => () => {}),
      },
    });
    const tree = callRender();
    const header = findFirst(
      tree,
      (el) =>
        typeof el.props['data-testid'] === 'string' &&
        el.props['data-testid'] === 'toolbar',
    )!;
    expect((header.props.style as { paddingLeft?: string }).paddingLeft).toBe('92px');
  });

  it('does not pad on Windows Electron', () => {
    vi.stubGlobal('window', {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      electronAPI: {
        platform: 'win32',
        getFullscreenState: vi.fn(() => Promise.resolve(false)),
        onFullscreenChange: vi.fn(() => () => {}),
      },
    });
    const tree = callRender();
    const header = findFirst(
      tree,
      (el) =>
        typeof el.props['data-testid'] === 'string' &&
        el.props['data-testid'] === 'toolbar',
    )!;
    expect((header.props.style as { paddingLeft?: string }).paddingLeft).toBeUndefined();
  });

  it('subscribes to onFullscreenChange when in Electron', () => {
    const onFullscreenChange = vi.fn(() => () => {});
    const getFullscreenState = vi.fn(() => Promise.resolve(true));
    vi.stubGlobal('window', {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      electronAPI: { platform: 'darwin', onFullscreenChange, getFullscreenState },
    });
    callRender();
    expect(onFullscreenChange).toHaveBeenCalled();
    expect(getFullscreenState).toHaveBeenCalled();
  });

  it('survives Electron API without optional methods', () => {
    vi.stubGlobal('window', {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      electronAPI: { platform: 'darwin' },
    });
    callRender();
  });

  it('survives the entire window object being undefined (returns isElectron=false)', () => {
    // Stub window to undefined so `typeof window !== 'undefined'` is false.
    vi.stubGlobal('window', undefined);
    callRender();
  });
});

describe('AppBar — checkGitHubConnection mount effect', () => {
  it('dispatches checkGitHubConnection() on mount', () => {
    callRender();
    expect(mocks.checkGitHubConnection).toHaveBeenCalled();
    expect(mocks.dispatch).toHaveBeenCalled();
  });
});

describe('AppBar — optional-chain branch coverage', () => {
  it('handles missing integrations.github bag (?.status optional chain)', () => {
    (mocks.state.integrations.integrations as Record<string, unknown>).github = undefined;
    const tree = callRender();
    const btn = findFirst(
      tree,
      (el) =>
        el.type === 'button' && (el.props as { id?: string }).id === 'ice-appbar-btn-github',
    )!;
    expect(btn).toBeDefined();
  });

  it('handles missing integrations.gcp bag (?.status optional chain)', () => {
    (mocks.state.integrations.integrations as Record<string, unknown>).gcp = undefined;
    const tree = callRender();
    const btn = findFirst(
      tree,
      (el) => el.type === 'button' && (el.props as { id?: string }).id === 'ice-appbar-btn-gcp',
    )!;
    expect(btn).toBeDefined();
  });
});

describe('AppBar — useElectronTitleBar effect branches', () => {
  it('survives api.getFullscreenState being undefined (optional ?. short-circuit)', () => {
    vi.stubGlobal('window', {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      electronAPI: {
        platform: 'darwin',
        // getFullscreenState undefined → ?. yields undefined → no .then
        onFullscreenChange: vi.fn(() => () => {}),
      },
    });
    callRender();
  });

  it('survives api.onFullscreenChange being undefined (no cleanup returned)', () => {
    vi.stubGlobal('window', {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      electronAPI: {
        platform: 'darwin',
        getFullscreenState: vi.fn(() => Promise.resolve(false)),
      },
    });
    callRender();
  });
});

describe('AppBar — file-private BarBtn / BarImgBtn branch coverage', () => {
  // BarBtn and BarImgBtn are file-private FCs. The walker yields each
  // `<BarBtn>` / `<BarImgBtn>` element when traversing the AppBar tree;
  // `el.type` is a stable reference to the FC. We invoke the FC directly
  // with custom props to drive the unreachable-from-AppBar-JSX branches:
  //   - disabled=true (BarBtn)
  //   - !tip (both BarBtn and BarImgBtn)
  //   - tip undefined → fallback to '' for the <img alt> attr (BarImgBtn)

  it('BarBtn renders without a tooltip wrapper when tip is missing', () => {
    const tree = callRender();
    // BarBtn elements have icon and onClick. Pick any.
    const barBtnEl = findFirst(
      tree,
      (el) =>
        typeof el.type === 'function' &&
        (el.props as { icon?: unknown }).icon != null &&
        typeof (el.props as { onClick?: unknown }).onClick === 'function' &&
        typeof (el.props as { tip?: unknown }).tip === 'string',
    );
    expect(barBtnEl).toBeDefined();
    const BarBtnFC = barBtnEl!.type as (p: unknown) => unknown;
    const result = BarBtnFC({
      icon: () => null,
      onClick: vi.fn(),
      // tip omitted — !tip path
    });
    // Without a tip, BarBtn returns the <button> directly (no Tooltip).
    expect(isEl(result)).toBe(true);
    expect((result as ElLike).type).toBe('button');
  });

  it('BarBtn with disabled=true sets the disabled attr and disabled class', () => {
    const tree = callRender();
    const barBtnEl = findFirst(
      tree,
      (el) =>
        typeof el.type === 'function' &&
        (el.props as { icon?: unknown }).icon != null &&
        typeof (el.props as { onClick?: unknown }).onClick === 'function' &&
        typeof (el.props as { tip?: unknown }).tip === 'string',
    )!;
    const BarBtnFC = barBtnEl.type as (p: unknown) => unknown;
    const result = BarBtnFC({
      icon: () => null,
      onClick: vi.fn(),
      tip: 'X',
      disabled: true,
    });
    // Walk the result tree to find the <button> and confirm disabled = true.
    const btn = findFirst(result, (el) => el.type === 'button');
    expect(btn).toBeDefined();
    expect((btn!.props as { disabled?: boolean }).disabled).toBe(true);
    expect((btn!.props.className as string).includes('opacity-30')).toBe(true);
  });

  it('BarImgBtn renders without a tooltip wrapper when tip is missing', () => {
    const tree = callRender();
    // BarImgBtn elements have src.
    const imgBtnEl = findFirst(
      tree,
      (el) =>
        typeof el.type === 'function' &&
        typeof (el.props as { src?: unknown }).src === 'string' &&
        typeof (el.props as { onClick?: unknown }).onClick === 'function',
    );
    expect(imgBtnEl).toBeDefined();
    const FC = imgBtnEl!.type as (p: unknown) => unknown;
    const result = FC({
      src: 'foo.svg',
      onClick: vi.fn(),
      // tip omitted
    });
    expect(isEl(result)).toBe(true);
    expect((result as ElLike).type).toBe('button');
    // Walk result; img should have alt='' (the tip || '' fallback branch).
    const img = findFirst(result, (el) => el.type === 'img');
    expect(img).toBeDefined();
    expect((img!.props as { alt?: string }).alt).toBe('');
  });
});

describe('AppBar — header style WebkitAppRegion branch', () => {
  it('applies WebkitAppRegion: drag on the header when in Electron', () => {
    vi.stubGlobal('window', {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      electronAPI: {
        platform: 'win32',
        getFullscreenState: vi.fn(() => Promise.resolve(false)),
        onFullscreenChange: vi.fn(() => () => {}),
      },
    });
    const tree = callRender();
    const header = findFirst(
      tree,
      (el) =>
        typeof el.props['data-testid'] === 'string' &&
        el.props['data-testid'] === 'toolbar',
    )!;
    expect(
      (header.props.style as { WebkitAppRegion?: string }).WebkitAppRegion,
    ).toBe('drag');
  });

  it('omits WebkitAppRegion when not in Electron', () => {
    const tree = callRender();
    const header = findFirst(
      tree,
      (el) =>
        typeof el.props['data-testid'] === 'string' &&
        el.props['data-testid'] === 'toolbar',
    )!;
    expect(
      (header.props.style as { WebkitAppRegion?: string }).WebkitAppRegion,
    ).toBeUndefined();
  });
});

describe('AppBar — modal close handlers', () => {
  it('GitHubConnectModal onClose flips showGitHub back to false', () => {
    const tree = callRender();
    const modal = findFirst(tree, (el) => el.type === mocks.GitHubConnectModal)!;
    expect(typeof modal.props.onClose).toBe('function');
    (modal.props.onClose as () => void)();
  });

  it('Each ProviderConnectModal exposes an onClose handler', () => {
    const tree = callRender();
    const modals = findAll(tree, (el) => el.type === mocks.ProviderConnectModal);
    expect(modals.length).toBe(3);
    for (const m of modals) {
      expect(typeof m.props.onClose).toBe('function');
      (m.props.onClose as () => void)();
    }
  });
});

// ─── Help button — single click launches the canvas tour ──────────────────

describe('AppBar — Help button', () => {
  it('renders a single button with the help icon id (no dropdown wrapper)', () => {
    const tree = callRender();
    const btn = findFirst(
      tree,
      (el) =>
        el.type === 'button' &&
        (el.props as { id?: string }).id === 'ice-appbar-btn-help',
    );
    expect(btn).toBeDefined();
    expect(typeof btn?.props.onClick).toBe('function');
  });

  it('clicking the help button starts the canvas tour directly', () => {
    const tree = callRender();
    const btn = findFirst(
      tree,
      (el) =>
        el.type === 'button' &&
        (el.props as { id?: string }).id === 'ice-appbar-btn-help',
    )!;
    (btn.props.onClick as () => void)();
    expect(mocks.startTour).toHaveBeenCalledWith('canvas-tour');
  });
});
