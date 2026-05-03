/**
 * Tests for `ErrorBoundary` — class component.
 *
 * Tests three things:
 *   - `getDerivedStateFromError` returns the correct state shape.
 *   - `componentDidCatch` logs to console.error with the `[ErrorBoundary]`
 *     or `[ErrorBoundary:<name>]` prefix.
 *   - `render()` returns children when no error, fallback when supplied,
 *     or default UI when not.
 *   - `handleReset` clears the error state.
 *
 * The class is instantiated directly (no React renderer required) so
 * we can assert on the rendered tree synchronously. `t` (i18n) is
 * mocked so labels are deterministic.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../i18n', () => ({
  t: (k: string, params?: Record<string, unknown>) =>
    params ? `${k}:${JSON.stringify(params)}` : k,
}));

import { ErrorBoundary } from '../error-boundary';

// ─── Helpers ────────────────────────────────────────────────────────────────

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
      /* opaque */
    }
    return;
  }
  yield* walk(node.props.children);
}

function findAll(tree: unknown, pred: (el: ElLike) => boolean): ElLike[] {
  const out: ElLike[] = [];
  for (const el of walk(tree)) if (pred(el)) out.push(el);
  return out;
}

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

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('ErrorBoundary — happy path', () => {
  it('renders children when there is no error', () => {
    const child = React.createElement('div', { id: 'child' }, 'hi');
    const eb = new ErrorBoundary({ children: child });
    const tree = eb.render();
    expect(tree).toBe(child);
  });
});

describe('ErrorBoundary — getDerivedStateFromError (static)', () => {
  it('returns hasError=true and the error reference', () => {
    const err = new Error('boom');
    const next = ErrorBoundary.getDerivedStateFromError(err);
    expect(next).toEqual({ hasError: true, error: err });
  });
});

describe('ErrorBoundary — render fallback when error', () => {
  it('returns the explicit fallback prop when provided', () => {
    const fallback = React.createElement('span', null, 'custom-fallback');
    const eb = new ErrorBoundary({ children: null, fallback });
    eb.state = { hasError: true, error: new Error('x') };
    const tree = eb.render();
    expect(tree).toBe(fallback);
  });

  it('renders the default UI with name-suffixed title and the error message', () => {
    const eb = new ErrorBoundary({ children: null, name: 'CanvasArea' });
    eb.state = { hasError: true, error: new Error('panel exploded') };
    const tree = eb.render();
    const text = collectText(tree);
    expect(text).toContain('error.crashed');
    expect(text).toContain('CanvasArea');
    expect(text).toContain('panel exploded');
    // Try-again button text.
    expect(text).toContain('error.tryAgain');
  });

  it('renders the default UI with somethingWrong title when no name is supplied', () => {
    const eb = new ErrorBoundary({ children: null });
    eb.state = { hasError: true, error: new Error('boom') };
    const tree = eb.render();
    const text = collectText(tree);
    expect(text).toContain('error.somethingWrong');
    expect(text).not.toContain('error.crashed');
  });

  it('renders error.unexpected when error.message is empty', () => {
    const eb = new ErrorBoundary({ children: null });
    eb.state = { hasError: true, error: new Error('') };
    const tree = eb.render();
    const text = collectText(tree);
    expect(text).toContain('error.unexpected');
  });

  it('renders error.unexpected when error is null', () => {
    const eb = new ErrorBoundary({ children: null });
    eb.state = { hasError: true, error: null };
    const tree = eb.render();
    const text = collectText(tree);
    expect(text).toContain('error.unexpected');
  });
});

describe('ErrorBoundary — componentDidCatch', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('logs to console.error with [ErrorBoundary] prefix when no name', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const eb = new ErrorBoundary({ children: null });
    const err = new Error('test');
    eb.componentDidCatch(err, { componentStack: 'stack-x' } as React.ErrorInfo);
    expect(errSpy).toHaveBeenCalledWith('[ErrorBoundary]', err, 'stack-x');
  });

  it('logs to console.error with [ErrorBoundary:Name] prefix when name set', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const eb = new ErrorBoundary({ children: null, name: 'TopBar' });
    const err = new Error('test');
    eb.componentDidCatch(err, { componentStack: 'stack-y' } as React.ErrorInfo);
    expect(errSpy).toHaveBeenCalledWith('[ErrorBoundary:TopBar]', err, 'stack-y');
  });
});

describe('ErrorBoundary — handleReset', () => {
  it('calls setState with the cleared shape', () => {
    const eb = new ErrorBoundary({ children: null });
    const setStateSpy = vi
      .spyOn(eb, 'setState')
      .mockImplementation(() => {});
    eb.handleReset();
    expect(setStateSpy).toHaveBeenCalledWith({ hasError: false, error: null });
  });
});

describe('ErrorBoundary — render fallback wires reset button', () => {
  it('renders a button whose onClick === handleReset', () => {
    const eb = new ErrorBoundary({ children: null });
    eb.state = { hasError: true, error: new Error('x') };
    const tree = eb.render();
    const btns = findAll(tree, (el) => el.type === 'button');
    expect(btns).toHaveLength(1);
    // The bound handler is the same arrow stored on the instance.
    expect((btns[0].props as { onClick: () => void }).onClick).toBe(eb.handleReset);
  });
});
