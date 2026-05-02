/**
 * Tests for `SvgSecretStoreNode` — read-only canvas card for `Security.Secret`.
 * Shows only KEY names (never values) — non-leak invariant pinned by these
 * tests. EmptyHint when no secrets, otherwise one KvLine per secret.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const passthrough: React.FC<Record<string, unknown>> = (props) =>
    React.createElement('div', null, (props as { children?: React.ReactNode }).children);
  passthrough.displayName = 'MockCardShell';
  const inert = (name: string): React.FC<Record<string, unknown>> => {
    const fc: React.FC<Record<string, unknown>> = () => null;
    fc.displayName = name;
    return fc;
  };
  return {
    CardShell: passthrough,
    KvLine: inert('MockKvLine'),
    EmptyHint: inert('MockEmptyHint'),
  };
});

vi.mock('../../_shared', () => ({
  CardShell: mocks.CardShell,
  KvLine: mocks.KvLine,
  EmptyHint: mocks.EmptyHint,
}));

import {
  SvgSecretStoreNode,
  computeSecretStoreHeight,
  SS_HEADER_HEIGHT,
  SS_PADDING,
  SS_ROW_HEIGHT,
} from '..';
import type { CanvasNode } from '../../../svg-canvas';

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

const makeNode = (overrides: Partial<CanvasNode> = {}): CanvasNode => ({
  id: 'ss-1',
  type: 'block',
  x: 0,
  y: 0,
  width: 240,
  height: 120,
  label: 'Secrets',
  data: {},
  ...overrides,
});

describe('computeSecretStoreHeight', () => {
  it('uses min 1 row for empty data', () => {
    const expected = SS_HEADER_HEIGHT + SS_PADDING + 1 * SS_ROW_HEIGHT + SS_PADDING;
    expect(computeSecretStoreHeight({})).toBe(expected);
  });

  it('uses N rows for N secrets', () => {
    const expected = SS_HEADER_HEIGHT + SS_PADDING + 4 * SS_ROW_HEIGHT + SS_PADDING;
    expect(computeSecretStoreHeight({ secrets: ['A', 'B', 'C', 'D'] })).toBe(expected);
  });
});

describe('SvgSecretStoreNode', () => {
  it('carries displayName', () => {
    expect(SvgSecretStoreNode.displayName).toBe('SvgSecretStoreNode');
  });

  it('renders a CardShell', () => {
    const tree = SvgSecretStoreNode({ node: makeNode(), isSelected: false }) as React.ReactElement;
    expect(tree.type).toBe(mocks.CardShell);
  });

  it('subtitle reads "No secrets yet" when none', () => {
    const tree = SvgSecretStoreNode({ node: makeNode(), isSelected: false }) as React.ReactElement;
    expect((tree.props as { subtitle: string }).subtitle).toBe('No secrets yet');
  });

  it('subtitle uses singular "secret" for one entry', () => {
    const tree = SvgSecretStoreNode({
      node: makeNode({ data: { secrets: ['ALPHA'] } }),
      isSelected: false,
    }) as React.ReactElement;
    expect((tree.props as { subtitle: string }).subtitle).toBe('1 secret');
  });

  it('subtitle uses plural "secrets" for >=2', () => {
    const tree = SvgSecretStoreNode({
      node: makeNode({ data: { secrets: ['A', 'B', 'C'] } }),
      isSelected: false,
    }) as React.ReactElement;
    expect((tree.props as { subtitle: string }).subtitle).toBe('3 secrets');
  });

  it('appends "· auto-rotate" when data.auto_rotate is truthy', () => {
    const tree = SvgSecretStoreNode({
      node: makeNode({ data: { secrets: ['X'], auto_rotate: true } }),
      isSelected: false,
    }) as React.ReactElement;
    expect((tree.props as { subtitle: string }).subtitle).toBe('1 secret · auto-rotate');
  });

  it('omits "· auto-rotate" when no secrets, even if flag set', () => {
    const tree = SvgSecretStoreNode({
      node: makeNode({ data: { auto_rotate: true } }),
      isSelected: false,
    }) as React.ReactElement;
    expect((tree.props as { subtitle: string }).subtitle).toBe('No secrets yet');
  });

  it('uses node.label as title when present, falls back to "Secret Store"', () => {
    const withLabel = SvgSecretStoreNode({
      node: makeNode({ label: 'My Secrets' }),
      isSelected: false,
    }) as React.ReactElement;
    const fallback = SvgSecretStoreNode({
      node: makeNode({ label: '' }),
      isSelected: false,
    }) as React.ReactElement;
    expect((withLabel.props as { title: string }).title).toBe('My Secrets');
    expect((fallback.props as { title: string }).title).toBe('Secret Store');
  });

  it('renders EmptyHint when no secrets', () => {
    const tree = SvgSecretStoreNode({ node: makeNode(), isSelected: false }) as React.ReactElement;
    expect(findByType(tree, mocks.EmptyHint)).toHaveLength(1);
    expect(findByType(tree, mocks.KvLine)).toHaveLength(0);
  });

  it('renders one KvLine per parsed secret name', () => {
    const tree = SvgSecretStoreNode({
      node: makeNode({ data: { secrets: ['A', 'B', 'C'] } }),
      isSelected: false,
    }) as React.ReactElement;
    expect(findByType(tree, mocks.KvLine)).toHaveLength(3);
  });

  it('parses object secrets via .key', () => {
    const tree = SvgSecretStoreNode({
      node: makeNode({ data: { secrets: [{ key: 'STRIPE_SECRET' }, { key: 'AWS_KEY' }] } }),
      isSelected: false,
    }) as React.ReactElement;
    const lines = findByType(tree, mocks.KvLine);
    expect(lines.map((l) => (l.props as { name: string }).name)).toEqual(['STRIPE_SECRET', 'AWS_KEY']);
  });

  it('falls back to empty string when object .key is absent (then filtered out)', () => {
    const tree = SvgSecretStoreNode({
      node: makeNode({ data: { secrets: [{}, { key: 'OK' }] } }),
      isSelected: false,
    }) as React.ReactElement;
    expect(findByType(tree, mocks.KvLine)).toHaveLength(1);
  });

  it('returns empty string for non-string non-object inputs (then filtered)', () => {
    const tree = SvgSecretStoreNode({
      node: makeNode({ data: { secrets: [42, null, undefined, true, 'KEEP'] } }),
      isSelected: false,
    }) as React.ReactElement;
    expect(findByType(tree, mocks.KvLine)).toHaveLength(1);
  });

  it('passes bullet=true to KvLine (display rendering hint)', () => {
    const tree = SvgSecretStoreNode({
      node: makeNode({ data: { secrets: ['A'] } }),
      isSelected: false,
    }) as React.ReactElement;
    const line = findByType(tree, mocks.KvLine)[0];
    expect((line.props as { bullet: boolean }).bullet).toBe(true);
  });

  it('forwards key-name only to KvLine (no value prop, no leak)', () => {
    const tree = SvgSecretStoreNode({
      node: makeNode({ data: { secrets: [{ key: 'TOKEN', value: 'leak-me' }] } }),
      isSelected: false,
    }) as React.ReactElement;
    const line = findByType(tree, mocks.KvLine)[0];
    const props = line.props as Record<string, unknown>;
    expect(props.name).toBe('TOKEN');
    expect(props.value).toBeUndefined();
  });

  it('forwards isDragOver / connectionDragState to CardShell with sensible defaults', () => {
    const tree = SvgSecretStoreNode({ node: makeNode(), isSelected: false }) as React.ReactElement;
    const props = tree.props as Record<string, unknown>;
    expect(props.isDragOver).toBe(false);
    expect(props.connectionDragState).toBe(null);
  });
});
