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
import { getDeployBadge } from '../helpers';
import { STATUS_COLORS } from '../../../../../../config/canvas-constants';

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
