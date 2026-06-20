import { describe, it, expect } from 'vitest';
import { posterStatusTone, posterStatusGlyph } from '../poster-status';
import { STATUS_COLORS } from '../../../../../../config/canvas-constants';

describe('posterStatusTone', () => {
  it.each([
    ['active', 'good'],
    ['running', 'good'],
    ['healthy', 'good'],
    ['deployed', 'good'],
    ['creating', 'in-flight'],
    ['updating', 'in-flight'],
    ['deploying', 'in-flight'],
    ['planning', 'in-flight'],
    ['destroying', 'in-flight'],
    ['deleting', 'in-flight'],
    ['queued', 'in-flight'],
    ['pending', 'warn'],
    ['warning', 'warn'],
    ['drifted', 'warn'],
    ['error', 'error'],
    ['failed', 'error'],
    ['stopped', 'neutral'],
    ['inactive', 'neutral'],
    ['idle', 'neutral'],
    ['skipped', 'neutral'],
    ['cancelled', 'neutral'],
  ])('buckets %s → %s', (raw, tone) => {
    expect(posterStatusTone(raw)).toBe(tone);
  });

  it('falls back to neutral for unknown / empty / nullish statuses', () => {
    expect(posterStatusTone('totally-unknown')).toBe('neutral');
    expect(posterStatusTone('')).toBe('neutral');
    expect(posterStatusTone(undefined)).toBe('neutral');
    expect(posterStatusTone(null)).toBe('neutral');
  });

  it('classifies every STATUS_COLORS key (no node status is left untoned)', () => {
    // Every colour the poster can paint must also map to a non-colour glyph,
    // otherwise the redundancy gap (CNV7/AX5) reopens for that status. `idle`
    // is the documented neutral fallback, so an explicit entry isn't required.
    for (const key of Object.keys(STATUS_COLORS)) {
      expect(['good', 'in-flight', 'warn', 'error', 'neutral']).toContain(posterStatusTone(key));
    }
  });
});

describe('posterStatusGlyph', () => {
  it('gives each tone a distinct, non-empty glyph', () => {
    const glyphs = ['good', 'in-flight', 'warn', 'error', 'neutral'].map(
      (_t, i) => posterStatusGlyph(['active', 'deploying', 'pending', 'error', 'stopped'][i]).glyph,
    );
    expect(new Set(glyphs).size).toBe(glyphs.length);
    glyphs.forEach((g) => expect(g.length).toBeGreaterThan(0));
  });

  it('pulses only while work is in flight', () => {
    expect(posterStatusGlyph('deploying').pulse).toBe(true);
    expect(posterStatusGlyph('queued').pulse).toBe(true);
    expect(posterStatusGlyph('deployed').pulse).toBe(false);
    expect(posterStatusGlyph('error').pulse).toBe(false);
    expect(posterStatusGlyph('idle').pulse).toBe(false);
  });
});
