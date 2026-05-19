/**
 * Tests for `SvgEnvConfigNode` + `computeEnvConfigHeight` + `parseVariable`.
 *
 * The component is a thin wrapper around `<CardShell>` that maps
 * `node.data.variables` into `<KvLine>` rows. Internal helper
 * `parseVariable` accepts the legacy string form and the structured
 * { key, value } form, and gates everything else off (returns empty key).
 *
 * Branches:
 *   - computeEnvConfigHeight: floor of 1 row when variables empty/missing.
 *   - parseVariable: object form, string with '=', string-only, neither.
 *   - liveConfig: pluralization (0 → "No variables yet"; 1 → "1 variable"; N → "N variables").
 *   - empty state vs KvLine list rendering.
 *   - title fallback to "Env Config" when label empty.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const named = (name: string): React.FC<Record<string, unknown>> => {
    const fc: React.FC<Record<string, unknown>> = (props) => (props.children as React.ReactElement) ?? null;
    fc.displayName = name;
    return fc;
  };
  return {
    CardShell: named('MockCardShell'),
    EmptyHint: ((props: { message: string }) => null) as React.FC<{ message: string }>,
    KvLine: ((props: { name: string; value: string }) => null) as React.FC<{ name: string; value: string }>,
  };
});

vi.mock('../../_shared', () => ({
  CardShell: mocks.CardShell,
  EmptyHint: mocks.EmptyHint,
  KvLine: mocks.KvLine,
}));

vi.mock('lucide-react', () => ({
  Cog: ((props: Record<string, unknown>) => null) as React.FC,
}));

import { CARD_FOOTER_HEIGHT } from '@ice/constants';
import { SvgEnvConfigNode, computeEnvConfigHeight, EC_HEADER_HEIGHT, EC_ROW_HEIGHT, EC_PADDING } from '..';
import type { CanvasNode } from '../../../svg-canvas';

const MockCardShell = mocks.CardShell;
const MockEmptyHint = mocks.EmptyHint;
const MockKvLine = mocks.KvLine;

// ─── tree walker ──────────────────────────────────────────────────────

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
  id: 'node-1',
  type: 'block',
  x: 0,
  y: 0,
  width: 240,
  height: 120,
  label: 'My Env',
  data: {},
  parentId: undefined,
  ...overrides,
});

const renderEC = (props: Partial<React.ComponentProps<typeof SvgEnvConfigNode>> = {}): React.ReactElement => {
  const Inner = SvgEnvConfigNode as React.FC<React.ComponentProps<typeof SvgEnvConfigNode>>;
  const defaults: React.ComponentProps<typeof SvgEnvConfigNode> = {
    node: makeNode(),
    isSelected: false,
  };
  return Inner({ ...defaults, ...props }) as React.ReactElement;
};

describe('Constants', () => {
  it('exports EC_HEADER_HEIGHT, EC_ROW_HEIGHT, EC_PADDING', () => {
    expect(EC_HEADER_HEIGHT).toBe(48);
    expect(EC_ROW_HEIGHT).toBe(20);
    expect(EC_PADDING).toBe(12);
  });

  it('SvgEnvConfigNode has displayName "SvgEnvConfigNode"', () => {
    expect((SvgEnvConfigNode as { displayName?: string }).displayName).toBe('SvgEnvConfigNode');
  });
});

describe('computeEnvConfigHeight', () => {
  it('returns header + padding*2 + 1 row + footer when variables empty', () => {
    const h = computeEnvConfigHeight({});
    expect(h).toBe(EC_HEADER_HEIGHT + EC_PADDING + 1 * EC_ROW_HEIGHT + EC_PADDING + CARD_FOOTER_HEIGHT);
  });

  it('returns header + padding*2 + N rows + footer for N variables', () => {
    const h = computeEnvConfigHeight({ variables: [1, 2, 3] });
    expect(h).toBe(EC_HEADER_HEIGHT + EC_PADDING + 3 * EC_ROW_HEIGHT + EC_PADDING + CARD_FOOTER_HEIGHT);
  });

  it('coerces missing variables key to empty list', () => {
    const h1 = computeEnvConfigHeight({});
    const h2 = computeEnvConfigHeight({ variables: undefined });
    const h3 = computeEnvConfigHeight({ variables: [] });
    expect(h1).toBe(h2);
    expect(h1).toBe(h3);
  });

  it('handles null data input via optional chaining', () => {
    const h = computeEnvConfigHeight(null as unknown as Record<string, unknown>);
    expect(h).toBe(EC_HEADER_HEIGHT + EC_PADDING + 1 * EC_ROW_HEIGHT + EC_PADDING + CARD_FOOTER_HEIGHT);
  });
});

describe('SvgEnvConfigNode — empty state', () => {
  it('renders "No variables yet" liveConfig when variables empty', () => {
    const tree = renderEC({ node: makeNode({ data: { variables: [] } }) });
    const shell = findByType(tree, MockCardShell)[0];
    expect((shell.props as { liveConfig: string }).liveConfig).toBe('No variables yet');
  });

  it('renders <EmptyHint> in body when no variables', () => {
    const tree = renderEC({ node: makeNode({ data: { variables: [] } }) });
    expect(findByType(tree, MockEmptyHint)).toHaveLength(1);
  });
});

describe('SvgEnvConfigNode — populated state', () => {
  it('renders KvLine for each variable in object form', () => {
    const node = makeNode({
      data: {
        variables: [
          { key: 'FOO', value: '1' },
          { key: 'BAR', value: '2' },
        ],
      },
    });
    const tree = renderEC({ node });
    const lines = findByType(tree, MockKvLine);
    expect(lines).toHaveLength(2);
    expect((lines[0].props as { name: string; value: string }).name).toBe('FOO');
    expect((lines[0].props as { name: string; value: string }).value).toBe('1');
    expect((lines[1].props as { name: string }).name).toBe('BAR');
  });

  it('parses string form "KEY=VAL"', () => {
    const node = makeNode({ data: { variables: ['DB=postgres://localhost'] } });
    const tree = renderEC({ node });
    const lines = findByType(tree, MockKvLine);
    expect(lines).toHaveLength(1);
    expect((lines[0].props as { name: string; value: string }).name).toBe('DB');
    expect((lines[0].props as { name: string; value: string }).value).toBe('postgres://localhost');
  });

  it('parses string-only (no "=") with empty value', () => {
    const node = makeNode({ data: { variables: ['BAREKEY'] } });
    const tree = renderEC({ node });
    const lines = findByType(tree, MockKvLine);
    expect(lines).toHaveLength(1);
    expect((lines[0].props as { name: string; value: string }).name).toBe('BAREKEY');
    expect((lines[0].props as { name: string; value: string }).value).toBe('');
  });

  it('drops variables with empty key (object form, non-string)', () => {
    const node = makeNode({
      data: {
        variables: [{ key: '', value: 'v' }, { key: 'OK', value: 'good' }, 42],
      },
    });
    const tree = renderEC({ node });
    const lines = findByType(tree, MockKvLine);
    expect(lines).toHaveLength(1);
    expect((lines[0].props as { name: string }).name).toBe('OK');
  });

  it('string starting with "=" keeps the literal as-is in key field', () => {
    // indexOf('=') === 0 → falls through to `{ key: raw, value: '' }`.
    const node = makeNode({ data: { variables: ['=onlyvalue'] } });
    const tree = renderEC({ node });
    const lines = findByType(tree, MockKvLine);
    expect(lines).toHaveLength(1);
    expect((lines[0].props as { name: string; value: string }).name).toBe('=onlyvalue');
    expect((lines[0].props as { name: string; value: string }).value).toBe('');
  });

  it('object form: missing key/value coerces to empty strings', () => {
    const node = makeNode({ data: { variables: [{ value: 'orphan' }] } });
    const tree = renderEC({ node });
    // Empty key → filtered out.
    expect(findByType(tree, MockKvLine)).toHaveLength(0);
  });

  it('object form: missing value coerces to empty string', () => {
    const node = makeNode({ data: { variables: [{ key: 'OK_KEY' }] } });
    const tree = renderEC({ node });
    const lines = findByType(tree, MockKvLine);
    expect(lines).toHaveLength(1);
    expect((lines[0].props as { name: string; value: string }).name).toBe('OK_KEY');
    expect((lines[0].props as { name: string; value: string }).value).toBe('');
  });

  it('non-string non-object input yields empty key (filtered)', () => {
    const node = makeNode({ data: { variables: [42, true, null, undefined] } });
    const tree = renderEC({ node });
    expect(findByType(tree, MockKvLine)).toHaveLength(0);
  });

  it('liveConfig: "1 variable" (singular)', () => {
    const node = makeNode({ data: { variables: [{ key: 'A', value: '1' }] } });
    const tree = renderEC({ node });
    const shell = findByType(tree, MockCardShell)[0];
    expect((shell.props as { liveConfig: string }).liveConfig).toBe('1 variable');
  });

  it('liveConfig: "N variables" (plural)', () => {
    const node = makeNode({
      data: {
        variables: [
          { key: 'A', value: '1' },
          { key: 'B', value: '2' },
          { key: 'C', value: '3' },
        ],
      },
    });
    const tree = renderEC({ node });
    const shell = findByType(tree, MockCardShell)[0];
    expect((shell.props as { liveConfig: string }).liveConfig).toBe('3 variables');
  });
});

describe('SvgEnvConfigNode — CardShell forwarding', () => {
  it('forwards node, isSelected, isDragOver, onNodeHover, connectionDragState', () => {
    const node = makeNode();
    const onHover = vi.fn();
    const tree = renderEC({
      node,
      isSelected: true,
      isDragOver: true,
      onNodeHover: onHover,
      connectionDragState: 'valid-target',
    });
    const shell = findByType(tree, MockCardShell)[0];
    const props = shell.props as Record<string, unknown>;
    expect(props.node).toBe(node);
    expect(props.isSelected).toBe(true);
    expect(props.isDragOver).toBe(true);
    expect(props.onNodeHover).toBe(onHover);
    expect(props.connectionDragState).toBe('valid-target');
    expect(props.headerHeight).toBe(EC_HEADER_HEIGHT);
  });

  it('uses node.label as title when set', () => {
    const tree = renderEC({ node: makeNode({ label: 'My Env' }) });
    const shell = findByType(tree, MockCardShell)[0];
    expect((shell.props as { title: string }).title).toBe('My Env');
  });

  it('falls back to "Env Config" title when label empty/undefined', () => {
    const noLabel = renderEC({ node: makeNode({ label: '' }) });
    const undef = renderEC({ node: makeNode({ label: undefined as unknown as string }) });
    expect((findByType(noLabel, MockCardShell)[0].props as { title: string }).title).toBe('Env Config');
    expect((findByType(undef, MockCardShell)[0].props as { title: string }).title).toBe('Env Config');
  });

  it('isDragOver defaults to false when not provided', () => {
    const tree = renderEC({});
    const shell = findByType(tree, MockCardShell)[0];
    expect((shell.props as { isDragOver: boolean }).isDragOver).toBe(false);
  });

  it('connectionDragState defaults to null when not provided', () => {
    const tree = renderEC({});
    const shell = findByType(tree, MockCardShell)[0];
    expect((shell.props as { connectionDragState: unknown }).connectionDragState).toBe(null);
  });

  it('handles missing node.data gracefully (empty variables fallback)', () => {
    const node = makeNode({ data: undefined as unknown as Record<string, unknown> });
    const tree = renderEC({ node });
    expect(findByType(tree, MockEmptyHint)).toHaveLength(1);
  });
});
