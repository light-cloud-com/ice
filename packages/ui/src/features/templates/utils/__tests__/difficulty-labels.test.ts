/**
 * rf-tgal-2 — getDifficultyLabels.
 *
 * Pins the four-tier label table and the dot counts each consumer
 * relies on. The translator is stubbed by the canonical "return the key
 * verbatim" pattern — the test asserts on the i18n key paths so a
 * future lookup-key rename has to update this file explicitly.
 */

import { describe, it, expect } from 'vitest';
import { getDifficultyLabels } from '../difficulty-labels';

describe('getDifficultyLabels', () => {
  const t = (k: string) => k;

  it('returns the four expected tier ids', () => {
    const map = getDifficultyLabels(t);
    expect(Object.keys(map).sort()).toEqual(['advanced', 'expert', 'intermediate', 'starter']);
  });

  it('routes each tier through the matching i18n key', () => {
    const map = getDifficultyLabels(t);
    expect(map.starter.label).toBe('templates.gallery.difficultyStarter');
    expect(map.intermediate.label).toBe('templates.gallery.difficultyIntermediate');
    expect(map.advanced.label).toBe('templates.gallery.difficultyAdvanced');
    expect(map.expert.label).toBe('templates.gallery.difficultyExpert');
  });

  it('has the dot counts 1/2/3/4 per tier (consumed by <DifficultyDots>)', () => {
    const map = getDifficultyLabels(t);
    expect(map.starter.dots).toBe(1);
    expect(map.intermediate.dots).toBe(2);
    expect(map.advanced.dots).toBe(3);
    expect(map.expert.dots).toBe(4);
  });

  it('passes the translator through verbatim — no key transformation', () => {
    const calls: string[] = [];
    const tracker = (k: string) => {
      calls.push(k);
      return `tx:${k}`;
    };
    const map = getDifficultyLabels(tracker);
    expect(calls).toEqual([
      'templates.gallery.difficultyStarter',
      'templates.gallery.difficultyIntermediate',
      'templates.gallery.difficultyAdvanced',
      'templates.gallery.difficultyExpert',
    ]);
    expect(map.starter.label).toBe('tx:templates.gallery.difficultyStarter');
  });

  it('returns a fresh object each call (no shared reference)', () => {
    const a = getDifficultyLabels(t);
    const b = getDifficultyLabels(t);
    expect(a).not.toBe(b);
    expect(a.starter).not.toBe(b.starter);
  });
});
