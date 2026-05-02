/**
 * IntegrationStatusDots — small status pills in the status bar.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  state: {
    integrations: {
      integrations: {
        github: { status: 'connected', username: 'octocat' },
        gcp: { status: 'connecting' },
        aws: { status: 'disconnected' },
        azure: { status: 'error' },
      } as Record<string, { status: string; username?: string }>,
    },
  },
}));

vi.mock('react-redux', () => ({
  useSelector: (sel: (s: unknown) => unknown) => sel(mocks.state),
}));

vi.mock('../../../../shared/utils/cn', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}));

import { IntegrationStatusDots } from '../integration-status-dots';

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
function collectText(node: unknown): string {
  let s = '';
  for (const el of walk(node)) {
    const c = (el.props as { children?: unknown }).children;
    if (typeof c === 'string') s += c + ' ';
    else if (Array.isArray(c)) {
      for (const item of c) {
        if (typeof item === 'string') s += item + ' ';
      }
    }
  }
  return s;
}

const callRender = (): unknown => (IntegrationStatusDots as () => unknown)();

beforeEach(() => {
  mocks.state.integrations.integrations = {
    github: { status: 'connected', username: 'octocat' },
    gcp: { status: 'connecting' },
    aws: { status: 'disconnected' },
    azure: { status: 'error' },
  };
});

describe('IntegrationStatusDots', () => {
  it('returns null when all providers are disconnected', () => {
    mocks.state.integrations.integrations = {
      github: { status: 'disconnected' },
    };
    expect(callRender()).toBeNull();
  });

  it('does not render aws because it is disconnected', () => {
    const tree = callRender();
    expect(collectText(tree)).not.toContain('AWS');
  });

  it('renders connected, connecting, and error providers (omits disconnected)', () => {
    const tree = callRender();
    const text = collectText(tree);
    expect(text).toContain('GitHub');
    expect(text).toContain('GCP');
    expect(text).toContain('Azure');
    expect(text).not.toContain('AWS');
  });

  it('renders a Loader2 with animate-spin for connecting status', () => {
    const tree = callRender();
    const loaders = findAll(
      tree,
      (el) =>
        typeof (el.props as { className?: string }).className === 'string' &&
        ((el.props as { className: string }).className.includes('animate-spin') ?? false),
    );
    expect(loaders.length).toBeGreaterThanOrEqual(1);
  });

  it('renders the colored dot div for non-connecting providers', () => {
    const tree = callRender();
    const dots = findAll(
      tree,
      (el) =>
        el.type === 'div' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        ((el.props as { className: string }).className.includes('w-2 h-2 rounded-full') ?? false),
    );
    expect(dots.length).toBeGreaterThanOrEqual(2); // github + azure
  });

  it('renders username in title for connected providers', () => {
    const tree = callRender();
    const titled = findAll(
      tree,
      (el) =>
        el.type === 'div' &&
        typeof (el.props as { title?: string }).title === 'string' &&
        ((el.props as { title: string }).title.includes('octocat') ?? false),
    );
    expect(titled.length).toBe(1);
  });

  it('renders raw provider id when no PROVIDER_LABEL match', () => {
    mocks.state.integrations.integrations = {
      mystery: { status: 'connected' },
    };
    const tree = callRender();
    expect(collectText(tree)).toContain('mystery');
  });
});
