/**
 * Tests for `ProfileAvatar` — compact avatar dropdown with user info and nav.
 *
 * Strategy:
 *  - Direct-FC tree-walker pattern.
 *  - Radix DropdownMenu primitives (`Root`, `Trigger`, `Portal`, `Content`,
 *    `Item`) are mocked as identity passthroughs so the walker traverses the
 *    rendered tree without Radix's internal context.
 *  - `react-redux.useSelector` reads from a hoisted `state.account.user`.
 *  - `react-router-dom.useNavigate` returns a hoisted spy.
 *  - `useTranslation` returns identity-key `t`.
 *
 *  Coverage targets the file-private `getInitials` helper (3 branches) and the
 *  ProfileAvatar render (avatar img vs initials, name fallback, navigation
 *  callbacks).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks ──────────────────────────────────────────────────────────
const mocks = vi.hoisted(() => {
  const Pass = ({ children, ...rest }: { children?: unknown } & Record<string, unknown>) => ({
    type: 'div',
    props: { ...rest, children },
  });
  return {
    state: {
      account: {
        user: null as { id?: string; email?: string; name?: string; avatar?: string } | null,
      },
    },
    navigate: vi.fn(),
    Pass,
  };
});

vi.mock('react-redux', () => ({
  useSelector: (sel: (s: unknown) => unknown) => sel(mocks.state),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock('../../../../i18n', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

// Radix DropdownMenu: each subcomponent acts as a pass-through `<div>` so
// the walker traverses the tree as if they were inline. The `asChild` prop
// is harmless on a div, and the Trigger's child <button> becomes a sibling
// not its parent, but for our predicate-based assertions reaching descendants
// is what matters.
vi.mock('@radix-ui/react-dropdown-menu', () => ({
  Root: mocks.Pass,
  Trigger: mocks.Pass,
  Portal: mocks.Pass,
  Content: mocks.Pass,
  Item: mocks.Pass,
}));

import { ProfileAvatar } from '../profile-avatar';

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

const render = (): unknown => (ProfileAvatar as unknown as () => unknown)();

// ─── Per-test reset ─────────────────────────────────────────────────────────
beforeEach(() => {
  mocks.state.account.user = null;
  mocks.navigate.mockReset();
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('ProfileAvatar — initials computation', () => {
  it('uses both first-letter pairs when user.name has 2+ space-separated parts', () => {
    mocks.state.account.user = { name: 'Alice Liddell', email: 'a@b.com' };
    const tree = render();
    const trigger = findFirst(tree, (el) => el.props.id === 'ice-appbar-btn-profile');
    expect(trigger!.props.children).toBe('AL');
  });

  it('uses both first-letter pairs when there are 3+ parts (only first two used)', () => {
    mocks.state.account.user = { name: 'Alice Bob Carol' };
    const tree = render();
    const trigger = findFirst(tree, (el) => el.props.id === 'ice-appbar-btn-profile');
    expect(trigger!.props.children).toBe('AB');
  });

  it('uses first 2 letters of single-part name uppercased', () => {
    mocks.state.account.user = { name: 'morgan' };
    const tree = render();
    const trigger = findFirst(tree, (el) => el.props.id === 'ice-appbar-btn-profile');
    expect(trigger!.props.children).toBe('MO');
  });

  it('handles 1-character single-part name', () => {
    mocks.state.account.user = { name: 'X' };
    const tree = render();
    const trigger = findFirst(tree, (el) => el.props.id === 'ice-appbar-btn-profile');
    expect(trigger!.props.children).toBe('X');
  });

  it('falls back to first letter of email when name is missing', () => {
    mocks.state.account.user = { email: 'morgan@example.com' };
    const tree = render();
    const trigger = findFirst(tree, (el) => el.props.id === 'ice-appbar-btn-profile');
    expect(trigger!.props.children).toBe('M');
  });

  it('shows ? when both name and email are missing', () => {
    mocks.state.account.user = null;
    const tree = render();
    const trigger = findFirst(tree, (el) => el.props.id === 'ice-appbar-btn-profile');
    expect(trigger!.props.children).toBe('?');
  });

  it('shows ? when user object exists but is empty', () => {
    mocks.state.account.user = {};
    const tree = render();
    const trigger = findFirst(tree, (el) => el.props.id === 'ice-appbar-btn-profile');
    expect(trigger!.props.children).toBe('?');
  });

  it('trims and splits on multi-space whitespace', () => {
    mocks.state.account.user = { name: '  Alice    Liddell  ' };
    const tree = render();
    const trigger = findFirst(tree, (el) => el.props.id === 'ice-appbar-btn-profile');
    expect(trigger!.props.children).toBe('AL');
  });
});

describe('ProfileAvatar — avatar img vs initials', () => {
  it('renders an <img> when user.avatar is set', () => {
    mocks.state.account.user = { name: 'Alice', avatar: '/me.png' };
    const tree = render();
    const trigger = findFirst(tree, (el) => el.props.id === 'ice-appbar-btn-profile');
    const img = trigger!.props.children as ElLike;
    expect(isEl(img)).toBe(true);
    expect(img.type).toBe('img');
    expect(img.props.src).toBe('/me.png');
  });

  it('renders initials text when user.avatar is missing', () => {
    mocks.state.account.user = { name: 'Alice' };
    const tree = render();
    const trigger = findFirst(tree, (el) => el.props.id === 'ice-appbar-btn-profile');
    expect(trigger!.props.children).toBe('AL');
  });

  it('the trigger button has aria-label from translation', () => {
    mocks.state.account.user = { name: 'Alice' };
    const tree = render();
    const trigger = findFirst(tree, (el) => el.props.id === 'ice-appbar-btn-profile');
    expect(trigger!.props['aria-label']).toBe('account.avatar.ariaLabel');
  });
});

describe('ProfileAvatar — user info section', () => {
  it('shows the user.name when present', () => {
    mocks.state.account.user = { name: 'Alice Liddell', email: 'a@b.com' };
    const tree = render();
    const text = collectText(tree);
    expect(text).toContain('Alice Liddell');
  });

  it('falls back to defaultName translation key when user.name is missing', () => {
    mocks.state.account.user = { email: 'a@b.com' };
    const tree = render();
    const text = collectText(tree);
    expect(text).toContain('account.avatar.defaultName');
  });

  it('falls back to defaultName when user is null', () => {
    mocks.state.account.user = null;
    const tree = render();
    const text = collectText(tree);
    expect(text).toContain('account.avatar.defaultName');
  });

  it('shows the user.email when present', () => {
    mocks.state.account.user = { name: 'Alice', email: 'me@example.com' };
    const tree = render();
    const text = collectText(tree);
    expect(text).toContain('me@example.com');
  });

  it('email defaults to empty string when missing — does not throw', () => {
    mocks.state.account.user = { name: 'Alice' };
    const tree = render();
    // Make sure the empty-string children doesn't blow up — collectText returns
    // a string and we don't expect "undefined" anywhere.
    expect(collectText(tree)).not.toContain('undefined');
  });
});

describe('ProfileAvatar — dropdown items navigate', () => {
  it('clicking the settings item navigates to /settings', () => {
    mocks.state.account.user = { name: 'Alice' };
    const tree = render();
    const text = collectText(tree);
    expect(text).toContain('account.avatar.settings');
    // Items are rendered via the mocked DropdownMenu.Item, which becomes a
    // div with onClick prop intact.
    const items = findAll(tree, (el) => typeof el.props.onClick === 'function' && el.props.children !== undefined);
    // First item is settings, second is team.
    const settings = items.find((el) => collectText(el).includes('account.avatar.settings'));
    expect(settings).toBeDefined();
    (settings!.props.onClick as () => void)();
    expect(mocks.navigate).toHaveBeenCalledWith('/settings');
  });

  it('clicking the team item navigates to /team', () => {
    mocks.state.account.user = { name: 'Alice' };
    const tree = render();
    const items = findAll(tree, (el) => typeof el.props.onClick === 'function' && el.props.children !== undefined);
    const team = items.find((el) => collectText(el).includes('account.avatar.team'));
    expect(team).toBeDefined();
    (team!.props.onClick as () => void)();
    expect(mocks.navigate).toHaveBeenCalledWith('/team');
  });

  it('renders both menu item translation keys', () => {
    mocks.state.account.user = { name: 'Alice' };
    const tree = render();
    const text = collectText(tree);
    expect(text).toContain('account.avatar.settings');
    expect(text).toContain('account.avatar.team');
  });
});
