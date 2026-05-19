/**
 * rf-rpal-1 — type-shape regression for the palette type leaf.
 *
 * `Provider`, `CategoryDef`, `RuntimeOption`, `ComponentDef`, and
 * `ResourcePaletteProps` were extracted verbatim from `resource-palette.tsx`
 * into `./types.ts`. These tests:
 *
 *   1. Import-resolution smoke: each interface/type alias must be
 *      importable from `'../types'`. If a future edit drops one, the file
 *      stops compiling.
 *   2. Field-shape regression: assemble dummy values exercising every
 *      required + optional field. Renaming or dropping a field surfaces
 *      here as a TS error before consumer files break.
 */

import { describe, expect, it } from 'vitest';
import { Server } from 'lucide-react';

import type {
  Provider,
  CategoryDef,
  RuntimeOption,
  ComponentDef,
  ResourcePaletteProps,
} from '../types';

describe('palette types — import resolution', () => {
  it('Provider resolves and accepts the three documented IDs', () => {
    const aws: Provider = 'aws';
    const gcp: Provider = 'gcp';
    const azure: Provider = 'azure';
    expect([aws, gcp, azure]).toEqual(['aws', 'gcp', 'azure']);
  });

  it('CategoryDef, RuntimeOption, ComponentDef, ResourcePaletteProps all resolve', () => {
    const cat: CategoryDef = {
      id: 'Compute',
      label: 'Compute',
      icon: Server,
      color: '#22c55e',
      tooltip: 'compute tooltip',
    };
    const rt: RuntimeOption = { label: 'Node', value: 'Node.js 20' };
    const comp: ComponentDef = {
      type: 'Compute.Container',
      name: 'Container',
      description: 'desc',
      tooltip: 'tooltip',
      icon: Server,
      providers: ['aws', 'gcp', 'azure'],
      category: 'Compute',
    };
    const props: ResourcePaletteProps = {};
    expect(cat.id).toBe('Compute');
    expect(rt.value).toBe('Node.js 20');
    expect(comp.type).toBe('Compute.Container');
    expect(props).toEqual({});
  });
});

describe('palette types — field-shape regression', () => {
  it('CategoryDef keeps every required field', () => {
    const sample: CategoryDef = {
      id: 'Network',
      label: 'Network',
      icon: Server,
      color: '#06b6d4',
      tooltip: 'network tooltip',
    };
    expect(sample.id).toBe('Network');
    expect(sample.label).toBe('Network');
    expect(sample.icon).toBe(Server);
    expect(sample.color).toBe('#06b6d4');
    expect(sample.tooltip).toBe('network tooltip');
  });

  it('RuntimeOption keeps required label/value plus optional icon', () => {
    const minimal: RuntimeOption = { label: 'Python', value: 'Python 3.12' };
    expect(minimal.label).toBe('Python');
    expect(minimal.value).toBe('Python 3.12');
    expect(minimal.icon).toBeUndefined();

    const withIcon: RuntimeOption = { label: 'Node', value: 'Node.js 20', icon: 'node' };
    expect(withIcon.icon).toBe('node');
  });

  it('ComponentDef keeps every required field plus optional runtimes', () => {
    const minimal: ComponentDef = {
      type: 'Compute.Container',
      name: 'Container',
      description: 'A container',
      tooltip: 'Run a container',
      icon: Server,
      providers: ['aws'],
      category: 'Compute',
    };
    expect(minimal.runtimes).toBeUndefined();

    const full: ComponentDef = {
      type: 'Compute.ServerlessFunction',
      name: 'Function',
      description: 'Serverless function',
      tooltip: 'tt',
      icon: Server,
      providers: ['aws', 'gcp', 'azure'],
      category: 'Compute',
      runtimes: [
        { label: 'Node', value: 'Node.js 20' },
        { label: 'Python', value: 'Python 3.12' },
      ],
    };
    expect(full.runtimes).toHaveLength(2);
    expect(full.runtimes?.[0].value).toBe('Node.js 20');
  });

  it('ComponentDef.providers accepts the documented union members', () => {
    const wide: ComponentDef['providers'] = [
      'aws',
      'gcp',
      'azure',
      'kubernetes',
      'alibaba',
      'oci',
      'digitalocean',
    ];
    expect(wide).toHaveLength(7);
    expect(new Set(wide)).toEqual(
      new Set(['aws', 'gcp', 'azure', 'kubernetes', 'alibaba', 'oci', 'digitalocean']),
    );
  });

  it('ResourcePaletteProps fields are all optional and default to undefined', () => {
    const empty: ResourcePaletteProps = {};
    expect(empty.showProjectSection).toBeUndefined();
    expect(empty.showBlocksSection).toBeUndefined();
    expect(empty.showTemplatesSection).toBeUndefined();

    const all: ResourcePaletteProps = {
      showProjectSection: true,
      showBlocksSection: false,
      showTemplatesSection: true,
    };
    expect(all.showProjectSection).toBe(true);
    expect(all.showBlocksSection).toBe(false);
    expect(all.showTemplatesSection).toBe(true);
  });
});
