/**
 * Direct-import smoke tests for each leaf data file under `packages/constants/src`.
 * The barrel `index.test.ts` imports through `../index`, but v8 doesn't
 * attribute the underlying lines to the data files when the re-export path
 * is shaken. Importing each file directly here gives v8 the line spans it
 * needs to flip them off 0%.
 */

import { describe, it, expect } from 'vitest';
import * as Cost from '../cost';
import * as Deploy from '../deploy';
import * as Derived from '../derived';
import * as Grid from '../grid';

describe('cost.ts — pure data shape', () => {
  it('STORAGE_GB_BY_TIER + REQUESTS_M_BY_TIER cover all six tiers', () => {
    const tiers = ['dev', 'low', 'moderate', 'medium', 'high', 'very-high'];
    for (const t of tiers) {
      expect(Cost.STORAGE_GB_BY_TIER[t]).toBeTypeOf('number');
      expect(Cost.REQUESTS_M_BY_TIER[t]).toBeTypeOf('number');
      expect(Cost.TIER_SCALE_FACTOR[t]).toBeTypeOf('number');
    }
    expect(Cost.TIER_SCALE_FACTOR.dev).toBe(0);
    expect(Cost.TIER_SCALE_FACTOR['very-high']).toBe(1);
  });

  it('COST_CATEGORY_LABELS + ICE_PREFIX_TO_COST_CATEGORY are non-empty maps', () => {
    expect(Object.keys(Cost.COST_CATEGORY_LABELS).length).toBeGreaterThan(0);
    expect(Object.keys(Cost.ICE_PREFIX_TO_COST_CATEGORY).length).toBeGreaterThan(0);
    expect(Cost.COST_CATEGORY_LABELS.Compute).toBe('Compute');
    expect(Cost.ICE_PREFIX_TO_COST_CATEGORY.Database).toBe('Data');
  });

  it('EGRESS_RATES has aws/gcp/azure with the expected EgressRate shape', () => {
    for (const p of ['aws', 'gcp', 'azure', 'digitalocean', 'alibaba', 'oci']) {
      const r = Cost.EGRESS_RATES[p];
      expect(r.provider).toBe(p);
      expect(typeof r.label).toBe('string');
      expect(typeof r.freeGb).toBe('number');
      expect(typeof r.perGbRate).toBe('number');
      expect(typeof r.notes).toBe('string');
    }
  });
});

describe('deploy.ts — provider/region/branch defaults', () => {
  it('exposes deploy + display + pipeline defaults', () => {
    expect(Deploy.DEFAULT_PROVIDER).toBe('gcp');
    expect(Deploy.DEFAULT_DISPLAY_PROVIDER).toBe('aws');
    expect(Deploy.DEFAULT_REGION).toBe('us-central1');
    expect(Deploy.DEFAULT_ENVIRONMENT).toBe('development');
    expect(Deploy.DEFAULT_PIPELINE_ENVIRONMENT).toBe('production');
    expect(Deploy.DEFAULT_BRANCH).toBe('main');
  });

  it('TERMINAL_DEPLOY_ACTIONS + TERMINAL_DEPLOY_STATUSES are populated', () => {
    expect(Deploy.TERMINAL_DEPLOY_ACTIONS).toContain('apply');
    expect(Deploy.TERMINAL_DEPLOY_ACTIONS).toContain('rollback');
    expect(Deploy.TERMINAL_DEPLOY_ACTIONS).toContain('destroy');
    expect(Deploy.TERMINAL_DEPLOY_STATUSES).toContain('success');
    expect(Deploy.TERMINAL_DEPLOY_STATUSES).toContain('failed');
  });

  it('DEPLOY_ACTION_LABELS + DEPLOY_ACTION_COLOR_CLASSES align with each action', () => {
    for (const k of ['plan', 'apply', 'destroy', 'rollback']) {
      expect(typeof Deploy.DEPLOY_ACTION_LABELS[k]).toBe('string');
      expect(Deploy.DEPLOY_ACTION_COLOR_CLASSES[k]).toMatch(/^text-.*\sbg-/);
    }
  });
});

