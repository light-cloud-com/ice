/**
 * pdl-6 — unit test for `getDeployBadge`, the helper the compact-LOD3
 * canvas overlay uses to render an inline pill for the current deploy
 * lifecycle phase.
 *
 * The mapping is the visible glue between the wire-status overlay
 * strings (`mapWireStatusToOverlay` in
 * `packages/ui/src/features/deploy/hooks/use-deploy-subscription.ts`) and
 * the canvas. Six wire-overlay strings are valid: `'queued'`,
 * `'deploying'`, `'active'`, `'error'`, `'skipped'`, `'cancelled'`.
 * Anything else (idle / unknown / empty pre-deploy) must produce no
 * badge so brand-new blocks don't render an artificial pill.
 *
 * Colors here MUST match the entries in `STATUS_COLORS`
 * (`packages/ui/src/config/canvas-constants.ts`) for the same status —
 * see learning anchor `deploy-overlay-mapping-must-match-status-colors-keyset`.
 */

import { describe, it, expect } from 'vitest';
import { STATUS_COLORS } from '../../../../../../config/canvas-constants';
import { getDeployBadge, truncate, shortRepo, shortDomain, ph, isPlaceholder, listCount } from '../helpers';

describe('getDeployBadge', () => {
  it('returns null for unknown / idle / empty status', () => {
    expect(getDeployBadge('')).toBeNull();
    expect(getDeployBadge('idle')).toBeNull();
    expect(getDeployBadge('unknown-phase')).toBeNull();
  });

  it('returns LIVE badge for active', () => {
    const badge = getDeployBadge('active');
    expect(badge).not.toBeNull();
    expect(badge?.label).toBe('LIVE');
    expect(badge?.color).toBe(STATUS_COLORS.active);
  });

  it('returns DEPLOY badge for deploying', () => {
    const badge = getDeployBadge('deploying');
    expect(badge).not.toBeNull();
    expect(badge?.label).toBe('DEPLOY');
    expect(badge?.color).toBe(STATUS_COLORS.deploying);
  });

  it('returns ERR badge for error', () => {
    const badge = getDeployBadge('error');
    expect(badge).not.toBeNull();
    expect(badge?.label).toBe('ERR');
    expect(badge?.color).toBe(STATUS_COLORS.error);
  });

  it('returns QUEUED badge for queued (pdl-6)', () => {
    const badge = getDeployBadge('queued');
    expect(badge).not.toBeNull();
    expect(badge?.label).toBe('QUEUED');
    // STATUS_COLORS.queued was added in pdl-7 to fix the keyset gap.
    expect(badge?.color).toBe(STATUS_COLORS.queued);
  });

  it('returns SKIPPED badge for skipped (pdl-6)', () => {
    const badge = getDeployBadge('skipped');
    expect(badge).not.toBeNull();
    expect(badge?.label).toBe('SKIPPED');
    expect(badge?.color).toBe(STATUS_COLORS.skipped);
  });

  it('returns CANCEL badge for cancelled (pdl-6 — shortened from CANCELLED for header width)', () => {
    const badge = getDeployBadge('cancelled');
    expect(badge).not.toBeNull();
    // 'CANCELLED' (9 chars) overflows the header next to provider pill +
    // info trigger; 'CANCEL' (6) keeps the same legibility budget as
    // 'DEPLOY' / 'QUEUED'.
    expect(badge?.label).toBe('CANCEL');
    expect(badge?.color).toBe(STATUS_COLORS.cancelled);
  });

  it('covers all six overlay strings produced by mapWireStatusToOverlay', () => {
    // Sentinel test — if a new wire status is added (e.g. `paused`),
    // either getDeployBadge needs to handle it or this list needs an
    // explicit decision. Keeps the badge mapping in lock-step with the
    // wire-overlay surface.
    const overlayStrings = ['queued', 'deploying', 'active', 'error', 'skipped', 'cancelled'];
    for (const status of overlayStrings) {
      expect(getDeployBadge(status)).not.toBeNull();
    }
  });
});

describe('truncate', () => {
  it('returns empty string for empty input', () => {
    expect(truncate('', 5)).toBe('');
  });
  it('returns the string unchanged when shorter than the cap', () => {
    expect(truncate('hi', 5)).toBe('hi');
  });
  it('returns the string unchanged when exactly the cap', () => {
    expect(truncate('hello', 5)).toBe('hello');
  });
  it('appends a Unicode ellipsis when over the cap', () => {
    expect(truncate('hello world', 5)).toBe('hello…');
  });
});

describe('shortRepo', () => {
  it('returns empty for empty input', () => {
    expect(shortRepo('')).toBe('');
  });
  it('extracts owner/repo from a github.com URL with .git suffix', () => {
    expect(shortRepo('https://github.com/anthropics/claude.git')).toBe('anthropics/claude');
  });
  it('extracts owner/repo from a github.com URL without .git', () => {
    expect(shortRepo('https://github.com/foo/bar')).toBe('foo/bar');
  });
  it('also matches gitlab.com URLs', () => {
    expect(shortRepo('https://gitlab.com/foo/bar')).toBe('foo/bar');
  });
  it('returns owner/repo shorthand when given without protocol', () => {
    expect(shortRepo('anthropics/claude')).toBe('anthropics/claude');
  });
  it('returns the input unchanged when neither URL nor shorthand', () => {
    expect(shortRepo('just-a-name')).toBe('just-a-name');
  });
});

describe('shortDomain', () => {
  it('returns empty for empty input', () => {
    expect(shortDomain('')).toBe('');
  });
  it('extracts hostname from a URL', () => {
    expect(shortDomain('https://app.example.com/path')).toBe('app.example.com');
  });
  it('returns the input unchanged when not a URL', () => {
    expect(shortDomain('app.example.com')).toBe('app.example.com');
  });
  it('returns the input unchanged when URL parsing throws', () => {
    expect(shortDomain('://malformed')).toBe('://malformed');
  });
});

describe('ph + isPlaceholder', () => {
  it('ph prepends a no-break space marker', () => {
    expect(ph('foo')).toBe(' foo');
  });
  it('isPlaceholder detects ph-prefixed strings', () => {
    expect(isPlaceholder(ph('foo'))).toBe(true);
  });
  it('isPlaceholder is false for plain strings', () => {
    expect(isPlaceholder('foo')).toBe(false);
  });
});

describe('listCount', () => {
  it('returns 0 for non-arrays', () => {
    expect(listCount(undefined)).toBe(0);
    expect(listCount(null)).toBe(0);
    expect(listCount('hi')).toBe(0);
    expect(listCount({})).toBe(0);
  });
  it('returns the array length', () => {
    expect(listCount([])).toBe(0);
    expect(listCount([1, 2, 3])).toBe(3);
  });
});
