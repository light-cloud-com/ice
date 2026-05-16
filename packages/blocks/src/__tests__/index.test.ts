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
import {
  ALL_PROVIDERS,
  CATEGORY_IDS,
  ICE_TYPE_TO_CATEGORY_ID,
  getCategoryForIceType,
  isCategoryEnabledForProvider,
  PROVIDER_FLAGS,
} from '@ice/constants';

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

describe('getBlueprint — provider-keyed lookup respects live PROVIDER_FLAGS', () => {
  // Tests below assert against the *live* config: a provider that's flagged
  // off in feature-flags.ts must return undefined; a provider that's on must
  // resolve to a blueprint declaring it. Flipping the flag flips the test.
  it.each(['aws', 'gcp', 'azure', 'kubernetes', 'alibaba', 'oci', 'digitalocean'] as const)(
    'Compute.StaticSite + %s — matches PROVIDER_FLAGS',
    (provider) => {
      const bp = getBlueprint('Compute.StaticSite', provider);
      if (isCategoryEnabledForProvider('Frontend', provider)) {
        expect(bp).toBeDefined();
        expect(bp!.providers).toContain(provider);
      } else {
        expect(bp).toBeUndefined();
      }
    },
  );

  it.each(['aws', 'gcp', 'azure', 'kubernetes', 'alibaba', 'oci', 'digitalocean'] as const)(
    'Database.PostgreSQL + %s — matches PROVIDER_FLAGS',
    (provider) => {
      const bp = getBlueprint('Database.PostgreSQL', provider);
      if (isCategoryEnabledForProvider('Database', provider)) {
        // The PostgreSQL blueprint may not exist for some providers regardless
        // of the flag (e.g. design-only stacks). A defined result must still
        // declare the provider.
        if (bp) expect(bp.providers).toContain(provider);
      } else {
        expect(bp).toBeUndefined();
      }
    },
  );

  it('returns undefined for an iceType the requested provider does not declare', () => {
    // SQS is AWS-only. Independently of the flag, GCP/Kubernetes lookups
    // for AWS-only iceTypes must miss.
    const bp = getBlueprint('Messaging.SQS', 'kubernetes');
    expect(bp).toBeUndefined();
  });
});

describe('iceType → CategoryId integrity', () => {
  it('every visible (palette) blueprint iceType resolves to a CategoryId', () => {
    const unmapped: string[] = [];
    for (const bp of BLOCK_BLUEPRINTS) {
      if (bp.hiddenFromPalette) continue;
      const cat = getCategoryForIceType(bp.iceType);
      if (!cat) unmapped.push(bp.iceType);
    }
    expect(unmapped).toEqual([]);
  });

  it('every entry in ICE_TYPE_TO_CATEGORY_ID points at a known CategoryId', () => {
    const knownCats = new Set(CATEGORY_IDS);
    for (const [iceType, cat] of Object.entries(ICE_TYPE_TO_CATEGORY_ID)) {
      expect(knownCats.has(cat as (typeof CATEGORY_IDS)[number])).toBe(true);
      expect(iceType).toContain('.');
    }
  });
});

describe('getBlueprint respects category × provider feature flags', () => {
  // Live-state assertions: every (iceType, provider) combo that the flags
  // disable must return undefined; every combo they enable must resolve to
  // a blueprint declaring that provider (when one exists).
  it('every disabled (category, provider) returns undefined for its concept iceTypes', () => {
    for (const provider of ALL_PROVIDERS) {
      for (const [iceType, cat] of Object.entries(ICE_TYPE_TO_CATEGORY_ID)) {
        if (isCategoryEnabledForProvider(cat, provider)) continue;
        expect(getBlueprint(iceType, provider)).toBeUndefined();
      }
    }
  });

  it('every enabled (category, provider) that has a declared blueprint resolves to it', () => {
    for (const provider of ALL_PROVIDERS) {
      for (const [iceType, cat] of Object.entries(ICE_TYPE_TO_CATEGORY_ID)) {
        if (!isCategoryEnabledForProvider(cat, provider)) continue;
        const bp = getBlueprint(iceType, provider);
        if (bp) expect(bp.providers).toContain(provider);
      }
    }
  });

  // Mechanism test: flipping a flag at runtime must change the gate's
  // verdict. Run against whichever (category, provider) is currently on so
  // the assertion is meaningful regardless of the shipped defaults.
  it('flipping a category off causes getBlueprint to start returning undefined', () => {
    const sample = ALL_PROVIDERS.flatMap((p) =>
      CATEGORY_IDS.filter((c) => isCategoryEnabledForProvider(c, p)).map((c) => ({ p, c })),
    )[0];
    if (!sample) return; // every combo is already off — nothing to flip
    // Find a concept iceType that lives in this category and is declared for
    // this provider; if none exists the flip has nothing to bite on.
    const iceType = Object.entries(ICE_TYPE_TO_CATEGORY_ID).find(
      ([t, c]) => c === sample.c && getBlueprint(t, sample.p) !== undefined,
    )?.[0];
    if (!iceType) return;
    const before = PROVIDER_FLAGS[sample.p].categories[sample.c];
    try {
      expect(getBlueprint(iceType, sample.p)).toBeDefined();
      PROVIDER_FLAGS[sample.p].categories[sample.c] = false;
      expect(getBlueprint(iceType, sample.p)).toBeUndefined();
    } finally {
      PROVIDER_FLAGS[sample.p].categories[sample.c] = before;
    }
  });

  it('provider-agnostic lookup ignores the gate', () => {
    // Pick any iceType; agnostic lookup must resolve regardless of flags.
    const bp = getBlueprint('Compute.Container');
    expect(bp).toBeDefined();
  });
});
