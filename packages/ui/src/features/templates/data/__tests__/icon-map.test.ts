/**
 * rf-tgal-1 — ICON_MAP.
 *
 * Pure data assertions: the map exposes a fixed set of lucide-react
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
  Heart,
  Landmark,
  Play,
  Cloud,
  Cpu,
  Gamepad2,
  Truck,
  GraduationCap,
} from 'lucide-react';
import { describe, it, expect } from 'vitest';
import { ICON_MAP } from '../icon-map';

describe('ICON_MAP', () => {
  it('exposes the full set of 20 keys', () => {
    expect(Object.keys(ICON_MAP).sort()).toEqual(
      [
        'Activity',
        'Brain',
        'BrainCircuit',
        'Cloud',
        'Cpu',
        'Gamepad2',
        'GitBranch',
        'Globe',
        'GraduationCap',
        'Heart',
        'Landmark',
        'Play',
        'Rocket',
        'Server',
        'ShieldCheck',
        'ShoppingCart',
        'Smartphone',
        'Truck',
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
    expect(ICON_MAP.Heart).toBe(Heart);
    expect(ICON_MAP.Landmark).toBe(Landmark);
    expect(ICON_MAP.Play).toBe(Play);
    expect(ICON_MAP.Cloud).toBe(Cloud);
    expect(ICON_MAP.Cpu).toBe(Cpu);
    expect(ICON_MAP.Gamepad2).toBe(Gamepad2);
    expect(ICON_MAP.Truck).toBe(Truck);
    expect(ICON_MAP.GraduationCap).toBe(GraduationCap);
  });

  it('returns undefined for unknown keys (caller falls back to default)', () => {
    expect(ICON_MAP['NonExistent']).toBeUndefined();
    expect(ICON_MAP['']).toBeUndefined();
  });
});
