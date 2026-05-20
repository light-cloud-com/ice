/**
 * Tests for `KvLine` — a `KEY = value` row used by Env Config and Secret
 * Store blocks. Three branches: bullet on/off, value present/absent,
 * maskValue on/off (with min 4 / max 10 dot count).
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { KvLine } from '../kv-line';

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

const findSpansByText = (tree: React.ReactNode, text: string) =>
  [...walk(tree)].filter((el) => el.type === 'span' && (el.props as { children?: unknown }).children === text);

describe('KvLine', () => {
  it('renders the key without bullet by default and without value column when value is undefined', () => {
    const tree = KvLine({ name: 'KEY' });
    const keys = findSpansByText(tree, 'KEY');
    expect(keys).toHaveLength(1);
    // No `=` sign rendered without a value.
    expect(findSpansByText(tree, '=')).toHaveLength(0);
  });

  it('renders the leading bullet when bullet=true', () => {
    const tree = KvLine({ name: 'API_KEY', bullet: true });
    const bullets = findSpansByText(tree, '●');
    expect(bullets).toHaveLength(1);
  });

  it('renders the value column when value is supplied', () => {
    const tree = KvLine({ name: 'PORT', value: '5432' });
    expect(findSpansByText(tree, 'PORT')).toHaveLength(1);
    expect(findSpansByText(tree, '=')).toHaveLength(1);
    expect(findSpansByText(tree, '5432')).toHaveLength(1);
  });

  it('masks values with dots between 4 and 10 chars when maskValue=true', () => {
    const tree = KvLine({ name: 'SECRET', value: 'abcdefghijklmnop', maskValue: true });
    // 16-char input → capped at 10 dots.
    const masks = findSpansByText(tree, '••••••••••');
    expect(masks).toHaveLength(1);
  });

  it('masks short values with at least 4 dots even when value is shorter', () => {
    const tree = KvLine({ name: 'X', value: 'ab', maskValue: true });
    const masks = findSpansByText(tree, '••••');
    expect(masks).toHaveLength(1);
  });

  it('masks medium values with the value-length number of dots when between 4 and 10', () => {
    const tree = KvLine({ name: 'X', value: 'abcdef', maskValue: true });
    const masks = findSpansByText(tree, '••••••');
    expect(masks).toHaveLength(1);
  });

  it('renders the unmasked value when maskValue=false (default)', () => {
    const tree = KvLine({ name: 'X', value: 'visible-value' });
    expect(findSpansByText(tree, 'visible-value')).toHaveLength(1);
  });

  it('renders an empty string value (still emits the value cell)', () => {
    const tree = KvLine({ name: 'X', value: '' });
    expect(findSpansByText(tree, '=')).toHaveLength(1);
  });

  it('exposes a stable displayName', () => {
    expect(KvLine.displayName).toBe('KvLine');
  });
});
