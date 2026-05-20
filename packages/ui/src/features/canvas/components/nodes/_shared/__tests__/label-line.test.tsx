/**
 * Tests for `LabelLine` — a 2-line LABEL/value stack used by Email
 * Service blocks (FROM / SENDER / REPLY-TO).
 *
 * Branches: hasValue (true/false), placeholder fallback chain, mono
 * on/off for the value typeface.
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { LabelLine } from '../label-line';

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

const findDivsByText = (tree: React.ReactNode, text: string) =>
  [...walk(tree)].filter((el) => el.type === 'div' && (el.props as { children?: unknown }).children === text);

describe('LabelLine', () => {
  it('renders both the LABEL and the value verbatim when value is non-empty', () => {
    const tree = LabelLine({ label: 'FROM', value: 'noreply@example.com' });
    expect(findDivsByText(tree, 'FROM')).toHaveLength(1);
    expect(findDivsByText(tree, 'noreply@example.com')).toHaveLength(1);
  });

  it('falls back to "—" when value is empty and no placeholder is supplied', () => {
    const tree = LabelLine({ label: 'FROM', value: '' });
    expect(findDivsByText(tree, '—')).toHaveLength(1);
  });

  it('uses a custom placeholder when supplied', () => {
    const tree = LabelLine({ label: 'REPLY-TO', value: '', placeholder: 'not configured' });
    expect(findDivsByText(tree, 'not configured')).toHaveLength(1);
  });

  it('value styling switches to italic + tertiary tone when value is empty', () => {
    const tree = LabelLine({ label: 'X', value: '' });
    const els = [...walk(tree)];
    const valueDiv = els.find((el) => el.type === 'div' && (el.props as { children?: unknown }).children === '—')!;
    const style = (valueDiv.props as { style: Record<string, string | number> }).style;
    expect(style.fontStyle).toBe('italic');
    expect(style.opacity).toBe(0.6);
    expect(style.color).toBe('var(--ice-text-tertiary)');
  });

  it('value styling becomes primary tone + non-italic when a value is present', () => {
    const tree = LabelLine({ label: 'X', value: 'set' });
    const els = [...walk(tree)];
    const valueDiv = els.find((el) => el.type === 'div' && (el.props as { children?: unknown }).children === 'set')!;
    const style = (valueDiv.props as { style: Record<string, string | number> }).style;
    expect(style.fontStyle).toBe('normal');
    expect(style.opacity).toBe(1);
    expect(style.color).toBe('var(--ice-text-primary)');
  });

  it('renders mono font for the value by default (mono=true)', () => {
    const tree = LabelLine({ label: 'X', value: 'token-abc' });
    const els = [...walk(tree)];
    const valueDiv = els.find(
      (el) => el.type === 'div' && (el.props as { children?: unknown }).children === 'token-abc',
    )!;
    const style = (valueDiv.props as { style: Record<string, string | undefined> }).style;
    expect(style.fontFamily).toBeDefined();
    expect(String(style.fontFamily)).toContain('monospace');
  });

  it('drops the mono fontFamily when mono=false', () => {
    const tree = LabelLine({ label: 'X', value: 'a sentence', mono: false });
    const els = [...walk(tree)];
    const valueDiv = els.find(
      (el) => el.type === 'div' && (el.props as { children?: unknown }).children === 'a sentence',
    )!;
    const style = (valueDiv.props as { style: Record<string, string | undefined> }).style;
    expect(style.fontFamily).toBeUndefined();
  });

  it('exposes a stable displayName', () => {
    expect(LabelLine.displayName).toBe('LabelLine');
  });
});
