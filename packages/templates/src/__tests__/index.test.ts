/**
 * Template Registry coverage.
 *
 * This file is the public API of @ice/templates: barrel re-exports + lookup,
 * filter, search, and provider-compatibility helpers. We test against the
 * REAL `ALL_TEMPLATES` (no mocking the registry) — the registry itself is
 * authoritative and the helpers' job is to read it correctly.
 *
 * The brief notes that template DATA files are pure data and need not be
 * tested directly; this file exercises them indirectly by running the
 * lookup helpers across the full registry.
 */

import { describe, it, expect } from 'vitest';
import {
  ALL_TEMPLATES,
  COMPOSED_TEMPLATES,
  QUICK_STARTS,
  getTemplate,
  getTemplatesByCategory,
  getActiveCategories,
  getFeaturedTemplates,
  searchTemplates,
  getProviderCompatibility,
  filterByProvider,
} from '../index';
import type { ComposedTemplate } from '../types';

describe('template registry', () => {
  it('ALL_TEMPLATES is QUICK_STARTS + COMPOSED_TEMPLATES', () => {
    expect(ALL_TEMPLATES.length).toBe(QUICK_STARTS.length + COMPOSED_TEMPLATES.length);
    // The order matters: quick-starts must come first so the empty-canvas overlay
    // surfaces them before deeper templates.
    expect(ALL_TEMPLATES.slice(0, QUICK_STARTS.length)).toEqual(QUICK_STARTS);
  });

  it('every template has a unique id', () => {
    const ids = ALL_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('getTemplate', () => {
  it('returns the template when id matches', () => {
    const sample = ALL_TEMPLATES[0];
    expect(getTemplate(sample.id)).toBe(sample);
  });

  it('returns undefined for an unknown id', () => {
    expect(getTemplate('definitely-not-a-real-template')).toBeUndefined();
  });
});

describe('getTemplatesByCategory', () => {
  it('returns only templates whose category matches', () => {
    const result = getTemplatesByCategory('quick-start');
    expect(result.length).toBeGreaterThan(0);
    for (const t of result) {
      expect(t.category).toBe('quick-start');
    }
  });

  it('returns an empty array for a category with no templates', () => {
    // ml-pipeline is a TEMPLATE_CATEGORIES id but no template uses it
    // (after Slice 6 cuts). Even if some category does match, the helper
    // returns [] for an unknown one.
    const result = getTemplatesByCategory('ZZZ-no-such-category' as any);
    expect(result).toEqual([]);
  });
});

describe('getActiveCategories', () => {
  it('returns categories that have at least one template, in TEMPLATE_CATEGORIES order', () => {
    const active = getActiveCategories();
    expect(active.length).toBeGreaterThan(0);
    // Each returned category must correspond to at least one template.
    for (const cat of active) {
      expect(ALL_TEMPLATES.some((t) => t.category === cat)).toBe(true);
    }
  });
});

describe('getFeaturedTemplates', () => {
  it('returns only templates with featured: true', () => {
    const featured = getFeaturedTemplates();
    for (const t of featured) {
      expect(t.featured).toBe(true);
    }
  });

  it('skips templates without the featured flag', () => {
    const featured = getFeaturedTemplates();
    const nonFeatured = ALL_TEMPLATES.filter((t) => !t.featured);
    for (const t of nonFeatured) {
      expect(featured).not.toContain(t);
    }
  });
});

describe('searchTemplates', () => {
  it('returns the original list when query is empty / whitespace', () => {
    expect(searchTemplates('')).toEqual(ALL_TEMPLATES);
    expect(searchTemplates('   ')).toEqual(ALL_TEMPLATES);
  });

  it('matches against template name (case-insensitive)', () => {
    const sample = ALL_TEMPLATES[0];
    const upperQuery = sample.name.toUpperCase().slice(0, Math.min(4, sample.name.length));
    const results = searchTemplates(upperQuery);
    expect(results).toContain(sample);
  });

  it('matches against description', () => {
    // Pick a template whose description has a unique word and search for it.
    const sample = ALL_TEMPLATES.find((t) => t.description.length > 5)!;
    const word = sample.description.split(' ').find((w) => w.length > 3)!;
    const results = searchTemplates(word);
    expect(results).toContain(sample);
  });

  it('matches against tags', () => {
    const sample = ALL_TEMPLATES.find((t) => t.tags.length > 0)!;
    const tag = sample.tags[0];
    const results = searchTemplates(tag);
    expect(results).toContain(sample);
  });

  it('matches against category', () => {
    const results = searchTemplates('quick-start');
    for (const r of results) {
      const matches =
        r.name.toLowerCase().includes('quick-start') ||
        r.description.toLowerCase().includes('quick-start') ||
        r.tags.some((t) => t.toLowerCase().includes('quick-start')) ||
        r.category.toLowerCase().includes('quick-start');
      expect(matches).toBe(true);
    }
  });

  it('returns an empty array for a query that matches nothing', () => {
    const results = searchTemplates('zzz-no-template-has-this-string-zzz');
    expect(results).toEqual([]);
  });

  it('respects a custom templates list passed as second arg', () => {
    const subset = ALL_TEMPLATES.slice(0, 1);
    const sample = subset[0];
    const word = sample.name.split(' ').find((w) => w.length > 3) || sample.id;
    const results = searchTemplates(word, subset);
    expect(results).toContain(sample);
    expect(results.length).toBeLessThanOrEqual(1);
  });
});

describe('getProviderCompatibility', () => {
  it('counts every block in the template (supported + unsupported = total)', () => {
    const sample = ALL_TEMPLATES[0];
    const compat = getProviderCompatibility(sample, 'gcp');
    expect(compat.template).toBe(sample);
    expect(compat.total).toBe(sample.blocks.length);
    expect(compat.supported + compat.unsupported.length).toBe(compat.total);
  });

  it('lists block labels (or iceTypes) under unsupported when blueprint missing or provider not in blueprint.providers', () => {
    // Build a minimal in-test template with a known-bad iceType.
    const badTemplate: ComposedTemplate = {
      id: 'test-bad',
      name: 'Test Bad',
      description: 'test',
      icon: '',
      estimatedCost: '$0',
      category: 'quick-start',
      tags: [],
      securityLevel: 'basic',
      environmentPresets: [{ type: 'production', name: 'p', region: 'r', securityLevel: 'basic' }],
      blocks: [
        { iceType: 'NoSuch.Block', label: 'Nope', position: { x: 0, y: 0 } },
      ],
      connections: [],
    };
    const compat = getProviderCompatibility(badTemplate, 'gcp');
    expect(compat.supported).toBe(0);
    expect(compat.unsupported).toEqual(['Nope']);
    expect(compat.total).toBe(1);
  });

  it('falls back to iceType in unsupported list when block has no label', () => {
    const t: ComposedTemplate = {
      id: 'test-unlabeled',
      name: 'Test',
      description: 'x',
      icon: '',
      estimatedCost: '$0',
      category: 'quick-start',
      tags: [],
      securityLevel: 'basic',
      environmentPresets: [{ type: 'production', name: 'p', region: 'r', securityLevel: 'basic' }],
      blocks: [
        // label deliberately empty — falsy → fallback path
        { iceType: 'Unknown.Type', label: '', position: { x: 0, y: 0 } },
      ],
      connections: [],
    };
    const compat = getProviderCompatibility(t, 'aws');
    expect(compat.unsupported).toEqual(['Unknown.Type']);
  });
});

describe('filterByProvider', () => {
  it('returns one TemplateCompatibility per template in the input list', () => {
    const subset = ALL_TEMPLATES.slice(0, 3);
    const result = filterByProvider(subset, 'gcp');
    expect(result.length).toBe(3);
    for (let i = 0; i < 3; i++) {
      expect(result[i].template).toBe(subset[i]);
    }
  });
});
