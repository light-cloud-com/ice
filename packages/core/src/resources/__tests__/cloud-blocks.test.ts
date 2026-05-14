/**
 * Smoke tests for the cloud-blocks shim split (rf-data-2).
 *
 * Verifies that the public API surface is intact after splitting
 * `cloud-blocks.ts` into types + data + shim.
 */

import { describe, expect, it } from 'vitest';
import * as CloudBlocksModule from '../cloud-blocks';
import {
  BLOCK_CATEGORIES,
  BLOCK_TEMPLATES,
  type BlockTemplate,
  createBlockFromTemplate,
  formatUptime,
  getBlockTemplate,
  getBlockTypeTag,
  getProviderIcon,
} from '../cloud-blocks';

describe('cloud-blocks shim — public API', () => {
  it('re-exports all 7 named runtime exports', () => {
    // The 7 runtime exports must all resolve.
    const namedRuntimeExports = [
      'BLOCK_TEMPLATES',
      'BLOCK_CATEGORIES',
      'getBlockTemplate',
      'createBlockFromTemplate',
      'getBlockTypeTag',
      'getProviderIcon',
      'formatUptime',
    ] as const;

    for (const name of namedRuntimeExports) {
      expect(CloudBlocksModule[name as keyof typeof CloudBlocksModule]).toBeDefined();
    }

    // The 9 type-only exports (BlockType, BlockStatus, CloudProvider, BlockSource,
    // BlockDeployment, EnvVar, BlockConfig, CloudBlock, BlockTemplate) are exercised
    // implicitly by the typed imports above and the typed assertions below.
  });

  it('BLOCK_TEMPLATES is a non-empty array of BlockTemplate', () => {
    expect(Array.isArray(BLOCK_TEMPLATES)).toBe(true);
    expect(BLOCK_TEMPLATES.length).toBeGreaterThan(0);
    // Spot-check shape: first template should have all canonical fields.
    const first: BlockTemplate = BLOCK_TEMPLATES[0]!;
    expect(first.type).toBeTypeOf('string');
    expect(first.name).toBeTypeOf('string');
    expect(first.display_name).toBeTypeOf('string');
    expect(first.description).toBeTypeOf('string');
    expect(first.icon).toBeTypeOf('string');
    expect(first.category).toBeTypeOf('string');
    expect(Array.isArray(first.expands_to)).toBe(true);
    expect(Array.isArray(first.required_inputs)).toBe(true);
  });

  it('BLOCK_TEMPLATES contains expected canonical block names', () => {
    // Sample a few names spanning frontend / backend / data / messaging / security
    // to catch a wholesale regression in the data array re-export.
    const names = BLOCK_TEMPLATES.map((b) => b.name);
    expect(names).toContain('static-site');
    expect(names).toContain('scalable-backend');
    expect(names).toContain('database');
    expect(names).toContain('queue');
    expect(names).toContain('secrets');
  });

  it('BLOCK_CATEGORIES contains the 8 canonical palette categories', () => {
    const ids = BLOCK_CATEGORIES.map((c) => c.id);
    expect(ids).toEqual([
      'frontend',
      'compute',
      'data',
      'storage',
      'networking',
      'messaging',
      'observability',
      'security',
    ]);
  });

  it('BLOCK_CATEGORIES groups templates by category', () => {
    // Frontend category should contain the static-site template.
    const frontend = BLOCK_CATEGORIES.find((c) => c.id === 'frontend');
    expect(frontend?.blocks.some((b) => b.name === 'static-site')).toBe(true);
    // Compute category aggregates Backend + Compute templates.
    const compute = BLOCK_CATEGORIES.find((c) => c.id === 'compute');
    expect(compute?.blocks.some((b) => b.name === 'scalable-backend')).toBe(true);
    expect(compute?.blocks.some((b) => b.name === 'serverless-function')).toBe(true);
  });
});

describe('getBlockTemplate', () => {
  it('returns the matching template by name', () => {
    const t = getBlockTemplate('static-site');
    expect(t).toBeDefined();
    expect(t?.name).toBe('static-site');
    expect(t?.type).toBe('static-site');
  });

  it('returns undefined for unknown name', () => {
    expect(getBlockTemplate('does-not-exist')).toBeUndefined();
  });
});

describe('createBlockFromTemplate', () => {
  it('creates a CloudBlock with merged config and metadata', () => {
    const template = getBlockTemplate('static-site')!;
    const block = createBlockFromTemplate(template, { name: 'my-site', framework: 'React' });
    expect(block.id).toMatch(/^block-static-site-\d+$/);
    expect(block.name).toBe('my-site');
    expect(block.type).toBe('static-site');
    expect(block.provider).toBe('aws'); // default
    expect(block.deployment.status).toBe('unknown');
    expect(block.config.public).toBe(true); // from default_config
    expect(block.config.framework).toBe('React'); // from inputs
    expect(block.created_at).toBeTypeOf('string');
    expect(block.updated_at).toBeTypeOf('string');
  });

  it('falls back to template display_name when no input name', () => {
    const template = getBlockTemplate('static-site')!;
    const block = createBlockFromTemplate(template, {});
    expect(block.name).toBe(template.display_name);
  });

  it('honors the provider override', () => {
    const template = getBlockTemplate('database')!;
    const block = createBlockFromTemplate(template, { name: 'pg' }, 'gcp');
    expect(block.provider).toBe('gcp');
  });
});

describe('getBlockTypeTag', () => {
  it('returns the tag for known block types', () => {
    expect(getBlockTypeTag('static-site')).toEqual({ label: 'Frontend', color: 'blue' });
    expect(getBlockTypeTag('database')).toEqual({ label: 'Database', color: 'orange' });
    expect(getBlockTypeTag('custom')).toEqual({ label: 'Custom', color: 'gray' });
  });
});

describe('getProviderIcon', () => {
  it('returns the icon string for each provider', () => {
    expect(getProviderIcon('aws')).toBe('aws');
    expect(getProviderIcon('gcp')).toBe('gcp');
    expect(getProviderIcon('custom')).toBe('cloud');
  });
});

describe('formatUptime', () => {
  it('returns "Unknown" when no timestamp', () => {
    expect(formatUptime()).toBe('Unknown');
    expect(formatUptime(undefined)).toBe('Unknown');
  });

  it('formats hours when less than a day', () => {
    const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
    expect(formatUptime(oneHourAgo)).toBe('1 hour');
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    expect(formatUptime(threeHoursAgo)).toBe('3 hours');
  });

  it('formats days when at least a day', () => {
    const oneDayAgo = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatUptime(oneDayAgo)).toBe('1 day');
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatUptime(threeDaysAgo)).toBe('3 days');
  });
});
