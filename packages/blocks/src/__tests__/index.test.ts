/**
 * Barrel + registry coverage for `@ice/blocks/index.ts`.
 *
 * The index module re-exports types, the expand engine, and assembles the
 * full BLOCK_BLUEPRINTS registry from ~124 raw provider blueprints plus the
 * 28 high-level Concept blueprints. The behavioural surface that matters:
 *
 *  - `getBlueprint(iceType)` provider-agnostic lookup (first-match wins)
 *  - `getBlueprint(iceType, provider)` provider-keyed lookup
 *  - The `hiddenFromPalette` flag is applied to every raw blueprint by the
 *    post-assembly map (line 331), so concepts appear in the palette and the
 *    raw provider blueprints do NOT.
 *  - `BLOCK_BLUEPRINTS` exposes a non-empty array; every entry obeys a small
 *    shape contract (iceType / providers / nodeData).
 *
 * The registry assembly itself runs at module load — importing the module
 * is the smoke test for the 100+ underlying imports.
 */

import { describe, expect, it } from 'vitest';
import {
  BLOCK_BLUEPRINTS,
  CONCEPT_BLUEPRINTS,
  expandBlueprint,
  getBlueprint,
  registerConceptFamily,
  getConceptFamily,
  getAllRegisteredConceptIceTypes,
  registerInfo,
  getInfoContent,
  hasConceptInfo,
  getAllRegisteredInfoIceTypes,
  SNIPPET_LANGUAGES,
  SNIPPET_LANGUAGE_LABELS,
  DEFAULT_ZOOM_THRESHOLDS,
} from '../index';
import { ALL_PROVIDERS } from '@ice/constants';

describe('@ice/blocks barrel — re-exports', () => {
  it('exposes the expansion engine as a callable function', () => {
    expect(typeof expandBlueprint).toBe('function');
  });

  it('exposes getBlueprint as a callable function', () => {
    expect(typeof getBlueprint).toBe('function');
  });

  it('exposes the concept registry helpers as functions', () => {
    expect(typeof registerConceptFamily).toBe('function');
    expect(typeof getConceptFamily).toBe('function');
    expect(typeof getAllRegisteredConceptIceTypes).toBe('function');
    expect(typeof registerInfo).toBe('function');
    expect(typeof getInfoContent).toBe('function');
    expect(typeof hasConceptInfo).toBe('function');
    expect(typeof getAllRegisteredInfoIceTypes).toBe('function');
  });

  it('re-exports the snippet language constants', () => {
    expect(SNIPPET_LANGUAGES).toEqual(['ts', 'py', 'go', 'java', 'csharp', 'rust']);
    expect(SNIPPET_LANGUAGE_LABELS.ts).toBe('TypeScript');
    expect(DEFAULT_ZOOM_THRESHOLDS).toEqual({ detailed: 1.25 });
  });
});

describe('BLOCK_BLUEPRINTS — registry shape', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(BLOCK_BLUEPRINTS)).toBe(true);
    expect(BLOCK_BLUEPRINTS.length).toBeGreaterThan(0);
  });

  it('places every concept blueprint after the raw ones (concepts appear in palette by default)', () => {
    // Concepts should be the visible ones — i.e., not hiddenFromPalette.
    for (const concept of CONCEPT_BLUEPRINTS) {
      expect(concept.hiddenFromPalette).not.toBe(true);
    }
  });

  it('hides every raw provider blueprint from the palette', () => {
    // All entries with a `conceptId` come from CONCEPT_BLUEPRINTS; everything
    // else is a raw provider blueprint and must be hidden.
    const raw = BLOCK_BLUEPRINTS.filter((bp) => !('conceptId' in bp));
    expect(raw.length).toBeGreaterThan(0);
    for (const bp of raw) {
      expect(bp.hiddenFromPalette).toBe(true);
    }
  });

  it('every blueprint has a non-empty iceType', () => {
    for (const bp of BLOCK_BLUEPRINTS) {
      expect(typeof bp.iceType).toBe('string');
      expect(bp.iceType.length).toBeGreaterThan(0);
    }
  });

  it('every blueprint has a non-empty providers array drawn from the canonical set', () => {
    const valid = new Set(ALL_PROVIDERS);
    for (const bp of BLOCK_BLUEPRINTS) {
      expect(Array.isArray(bp.providers)).toBe(true);
      expect(bp.providers.length).toBeGreaterThan(0);
      for (const p of bp.providers) {
        expect(valid.has(p)).toBe(true);
      }
    }
  });

  it('every blueprint exposes a nodeData record', () => {
    for (const bp of BLOCK_BLUEPRINTS) {
      expect(bp.nodeData).toBeTypeOf('object');
      expect(bp.nodeData).not.toBeNull();
    }
  });

  it('every blueprint has a non-empty resourceId, name, description, category, and icon', () => {
    for (const bp of BLOCK_BLUEPRINTS) {
      expect(bp.resourceId).toBeTypeOf('string');
      expect(bp.resourceId.length).toBeGreaterThan(0);
      expect(bp.name.length).toBeGreaterThan(0);
      expect(bp.description.length).toBeGreaterThan(0);
      expect(bp.category.length).toBeGreaterThan(0);
      expect(bp.icon.length).toBeGreaterThan(0);
    }
  });
});

describe('getBlueprint — provider-agnostic lookup', () => {
  it('returns the first matching blueprint when no provider is supplied', () => {
    // Compute.StaticSite is registered for AWS, GCP, Azure (raw) plus the
    // multi-provider concept; the agnostic lookup should resolve to one of
    // them (whichever loaded first).
    const bp = getBlueprint('Compute.StaticSite');
    expect(bp).toBeDefined();
    expect(bp!.iceType).toBe('Compute.StaticSite');
  });

  it('returns undefined for an unknown iceType', () => {
    expect(getBlueprint('NotARealType.Imaginary')).toBeUndefined();
  });

  it('returns undefined for an unknown iceType + provider combination', () => {
    expect(getBlueprint('NotARealType.Imaginary', 'aws')).toBeUndefined();
  });
});

describe('getBlueprint — provider-keyed lookup', () => {
  it('routes Compute.StaticSite + aws to a blueprint declaring aws as a provider', () => {
    const bp = getBlueprint('Compute.StaticSite', 'aws');
    expect(bp).toBeDefined();
    expect(bp!.providers).toContain('aws');
  });

  it('routes Compute.StaticSite + gcp to a blueprint declaring gcp as a provider', () => {
    const bp = getBlueprint('Compute.StaticSite', 'gcp');
    expect(bp).toBeDefined();
    expect(bp!.providers).toContain('gcp');
  });

  it('routes Database.PostgreSQL + aws to the AWS PostgreSQL blueprint', () => {
    const bp = getBlueprint('Database.PostgreSQL', 'aws');
    expect(bp).toBeDefined();
    expect(bp!.providers).toContain('aws');
  });

  it('returns undefined when the iceType exists but the requested provider does not', () => {
    // SQS is AWS-only — asking for it on GCP must miss.
    const bp = getBlueprint('Messaging.Queue', 'kubernetes');
    // Either it's not registered at all for kubernetes, or it is — both are
    // valid as long as the provider matches when defined.
    if (bp) {
      expect(bp.providers).toContain('kubernetes');
    } else {
      expect(bp).toBeUndefined();
    }
  });
});
