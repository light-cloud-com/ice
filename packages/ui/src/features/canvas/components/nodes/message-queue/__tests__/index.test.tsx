/**
 * Tests for `SvgMessageQueueNode` — Messaging.Queue read-only renderer.
 * Renders a CardShell + Pill+Badge per queue, or EmptyHint when none.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const passthrough: React.FC<Record<string, unknown>> = (props) =>
    React.createElement('div', null, (props as { children?: React.ReactNode }).children);
  passthrough.displayName = 'MockCardShell';
  const inert = (name: string): React.FC<Record<string, unknown>> => {
    const fc: React.FC<Record<string, unknown>> = (props) =>
      React.createElement('span', null, (props as { children?: React.ReactNode }).children);
    fc.displayName = name;
    return fc;
  };
  return {
    CardShell: passthrough,
    Pill: inert('MockPill'),
    Badge: inert('MockBadge'),
    EmptyHint: inert('MockEmptyHint'),
  };
});

vi.mock('../../_shared', () => ({
  CardShell: mocks.CardShell,
  Pill: mocks.Pill,
  Badge: mocks.Badge,
  EmptyHint: mocks.EmptyHint,
}));

import {
  SvgMessageQueueNode,
  computeMessageQueueHeight,
  MQ_HEADER_HEIGHT,
  MQ_ROW_HEIGHT,
  MQ_ROW_GAP,
  MQ_PADDING,
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
function collectText(tree: React.ReactNode): string {
  const parts: string[] = [];
  const visit = (n: ReactNodeLike): void => {
    if (n == null || typeof n === 'boolean') return;
    if (typeof n === 'string' || typeof n === 'number') {
      parts.push(String(n));
      return;
    }
    if (Array.isArray(n)) {
      for (const c of n) visit(c as ReactNodeLike);
      return;
    }
    const el = n as React.ReactElement;
    visit((el.props as { children?: React.ReactNode } | undefined)?.children ?? null);
  };
  visit(tree);
  return parts.join('');
}

const makeNode = (overrides: Partial<CanvasNode> = {}): CanvasNode => ({
  id: 'mq-1',
  type: 'block',
  x: 0,
  y: 0,
  width: 240,
  height: 120,
  label: 'MQ',
  data: {},
  ...overrides,
});

describe('computeMessageQueueHeight', () => {
  it('returns header + 1 row when no queues', () => {
    const expected = MQ_HEADER_HEIGHT + MQ_PADDING + 1 * (MQ_ROW_HEIGHT + MQ_ROW_GAP) + MQ_PADDING;
    expect(computeMessageQueueHeight({})).toBe(expected);
  });

  it('returns header + N rows for N queues', () => {
    const expected = MQ_HEADER_HEIGHT + MQ_PADDING + 3 * (MQ_ROW_HEIGHT + MQ_ROW_GAP) + MQ_PADDING;
    expect(computeMessageQueueHeight({ queues: ['a', 'b', 'c'] })).toBe(expected);
  });
});

describe('SvgMessageQueueNode', () => {
  it('carries displayName', () => {
    expect(SvgMessageQueueNode.displayName).toBe('SvgMessageQueueNode');
  });

  it('renders a CardShell wrapper', () => {
    const tree = SvgMessageQueueNode({ node: makeNode(), isSelected: false }) as React.ReactElement;
    expect(tree.type).toBe(mocks.CardShell);
  });

  it('subtitle: "No queues yet" when empty', () => {
    const tree = SvgMessageQueueNode({ node: makeNode(), isSelected: false }) as React.ReactElement;
    expect((tree.props as { subtitle: string }).subtitle).toBe('No queues yet');
  });

  it('subtitle: singular "queue" for 1', () => {
    const tree = SvgMessageQueueNode({
      node: makeNode({ data: { queues: [{ name: 'X' }] } }),
      isSelected: false,
    }) as React.ReactElement;
    expect((tree.props as { subtitle: string }).subtitle).toBe('1 queue');
  });

  it('subtitle: plural "queues" for >=2', () => {
    const tree = SvgMessageQueueNode({
      node: makeNode({ data: { queues: [{ name: 'X' }, { name: 'Y' }] } }),
      isSelected: false,
    }) as React.ReactElement;
    expect((tree.props as { subtitle: string }).subtitle).toBe('2 queues');
  });

  it('falls back to "Message Queue" title when label empty', () => {
    const tree = SvgMessageQueueNode({
      node: makeNode({ label: '' }),
      isSelected: false,
    }) as React.ReactElement;
    expect((tree.props as { title: string }).title).toBe('Message Queue');
  });

  it('renders EmptyHint when no queues', () => {
    const tree = SvgMessageQueueNode({ node: makeNode(), isSelected: false }) as React.ReactElement;
    expect(findByType(tree, mocks.EmptyHint)).toHaveLength(1);
    expect(findByType(tree, mocks.Pill)).toHaveLength(0);
  });

  it('renders Pill+Badge per queue when non-empty', () => {
    const tree = SvgMessageQueueNode({
      node: makeNode({ data: { queues: [{ name: 'A', fifo: true }, { name: 'B' }] } }),
      isSelected: false,
    }) as React.ReactElement;
    expect(findByType(tree, mocks.Pill)).toHaveLength(2);
    expect(findByType(tree, mocks.Badge)).toHaveLength(2);
  });

  it('Badge tone "accent" + label "FIFO" when fifo true; "neutral" + "STD" otherwise', () => {
    const tree = SvgMessageQueueNode({
      node: makeNode({ data: { queues: [{ name: 'F', fifo: true }, { name: 'S', fifo: false }] } }),
      isSelected: false,
    }) as React.ReactElement;
    const badges = findByType(tree, mocks.Badge);
    expect((badges[0].props as { tone: string; children: string }).tone).toBe('accent');
    expect(collectText(badges[0])).toBe('FIFO');
    expect((badges[1].props as { tone: string; children: string }).tone).toBe('neutral');
    expect(collectText(badges[1])).toBe('STD');
  });

  it('parses string queues as { name: string, fifo: false }', () => {
    const tree = SvgMessageQueueNode({
      node: makeNode({ data: { queues: ['raw-name'] } }),
      isSelected: false,
    }) as React.ReactElement;
    const pill = findByType(tree, mocks.Pill)[0];
    expect(collectText(pill)).toBe('raw-name');
    expect((findByType(tree, mocks.Badge)[0].props as { children: string }).children).toBe('STD');
  });

  it('parses JSON-encoded string queues with fifo flag', () => {
    const tree = SvgMessageQueueNode({
      node: makeNode({ data: { queues: ['{"name":"jsoned","fifo":true}'] } }),
      isSelected: false,
    }) as React.ReactElement;
    const pill = findByType(tree, mocks.Pill)[0];
    expect(collectText(pill)).toBe('jsoned');
    expect(collectText(findByType(tree, mocks.Badge)[0])).toBe('FIFO');
  });

  it('falls back to verbatim string when JSON parse fails', () => {
    const tree = SvgMessageQueueNode({
      node: makeNode({ data: { queues: ['{"not valid json'] } }),
      isSelected: false,
    }) as React.ReactElement;
    const pill = findByType(tree, mocks.Pill)[0];
    expect(collectText(pill)).toBe('{"not valid json');
  });

  it('falls back to verbatim string when JSON parses but lacks .name', () => {
    const tree = SvgMessageQueueNode({
      node: makeNode({ data: { queues: ['{"foo":"bar"}'] } }),
      isSelected: false,
    }) as React.ReactElement;
    const pill = findByType(tree, mocks.Pill)[0];
    expect(collectText(pill)).toBe('{"foo":"bar"}');
  });

  it('renders "(unnamed)" when queue name is empty string', () => {
    const tree = SvgMessageQueueNode({
      node: makeNode({ data: { queues: [{ name: '' }] } }),
      isSelected: false,
    }) as React.ReactElement;
    const pill = findByType(tree, mocks.Pill)[0];
    expect(collectText(pill)).toBe('(unnamed)');
  });

  it('parses non-string non-object as { name: "", fifo: false }', () => {
    const tree = SvgMessageQueueNode({
      node: makeNode({ data: { queues: [42, null] } }),
      isSelected: false,
    }) as React.ReactElement;
    expect(findByType(tree, mocks.Pill)).toHaveLength(2);
    expect(collectText(findByType(tree, mocks.Pill)[0])).toBe('(unnamed)');
  });

  it('forwards isSelected, isDragOver, onNodeHover, connectionDragState to CardShell', () => {
    const onNodeHover = vi.fn();
    const tree = SvgMessageQueueNode({
      node: makeNode(),
      isSelected: true,
      isDragOver: true,
      onNodeHover,
      connectionDragState: 'source',
    }) as React.ReactElement;
    const props = tree.props as Record<string, unknown>;
    expect(props.isSelected).toBe(true);
    expect(props.isDragOver).toBe(true);
    expect(props.onNodeHover).toBe(onNodeHover);
    expect(props.connectionDragState).toBe('source');
  });

  it('isDragOver / connectionDragState default to false / null', () => {
    const tree = SvgMessageQueueNode({ node: makeNode(), isSelected: false }) as React.ReactElement;
    const props = tree.props as Record<string, unknown>;
    expect(props.isDragOver).toBe(false);
    expect(props.connectionDragState).toBe(null);
  });
});