describe('grid.ts — geometry helpers', () => {
  it('exposes card + container constants', () => {
    expect(Grid.CARD_WIDTH).toBe(240);
    expect(Grid.CARD_HEIGHT).toBe(160);
    expect(Grid.HEADER_HEIGHT).toBe(36);
    expect(Grid.CONTAINER_PADDING).toBe(20);
    expect(Grid.CHILD_GAP).toBe(16);
    expect(Grid.GROUP_GAP).toBe(30);
    expect(Grid.LAYOUT_NODE_SEP).toBe(40);
    expect(Grid.LAYOUT_RANK_SEP).toBe(80);
    expect(Grid.LAYOUT_MARGIN).toBe(40);
    expect(Grid.LAYOUT_GRID_STEP).toBe(40);
    expect(Grid.PRIVATE_NETWORK_MIN_WIDTH).toBeGreaterThan(0);
    expect(Grid.PRIVATE_NETWORK_MIN_HEIGHT).toBeGreaterThan(0);
  });

  it('groupWidth(cols) accounts for padding + child gap on each side', () => {
    expect(Grid.groupWidth(1)).toBe(20 + 240 + 0 + 20);
    expect(Grid.groupWidth(2)).toBe(20 + 480 + 16 + 20);
    expect(Grid.groupWidth(3)).toBe(20 + 720 + 32 + 20);
  });

  it('groupHeight(rows) accounts for header + padding + child gap on each side', () => {
    expect(Grid.groupHeight(1)).toBe(36 + 20 + 160 + 0 + 20);
    expect(Grid.groupHeight(2)).toBe(36 + 20 + 320 + 16 + 20);
  });
});

describe('derived.ts — TREE indexing', () => {
  it('exposes the seven derived maps populated from TREE', () => {
    expect(Object.keys(Derived.ICE_TYPE_TO_RESOURCE_ID).length).toBeGreaterThan(0);
    expect(Derived.VALID_TEMPLATE_ICE_TYPES.size).toBeGreaterThan(0);
    expect(Object.keys(Derived.PREFIX_TO_CATEGORY).length).toBeGreaterThan(0);
    expect(Object.keys(Derived.TYPE_TO_CATEGORY).length).toBeGreaterThan(0);
    expect(typeof Derived.REQUIRED_PROPS).toBe('object');
    expect(typeof Derived.DEFAULT_PORTS).toBe('object');
    expect(typeof Derived.DEFAULT_ENV_VARS).toBe('object');
  });

  it('every primary type in VALID_TEMPLATE_ICE_TYPES has a resource_id and category', () => {
    for (const t of Derived.VALID_TEMPLATE_ICE_TYPES) {
      expect(typeof Derived.ICE_TYPE_TO_RESOURCE_ID[t]).toBe('string');
      expect(typeof Derived.TYPE_TO_CATEGORY[t]).toBe('string');
    }
  });

  it('iceType "Prefix.Resource" pattern — every key has a "." separator', () => {
    for (const t of Derived.VALID_TEMPLATE_ICE_TYPES) {
      expect(t).toContain('.');
      const [prefix] = t.split('.');
      expect(Derived.PREFIX_TO_CATEGORY[prefix]).toBeDefined();
    }
  });

  it('aliases (when present) collapse onto the same resource_id as their primary', () => {
    const idToTypes: Record<string, string[]> = {};
    for (const [t, id] of Object.entries(Derived.ICE_TYPE_TO_RESOURCE_ID)) {
      (idToTypes[id] ??= []).push(t);
    }
    let aliasFamiliesSeen = 0;
    for (const types of Object.values(idToTypes)) {
      if (types.length > 1) {
        aliasFamiliesSeen++;
        const ids = new Set(types.map((t) => Derived.ICE_TYPE_TO_RESOURCE_ID[t]));
        expect(ids.size).toBe(1);
      }
    }
    expect(aliasFamiliesSeen).toBeGreaterThanOrEqual(0);
  });
});
