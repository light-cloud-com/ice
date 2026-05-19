/**
 * TeamStep — onboarding team create/join screen.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  useStateQueue: [] as unknown[],
  state: {
    onboarding: { teamMode: 'create' as 'create' | 'join', teamName: '' },
  },
  dispatch: vi.fn(),
  setTeamModeSpy: vi.fn((m: string) => ({ type: 'ob/teamMode', payload: m })),
  setTeamNameSpy: vi.fn((n: string) => ({ type: 'ob/teamName', payload: n })),
}));

vi.mock('react', async (orig) => {
  const actual = (await orig()) as typeof import('react');
  const useState = vi.fn(<T,>(init: T): [T, (v: T) => void] => {
    const next = mocks.useStateQueue.shift();
    return [next === undefined ? init : (next as T), vi.fn()];
  });
  const def = (actual as unknown as { default?: typeof actual }).default ?? actual;
  return { ...actual, useState, default: { ...def, useState } };
});

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

vi.mock('../../../../store/slices/onboarding-slice', () => ({
  setTeamMode: (m: string) => mocks.setTeamModeSpy(m),
  setTeamName: (n: string) => mocks.setTeamNameSpy(n),
}));

import { TeamStep } from '../team-step';

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

const callRender = (): unknown => (TeamStep as () => unknown)();

beforeEach(() => {
  mocks.useStateQueue.length = 0;
  mocks.state.onboarding = { teamMode: 'create', teamName: '' };
  mocks.dispatch.mockReset();
  mocks.setTeamModeSpy.mockClear();
  mocks.setTeamNameSpy.mockClear();
});

describe('TeamStep', () => {
  it('renders both team option buttons', () => {
    const tree = callRender();
    const buttons = findAll(tree, (el) => el.type === 'button');
    expect(buttons.length).toBe(2);
  });

  it('marks the currently-selected option with the accent class', () => {
    mocks.state.onboarding.teamMode = 'create';
    const tree = callRender();
    const buttons = findAll(tree, (el) => el.type === 'button');
    expect(buttons[0].props.className as string).toContain('border-ice-accent');
    expect(buttons[1].props.className as string).not.toContain('border-ice-accent');
  });

  it('clicking the create option dispatches setTeamMode("create")', () => {
    const tree = callRender();
    const buttons = findAll(tree, (el) => el.type === 'button');
    (buttons[0].props.onClick as () => void)?.();
    expect(mocks.setTeamModeSpy).toHaveBeenCalledWith('create');
  });

  it('clicking the join option dispatches setTeamMode("join")', () => {
    const tree = callRender();
    const buttons = findAll(tree, (el) => el.type === 'button');
    (buttons[1].props.onClick as () => void)?.();
    expect(mocks.setTeamModeSpy).toHaveBeenCalledWith('join');
  });

  it('renders the team-name input only in create mode', () => {
    mocks.state.onboarding.teamMode = 'create';
    const tree = callRender();
    const input = findByPredicate(
      tree,
      (el) => el.type === 'input' && (el.props as { id?: string }).id === 'ice-onboarding-team-input-name',
    );
    expect(input).toBeDefined();
  });

  it('does not render the team-name input in join mode', () => {
    mocks.state.onboarding.teamMode = 'join';
    const tree = callRender();
    const input = findByPredicate(
      tree,
      (el) => el.type === 'input' && (el.props as { id?: string }).id === 'ice-onboarding-team-input-name',
    );
    expect(input).toBeUndefined();
  });

  it('typing in the team-name input dispatches setTeamName', () => {
    mocks.state.onboarding.teamMode = 'create';
    const tree = callRender();
    const input = findByPredicate(
      tree,
      (el) => el.type === 'input' && (el.props as { id?: string }).id === 'ice-onboarding-team-input-name',
    );
    (input?.props.onChange as (e: { target: { value: string } }) => void)?.({ target: { value: 'My Team' } });
    expect(mocks.setTeamNameSpy).toHaveBeenCalledWith('My Team');
  });

  it('renders the invite-code input only in join mode', () => {
    mocks.state.onboarding.teamMode = 'join';
    const tree = callRender();
    const inputs = findAll(tree, (el) => el.type === 'input');
    expect(inputs.length).toBe(1);
  });

  it('typing in the invite-code input updates local state (no dispatch)', () => {
    mocks.state.onboarding.teamMode = 'join';
    const tree = callRender();
    const input = findByPredicate(tree, (el) => el.type === 'input');
    (input?.props.onChange as (e: { target: { value: string } }) => void)?.({ target: { value: 'CODE-1' } });
    expect(mocks.setTeamNameSpy).not.toHaveBeenCalled();
  });
});
