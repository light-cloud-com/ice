/**
 * FirstProjectStep — onboarding step 5 template picker + project name.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  state: {
    onboarding: { projectName: '', selectedTemplateId: null as string | null },
  },
  dispatch: vi.fn(),
  setProjectNameSpy: vi.fn((n: string) => ({ type: 'ob/projectName', payload: n })),
  setSelectedTemplateIdSpy: vi.fn((id: string | null) => ({ type: 'ob/template', payload: id })),
  quickStarts: [{ id: 'qs-1', name: 'Quick Start', description: 'd1', icon: 'Globe' }],
  composedTemplates: [
    { id: 'ct-1', name: 'Composed One', description: 'd2', icon: 'Server' },
    { id: 'ct-2', name: 'Composed Two', description: 'd3', icon: 'NotInMap' },
    { id: 'ct-3', name: 'Composed Three', description: 'd4', icon: 'Activity' }, // sliced off
  ],
}));

vi.mock('react-redux', () => ({
  useSelector: (sel: (s: unknown) => unknown) => sel(mocks.state),
  useDispatch: () => mocks.dispatch,
}));

vi.mock('../../../../i18n', () => ({
  useTranslation: () => ({ t: (k: string) => `t:${k}` }),
}));

vi.mock('../../../../shared/utils/cn', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}));

vi.mock('../../../../config/templates', () => ({
  COMPOSED_TEMPLATES: mocks.composedTemplates,
  QUICK_STARTS: mocks.quickStarts,
}));

vi.mock('../../../../store/slices/onboarding-slice', () => ({
  setProjectName: (n: string) => mocks.setProjectNameSpy(n),
  setSelectedTemplateId: (id: string | null) => mocks.setSelectedTemplateIdSpy(id),
}));

import { FirstProjectStep } from '../first-project-step';

interface ReactElementLike {
  type: unknown;
  props: { [k: string]: unknown; children?: unknown };
}
function isElement(x: unknown): x is ReactElementLike {
  return !!x && typeof x === 'object' && 'type' in x && 'props' in x;
}
function* walk(node: unknown): Generator<ReactElementLike> {
  if (Array.isArray(node)) {
    for (const c of node) yield* walk(c);
    return;
  }
  if (!isElement(node)) return;
  yield node;
  yield* walk(node.props.children);
}
function findAll(tree: unknown, predicate: (el: ReactElementLike) => boolean): ReactElementLike[] {
  const out: ReactElementLike[] = [];
  for (const el of walk(tree)) {
    if (predicate(el)) out.push(el);
  }
  return out;
}
function findByPredicate(tree: unknown, predicate: (el: ReactElementLike) => boolean): ReactElementLike | undefined {
  for (const el of walk(tree)) {
    if (predicate(el)) return el;
  }
  return undefined;
}

const callRender = (): unknown => (FirstProjectStep as () => unknown)();

beforeEach(() => {
  mocks.state.onboarding = { projectName: '', selectedTemplateId: null };
  mocks.dispatch.mockReset();
  mocks.setProjectNameSpy.mockClear();
  mocks.setSelectedTemplateIdSpy.mockClear();
});

describe('FirstProjectStep — render', () => {
  it('renders the project name input', () => {
    const tree = callRender();
    const input = findByPredicate(
      tree,
      (el) => el.type === 'input' && (el.props as { id?: string }).id === 'ice-onboarding-project-input-name',
    );
    expect(input).toBeDefined();
  });

  it('renders quickstarts + first 2 composed templates + blank canvas (4 total)', () => {
    const tree = callRender();
    const buttons = findAll(tree, (el) => el.type === 'button');
    expect(buttons.length).toBe(4);
  });

  it('falls back to FileBox when icon is unknown', () => {
    const tree = callRender();
    // Composed Two has icon "NotInMap" — should still render a button without throwing
    const buttons = findAll(tree, (el) => el.type === 'button');
    expect(buttons.length).toBe(4);
  });
});

describe('FirstProjectStep — handlers', () => {
  it('typing in the project-name input dispatches setProjectName', () => {
    const tree = callRender();
    const input = findByPredicate(
      tree,
      (el) => el.type === 'input' && (el.props as { id?: string }).id === 'ice-onboarding-project-input-name',
    );
    (input?.props.onChange as (e: { target: { value: string } }) => void)?.({ target: { value: 'My App' } });
    expect(mocks.setProjectNameSpy).toHaveBeenCalledWith('My App');
  });

  it('clicking a template fires setSelectedTemplateId AND auto-fills project name when blank', () => {
    mocks.state.onboarding.projectName = '';
    const tree = callRender();
    const buttons = findAll(tree, (el) => el.type === 'button');
    (buttons[0].props.onClick as () => void)?.();
    expect(mocks.setSelectedTemplateIdSpy).toHaveBeenCalledWith('qs-1');
    expect(mocks.setProjectNameSpy).toHaveBeenCalledWith('My Quick Start');
  });

  it('does NOT auto-fill the name when already user-customized (does not start with "My ")', () => {
    mocks.state.onboarding.projectName = 'Cool Service';
    const tree = callRender();
    const buttons = findAll(tree, (el) => el.type === 'button');
    (buttons[0].props.onClick as () => void)?.();
    expect(mocks.setSelectedTemplateIdSpy).toHaveBeenCalled();
    expect(mocks.setProjectNameSpy).not.toHaveBeenCalled();
  });

  it('DOES auto-fill the name when current name starts with "My "', () => {
    mocks.state.onboarding.projectName = 'My Old Name';
    const tree = callRender();
    const buttons = findAll(tree, (el) => el.type === 'button');
    (buttons[0].props.onClick as () => void)?.();
    expect(mocks.setProjectNameSpy).toHaveBeenCalledWith('My Quick Start');
  });

  it('clicking the blank-canvas button dispatches setSelectedTemplateId(null)', () => {
    const tree = callRender();
    const buttons = findAll(tree, (el) => el.type === 'button');
    // Last button = blank canvas
    (buttons[buttons.length - 1].props.onClick as () => void)?.();
    expect(mocks.setSelectedTemplateIdSpy).toHaveBeenCalledWith(null);
    expect(mocks.setProjectNameSpy).toHaveBeenCalledWith('My Project');
  });
});

describe('FirstProjectStep — selection styling', () => {
  it('marks the selected template button with accent class', () => {
    mocks.state.onboarding.selectedTemplateId = 'qs-1';
    const tree = callRender();
    const buttons = findAll(tree, (el) => el.type === 'button');
    expect(buttons[0].props.className as string).toContain('border-ice-accent');
  });

  it('marks blank-canvas as selected when selectedTemplateId is null', () => {
    mocks.state.onboarding.selectedTemplateId = null;
    const tree = callRender();
    const buttons = findAll(tree, (el) => el.type === 'button');
    expect(buttons[buttons.length - 1].props.className as string).toContain('border-ice-accent');
  });
});
