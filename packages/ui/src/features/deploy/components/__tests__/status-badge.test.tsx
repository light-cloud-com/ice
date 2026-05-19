/**
 * rf-pdpl-6 — StatusBadge.
 *
 * First Layer 1 leaf-component extraction in rf-pdpl. Direct-FC tree-walker
 * (cite `tree-walker-for-react-fc-tests-must-flatten-nested-children-arrays`):
 * call the FC as a function and assert on the returned element.
 *
 * `useTranslation` is mocked so `t(key)` returns the key verbatim — label
 * assertions become `expect(span.props.children).toBe('deploy.status.<status>')`.
 *
 * The 'destroying' branch is the load-bearing exception: its label is the
 * literal string `'Destroying'` (NOT routed through t()) — verbatim from the
 * pre-extraction source. The dedicated assertion below pins this.
 *
 * RISK #8 invariant: returns null for both 'idle' and any unknown status.
 * Both null branches must stay reachable; rendering null is correct when
 * Redux transiently holds a status outside the config table.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';

// Mock useTranslation: t(key) → key. Hoisted before the component import.
vi.mock('../../../../i18n', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

import { StatusBadge } from '../status-badge';
import type { DeployStatus } from '../../../../store/slices/deploy-slice';

// ─── Helpers ────────────────────────────────────────────────────────────────

function render(props: { status: DeployStatus; id?: string }): React.ReactElement | null {
  // StatusBadge is a stateless React.FC — invoking it directly returns the
  // rendered element (or null). useTranslation is mocked above so the hook
  // call resolves synchronously to a deterministic `t`.
  return (StatusBadge as unknown as (p: typeof props) => React.ReactElement | null)(props);
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('StatusBadge', () => {
  it('returns null for status="idle"', () => {
    expect(render({ status: 'idle' })).toBeNull();
  });

  it('renders span with translated label for "authenticating"', () => {
    const el = render({ status: 'authenticating' });
    expect(el).not.toBeNull();
    expect(el!.type).toBe('span');
    expect((el!.props as { children: unknown }).children).toBe('deploy.status.authenticating');
  });

  it('renders span with translated label for "planning"', () => {
    const el = render({ status: 'planning' });
    expect(el!.type).toBe('span');
    expect((el!.props as { children: unknown }).children).toBe('deploy.status.planning');
  });

  it('renders span with translated label for "planned"', () => {
    const el = render({ status: 'planned' });
    expect(el!.type).toBe('span');
    expect((el!.props as { children: unknown }).children).toBe('deploy.status.planned');
  });

  it('renders span with translated label for "deploying"', () => {
    const el = render({ status: 'deploying' });
    expect(el!.type).toBe('span');
    expect((el!.props as { children: unknown }).children).toBe('deploy.status.deploying');
  });

  it('renders span with literal "Destroying" label for "destroying" (NOT t()) — load-bearing verbatim', () => {
    const el = render({ status: 'destroying' });
    expect(el!.type).toBe('span');
    // Verbatim hardcoded literal — pre-extraction source did NOT route this
    // through t(). Pinning the divergence so a future "fix" doesn't silently
    // change the rendered label.
    expect((el!.props as { children: unknown }).children).toBe('Destroying');
  });

  it('renders span with translated label for "success"', () => {
    const el = render({ status: 'success' });
    expect(el!.type).toBe('span');
    expect((el!.props as { children: unknown }).children).toBe('deploy.status.success');
  });

  it('renders span with translated label for "error"', () => {
    const el = render({ status: 'error' });
    expect(el!.type).toBe('span');
    expect((el!.props as { children: unknown }).children).toBe('deploy.status.error');
  });

  it('renders span with translated label for "cancelled"', () => {
    const el = render({ status: 'cancelled' });
    expect(el!.type).toBe('span');
    expect((el!.props as { children: unknown }).children).toBe('deploy.status.cancelled');
  });

  it('returns null for an unknown status (RISK #8: config[status] is undefined)', () => {
    // Cast through `as DeployStatus` to bypass the static type — Redux can
    // transiently hold a status outside the config table (e.g. mid-rehydrate
    // or after a slice migration), and rendering null is the correct fallback.
    expect(render({ status: 'mystery' as DeployStatus })).toBeNull();
  });

  it('respects the id prop when provided', () => {
    const el = render({ status: 'success', id: 'ice-deploy-status' });
    expect((el!.props as { id?: string }).id).toBe('ice-deploy-status');
  });

  it('omits the id attribute when id is not provided', () => {
    const el = render({ status: 'success' });
    expect((el!.props as { id?: string }).id).toBeUndefined();
  });

  it('applies the rounded-pill class shape via cn()', () => {
    const el = render({ status: 'success' });
    const className = (el!.props as { className: string }).className;
    expect(className).toContain('px-2');
    expect(className).toContain('py-0.5');
    expect(className).toContain('rounded-full');
    expect(className).toContain('font-medium');
  });

  it('applies the per-status color classes (success → green palette)', () => {
    const el = render({ status: 'success' });
    const className = (el!.props as { className: string }).className;
    expect(className).toContain('bg-green-100');
    expect(className).toContain('text-green-700');
  });

  it('applies the destroying amber palette', () => {
    const el = render({ status: 'destroying' });
    const className = (el!.props as { className: string }).className;
    expect(className).toContain('bg-amber-100');
    expect(className).toContain('text-amber-700');
  });
});
