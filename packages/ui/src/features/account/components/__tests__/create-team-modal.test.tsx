/**
 * Tests for `CreateTeamModal` — modal dialog to create a new team/organisation.
 *
 * Strategy:
 *  - Direct-FC tree-walker pattern (cite team-page-coverage / destroy-confirm-modal).
 *  - `useState` mocked via slot-by-call-index (3 slots: name, loading, error).
 *  - `react-redux.useDispatch` returns a hoisted spy.
 *  - `axiosInstance.post` returns test-controlled response/error.
 *  - `react-dom.createPortal` is the identity (returns its first arg verbatim) so
 *    the walker sees the modal tree as if it were inline.
 *  - `useTranslation` returns identity-key `t`.
 *  - `lucide-react` icons remain unmocked (rendered as opaque forwardRef objects).
 *  - Account-slice action creators are mocked at the module boundary so the
 *    dispatch payload is observable as a tagged action object.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks ──────────────────────────────────────────────────────────
const mocks = vi.hoisted(() => ({
  // useState slots in source order: 0=name (string), 1=loading (boolean), 2=error (string|null)
  nameRef: { current: '' as string },
  loadingRef: { current: false as boolean },
  errorRef: { current: null as string | null },
  setNameSpy: vi.fn(),
  setLoadingSpy: vi.fn(),
  setErrorSpy: vi.fn(),
  // react-redux
  dispatch: vi.fn(),
  addOrgSpy: vi.fn((p: unknown) => ({ type: 'account/addOrg', payload: p })),
  switchOrgSpy: vi.fn((p: unknown) => ({ type: 'account/switchOrg', payload: p })),
  // axios
  axiosPost: vi.fn(),
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  let callIdx = 0;
  (mocks as unknown as { __resetUseState: () => void }).__resetUseState = () => {
    callIdx = 0;
  };
  const dispatch = [
    () => [mocks.nameRef.current, mocks.setNameSpy] as const,
    () => [mocks.loadingRef.current, mocks.setLoadingSpy] as const,
    () => [mocks.errorRef.current, mocks.setErrorSpy] as const,
  ];
  const useStateStub = <T,>(): [T, (v: T) => void] => {
    const slot = dispatch[callIdx] ?? dispatch[dispatch.length - 1];
    callIdx += 1;
    return slot() as unknown as [T, (v: T) => void];
  };
  const actualDefault = (actual as unknown as { default?: typeof actual }).default ?? actual;
  return {
    ...actual,
    useState: useStateStub,
    default: { ...actualDefault, useState: useStateStub },
  };
});

vi.mock('react-redux', () => ({
  useDispatch: () => mocks.dispatch,
}));

vi.mock('react-dom', () => ({
  createPortal: (el: React.ReactElement) => el,
}));

vi.mock('../../../../i18n', () => ({
  useTranslation: () => ({
    t: (k: string) => k,
  }),
}));

vi.mock('../../../../shared/api/axios-instance', () => ({
  default: { post: mocks.axiosPost },
}));

vi.mock('../../../../store/slices/account-slice', () => ({
  addOrganisation: (p: unknown) => mocks.addOrgSpy(p),
  switchOrganisation: (p: unknown) => mocks.switchOrgSpy(p),
}));

// `document.body` is the 2nd arg to `createPortal` and is read at the call
// site; provide a minimal stub.
vi.stubGlobal('document', { body: {} });

import { CreateTeamModal } from '../create-team-modal';

// ─── Tree walker ────────────────────────────────────────────────────────────

interface ElLike {
  type: unknown;
  props: { [k: string]: unknown; children?: unknown };
}
function isEl(x: unknown): x is ElLike {
  return !!x && typeof x === 'object' && 'type' in x && 'props' in x;
}
function* walk(node: unknown): Generator<ElLike> {
  if (Array.isArray(node)) {
    for (const c of node) yield* walk(c);
    return;
  }
  if (!isEl(node)) return;
  yield node;
  if (typeof node.type === 'function') {
    try {
      const FC = node.type as (p: unknown) => unknown;
      yield* walk(FC(node.props));
    } catch {
      /* skip */
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
function collectText(tree: unknown): string {
  let out = '';
  for (const el of walk(tree)) {
    const c = el.props.children;
    if (typeof c === 'string') out += c + ' ';
    else if (typeof c === 'number') out += String(c) + ' ';
    else if (Array.isArray(c)) {
      for (const item of c) {
        if (typeof item === 'string') out += item + ' ';
        else if (typeof item === 'number') out += String(item) + ' ';
      }
    }
  }
  return out;
}

