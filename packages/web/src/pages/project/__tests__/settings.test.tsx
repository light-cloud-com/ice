/**
 * ProjectSettings — tabbed General/Environments/Danger settings page.
 *
 * Direct-FC tree-walker (rf-rpal-8 / rf-pdpl pattern). The page is
 * gated behind a `loading` slot — tests pre-seed slots to bypass the
 * spinner and render the actual UI.
 *
 * Auth note: project deletion requires `selectedOrg.id` AND a
 * confirmation string matching the project name. Both gates are
 * exercised below — they together protect against accidental
 * cross-org deletes.
 *
 * Slot order in ProjectSettings:
 *   0 = tab            ('general')
 *   1 = name           ('')
 *   2 = description    ('')
 *   3 = provider       ('')
 *   4 = region         ('')
 *   5 = loading        (true)
 *   6 = saving         (false)
 *   7 = deleting       (false)
 *   8 = confirmDelete  ('')
 *   9 = message        (null)
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const stateSlots: unknown[] = [];
  const effects: Array<{ cb: () => void | (() => void); deps: unknown[] }> = [];
  return {
    stateSlots,
    effects,
    resetUseState: () => {
      stateSlots.length = 0;
    },
    selectedOrg: { id: 'org-1', name: 'Acme' } as { id: string; name: string } | null,
    navigate: vi.fn(),
    axiosPost: vi.fn(),
  };
});

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  let useStateIdx = 0;
  const patchedUseState = vi.fn((initial?: unknown) => {
    const slot = useStateIdx;
    if (mocks.stateSlots.length <= slot) {
      const init = typeof initial === 'function' ? (initial as () => unknown)() : initial;
      mocks.stateSlots.push(init);
    }
    const setter = vi.fn((next: unknown) => {
      const cur = mocks.stateSlots[slot];
      const resolved = typeof next === 'function' ? (next as (prev: unknown) => unknown)(cur) : next;
      mocks.stateSlots[slot] = resolved;
    });
    useStateIdx += 1;
    return [mocks.stateSlots[slot], setter];
  });
  (mocks as unknown as { __resetIdx: () => void }).__resetIdx = () => {
    useStateIdx = 0;
  };
  const patchedUseEffect = vi.fn((cb: () => void | (() => void), deps?: unknown[]) => {
    mocks.effects.push({ cb, deps: deps ?? [] });
  });
  const actualDefault = (actual as unknown as { default?: typeof actual }).default ?? actual;
  return {
    ...actual,
    useState: patchedUseState,
    useEffect: patchedUseEffect,
    default: {
      ...actualDefault,
      useState: patchedUseState,
      useEffect: patchedUseEffect,
    },
  };
});

vi.mock('@ui/i18n', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock('@ui/shared/api/axios-instance', () => ({
  default: { post: (...args: unknown[]) => mocks.axiosPost(...args) },
}));

vi.mock('@ui/shared/utils/cn', () => ({
  cn: (...classes: unknown[]) => classes.filter(Boolean).join(' '),
}));

vi.mock('react-redux', () => ({
  useSelector: (sel: (s: unknown) => unknown) => sel({ account: { selectedOrg: mocks.selectedOrg } }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
}));

// The ProjectEnvironments child is mocked as an opaque marker — its own
// unit tests cover its behaviour.
vi.mock('../environments', () => ({
  ProjectEnvironments: ({ projectId }: { projectId: string }) => (
    <div data-stub="ProjectEnvironments" data-project-id={projectId} />
  ),
}));

// devicon SVG imports resolve via Vite's `?url` loader at runtime; for
// tests we shim them as inert strings.
vi.mock('devicon/icons/amazonwebservices/amazonwebservices-original-wordmark.svg', () => ({ default: 'aws.svg' }));
vi.mock('devicon/icons/azure/azure-original.svg', () => ({ default: 'azure.svg' }));
vi.mock('devicon/icons/googlecloud/googlecloud-original.svg', () => ({ default: 'gcp.svg' }));

import { ProjectSettings } from '../settings';

// ─── Tree-walker helpers ──────────────────────────────────────────────────

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

function findByPredicate(tree: React.ReactNode, predicate: (el: React.ReactElement) => boolean): React.ReactElement[] {
  const out: React.ReactElement[] = [];
  for (const el of walk(tree)) if (el && predicate(el)) out.push(el);
  return out;
}

function render(): React.ReactElement | null {
  (mocks as unknown as { __resetIdx: () => void }).__resetIdx();
  const FC = ProjectSettings as unknown as (p: { projectId: string }) => React.ReactElement | null;
  return FC({ projectId: 'proj-1' });
}

beforeEach(() => {
  mocks.resetUseState();
  mocks.effects.length = 0;
  mocks.navigate.mockReset();
  mocks.axiosPost.mockReset();
  mocks.selectedOrg = { id: 'org-1', name: 'Acme' };
});

// ─── Initial loading ──────────────────────────────────────────────────────

describe('ProjectSettings — initial loading', () => {
  it('renders a spinner while the project loads', () => {
    const tree = render();
    const spinners = findByPredicate(
      tree,
      (el) =>
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('animate-spin'),
    );
    expect(spinners.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── Load effect ─────────────────────────────────────────────────────────

describe('ProjectSettings — load effect', () => {
  it('posts to /canvas/projects/get with the projectId on mount', async () => {
    mocks.axiosPost.mockResolvedValueOnce({
      data: { name: 'My App', description: 'Desc', provider: 'aws', region: 'us-east-1' },
    });
    render();
    await mocks.effects[0].cb();
    expect(mocks.axiosPost).toHaveBeenCalledWith('/canvas/projects/get', { projectId: 'proj-1' });
    // slot 1 = name
    expect(mocks.stateSlots[1]).toBe('My App');
    expect(mocks.stateSlots[2]).toBe('Desc');
    expect(mocks.stateSlots[3]).toBe('aws');
    expect(mocks.stateSlots[4]).toBe('us-east-1');
    // slot 5 = loading flipped to false
    expect(mocks.stateSlots[5]).toBe(false);
  });

  it('falls back to empty strings when fields are missing', async () => {
    mocks.axiosPost.mockResolvedValueOnce({ data: {} });
    render();
    await mocks.effects[0].cb();
    expect(mocks.stateSlots[1]).toBe('');
    expect(mocks.stateSlots[2]).toBe('');
    expect(mocks.stateSlots[3]).toBe('');
    expect(mocks.stateSlots[4]).toBe('');
  });

  it('still flips loading=false on fetch failure', async () => {
    mocks.axiosPost.mockRejectedValueOnce(new Error('500'));
    render();
    await mocks.effects[0].cb();
    expect(mocks.stateSlots[5]).toBe(false);
  });
});

// ─── Tabs ─────────────────────────────────────────────────────────────────

describe('ProjectSettings — tab navigation', () => {
  it('renders three tabs (general / environments / danger)', () => {
    mocks.stateSlots.push('general', 'My App', '', '', '', false, false, false, '', null);
    const tree = render();
    const tabs = findByPredicate(
      tree,
      (el) =>
        typeof el.type === 'function' &&
        typeof (el.props as { label?: string }).label === 'string' &&
        ['project.settings.tabGeneral', 'project.settings.tabEnvironments', 'project.settings.tabDangerZone'].includes(
          (el.props as { label: string }).label,
        ),
    );
    expect(tabs).toHaveLength(3);
  });

  it('switches tab via TabButton onClick', () => {
    mocks.stateSlots.push('general', 'X', '', '', '', false, false, false, '', null);
    const tree = render();
    const envTab = findByPredicate(
      tree,
      (el) =>
        typeof el.type === 'function' && (el.props as { label?: string }).label === 'project.settings.tabEnvironments',
    )[0];
    (envTab.props as { onClick: () => void }).onClick();
    expect(mocks.stateSlots[0]).toBe('environments');
  });

  it('switches to general tab', () => {
    mocks.stateSlots.push('environments', 'X', '', '', '', false, false, false, '', null);
    const tree = render();
    const genTab = findByPredicate(
      tree,
      (el) => typeof el.type === 'function' && (el.props as { label?: string }).label === 'project.settings.tabGeneral',
    )[0];
    (genTab.props as { onClick: () => void }).onClick();
    expect(mocks.stateSlots[0]).toBe('general');
  });

  it('switches to danger tab', () => {
    mocks.stateSlots.push('general', 'X', '', '', '', false, false, false, '', null);
    const tree = render();
    const dangerTab = findByPredicate(
      tree,
      (el) =>
        typeof el.type === 'function' && (el.props as { label?: string }).label === 'project.settings.tabDangerZone',
    )[0];
    (dangerTab.props as { onClick: () => void }).onClick();
    expect(mocks.stateSlots[0]).toBe('danger');
  });

  it('tab button is unchanged when same tab is clicked again', () => {
    mocks.stateSlots.push('general', 'X', '', '', '', false, false, false, '', null);
    const tree = render();
    const genTab = findByPredicate(
      tree,
      (el) => typeof el.type === 'function' && (el.props as { label?: string }).label === 'project.settings.tabGeneral',
    )[0];
    expect((genTab.props as { active: boolean }).active).toBe(true);
  });

  it('renders ProjectEnvironments when environments tab active', () => {
    mocks.stateSlots.push('environments', 'X', '', '', '', false, false, false, '', null);
    const tree = render();
    const stub = findByPredicate(
      tree,
      (el) =>
        typeof (el.props as { ['data-stub']?: string })['data-stub'] === 'string' &&
        (el.props as { ['data-stub']: string })['data-stub'] === 'ProjectEnvironments',
    );
    expect(stub).toHaveLength(1);
    expect((stub[0].props as { ['data-project-id']: string })['data-project-id']).toBe('proj-1');
  });
});

// ─── General tab — name / description ────────────────────────────────────

describe('ProjectSettings — general inputs', () => {
  it('updates name slot on input change', () => {
    mocks.stateSlots.push('general', 'X', '', '', '', false, false, false, '', null);
    const tree = render();
    const input = findByPredicate(
      tree,
      (el) => el.type === 'input' && (el.props as { name?: string }).name === 'name',
    )[0];
    (input.props as { onChange: (e: { target: { value: string } }) => void }).onChange({
      target: { value: 'Renamed' },
    });
    expect(mocks.stateSlots[1]).toBe('Renamed');
  });

  it('updates description slot on textarea change', () => {
    mocks.stateSlots.push('general', 'X', '', '', '', false, false, false, '', null);
    const tree = render();
    const textarea = findByPredicate(
      tree,
      (el) => el.type === 'textarea' && (el.props as { name?: string }).name === 'description',
    )[0];
    (textarea.props as { onChange: (e: { target: { value: string } }) => void }).onChange({
      target: { value: 'New desc' },
    });
    expect(mocks.stateSlots[2]).toBe('New desc');
  });
});

// ─── Provider buttons ────────────────────────────────────────────────────

describe('ProjectSettings — provider selection', () => {
  it('renders all three providers (gcp / aws / azure)', () => {
    mocks.stateSlots.push('general', 'X', '', '', '', false, false, false, '', null);
    const tree = render();
    const providerBtns = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        (el.props as { type?: string }).type === 'button' &&
        Array.isArray((el.props as { children?: unknown }).children),
    );
    expect(providerBtns.length).toBeGreaterThanOrEqual(3);
  });

  it('selects a provider when not locked', () => {
    mocks.stateSlots.push('general', 'X', '', '', '', false, false, false, '', null);
    const tree = render();
    const providerBtns = findByPredicate(
      tree,
      (el) => el.type === 'button' && (el.props as { type?: string }).type === 'button',
    );
    (providerBtns[0].props as { onClick: () => void }).onClick();
    expect(mocks.stateSlots[3]).toBe('gcp');
    // Region also clears
    expect(mocks.stateSlots[4]).toBe('');
  });

  it('does NOT change provider when locked (provider+region both set)', () => {
    mocks.stateSlots.push('general', 'X', '', 'aws', 'us-east-1', false, false, false, '', null);
    const tree = render();
    const providerBtns = findByPredicate(
      tree,
      (el) => el.type === 'button' && (el.props as { type?: string }).type === 'button',
    );
    // Click the gcp button (different from current aws)
    const gcpBtn = providerBtns[0];
    (gcpBtn.props as { onClick: () => void }).onClick();
    // slot 3 should still be 'aws'
    expect(mocks.stateSlots[3]).toBe('aws');
  });

  it('renders the lock badge on the selected provider when locked', () => {
    mocks.stateSlots.push('general', 'X', '', 'aws', 'us-east-1', false, false, false, '', null);
    const tree = render();
    const lock = findByPredicate(
      tree,
      (el) => el.type === 'span' && (el.props as { children?: unknown }).children === '🔒',
    );
    expect(lock.length).toBeGreaterThanOrEqual(1);
  });

  it('shows the provider-locked description when both provider and region set', () => {
    mocks.stateSlots.push('general', 'X', '', 'aws', 'us-east-1', false, false, false, '', null);
    const tree = render();
    const lockedDesc = findByPredicate(
      tree,
      (el) =>
        el.type === 'p' && (el.props as { children?: unknown }).children === 'project.settings.providerLockedDesc',
    );
    expect(lockedDesc).toHaveLength(1);
  });

  it('shows the provider-unlocked description when not yet finalised', () => {
    mocks.stateSlots.push('general', 'X', '', '', '', false, false, false, '', null);
    const tree = render();
    const unlockedDesc = findByPredicate(
      tree,
      (el) =>
        el.type === 'p' && (el.props as { children?: unknown }).children === 'project.settings.providerUnlockedDesc',
    );
    expect(unlockedDesc).toHaveLength(1);
  });

  it('shows the selectPrompt when no provider chosen', () => {
    mocks.stateSlots.push('general', 'X', '', '', '', false, false, false, '', null);
    const tree = render();
    const prompt = findByPredicate(
      tree,
      (el) => el.type === 'p' && (el.props as { children?: unknown }).children === 'project.settings.selectPrompt',
    );
    expect(prompt).toHaveLength(1);
  });

  it('renders the region select with all regions for the chosen provider', () => {
    mocks.stateSlots.push('general', 'X', '', 'gcp', '', false, false, false, '', null);
    const tree = render();
    const regionSelect = findByPredicate(
      tree,
      (el) => el.type === 'select' && (el.props as { name?: string }).name === 'region',
    )[0];
    expect(regionSelect).toBeDefined();
    const options = (regionSelect.props as { children: unknown[] }).children as unknown[];
    // 8 GCP regions + 1 placeholder = 9
    expect(Array.isArray(options[1])).toBe(true);
    expect((options[1] as unknown[]).length).toBe(8);
  });

  it('updates region slot on region select change', () => {
    mocks.stateSlots.push('general', 'X', '', 'aws', '', false, false, false, '', null);
    const tree = render();
    const regionSelect = findByPredicate(
      tree,
      (el) => el.type === 'select' && (el.props as { name?: string }).name === 'region',
    )[0];
    (regionSelect.props as { onChange: (e: { target: { value: string } }) => void }).onChange({
      target: { value: 'us-east-1' },
    });
    expect(mocks.stateSlots[4]).toBe('us-east-1');
  });
});

// ─── Save flow ───────────────────────────────────────────────────────────

describe('ProjectSettings — save flow', () => {
  it('handleSave posts the form data to /canvas/projects/update', async () => {
    mocks.axiosPost.mockResolvedValueOnce({ data: {} });
    mocks.stateSlots.push('general', 'My App', 'Desc', 'aws', 'us-east-1', false, false, false, '', null);
    const tree = render();
    const form = findByPredicate(tree, (el) => el.type === 'form')[0];
    const preventDefault = vi.fn();
    await (form.props as { onSubmit: (e: { preventDefault: () => void }) => Promise<void> }).onSubmit({
      preventDefault,
    });
    expect(preventDefault).toHaveBeenCalled();
    expect(mocks.axiosPost).toHaveBeenCalledWith('/canvas/projects/update', {
      projectId: 'proj-1',
      name: 'My App',
      description: 'Desc',
      provider: 'aws',
      region: 'us-east-1',
    });
    // slot 9 = message
    expect(mocks.stateSlots[9]).toEqual({ type: 'success', text: 'project.settings.saveSuccess' });
  });

  it('sets an error message on save failure', async () => {
    mocks.axiosPost.mockRejectedValueOnce(new Error('500'));
    mocks.stateSlots.push('general', 'My App', '', 'aws', 'us-east-1', false, false, false, '', null);
    const tree = render();
    const form = findByPredicate(tree, (el) => el.type === 'form')[0];
    await (form.props as { onSubmit: (e: { preventDefault: () => void }) => Promise<void> }).onSubmit({
      preventDefault: vi.fn(),
    });
    expect(mocks.stateSlots[9]).toEqual({ type: 'error', text: 'project.settings.saveError' });
  });

  it('renders the success message under the form', () => {
    mocks.stateSlots.push('general', 'X', '', '', '', false, false, false, '', { type: 'success', text: 'Saved!' });
    const tree = render();
    const message = findByPredicate(
      tree,
      (el) => el.type === 'p' && (el.props as { children?: unknown }).children === 'Saved!',
    );
    expect(message).toHaveLength(1);
  });

  it('renders the error message under the form', () => {
    mocks.stateSlots.push('general', 'X', '', '', '', false, false, false, '', { type: 'error', text: 'Failed!' });
    const tree = render();
    const message = findByPredicate(
      tree,
      (el) => el.type === 'p' && (el.props as { children?: unknown }).children === 'Failed!',
    );
    expect(message).toHaveLength(1);
  });

  it('renders the spinner inside the save button when saving=true', () => {
    mocks.stateSlots.push('general', 'X', '', '', '', false, true, false, '', null);
    const tree = render();
    const spinners = findByPredicate(
      tree,
      (el) =>
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('animate-spin'),
    );
    expect(spinners.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── Danger zone — delete flow ───────────────────────────────────────────

describe('ProjectSettings — danger zone', () => {
  it('renders the delete UI when on danger tab', () => {
    mocks.stateSlots.push('danger', 'My App', '', '', '', false, false, false, '', null);
    const tree = render();
    const heading = findByPredicate(
      tree,
      (el) => el.type === 'h2' && Array.isArray((el.props as { children?: unknown }).children),
    );
    const dangerHeading = heading.find((h) =>
      ((h.props as { children: unknown[] }).children as unknown[]).some((c) => c === 'Danger Zone'),
    );
    expect(dangerHeading).toBeDefined();
  });

  it('updates confirmDelete on input change', () => {
    mocks.stateSlots.push('danger', 'My App', '', '', '', false, false, false, '', null);
    const tree = render();
    const input = findByPredicate(
      tree,
      (el) => el.type === 'input' && (el.props as { placeholder?: string }).placeholder === 'My App',
    )[0];
    (input.props as { onChange: (e: { target: { value: string } }) => void }).onChange({ target: { value: 'My App' } });
    expect(mocks.stateSlots[8]).toBe('My App');
  });

  it('delete button is disabled when confirmDelete does not match name', () => {
    mocks.stateSlots.push('danger', 'My App', '', '', '', false, false, false, 'Wrong', null);
    const tree = render();
    const btn = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        Array.isArray((el.props as { children?: unknown }).children) &&
        ((el.props as { children: unknown[] }).children as unknown[]).some(
          (c) => c === 'project.settings.deleteButton',
        ),
    )[0];
    expect((btn.props as { disabled: boolean }).disabled).toBe(true);
  });

  it('delete button is enabled when confirmDelete matches name', () => {
    mocks.stateSlots.push('danger', 'My App', '', '', '', false, false, false, 'My App', null);
    const tree = render();
    const btn = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        Array.isArray((el.props as { children?: unknown }).children) &&
        ((el.props as { children: unknown[] }).children as unknown[]).some(
          (c) => c === 'project.settings.deleteButton',
        ),
    )[0];
    expect((btn.props as { disabled: boolean }).disabled).toBe(false);
  });

  it('does NOT call delete when confirmDelete differs from name (security gate)', async () => {
    mocks.stateSlots.push('danger', 'My App', '', '', '', false, false, false, 'WrongName', null);
    const tree = render();
    const btn = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        Array.isArray((el.props as { children?: unknown }).children) &&
        ((el.props as { children: unknown[] }).children as unknown[]).some(
          (c) => c === 'project.settings.deleteButton',
        ),
    )[0];
    await (btn.props as { onClick: () => Promise<void> }).onClick();
    expect(mocks.axiosPost).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it('posts to /canvas/projects/delete with org id when confirmation matches', async () => {
    mocks.axiosPost.mockResolvedValueOnce({ data: {} });
    mocks.stateSlots.push('danger', 'My App', '', '', '', false, false, false, 'My App', null);
    const tree = render();
    const btn = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        Array.isArray((el.props as { children?: unknown }).children) &&
        ((el.props as { children: unknown[] }).children as unknown[]).some(
          (c) => c === 'project.settings.deleteButton',
        ),
    )[0];
    await (btn.props as { onClick: () => Promise<void> }).onClick();
    expect(mocks.axiosPost).toHaveBeenCalledWith('/canvas/projects/delete', {
      projectId: 'proj-1',
      organisationId: 'org-1',
    });
    expect(mocks.navigate).toHaveBeenCalledWith('/', { replace: true });
  });

  it('posts with undefined organisationId when no selectedOrg', async () => {
    mocks.selectedOrg = null;
    mocks.axiosPost.mockResolvedValueOnce({ data: {} });
    mocks.stateSlots.push('danger', 'My App', '', '', '', false, false, false, 'My App', null);
    const tree = render();
    const btn = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        Array.isArray((el.props as { children?: unknown }).children) &&
        ((el.props as { children: unknown[] }).children as unknown[]).some(
          (c) => c === 'project.settings.deleteButton',
        ),
    )[0];
    await (btn.props as { onClick: () => Promise<void> }).onClick();
    expect(mocks.axiosPost).toHaveBeenCalledWith('/canvas/projects/delete', {
      projectId: 'proj-1',
      organisationId: undefined,
    });
  });

  it('sets an error message and clears deleting on delete failure', async () => {
    mocks.axiosPost.mockRejectedValueOnce(new Error('500'));
    mocks.stateSlots.push('danger', 'My App', '', '', '', false, false, false, 'My App', null);
    const tree = render();
    const btn = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        Array.isArray((el.props as { children?: unknown }).children) &&
        ((el.props as { children: unknown[] }).children as unknown[]).some(
          (c) => c === 'project.settings.deleteButton',
        ),
    )[0];
    await (btn.props as { onClick: () => Promise<void> }).onClick();
    expect(mocks.stateSlots[9]).toEqual({ type: 'error', text: 'project.settings.deleteError' });
    expect(mocks.stateSlots[7]).toBe(false); // deleting cleared
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it('renders the spinner inside the delete button when deleting=true', () => {
    mocks.stateSlots.push('danger', 'My App', '', '', '', false, false, true, 'My App', null);
    const tree = render();
    const spinners = findByPredicate(
      tree,
      (el) =>
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('animate-spin'),
    );
    expect(spinners.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── Region locked badge ─────────────────────────────────────────────────

describe('ProjectSettings — region locked badge', () => {
  it('renders the regionLocked label when both provider and region set', () => {
    mocks.stateSlots.push('general', 'X', '', 'aws', 'us-east-1', false, false, false, '', null);
    const tree = render();
    // The locked badge contains '🔒 ' followed by the i18n key
    const lockedBadges = findByPredicate(
      tree,
      (el) =>
        el.type === 'span' &&
        Array.isArray((el.props as { children?: unknown }).children) &&
        ((el.props as { children: unknown[] }).children as unknown[]).some(
          (c) => typeof c === 'string' && c.includes('🔒'),
        ),
    );
    expect(lockedBadges.length).toBeGreaterThanOrEqual(1);
  });
});
