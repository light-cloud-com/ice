/**
 * Smoke tests for the per-category data extractions (rf-hlres-2..7).
 *
 * Each category file exports a single `HighLevelCategory` literal that was
 * cut byte-identical out of `../high-level-resources.ts`. These tests pin:
 *   - the export resolves and has the expected shape
 *   - the entry count
 *   - that the resource ids match the canonical list (catches accidental
 *     drop / duplicate during the splice)
 *
 * As later units land, the assertions for newer categories are appended.
 * The shim's `HIGH_LEVEL_CATEGORIES` ordering is exercised in
 * `./high-level-resources-types.test.ts`.
 */

import { describe, expect, it } from 'vitest';
import { compute } from '../high-level-resources/categories/compute.js';

describe('compute category (rf-hlres-2)', () => {
  it('has the expected metadata', () => {
    expect(compute.id).toBe('compute');
    expect(compute.name).toBe('Compute');
    expect(compute.description).toBe('Web apps, APIs, and services');
    expect(compute.icon).toBe('Globe');
  });

  it('contains the canonical resource ids in order', () => {
    const ids = compute.resources.map((r) => r.id);
    // Pulled from the original inline array — these are the canonical compute resources.
    expect(ids).toEqual([
      'frontend-app',
      'backend-api',
      'serverless-function',
      'function-compute',
      'oci-functions',
      'do-app-platform',
      'container-service',
      'worker',
      'ssr-site',
      'scheduled-task',
      'llm-gateway',
      'ml-model',
      'private-ai-service',
    ]);
  });

  it('frontend-app has at least one provider implementation', () => {
    const fe = compute.resources.find((r) => r.id === 'frontend-app');
    expect(fe).toBeDefined();
    expect(fe!.providers.length).toBeGreaterThan(0);
    expect(fe!.implementations.length).toBeGreaterThan(0);
  });

  it('backend-api carries the expected behavior + properties shape', () => {
    const be = compute.resources.find((r) => r.id === 'backend-api');
    expect(be).toBeDefined();
    expect(typeof be!.behavior).toBe('string');
    expect(Array.isArray(be!.properties)).toBe(true);
    expect(be!.properties.length).toBeGreaterThan(0);
  });
});