const render = (props: { onClose: () => void }): unknown => {
  (mocks as unknown as { __resetUseState: () => void }).__resetUseState();
  return (CreateTeamModal as unknown as (p: { onClose: () => void }) => unknown)(props);
};

const flush = async (): Promise<void> => {
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
};

// ─── Per-test reset ─────────────────────────────────────────────────────────
beforeEach(() => {
  mocks.nameRef.current = '';
  mocks.loadingRef.current = false;
  mocks.errorRef.current = null;
  mocks.setNameSpy.mockReset();
  mocks.setLoadingSpy.mockReset();
  mocks.setErrorSpy.mockReset();
  mocks.dispatch.mockReset();
  mocks.addOrgSpy.mockClear();
  mocks.switchOrgSpy.mockClear();
  mocks.axiosPost.mockReset();
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('CreateTeamModal — render', () => {
  it('renders the title and label translation keys', () => {
    const tree = render({ onClose: vi.fn() });
    const text = collectText(tree);
    expect(text).toContain('account.createTeam.title');
    expect(text).toContain('account.createTeam.nameLabel');
    expect(text).toContain('account.createTeam.nameHint');
  });

  it('renders a text input wired to setName', () => {
    const tree = render({ onClose: vi.fn() });
    const input = findFirst(tree, (el) => el.type === 'input');
    expect(input).toBeDefined();
    (input!.props.onChange as (e: { target: { value: string } }) => void)({
      target: { value: 'My Team' },
    });
    expect(mocks.setNameSpy).toHaveBeenCalledWith('My Team');
  });

  it('input value reflects current name state', () => {
    mocks.nameRef.current = 'pre-filled';
    const tree = render({ onClose: vi.fn() });
    const input = findFirst(tree, (el) => el.type === 'input');
    expect(input!.props.value).toBe('pre-filled');
  });

  it('input has minLength=2, maxLength=50, autoFocus', () => {
    const tree = render({ onClose: vi.fn() });
    const input = findFirst(tree, (el) => el.type === 'input');
    expect(input!.props.minLength).toBe(2);
    expect(input!.props.maxLength).toBe(50);
    expect(input!.props.autoFocus).toBe(true);
  });

  it('renders no error block when error state is null', () => {
    mocks.errorRef.current = null;
    const tree = render({ onClose: vi.fn() });
    const text = collectText(tree);
    // The error <p> only renders when error is truthy; absence shouldn't
    // include the className fragment for the red banner.
    const errorPara = findFirst(
      tree,
      (el) => el.type === 'p' && typeof el.props.className === 'string' && (el.props.className as string).includes('text-red-400'),
    );
    expect(errorPara).toBeUndefined();
    expect(text).not.toContain('boom');
  });

  it('renders the error block when error state is set', () => {
    mocks.errorRef.current = 'something failed';
    const tree = render({ onClose: vi.fn() });
    const text = collectText(tree);
    expect(text).toContain('something failed');
  });
});

describe('CreateTeamModal — submit gating (isValid)', () => {
  it('submit button is disabled when name is empty (length 0)', () => {
    mocks.nameRef.current = '';
    const tree = render({ onClose: vi.fn() });
    const submit = findFirst(tree, (el) => el.type === 'button' && el.props.type === 'submit');
    expect(submit!.props.disabled).toBe(true);
  });

  it('submit button is disabled when name is below 2 chars', () => {
    mocks.nameRef.current = 'a';
    const tree = render({ onClose: vi.fn() });
    const submit = findFirst(tree, (el) => el.type === 'button' && el.props.type === 'submit');
    expect(submit!.props.disabled).toBe(true);
  });

  it('submit button is disabled when name has only whitespace', () => {
    mocks.nameRef.current = '   ';
    const tree = render({ onClose: vi.fn() });
    const submit = findFirst(tree, (el) => el.type === 'button' && el.props.type === 'submit');
    expect(submit!.props.disabled).toBe(true);
  });

  it('submit button is enabled when name is between 2 and 50 chars', () => {
    mocks.nameRef.current = 'OK';
    const tree = render({ onClose: vi.fn() });
    const submit = findFirst(tree, (el) => el.type === 'button' && el.props.type === 'submit');
    expect(submit!.props.disabled).toBe(false);
  });

  it('submit button is disabled when name exceeds 50 chars (after trim)', () => {
    mocks.nameRef.current = 'a'.repeat(51);
    const tree = render({ onClose: vi.fn() });
    const submit = findFirst(tree, (el) => el.type === 'button' && el.props.type === 'submit');
    expect(submit!.props.disabled).toBe(true);
  });

  it('submit button is disabled while loading even with valid name', () => {
    mocks.nameRef.current = 'Valid Name';
    mocks.loadingRef.current = true;
    const tree = render({ onClose: vi.fn() });
    const submit = findFirst(tree, (el) => el.type === 'button' && el.props.type === 'submit');
    expect(submit!.props.disabled).toBe(true);
  });
});

describe('CreateTeamModal — submit button label', () => {
  it('shows the create label when not loading', () => {
    mocks.loadingRef.current = false;
    const tree = render({ onClose: vi.fn() });
    const submit = findFirst(tree, (el) => el.type === 'button' && el.props.type === 'submit');
    expect(submit!.props.children).toBe('account.createTeam.createButton');
  });

  it('shows the creating label when loading', () => {
    mocks.loadingRef.current = true;
    const tree = render({ onClose: vi.fn() });
    const submit = findFirst(tree, (el) => el.type === 'button' && el.props.type === 'submit');
    expect(submit!.props.children).toBe('account.createTeam.creatingButton');
  });
});

describe('CreateTeamModal — onClose handlers', () => {
  it('clicking the backdrop calls onClose', () => {
    const onClose = vi.fn();
    const tree = render({ onClose });
    const backdrop = findFirst(
      tree,
      (el) =>
        el.type === 'div' &&
        typeof el.props.className === 'string' &&
        (el.props.className as string).includes('absolute inset-0 bg-black/60'),
    );
    expect(backdrop).toBeDefined();
    (backdrop!.props.onClick as () => void)();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('clicking the X header button calls onClose', () => {
    const onClose = vi.fn();
    const tree = render({ onClose });
    const buttons = findAll(tree, (el) => el.type === 'button');
    // Header X is the first button (no type='submit', no type='button' — type is undefined)
    const xBtn = buttons.find((b) => b.props.type === undefined);
    expect(xBtn).toBeDefined();
    (xBtn!.props.onClick as () => void)();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('clicking the cancel button calls onClose', () => {
    const onClose = vi.fn();
    const tree = render({ onClose });
    const cancelBtn = findFirst(
      tree,
      (el) =>
        el.type === 'button' &&
        el.props.type === 'button' &&
        el.props.children === 'account.createTeam.cancelButton',
    );
    expect(cancelBtn).toBeDefined();
    (cancelBtn!.props.onClick as () => void)();
    expect(onClose).toHaveBeenCalled();
  });
});

describe('CreateTeamModal — handleSubmit happy path', () => {
  it('posts name (trimmed), dispatches addOrganisation + switchOrganisation, then onClose', async () => {
    mocks.nameRef.current = '  My Team  ';
    mocks.axiosPost.mockResolvedValueOnce({ data: { id: 'org-99', name: 'My Team' } });
    const onClose = vi.fn();
    const tree = render({ onClose });
    const form = findFirst(tree, (el) => el.type === 'form')!;
    const preventDefault = vi.fn();
    await (form.props.onSubmit as (e: { preventDefault: () => void }) => Promise<void>)({
      preventDefault,
    });
    expect(preventDefault).toHaveBeenCalled();
    expect(mocks.setLoadingSpy).toHaveBeenNthCalledWith(1, true);
    expect(mocks.setErrorSpy).toHaveBeenCalledWith(null);
    expect(mocks.axiosPost).toHaveBeenCalledWith('/organisations/create', { name: 'My Team' });
    expect(mocks.addOrgSpy).toHaveBeenCalledWith({ id: 'org-99', name: 'My Team', role: 'Admin' });
    expect(mocks.switchOrgSpy).toHaveBeenCalledWith({ id: 'org-99', name: 'My Team', role: 'Admin' });
    expect(onClose).toHaveBeenCalled();
    expect(mocks.setLoadingSpy).toHaveBeenLastCalledWith(false);
  });

  it('uses trimmed name fallback when response.data.name is null/undefined', async () => {
    mocks.nameRef.current = 'Fallback Team';
    mocks.axiosPost.mockResolvedValueOnce({ data: { id: 'org-1' } });
    const onClose = vi.fn();
    const tree = render({ onClose });
    const form = findFirst(tree, (el) => el.type === 'form')!;
    await (form.props.onSubmit as (e: { preventDefault: () => void }) => Promise<void>)({
      preventDefault: vi.fn(),
    });
    expect(mocks.addOrgSpy).toHaveBeenCalledWith({ id: 'org-1', name: 'Fallback Team', role: 'Admin' });
  });
});

describe('CreateTeamModal — handleSubmit guards', () => {
  it('returns early if name is invalid (no axios call)', async () => {
    mocks.nameRef.current = 'a';
    const tree = render({ onClose: vi.fn() });
    const form = findFirst(tree, (el) => el.type === 'form')!;
    await (form.props.onSubmit as (e: { preventDefault: () => void }) => Promise<void>)({
      preventDefault: vi.fn(),
    });
    expect(mocks.axiosPost).not.toHaveBeenCalled();
    expect(mocks.setLoadingSpy).not.toHaveBeenCalled();
  });

  it('returns early if loading is already true (no axios call)', async () => {
    mocks.nameRef.current = 'Valid Name';
    mocks.loadingRef.current = true;
    const tree = render({ onClose: vi.fn() });
    const form = findFirst(tree, (el) => el.type === 'form')!;
    await (form.props.onSubmit as (e: { preventDefault: () => void }) => Promise<void>)({
      preventDefault: vi.fn(),
    });
    expect(mocks.axiosPost).not.toHaveBeenCalled();
  });

  it('preventDefault is always called even on early-return', async () => {
    mocks.nameRef.current = 'a';
    const tree = render({ onClose: vi.fn() });
    const form = findFirst(tree, (el) => el.type === 'form')!;
    const preventDefault = vi.fn();
    await (form.props.onSubmit as (e: { preventDefault: () => void }) => Promise<void>)({
      preventDefault,
    });
    expect(preventDefault).toHaveBeenCalledTimes(1);
  });
});

describe('CreateTeamModal — handleSubmit error path', () => {
  it('catches an Error and calls setError with err.message', async () => {
    mocks.nameRef.current = 'Valid Name';
    mocks.axiosPost.mockRejectedValueOnce(new Error('http 500'));
    const onClose = vi.fn();
    const tree = render({ onClose });
    const form = findFirst(tree, (el) => el.type === 'form')!;
    await (form.props.onSubmit as (e: { preventDefault: () => void }) => Promise<void>)({
      preventDefault: vi.fn(),
    });
    expect(mocks.setErrorSpy).toHaveBeenLastCalledWith('http 500');
    expect(mocks.setLoadingSpy).toHaveBeenLastCalledWith(false);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('falls back to t(errorFallback) when thrown value is not an Error instance', async () => {
    mocks.nameRef.current = 'Valid Name';
    mocks.axiosPost.mockRejectedValueOnce('plain string');
    const tree = render({ onClose: vi.fn() });
    const form = findFirst(tree, (el) => el.type === 'form')!;
    await (form.props.onSubmit as (e: { preventDefault: () => void }) => Promise<void>)({
      preventDefault: vi.fn(),
    });
    expect(mocks.setErrorSpy).toHaveBeenLastCalledWith('account.createTeam.errorFallback');
  });

  it('falls back to t(errorFallback) when thrown value is null', async () => {
    mocks.nameRef.current = 'Valid Name';
    mocks.axiosPost.mockRejectedValueOnce(null);
    const tree = render({ onClose: vi.fn() });
    const form = findFirst(tree, (el) => el.type === 'form')!;
    await (form.props.onSubmit as (e: { preventDefault: () => void }) => Promise<void>)({
      preventDefault: vi.fn(),
    });
    expect(mocks.setErrorSpy).toHaveBeenLastCalledWith('account.createTeam.errorFallback');
  });
});
