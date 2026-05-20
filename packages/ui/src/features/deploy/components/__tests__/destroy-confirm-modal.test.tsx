/**
 * rf-pdpl-12 — DestroyConfirmModal.
 *
 * Seventh Layer 1 leaf-component extraction. The first rf-pdpl unit whose
 * source has BOTH `useState` (×2) AND `useEffect` plus `createPortal`. We
 * extend the rf-props-19 queued-ref-dispatch pattern (cite
 * `queued-ref-dispatch-extends-the-mutable-ref-usestate-mock-to-multi-state-fcs`)
 * to two slots — `typed` and `destroyEverything` — and pair it with a
 * synchronous `useEffect` mock that fires the callback inline so the keyboard
 * listener registers during the render call.
 *
 * `createPortal` is mocked to return its first argument verbatim — `document.body`
 * isn't load-bearing for the assertions, and the no-op portal lets the walker
 * see the rendered tree exactly as if the modal were inline.
 *
 * Tree-walker pattern (cite `tree-walker-for-react-fc-tests-must-flatten-nested-children-arrays`):
 * walks the React element tree, invoking any function `el.type` it encounters.
 * No inner FCs in this module — the modal renders only HTML elements + lucide
 * icons (which the walker treats as opaque function components since their
 * children are intrinsic SVG primitives).
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks ──────────────────────────────────────────────────────────
//
// Two useState slots, in declaration order: typed (string) / destroyEverything (boolean).
// Setter spies are independent so per-toggle / per-keystroke calls have a
// verifiable callback target.
const mocks = vi.hoisted(() => ({
  typedRef: { current: '' as string },
  destroyEverythingRef: { current: false as boolean },
  typedSetterSpy: vi.fn(),
  destroyEverythingSetterSpy: vi.fn(),
  // useEffect deps captured — tests can introspect what was listed.
  effectCallbacks: [] as Array<() => void | (() => void)>,
  effectCleanups: [] as Array<(() => void) | void>,
  effectDeps: [] as unknown[][],
}));

// Mock React's useState / useEffect so the FC body runs synchronously and the
// two useState calls deal back in order from the ref queue.
//
// The source (`destroy-confirm-modal.tsx`) accesses hooks via
// `React.useState(...)` / `React.useEffect(...)` (default import), so we have
// to patch both the named exports AND the default export — patching only the
// named exports leaves `React.useState` pointing at the real (renderer-context-
// bound) function, which throws "Cannot read properties of null".
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  // useState call counter — reset per-render via `__resetUseState()`.
  let callIdx = 0;
  (mocks as unknown as { __resetUseState: () => void }).__resetUseState = () => {
    callIdx = 0;
  };
  const dispatch = [
    () => [mocks.typedRef.current, mocks.typedSetterSpy] as const,
    () => [mocks.destroyEverythingRef.current, mocks.destroyEverythingSetterSpy] as const,
  ];
  const patchedUseState = vi.fn((initial?: unknown) => {
    const slot = dispatch[callIdx] ?? dispatch[dispatch.length - 1];
    // Seed the destroyEverything slot from `initial` when the test asks
    // (only when `__seedFromInitial` is set). This pins the load-bearing
    // `useState(resources.length === 0)` initial-value contract.
    if (callIdx === 1 && (mocks as unknown as { __seedFromInitial: boolean }).__seedFromInitial) {
      mocks.destroyEverythingRef.current = Boolean(initial);
    }
    callIdx += 1;
    return slot();
  });
  const patchedUseEffect = vi.fn((cb: () => void | (() => void), deps?: unknown[]) => {
    mocks.effectCallbacks.push(cb);
    mocks.effectDeps.push(deps ?? []);
    // Fire synchronously so the keyboard listener registers during render.
    const cleanup = cb();
    mocks.effectCleanups.push(cleanup);
  });
  // Some React-types builds don't declare `default` on the namespace; cast to
  // `unknown` and back to read it without breaking `--noEmit`.
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

// `createPortal` is a no-op in test: render inline so the walker sees the
// modal tree exactly as if it were embedded in the parent. `document.body`
// isn't used for any assertions in this suite.
vi.mock('react-dom', () => ({
  createPortal: (el: React.ReactElement) => el,
}));

// The vitest default environment is `node` (no DOM globals). The modal's
// useEffect calls `window.addEventListener('keydown', ...)`, so we stub a
// minimal window with a mini event-bus that supports add/remove/dispatch.
type Listener = (e: KeyboardEvent) => void;
const windowListeners: Map<string, Set<Listener>> = new Map();
const stubWindow = {
  addEventListener: vi.fn((evt: string, listener: Listener) => {
    if (!windowListeners.has(evt)) windowListeners.set(evt, new Set());
    windowListeners.get(evt)!.add(listener);
  }),
  removeEventListener: vi.fn((evt: string, listener: Listener) => {
    windowListeners.get(evt)?.delete(listener);
  }),
  dispatchEvent: (e: KeyboardEvent) => {
    const listeners = windowListeners.get(e.type);
    if (listeners) {
      for (const l of listeners) l(e);
    }
    return true;
  },
};
vi.stubGlobal('window', stubWindow);
// `KeyboardEvent` may not exist in the node environment — stub a tiny shape
// matching what the source's keydown handler reads: `{ key }`.
class StubKeyboardEvent {
  type: string;
  key: string;
  constructor(type: string, init?: { key?: string }) {
    this.type = type;
    this.key = init?.key ?? '';
  }
}
vi.stubGlobal('KeyboardEvent', StubKeyboardEvent);
// `document.body` is the 2nd arg to `createPortal` and is read at the call
// site — even though our `createPortal` mock ignores it, the expression has
// to evaluate. Provide a minimal stub.
vi.stubGlobal('document', { body: {} });

import { DestroyConfirmModal } from '../destroy-confirm-modal';

// ─── Tree-walker (rf-pdpl-7/-8/-9/-10/-11 style) ────────────────────────────

type ReactNodeLike = React.ReactNode;

function* walk(node: ReactNodeLike): Generator<React.ReactElement> {
  if (node == null || typeof node === 'boolean' || typeof node === 'string' || typeof node === 'number') {
    return;
  }
  if (Array.isArray(node)) {
    for (const c of node) yield* walk(c as ReactNodeLike);
    return;
  }
  const el = node as React.ReactElement;
  yield el;
  if (typeof el.type === 'function') {
    // lucide icons are FCs but their internals aren't relevant — guard with
    // a try/catch so any "ref.current is undefined" hook reuse doesn't bubble.
    try {
      const FC = el.type as (props: unknown) => React.ReactNode;
      const rendered = FC(el.props);
      yield* walk(rendered as ReactNodeLike);
    } catch {
      // Opaque FC — skip its subtree.
    }
    return;
  }
  const children = (el.props as { children?: React.ReactNode } | undefined)?.children;
  if (children == null) return;
  yield* walk(children);
}

function findByPredicate(tree: React.ReactNode, predicate: (el: React.ReactElement) => boolean): React.ReactElement[] {
  const out: React.ReactElement[] = [];
  for (const el of walk(tree)) {
    if (el && predicate(el)) out.push(el);
  }
  return out;
}

function collectText(tree: React.ReactNode): string {
  const parts: string[] = [];
  function visit(n: ReactNodeLike): void {
    if (n == null || typeof n === 'boolean') return;
    if (typeof n === 'string') {
      parts.push(n);
      return;
    }
    if (typeof n === 'number') {
      parts.push(String(n));
      return;
    }
    if (Array.isArray(n)) {
      for (const c of n) visit(c as ReactNodeLike);
      return;
    }
    const el = n as React.ReactElement;
    if (typeof el.type === 'function') {
      try {
        const FC = el.type as (props: unknown) => React.ReactNode;
        visit(FC(el.props) as ReactNodeLike);
      } catch {
        // Opaque FC.
      }
      return;
    }
    const children = (el.props as { children?: React.ReactNode } | undefined)?.children;
    if (children != null) visit(children);
  }
  visit(tree);
  return parts.join('');
}

// ─── Helpers ────────────────────────────────────────────────────────────────

type ModalProps = {
  cardName: string;
  resources: Array<{ name: string; type: string }>;
  onCancel: () => void;
  onConfirm: (destroyEverything: boolean) => void;
};

const renderModal = (props: ModalProps): React.ReactElement => {
  (mocks as unknown as { __resetUseState: () => void }).__resetUseState();
  // Clear effect-callback / dep accumulators so per-test introspection is clean.
  mocks.effectCallbacks.length = 0;
  mocks.effectCleanups.length = 0;
  mocks.effectDeps.length = 0;
  return (DestroyConfirmModal as unknown as (p: ModalProps) => React.ReactElement)(props);
};

const makeProps = (overrides: Partial<ModalProps> = {}): ModalProps => ({
  cardName: 'my-app',
  resources: [{ name: 'gcs-bucket', type: 'storage.googleapis.com/Bucket' }],
  onCancel: vi.fn(),
  onConfirm: vi.fn(),
  ...overrides,
});

const findByClassFragment = (tree: React.ReactNode, fragments: string[]): React.ReactElement[] =>
  findByPredicate(tree, (el) => {
    const cn = (el.props as { className?: string }).className;
    if (typeof cn !== 'string') return false;
    return fragments.every((f) => cn.includes(f));
  });

const findHeading = (tree: React.ReactNode): React.ReactElement => {
  const found = findByPredicate(tree, (el) => el.type === 'h2');
  expect(found).toHaveLength(1);
  return found[0];
};

const findInput = (tree: React.ReactNode, predicate?: (el: React.ReactElement) => boolean): React.ReactElement[] =>
  findByPredicate(tree, (el) => {
    if (el.type !== 'input') return false;
    return predicate ? predicate(el) : true;
  });

const findCheckbox = (tree: React.ReactNode): React.ReactElement => {
  const inputs = findInput(tree, (el) => (el.props as { type?: string }).type === 'checkbox');
  expect(inputs).toHaveLength(1);
  return inputs[0];
};

const findTypedInput = (tree: React.ReactNode): React.ReactElement => {
  const inputs = findInput(tree, (el) => (el.props as { type?: string }).type === 'text');
  expect(inputs).toHaveLength(1);
  return inputs[0];
};

const findButtons = (tree: React.ReactNode): React.ReactElement[] =>
  findByPredicate(tree, (el) => el.type === 'button');

const findCancelButton = (tree: React.ReactNode): React.ReactElement => {
  const btns = findButtons(tree).filter((el) => {
    const children = (el.props as { children?: React.ReactNode }).children;
    return typeof children === 'string' && children === 'Cancel';
  });
  expect(btns).toHaveLength(1);
  return btns[0];
};

const findDestroyButton = (tree: React.ReactNode): React.ReactElement => {
  const btns = findButtons(tree).filter((el) => {
    const children = (el.props as { children?: React.ReactNode }).children;
    return typeof children === 'string' && (children === 'Destroy' || children === 'Destroy everything');
  });
  expect(btns).toHaveLength(1);
  return btns[0];
};

const findBackdrop = (tree: React.ReactNode): React.ReactElement => {
  const found = findByClassFragment(tree, ['fixed', 'inset-0', 'z-[10000]', 'bg-black/60']);
  expect(found).toHaveLength(1);
  return found[0];
};

const findInnerCard = (tree: React.ReactNode): React.ReactElement => {
  const found = findByClassFragment(tree, ['w-[560px]', 'border-red-500/30', 'rounded-lg']);
  expect(found).toHaveLength(1);
  return found[0];
};

// ─── Reset state between tests ──────────────────────────────────────────────

beforeEach(() => {
  mocks.typedRef.current = '';
  mocks.destroyEverythingRef.current = false;
  mocks.typedSetterSpy.mockClear();
  mocks.destroyEverythingSetterSpy.mockClear();
  (mocks as unknown as { __seedFromInitial: boolean }).__seedFromInitial = false;
  // Clear window-listener map and reset the addEventListener spy so each
  // test sees a clean event bus.
  windowListeners.clear();
  stubWindow.addEventListener.mockClear();
  stubWindow.removeEventListener.mockClear();
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('DestroyConfirmModal — heading branches', () => {
  it('renders "Destroy deployment?" when resources.length > 0 and destroyEverything is false', () => {
    mocks.destroyEverythingRef.current = false;
    const tree = renderModal(makeProps({ resources: [{ name: 'a', type: 't' }] }));
    expect(collectText(findHeading(tree))).toBe('Destroy deployment?');
  });

  it('renders "Destroy all infrastructure?" when destroyEverything is true', () => {
    mocks.destroyEverythingRef.current = true;
    const tree = renderModal(makeProps({ resources: [{ name: 'a', type: 't' }] }));
    expect(collectText(findHeading(tree))).toBe('Destroy all infrastructure?');
  });

  it('seeds destroyEverything from useState initial value (resources.length === 0) when resources empty', () => {
    // Simulate the first-render path: the source's useState call uses
    // `useState(resources.length === 0)`. The mock should observe the
    // initial-value argument when seeded; the helper here flips the seed flag.
    (mocks as unknown as { __seedFromInitial: boolean }).__seedFromInitial = true;
    const tree = renderModal(makeProps({ resources: [] }));
    // Initial value is `true` → heading reflects the destroyEverything branch.
    expect(collectText(findHeading(tree))).toBe('Destroy all infrastructure?');
  });

  it('seeds destroyEverything to false when resources is non-empty (initial value false)', () => {
    (mocks as unknown as { __seedFromInitial: boolean }).__seedFromInitial = true;
    const tree = renderModal(
      makeProps({
        resources: [
          { name: 'a', type: 'storage' },
          { name: 'b', type: 'storage' },
        ],
      }),
    );
    expect(collectText(findHeading(tree))).toBe('Destroy deployment?');
  });
});

describe('DestroyConfirmModal — body branches', () => {
  it('renders the resource list when !destroyEverything && resources.length > 0', () => {
    mocks.destroyEverythingRef.current = false;
    const tree = renderModal(
      makeProps({
        resources: [
          { name: 'gcs-bucket', type: 'storage.googleapis.com/Bucket' },
          { name: 'cdn', type: 'compute.googleapis.com/BackendBucket' },
        ],
      }),
    );
    const text = collectText(tree);
    expect(text).toContain('This will permanently delete the following 2 resources from the cloud:');
    expect(text).toContain('gcs-bucket');
    expect(text).toContain('storage.googleapis.com/Bucket');
    expect(text).toContain('cdn');
    expect(text).toContain('compute.googleapis.com/BackendBucket');
  });

  it('uses the singular "resource" form when resources.length === 1', () => {
    mocks.destroyEverythingRef.current = false;
    const tree = renderModal(makeProps({ resources: [{ name: 'only', type: 'storage.googleapis.com/Bucket' }] }));
    const text = collectText(tree);
    expect(text).toContain('This will permanently delete the following 1 resource from the cloud:');
    // Make sure the plural form is NOT present.
    expect(text).not.toContain('1 resources');
  });

  it('uses the plural "resources" form when resources.length === 2', () => {
    mocks.destroyEverythingRef.current = false;
    const tree = renderModal(
      makeProps({
        resources: [
          { name: 'a', type: 't' },
          { name: 'b', type: 't' },
        ],
      }),
    );
    const text = collectText(tree);
    expect(text).toContain('2 resources from the cloud');
  });

  it('renders the cascading-delete explanation when destroyEverything is true', () => {
    mocks.destroyEverythingRef.current = true;
    const tree = renderModal(makeProps({ resources: [{ name: 'a', type: 't' }] }));
    const text = collectText(tree);
    expect(text).toContain('This will scan every historical deployment for this card');
    expect(text).toContain('failed and partial deploys');
    expect(text).toContain('Deletes in dependency order');
    expect(text).toContain('forwarding rules → target proxies → URL maps → backend buckets');
  });

  it('renders the "no resources tracked" message when !destroyEverything && resources.length === 0', () => {
    mocks.destroyEverythingRef.current = false;
    const tree = renderModal(makeProps({ resources: [] }));
    const text = collectText(tree);
    expect(text).toContain('No resources tracked for this card.');
    expect(text).toContain('enable "Destroy');
    expect(text).toContain('to scan for orphaned leftovers');
  });

  it('renders neither resource-list nor empty message when destroyEverything is true', () => {
    mocks.destroyEverythingRef.current = true;
    const tree = renderModal(makeProps({ resources: [{ name: 'a', type: 't' }] }));
    const text = collectText(tree);
    // The cascading explanation appears, but NOT the "permanently delete the following" line.
    expect(text).not.toContain('This will permanently delete the following');
    expect(text).not.toContain('No resources tracked for this card.');
  });

  it('renders the "cannot be undone" red banner regardless of branch', () => {
    mocks.destroyEverythingRef.current = false;
    const tree1 = renderModal(makeProps({ resources: [{ name: 'a', type: 't' }] }));
    expect(collectText(tree1)).toContain('This cannot be undone.');

    mocks.destroyEverythingRef.current = true;
    const tree2 = renderModal(makeProps({ resources: [{ name: 'a', type: 't' }] }));
    expect(collectText(tree2)).toContain('This cannot be undone.');

    mocks.destroyEverythingRef.current = false;
    const tree3 = renderModal(makeProps({ resources: [] }));
    expect(collectText(tree3)).toContain('This cannot be undone.');
  });
});

describe('DestroyConfirmModal — Esc keyboard listener', () => {
  it('registers a window keydown listener on render', () => {
    renderModal(makeProps());
    expect(stubWindow.addEventListener).toHaveBeenCalledWith('keydown', expect.any(Function));
  });

  it('calls onCancel when an Escape keydown fires', () => {
    const onCancel = vi.fn();
    renderModal(makeProps({ onCancel }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    // Cleanup so the listener doesn't leak across tests.
    const cleanup = mocks.effectCleanups[0];
    if (typeof cleanup === 'function') cleanup();
  });

  it('does NOT call onCancel for non-Escape keys', () => {
    const onCancel = vi.fn();
    renderModal(makeProps({ onCancel }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    expect(onCancel).not.toHaveBeenCalled();
    const cleanup = mocks.effectCleanups[0];
    if (typeof cleanup === 'function') cleanup();
  });

  it('removes the keydown listener on cleanup (unmount)', () => {
    const onCancel = vi.fn();
    renderModal(makeProps({ onCancel }));
    // Run the cleanup function — simulates unmount.
    const cleanup = mocks.effectCleanups[0];
    expect(typeof cleanup).toBe('function');
    if (typeof cleanup === 'function') cleanup();
    // Now an Escape keydown should NOT call onCancel — the listener was detached.
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('listens with onCancel as a dependency in the effect deps array', () => {
    const onCancel1 = vi.fn();
    renderModal(makeProps({ onCancel: onCancel1 }));
    expect(mocks.effectDeps[0]).toEqual([onCancel1]);
    const cleanup = mocks.effectCleanups[0];
    if (typeof cleanup === 'function') cleanup();
  });
});

describe('DestroyConfirmModal — backdrop click-to-close', () => {
  it('calls onCancel when the backdrop is clicked (target === currentTarget)', () => {
    const onCancel = vi.fn();
    const tree = renderModal(makeProps({ onCancel }));
    const backdrop = findBackdrop(tree);
    const onClick = (backdrop.props as { onClick: (e: { target: unknown; currentTarget: unknown }) => void }).onClick;
    const sentinel = {};
    onClick({ target: sentinel, currentTarget: sentinel });
    expect(onCancel).toHaveBeenCalledTimes(1);
    const cleanup = mocks.effectCleanups[0];
    if (typeof cleanup === 'function') cleanup();
  });

  it('does NOT call onCancel when the backdrop click target is NOT the currentTarget (e.g. inner-div bubbled)', () => {
    const onCancel = vi.fn();
    const tree = renderModal(makeProps({ onCancel }));
    const backdrop = findBackdrop(tree);
    const onClick = (backdrop.props as { onClick: (e: { target: unknown; currentTarget: unknown }) => void }).onClick;
    onClick({ target: {}, currentTarget: {} });
    expect(onCancel).not.toHaveBeenCalled();
    const cleanup = mocks.effectCleanups[0];
    if (typeof cleanup === 'function') cleanup();
  });

  it('inner-card click handler stops propagation (e.stopPropagation called)', () => {
    const tree = renderModal(makeProps());
    const inner = findInnerCard(tree);
    const onClick = (inner.props as { onClick: (e: { stopPropagation: () => void }) => void }).onClick;
    const stopSpy = vi.fn();
    onClick({ stopPropagation: stopSpy });
    expect(stopSpy).toHaveBeenCalledTimes(1);
    const cleanup = mocks.effectCleanups[0];
    if (typeof cleanup === 'function') cleanup();
  });
});

describe('DestroyConfirmModal — type-to-confirm gating', () => {
  it('disables the Destroy button when typed input is empty', () => {
    mocks.typedRef.current = '';
    const tree = renderModal(makeProps({ cardName: 'my-app' }));
    const btn = findDestroyButton(tree);
    expect((btn.props as { disabled: boolean }).disabled).toBe(true);
    const cleanup = mocks.effectCleanups[0];
    if (typeof cleanup === 'function') cleanup();
  });

  it('disables the Destroy button when typed string does not match cardName', () => {
    mocks.typedRef.current = 'wrong';
    const tree = renderModal(makeProps({ cardName: 'my-app' }));
    expect((findDestroyButton(tree).props as { disabled: boolean }).disabled).toBe(true);
    const cleanup = mocks.effectCleanups[0];
    if (typeof cleanup === 'function') cleanup();
  });

  it('enables the Destroy button when typed string exactly matches cardName', () => {
    mocks.typedRef.current = 'my-app';
    const tree = renderModal(makeProps({ cardName: 'my-app' }));
    expect((findDestroyButton(tree).props as { disabled: boolean }).disabled).toBe(false);
    const cleanup = mocks.effectCleanups[0];
    if (typeof cleanup === 'function') cleanup();
  });

  it('enables the Destroy button when typed string matches cardName after trimming whitespace', () => {
    mocks.typedRef.current = '   my-app   ';
    const tree = renderModal(makeProps({ cardName: 'my-app' }));
    expect((findDestroyButton(tree).props as { disabled: boolean }).disabled).toBe(false);
    const cleanup = mocks.effectCleanups[0];
    if (typeof cleanup === 'function') cleanup();
  });

  it('does NOT trim the cardName itself: "  foo  " trimmed input does NOT match cardName="my-app  "', () => {
    // The trim is only applied to `typed`, not `cardName`. So if cardName has
    // trailing whitespace, even an exact-but-untrimmed input won't match.
    mocks.typedRef.current = 'my-app';
    const tree = renderModal(makeProps({ cardName: 'my-app  ' }));
    expect((findDestroyButton(tree).props as { disabled: boolean }).disabled).toBe(true);
    const cleanup = mocks.effectCleanups[0];
    if (typeof cleanup === 'function') cleanup();
  });
});

describe('DestroyConfirmModal — input change handlers', () => {
  it('typing in the text input calls setTyped with the new value', () => {
    const tree = renderModal(makeProps());
    const input = findTypedInput(tree);
    const onChange = (input.props as { onChange: (e: { target: { value: string } }) => void }).onChange;
    onChange({ target: { value: 'partial' } });
    expect(mocks.typedSetterSpy).toHaveBeenCalledWith('partial');
    const cleanup = mocks.effectCleanups[0];
    if (typeof cleanup === 'function') cleanup();
  });

  it('the text input has autoFocus attribute', () => {
    const tree = renderModal(makeProps());
    const input = findTypedInput(tree);
    expect((input.props as { autoFocus?: boolean }).autoFocus).toBe(true);
    const cleanup = mocks.effectCleanups[0];
    if (typeof cleanup === 'function') cleanup();
  });

  it('the text input value reflects the typed state', () => {
    mocks.typedRef.current = 'mid-input';
    const tree = renderModal(makeProps());
    const input = findTypedInput(tree);
    expect((input.props as { value: string }).value).toBe('mid-input');
    const cleanup = mocks.effectCleanups[0];
    if (typeof cleanup === 'function') cleanup();
  });

  it('the text input placeholder is the cardName', () => {
    const tree = renderModal(makeProps({ cardName: 'placeholder-name' }));
    const input = findTypedInput(tree);
    expect((input.props as { placeholder: string }).placeholder).toBe('placeholder-name');
    const cleanup = mocks.effectCleanups[0];
    if (typeof cleanup === 'function') cleanup();
  });

  it('the cardName is rendered in the type-to-confirm label', () => {
    const tree = renderModal(makeProps({ cardName: 'my-special-app' }));
    const text = collectText(tree);
    expect(text).toContain('Type my-special-app to confirm:');
    const cleanup = mocks.effectCleanups[0];
    if (typeof cleanup === 'function') cleanup();
  });
});

describe('DestroyConfirmModal — checkbox toggle', () => {
  it('the checkbox is unchecked when destroyEverything is false', () => {
    mocks.destroyEverythingRef.current = false;
    const tree = renderModal(makeProps({ resources: [{ name: 'a', type: 't' }] }));
    const checkbox = findCheckbox(tree);
    expect((checkbox.props as { checked: boolean }).checked).toBe(false);
    const cleanup = mocks.effectCleanups[0];
    if (typeof cleanup === 'function') cleanup();
  });

  it('the checkbox is checked when destroyEverything is true', () => {
    mocks.destroyEverythingRef.current = true;
    const tree = renderModal(makeProps({ resources: [{ name: 'a', type: 't' }] }));
    const checkbox = findCheckbox(tree);
    expect((checkbox.props as { checked: boolean }).checked).toBe(true);
    const cleanup = mocks.effectCleanups[0];
    if (typeof cleanup === 'function') cleanup();
  });

  it('checking the box calls setDestroyEverything(true)', () => {
    mocks.destroyEverythingRef.current = false;
    const tree = renderModal(makeProps({ resources: [{ name: 'a', type: 't' }] }));
    const checkbox = findCheckbox(tree);
    const onChange = (checkbox.props as { onChange: (e: { target: { checked: boolean } }) => void }).onChange;
    onChange({ target: { checked: true } });
    expect(mocks.destroyEverythingSetterSpy).toHaveBeenCalledWith(true);
    const cleanup = mocks.effectCleanups[0];
    if (typeof cleanup === 'function') cleanup();
  });

  it('unchecking the box calls setDestroyEverything(false)', () => {
    mocks.destroyEverythingRef.current = true;
    const tree = renderModal(makeProps({ resources: [{ name: 'a', type: 't' }] }));
    const checkbox = findCheckbox(tree);
    const onChange = (checkbox.props as { onChange: (e: { target: { checked: boolean } }) => void }).onChange;
    onChange({ target: { checked: false } });
    expect(mocks.destroyEverythingSetterSpy).toHaveBeenCalledWith(false);
    const cleanup = mocks.effectCleanups[0];
    if (typeof cleanup === 'function') cleanup();
  });
});

describe('DestroyConfirmModal — footer buttons', () => {
  it('the Destroy button label is "Destroy" when !destroyEverything', () => {
    mocks.destroyEverythingRef.current = false;
    const tree = renderModal(makeProps({ resources: [{ name: 'a', type: 't' }] }));
    const btn = findDestroyButton(tree);
    expect((btn.props as { children: string }).children).toBe('Destroy');
    const cleanup = mocks.effectCleanups[0];
    if (typeof cleanup === 'function') cleanup();
  });

  it('the Destroy button label is "Destroy everything" when destroyEverything', () => {
    mocks.destroyEverythingRef.current = true;
    const tree = renderModal(makeProps({ resources: [{ name: 'a', type: 't' }] }));
    const btn = findDestroyButton(tree);
    expect((btn.props as { children: string }).children).toBe('Destroy everything');
    const cleanup = mocks.effectCleanups[0];
    if (typeof cleanup === 'function') cleanup();
  });

  it('clicking Cancel calls onCancel', () => {
    const onCancel = vi.fn();
    const tree = renderModal(makeProps({ onCancel }));
    const btn = findCancelButton(tree);
    const onClick = (btn.props as { onClick: () => void }).onClick;
    onClick();
    expect(onCancel).toHaveBeenCalledTimes(1);
    const cleanup = mocks.effectCleanups[0];
    if (typeof cleanup === 'function') cleanup();
  });

  it('clicking Destroy calls onConfirm with the current destroyEverything value (false branch)', () => {
    const onConfirm = vi.fn();
    mocks.destroyEverythingRef.current = false;
    const tree = renderModal(makeProps({ onConfirm, resources: [{ name: 'a', type: 't' }] }));
    const btn = findDestroyButton(tree);
    const onClick = (btn.props as { onClick: () => void }).onClick;
    onClick();
    expect(onConfirm).toHaveBeenCalledWith(false);
    const cleanup = mocks.effectCleanups[0];
    if (typeof cleanup === 'function') cleanup();
  });

  it('clicking Destroy calls onConfirm with the current destroyEverything value (true branch)', () => {
    const onConfirm = vi.fn();
    mocks.destroyEverythingRef.current = true;
    const tree = renderModal(makeProps({ onConfirm, resources: [{ name: 'a', type: 't' }] }));
    const btn = findDestroyButton(tree);
    const onClick = (btn.props as { onClick: () => void }).onClick;
    onClick();
    expect(onConfirm).toHaveBeenCalledWith(true);
    const cleanup = mocks.effectCleanups[0];
    if (typeof cleanup === 'function') cleanup();
  });
});

describe('DestroyConfirmModal — scope-toggle copy', () => {
  it('renders the "Destroy everything for this project" label and helper copy', () => {
    const tree = renderModal(makeProps());
    const text = collectText(tree);
    expect(text).toContain('Destroy everything for this project');
    expect(text).toContain('Walks every historical deployment');
    expect(text).toContain('Useful when');
    expect(text).toContain('the normal destroy misses orphans from failed deploys');
    const cleanup = mocks.effectCleanups[0];
    if (typeof cleanup === 'function') cleanup();
  });
});
