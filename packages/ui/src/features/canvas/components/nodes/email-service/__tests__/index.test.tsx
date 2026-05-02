/**
 * Tests for `SvgEmailServiceNode` — Messaging.Email read-only renderer.
 * Subtitle is `from_address` (or 'Transactional' fallback) and the body
 * has two LabelLines for FROM and SENDER.
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
    LabelLine: inert('MockLabelLine'),
  };
});

vi.mock('../../_shared', () => ({
  CardShell: mocks.CardShell,
  LabelLine: mocks.LabelLine,
}));

import {
  SvgEmailServiceNode,
  computeEmailServiceHeight,
  ES_HEADER_HEIGHT,
  ES_FIELD_HEIGHT,
  ES_PADDING,
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
  id: 'es-1',
  type: 'block',
  x: 0,
  y: 0,
  width: 240,
  height: 120,
  label: 'Email',
  data: {},
  ...overrides,
});

describe('computeEmailServiceHeight', () => {
  it('returns ES_HEADER_HEIGHT + padding*2 + 2*field + 6 (two-row layout)', () => {
    const expected = ES_HEADER_HEIGHT + ES_PADDING + ES_FIELD_HEIGHT * 2 + 6 + ES_PADDING;
    expect(computeEmailServiceHeight()).toBe(expected);
  });
});

describe('SvgEmailServiceNode', () => {
  it('carries displayName', () => {
    expect(SvgEmailServiceNode.displayName).toBe('SvgEmailServiceNode');
  });

  it('renders a CardShell', () => {
    const tree = SvgEmailServiceNode({ node: makeNode(), isSelected: false }) as React.ReactElement;
    expect(tree.type).toBe(mocks.CardShell);
  });

  it('subtitle = from_address when set', () => {
    const tree = SvgEmailServiceNode({
      node: makeNode({ data: { from_address: 'noreply@example.com' } }),
      isSelected: false,
    }) as React.ReactElement;
    expect((tree.props as { subtitle: string }).subtitle).toBe('noreply@example.com');
  });

  it('subtitle = "Transactional" fallback when from_address absent', () => {
    const tree = SvgEmailServiceNode({ node: makeNode(), isSelected: false }) as React.ReactElement;
    expect((tree.props as { subtitle: string }).subtitle).toBe('Transactional');
  });

  it('falls back to "Email Service" title when label empty', () => {
    const tree = SvgEmailServiceNode({
      node: makeNode({ label: '' }),
      isSelected: false,
    }) as React.ReactElement;
    expect((tree.props as { title: string }).title).toBe('Email Service');
  });

  it('uses node.label as title when present', () => {
    const tree = SvgEmailServiceNode({
      node: makeNode({ label: 'My Email' }),
      isSelected: false,
    }) as React.ReactElement;
    expect((tree.props as { title: string }).title).toBe('My Email');
  });

  it('renders two LabelLines (FROM + SENDER)', () => {
    const tree = SvgEmailServiceNode({ node: makeNode(), isSelected: false }) as React.ReactElement;
    const lines = findByType(tree, mocks.LabelLine);
    expect(lines).toHaveLength(2);
    expect((lines[0].props as { label: string }).label).toBe('FROM');
    expect((lines[1].props as { label: string }).label).toBe('SENDER');
  });

  it('FROM LabelLine receives from_address as value, mono default (true)', () => {
    const tree = SvgEmailServiceNode({
      node: makeNode({ data: { from_address: 'a@b.c' } }),
      isSelected: false,
    }) as React.ReactElement;
    const fromLine = findByType(tree, mocks.LabelLine)[0];
    const props = fromLine.props as { value: string; placeholder: string; mono?: boolean };
    expect(props.value).toBe('a@b.c');
    expect(props.placeholder).toBe('noreply@example.com');
    // FROM uses default mono (no explicit prop), so undefined OR true.
    expect(props.mono === undefined || props.mono === true).toBe(true);
  });

  it('SENDER LabelLine receives from_name and disables mono', () => {
    const tree = SvgEmailServiceNode({
      node: makeNode({ data: { from_name: 'Acme Inc' } }),
      isSelected: false,
    }) as React.ReactElement;
    const senderLine = findByType(tree, mocks.LabelLine)[1];
    const props = senderLine.props as { value: string; placeholder: string; mono: boolean };
    expect(props.value).toBe('Acme Inc');
    expect(props.placeholder).toBe('My App');
    expect(props.mono).toBe(false);
  });

  it('coerces missing from_address / from_name to empty string', () => {
    const tree = SvgEmailServiceNode({ node: makeNode(), isSelected: false }) as React.ReactElement;
    const lines = findByType(tree, mocks.LabelLine);
    expect((lines[0].props as { value: string }).value).toBe('');
    expect((lines[1].props as { value: string }).value).toBe('');
  });

  it('forwards isDragOver / connectionDragState defaults', () => {
    const tree = SvgEmailServiceNode({ node: makeNode(), isSelected: false }) as React.ReactElement;
    const props = tree.props as Record<string, unknown>;
    expect(props.isDragOver).toBe(false);
    expect(props.connectionDragState).toBe(null);
  });

  it('forwards onNodeHover and connectionDragState through', () => {
    const onNodeHover = vi.fn();
    const tree = SvgEmailServiceNode({
      node: makeNode(),
      isSelected: false,
      onNodeHover,
      connectionDragState: 'invalid-target',
    }) as React.ReactElement;
    const props = tree.props as Record<string, unknown>;
    expect(props.onNodeHover).toBe(onNodeHover);
    expect(props.connectionDragState).toBe('invalid-target');
  });
});
