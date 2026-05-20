/**
 * rf-ppanel-3 — StatusPill.
 *
 * Direct-FC tests. `useTranslation` is mocked so `t(key)` returns the
 * key verbatim — label assertions become equality checks against the
 * translation key (`pipeline.status.<status>`).
 *
 * RISK: any Redux-held status outside the config table must render a
 * pill with the verbatim status string and the neutral palette. This
 * is the unknown-status branch — pinned below.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../../i18n', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

import { StatusPill } from '../status-pill';
import type { StatusPillProps } from '../status-pill';

function render(props: StatusPillProps): React.ReactElement {
  return (StatusPill as unknown as (p: StatusPillProps) => React.ReactElement)(props);
}

describe('StatusPill', () => {
  it('renders a span at the root', () => {
    const el = render({ status: 'success' });
    expect(el.type).toBe('span');
  });

  it("translates the 'queued' label and applies the yellow palette", () => {
    const el = render({ status: 'queued' });
    expect((el.props as { children: unknown }).children).toBe('pipeline.status.queued');
    const cls = (el.props as { className: string }).className;
    expect(cls).toContain('bg-yellow-500/10');
    expect(cls).toContain('text-yellow-500');
  });

  it("translates the 'building' label and applies the blue palette", () => {
    const el = render({ status: 'building' });
    expect((el.props as { children: unknown }).children).toBe('pipeline.status.building');
    const cls = (el.props as { className: string }).className;
    expect(cls).toContain('bg-blue-500/10');
    expect(cls).toContain('text-blue-500');
  });

  it("translates the 'deploying' label and applies the purple palette", () => {
    const el = render({ status: 'deploying' });
    expect((el.props as { children: unknown }).children).toBe('pipeline.status.deploying');
    const cls = (el.props as { className: string }).className;
    expect(cls).toContain('bg-purple-500/10');
    expect(cls).toContain('text-purple-500');
  });

  it("translates the 'success' label and applies the emerald palette", () => {
    const el = render({ status: 'success' });
    expect((el.props as { children: unknown }).children).toBe('pipeline.status.success');
    const cls = (el.props as { className: string }).className;
    expect(cls).toContain('bg-emerald-500/10');
    expect(cls).toContain('text-emerald-500');
  });

  it("translates the 'failed' label and applies the red palette", () => {
    const el = render({ status: 'failed' });
    expect((el.props as { children: unknown }).children).toBe('pipeline.status.failed');
    const cls = (el.props as { className: string }).className;
    expect(cls).toContain('bg-red-500/10');
    expect(cls).toContain('text-red-500');
  });

  it('passes through an unknown status as the verbatim label and neutral palette', () => {
    const el = render({ status: 'mystery' });
    expect((el.props as { children: unknown }).children).toBe('mystery');
    const cls = (el.props as { className: string }).className;
    expect(cls).toContain('bg-ice-hover');
    expect(cls).toContain('text-ice-text-3');
  });

  it('always applies the rounded-pill shape classes', () => {
    const el = render({ status: 'success' });
    const cls = (el.props as { className: string }).className;
    expect(cls).toContain('px-1.5');
    expect(cls).toContain('py-0.5');
    // `text-ice-2xs` collides in twMerge's text-size/color group with the
    // status-color class (`text-emerald-500`), so the per-status color wins
    // and `text-ice-2xs` is dropped from the merged className. The base
    // class is still in the source — the merge just chooses one. Document
    // here so a future refactor that splits the literal does not regress.
    expect(cls).toContain('font-semibold');
    expect(cls).toContain('rounded-full');
  });

  it('preserves the unknown-branch neutral text color', () => {
    const el = render({ status: 'mystery' });
    const cls = (el.props as { className: string }).className;
    // tailwind-merge's `text-*` group collapses both font-size and color
    // tokens that start with `text-ice-` — the latest one wins. With the
    // unknown palette, `text-ice-text-3` overrides the base `text-ice-2xs`
    // in the merged output. Pin the surviving color.
    expect(cls).toContain('text-ice-text-3');
  });
});
