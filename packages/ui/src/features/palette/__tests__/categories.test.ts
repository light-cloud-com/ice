/**
 * rf-rpal-2 — `data/categories.ts` invariant tests.
 *
 * Pin the 14 category metadata entries (id + color + icon family) plus the
 * derived `CATEGORY_ORDER`. The visual section order in the palette is
 * observable to users — this file catches an accidental re-order or rename.
 *
 * The locale-dependent fields (label/tooltip) now come from
 * `getCategoryDefs(t)` / `getCategoryMap(t)` so locale switches re-derive
 * the labels. The tests pass an identity `t` so assertions equal the i18n
 * key (independent of en.json strings).
 */

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
import { describe, it, expect } from 'vitest';
import { getCategoryDefs, getCategoryMap, CATEGORY_ORDER } from '../data/categories';

const identityT = (key: string) => key;
const categoryDefs = () => getCategoryDefs(identityT);
const categoryMap = () => getCategoryMap(identityT);

describe('getCategoryDefs', () => {
  it('declares 14 categories', () => {
    expect(categoryDefs()).toHaveLength(14);
  });

  it('preserves the visual ordering Compute → Config', () => {
    expect(categoryDefs().map((c) => c.id)).toEqual([
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
    for (const cat of categoryDefs()) {
      expect(typeof cat.id).toBe('string');
      expect(typeof cat.label).toBe('string');
      expect(typeof cat.color).toBe('string');
      expect(typeof cat.tooltip).toBe('string');
      expect(cat.icon).toBeTruthy();
    }
  });

  it('pins each category color verbatim', () => {
    const colorByID = Object.fromEntries(categoryDefs().map((c) => [c.id, c.color]));
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
    const iconByID = Object.fromEntries(categoryDefs().map((c) => [c.id, c.icon]));
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

  it('label and tooltip resolve through the passed-in `t` — identity yields the i18n key', () => {
    const compute = categoryDefs().find((c) => c.id === 'Compute');
    expect(compute?.label).toBe('blocks.categories.compute.label');
    expect(compute?.tooltip).toBe('blocks.categories.compute.tooltip');
    const cfg = categoryDefs().find((c) => c.id === 'Config');
    expect(cfg?.label).toBe('blocks.categories.config.label');
    expect(cfg?.tooltip).toBe('blocks.categories.config.tooltip');
  });

  it('Network and Source share the GitBranch icon (verbatim from source)', () => {
    const defs = categoryDefs();
    const network = defs.find((c) => c.id === 'Network');
    const source = defs.find((c) => c.id === 'Source');
    expect(network?.icon).toBe(GitBranch);
    expect(source?.icon).toBe(GitBranch);
  });

  it('re-derives labels when called with a different translator (locale reactivity)', () => {
    const en = getCategoryDefs((k) => `EN:${k}`);
    const zh = getCategoryDefs((k) => `ZH:${k}`);
    expect(en[0].label).toBe('EN:blocks.categories.compute.label');
    expect(zh[0].label).toBe('ZH:blocks.categories.compute.label');
  });
});

describe('CATEGORY_ORDER', () => {
  it('is the same length as the category definitions', () => {
    expect(CATEGORY_ORDER).toHaveLength(categoryDefs().length);
  });

  it('matches the declaration order of the category definitions', () => {
    expect(CATEGORY_ORDER).toEqual(categoryDefs().map((c) => c.id));
  });

  it('begins with Compute and ends with Config', () => {
    expect(CATEGORY_ORDER[0]).toBe('Compute');
    expect(CATEGORY_ORDER[CATEGORY_ORDER.length - 1]).toBe('Config');
  });
});

describe('getCategoryMap', () => {
  it('is a Map keyed by category id', () => {
    const map = categoryMap();
    expect(map).toBeInstanceOf(Map);
    expect(map.size).toBe(categoryDefs().length);
  });

  it('maps each id back to a CategoryDef with matching id', () => {
    const map = categoryMap();
    for (const cat of categoryDefs()) {
      expect(map.get(cat.id)?.id).toBe(cat.id);
    }
  });

  it('returns undefined for unknown ids', () => {
    const map = categoryMap();
    expect(map.get('Unknown')).toBeUndefined();
    expect(map.get('')).toBeUndefined();
  });
});
