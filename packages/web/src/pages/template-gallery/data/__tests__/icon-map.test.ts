/**
 * rf-wgal-1 — ICON_MAP (web).
 *
 * Pure data assertions: the map exposes a fixed set of 12 lucide-react
 * icon names addressable by string. The icons are forwardRef objects
 * (per the lucide-react-icons-are-forwardref-objects-not-fcs-for-tree-walker-predicates
 * learning), so we assert reference equality against the lucide
 * imports to dodge the displayName-aliasing trap.
 */

import {
  Rocket,
  Brain,
  BrainCircuit,
  ShieldCheck,
  Zap,
  Server,
  Activity,
  Globe,
  Waypoints,
  ShoppingCart,
  Smartphone,
  GitBranch,
} from 'lucide-react';
import { describe, it, expect } from 'vitest';
import { ICON_MAP } from '../icon-map';

describe('ICON_MAP (web)', () => {
  it('exposes the 12 keys used by the web gallery route', () => {
    expect(Object.keys(ICON_MAP).sort()).toEqual(
      [
        'Activity',
        'Brain',
        'BrainCircuit',
        'GitBranch',
        'Globe',
        'Rocket',
        'Server',
        'ShieldCheck',
        'ShoppingCart',
        'Smartphone',
        'Waypoints',
        'Zap',
      ].sort(),
    );
  });

  it('maps each key to the matching lucide-react icon by reference', () => {
    expect(ICON_MAP.Rocket).toBe(Rocket);
    expect(ICON_MAP.Brain).toBe(Brain);
    expect(ICON_MAP.BrainCircuit).toBe(BrainCircuit);
    expect(ICON_MAP.ShieldCheck).toBe(ShieldCheck);
    expect(ICON_MAP.Zap).toBe(Zap);
    expect(ICON_MAP.Server).toBe(Server);
    expect(ICON_MAP.Activity).toBe(Activity);
    expect(ICON_MAP.Globe).toBe(Globe);
    expect(ICON_MAP.Waypoints).toBe(Waypoints);
    expect(ICON_MAP.ShoppingCart).toBe(ShoppingCart);
    expect(ICON_MAP.Smartphone).toBe(Smartphone);
    expect(ICON_MAP.GitBranch).toBe(GitBranch);
  });

  it('returns undefined for unknown keys (caller falls back to default)', () => {
    expect(ICON_MAP['NonExistent']).toBeUndefined();
    expect(ICON_MAP['']).toBeUndefined();
    // The web gallery's narrower set: keys present in the panel-dialog's
    // ICON_MAP but NOT here should also fall through.
    expect(ICON_MAP['Heart']).toBeUndefined();
    expect(ICON_MAP['Cloud']).toBeUndefined();
    expect(ICON_MAP['Cpu']).toBeUndefined();
  });
});
