/**
 * rf-cost-3 — category-meta.
 *
 * Pin the keyset coverage and the icon-type / color-class associations.
 * Each map entry is verified directly: icon `el.type` must reference-equal
 * the corresponding lucide forwardRef object, and colors must match the
 * Tailwind bg class.
 */

import { Server, Database, MessageSquare, Globe, Shield, Activity, BrainCircuit, Package } from 'lucide-react';
import React from 'react';
import { describe, it, expect } from 'vitest';
import { CATEGORY_ICONS, CATEGORY_COLORS } from '../category-meta';

const EXPECTED_KEYS = [
  'Compute',
  'Data',
  'Data Storage',
  'Messaging',
  'Networking',
  'Security',
  'Observability',
  'Analytics',
  'AI / ML',
  'Config',
  'Source',
  'Other',
] as const;

describe('CATEGORY_ICONS', () => {
  it('exposes exactly the documented keyset', () => {
    expect(Object.keys(CATEGORY_ICONS).sort()).toEqual([...EXPECTED_KEYS].sort());
  });

  // (key, expected lucide icon component)
  const ICON_PAIRS: Array<[string, React.ElementType]> = [
    ['Compute', Server],
    ['Data', Database],
    ['Data Storage', Database],
    ['Messaging', MessageSquare],
    ['Networking', Globe],
    ['Security', Shield],
    ['Observability', Activity],
    ['Analytics', Activity],
    ['AI / ML', BrainCircuit],
    ['Config', Package],
    ['Source', Package],
    ['Other', Package],
  ];

  for (const [key, IconType] of ICON_PAIRS) {
    it(`maps "${key}" to the ${(IconType as { displayName?: string }).displayName ?? 'icon'} forwardRef`, () => {
      const node = CATEGORY_ICONS[key];
      // Each entry is a JSX element rendered with className="w-3.5 h-3.5".
      const el = node as React.ReactElement;
      expect(el.type).toBe(IconType);
      const cls = (el.props as { className: string }).className;
      expect(cls).toContain('w-3.5');
      expect(cls).toContain('h-3.5');
    });
  }
});

describe('CATEGORY_COLORS', () => {
  it('exposes the same keyset as CATEGORY_ICONS', () => {
    expect(Object.keys(CATEGORY_COLORS).sort()).toEqual([...EXPECTED_KEYS].sort());
  });

  const COLOR_PAIRS: Array<[string, string]> = [
    ['Compute', 'bg-blue-500'],
    ['Data', 'bg-emerald-500'],
    ['Data Storage', 'bg-emerald-500'],
    ['Messaging', 'bg-purple-500'],
    ['Networking', 'bg-cyan-500'],
    ['Security', 'bg-amber-500'],
    ['Observability', 'bg-pink-500'],
    ['Analytics', 'bg-orange-500'],
    ['AI / ML', 'bg-violet-500'],
    ['Config', 'bg-slate-500'],
    ['Source', 'bg-slate-400'],
    ['Other', 'bg-gray-500'],
  ];

  for (const [key, color] of COLOR_PAIRS) {
    it(`maps "${key}" to ${color}`, () => {
      expect(CATEGORY_COLORS[key]).toBe(color);
    });
  }
});

describe('CATEGORY_ICONS / CATEGORY_COLORS — unknown key behavior', () => {
  it('returns undefined for keys not in the map', () => {
    expect(CATEGORY_ICONS['NotAReal Category']).toBeUndefined();
    expect(CATEGORY_COLORS['NotAReal Category']).toBeUndefined();
  });
});
