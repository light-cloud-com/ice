/**
 * rf-rpal-2 — `data/categories.ts` invariant tests.
 *
 * Pin the 14 category metadata entries (id + color + icon family) plus the
 * derived constants `CATEGORY_ORDER` and `CATEGORY_MAP`. The visual section
 * order in the palette is observable to users — this file catches an
 * accidental re-order or rename.
 *
 * `t()` is mocked to identity so labels/tooltips equal the source key, which
 * means assertions don't depend on the en.json translation strings.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../i18n', () => ({
  t: (key: string) => key,
}));

import {
  Server,
  Clock,
  Globe,
  GitBranch,
  Database,
  Zap,
  List,
  HardDrive,
  Key,
  Brain,
  BarChart3,
  FileText,
  Cog,
} from 'lucide-react';

import { CATEGORY_DEFS, CATEGORY_ORDER, CATEGORY_MAP } from '../data/categories';

describe('CATEGORY_DEFS', () => {
  it('declares 14 categories', () => {
    expect(CATEGORY_DEFS).toHaveLength(14);
  });

  it('preserves the visual ordering Compute → Config', () => {
    expect(CATEGORY_DEFS.map((c) => c.id)).toEqual([
      'Compute',
      'Scheduler',
      'Frontend',
      'Network',
      'Database',
      'Cache',
      'Messaging',
      'Storage',
      'Security',
      'AI',
      'Analytics',
      'Monitoring',
      'Source',
      'Config',
    ]);
  });

  it('every category carries id/label/icon/color/tooltip', () => {
    for (const cat of CATEGORY_DEFS) {
      expect(typeof cat.id).toBe('string');
      expect(typeof cat.label).toBe('string');
      expect(typeof cat.color).toBe('string');
      expect(typeof cat.tooltip).toBe('string');
      expect(cat.icon).toBeTruthy();
    }
  });

  it('pins each category color verbatim', () => {
    const colorByID = Object.fromEntries(CATEGORY_DEFS.map((c) => [c.id, c.color]));
    expect(colorByID).toEqual({
      Compute: '#22c55e',
      Scheduler: '#eab308',
      Frontend: '#3b82f6',
      Network: '#06b6d4',
      Database: '#f59e0b',
      Cache: '#ef4444',
      Messaging: '#8b5cf6',
      Storage: '#64748b',
      Security: '#ec4899',
      AI: '#a855f7',
      Analytics: '#14b8a6',
      Monitoring: '#f97316',
      Source: '#6366f1',
      Config: '#78716c',
    });
  });

  it('pins each category icon to the documented lucide component', () => {
    const iconByID = Object.fromEntries(CATEGORY_DEFS.map((c) => [c.id, c.icon]));
    expect(iconByID.Compute).toBe(Server);
    expect(iconByID.Scheduler).toBe(Clock);
    expect(iconByID.Frontend).toBe(Globe);
    expect(iconByID.Network).toBe(GitBranch);
    expect(iconByID.Database).toBe(Database);
    expect(iconByID.Cache).toBe(Zap);
    expect(iconByID.Messaging).toBe(List);
    expect(iconByID.Storage).toBe(HardDrive);
    expect(iconByID.Security).toBe(Key);
    expect(iconByID.AI).toBe(Brain);
    expect(iconByID.Analytics).toBe(BarChart3);
    expect(iconByID.Monitoring).toBe(FileText);
    expect(iconByID.Source).toBe(GitBranch);
    expect(iconByID.Config).toBe(Cog);
  });

  it('label and tooltip resolve through t() — identity mock yields the i18n key', () => {
    const compute = CATEGORY_DEFS.find((c) => c.id === 'Compute');
    expect(compute?.label).toBe('blocks.categories.compute.label');
    expect(compute?.tooltip).toBe('blocks.categories.compute.tooltip');
    const cfg = CATEGORY_DEFS.find((c) => c.id === 'Config');
    expect(cfg?.label).toBe('blocks.categories.config.label');
    expect(cfg?.tooltip).toBe('blocks.categories.config.tooltip');
  });

  it('Network and Source share the GitBranch icon (verbatim from source)', () => {
    const network = CATEGORY_DEFS.find((c) => c.id === 'Network');
    const source = CATEGORY_DEFS.find((c) => c.id === 'Source');
    expect(network?.icon).toBe(GitBranch);
    expect(source?.icon).toBe(GitBranch);
  });
});

describe('CATEGORY_ORDER', () => {
  it('is the same length as CATEGORY_DEFS', () => {
    expect(CATEGORY_ORDER).toHaveLength(CATEGORY_DEFS.length);
  });

  it('matches the declaration order of CATEGORY_DEFS', () => {
    expect(CATEGORY_ORDER).toEqual(CATEGORY_DEFS.map((c) => c.id));
  });

  it('begins with Compute and ends with Config', () => {
    expect(CATEGORY_ORDER[0]).toBe('Compute');
    expect(CATEGORY_ORDER[CATEGORY_ORDER.length - 1]).toBe('Config');
  });
});

describe('CATEGORY_MAP', () => {
  it('is a Map keyed by category id', () => {
    expect(CATEGORY_MAP).toBeInstanceOf(Map);
    expect(CATEGORY_MAP.size).toBe(CATEGORY_DEFS.length);
  });

  it('maps each id back to its CategoryDef instance', () => {
    for (const cat of CATEGORY_DEFS) {
      expect(CATEGORY_MAP.get(cat.id)).toBe(cat);
    }
  });

  it('returns undefined for unknown ids', () => {
    expect(CATEGORY_MAP.get('Unknown')).toBeUndefined();
    expect(CATEGORY_MAP.get('')).toBeUndefined();
  });
});
