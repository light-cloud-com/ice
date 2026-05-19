/**
 * Tests for `ServiceLine` — the brand-icon + service-name row of the
 * compact node. Renders an <img> + truncated <span> when at least one
 * input is set; returns null when all inputs are empty.
 *
 * Branches:
 *   - early return null when brandIcon, providerUrl, serviceLineText all empty.
 *   - <img> renders when brandIcon OR providerUrl set; src priority brandIcon→providerUrl.
 *   - <span> renders when serviceLineText non-empty; truncated to maxChars.
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { ServiceLine } from '../service-line';
import type { BrandIcon } from '../../../../../../assets/icons/brand-registry';

type ReactNodeLike = React.ReactNode;
function* walk(node: ReactNodeLike): Generator<React.ReactElement> {
  if (node == null || typeof node === 'boolean' || typeof node === 'string' || typeof node === 'number') return;
  if (Array.isArray(node)) {
    for (const c of node) yield* walk(c as ReactNodeLike);
    return;
  }
  const el = node as React.ReactElement;
  yield el;
  const children = (el.props as { children?: React.ReactNode } | undefined)?.children;
  if (children == null) return;
  yield* walk(children);
}
function findByType(tree: React.ReactNode, type: unknown): React.ReactElement[] {
  const out: React.ReactElement[] = [];
  for (const el of walk(tree)) if (el && el.type === type) out.push(el);
  return out;
}

const renderSL = (props: Partial<React.ComponentProps<typeof ServiceLine>> = {}): React.ReactElement | null => {
  const Inner = (
    ServiceLine as unknown as {
      type: (p: React.ComponentProps<typeof ServiceLine>) => React.ReactElement | null;
    }
  ).type;
  const defaults: React.ComponentProps<typeof ServiceLine> = {
    brandIcon: null,
    providerUrl: '',
    serviceLineText: '',
  };
  return Inner({ ...defaults, ...props });
};

describe('ServiceLine — React.memo + displayName', () => {
  it('is wrapped in React.memo', () => {
    expect(typeof (ServiceLine as unknown as { $$typeof: symbol }).$$typeof).toBe('symbol');
  });

  it('carries displayName "ServiceLine"', () => {
    expect((ServiceLine as unknown as { displayName: string }).displayName).toBe('ServiceLine');
  });
});

describe('ServiceLine — empty input early return', () => {
  it('returns null when brandIcon null, providerUrl empty, serviceLineText empty', () => {
    expect(renderSL({})).toBeNull();
  });
});

describe('ServiceLine — img rendering + src priority', () => {
  it('uses brandIcon.url when brandIcon set', () => {
    const brandIcon: BrandIcon = { url: 'https://b.example/icon.svg', label: 'X' };
    const tree = renderSL({ brandIcon, providerUrl: 'https://p.example/icon.svg' })!;
    const img = findByType(tree, 'img')[0];
    expect((img.props as { src: string }).src).toBe('https://b.example/icon.svg');
  });

  it('falls back to providerUrl when brandIcon null', () => {
    const tree = renderSL({ providerUrl: 'https://p.example/icon.svg' })!;
    const img = findByType(tree, 'img')[0];
    expect((img.props as { src: string }).src).toBe('https://p.example/icon.svg');
  });

  it('omits img when both brandIcon null and providerUrl empty (but serviceLineText set)', () => {
    const tree = renderSL({ serviceLineText: 'Hello' })!;
    expect(findByType(tree, 'img')).toHaveLength(0);
  });

  it('img has alt="" and width/height 14', () => {
    const tree = renderSL({ providerUrl: 'https://p.example/icon.svg' })!;
    const img = findByType(tree, 'img')[0];
    const props = img.props as { alt: string; width: number; height: number };
    expect(props.alt).toBe('');
    expect(props.width).toBe(14);
    expect(props.height).toBe(14);
  });
});

describe('ServiceLine — text rendering', () => {
  it('renders untruncated text when length <= maxChars (default 28)', () => {
    const tree = renderSL({ serviceLineText: 'short text' })!;
    const span = findByType(tree, 'span')[0];
    expect((span.props as { children: string }).children).toBe('short text');
  });

  it('truncates to maxChars + ellipsis when too long', () => {
    const tree = renderSL({ serviceLineText: 'x'.repeat(40) })!;
    const span = findByType(tree, 'span')[0];
    const text = (span.props as { children: string }).children;
    expect(text.length).toBe(29); // 28 + ellipsis
    expect(text.endsWith('…')).toBe(true);
  });

  it('respects custom maxChars', () => {
    const tree = renderSL({ serviceLineText: 'x'.repeat(20), maxChars: 5 })!;
    const span = findByType(tree, 'span')[0];
    const text = (span.props as { children: string }).children;
    expect(text.length).toBe(6);
    expect(text.endsWith('…')).toBe(true);
  });

  it('omits text span when serviceLineText empty (but img renders)', () => {
    const tree = renderSL({ providerUrl: 'https://p.example/icon.svg' })!;
    expect(findByType(tree, 'span')).toHaveLength(0);
  });
});
