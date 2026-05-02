/**
 * `types.ts` is a re-export module. Other than the runtime
 * `TEMPLATE_CATEGORIES` const passing through, the file is purely TypeScript
 * type definitions (CardNode, CardEdge, ComposedTemplate, etc.). Type-level
 * exports cost nothing at runtime, so this file's job here is to lock down
 * the runtime barrel — `TEMPLATE_CATEGORIES` reaching consumers.
 */

import { describe, expect, it } from 'vitest';
import { TEMPLATE_CATEGORIES } from '../types';
import { TEMPLATE_CATEGORIES as ConstantsTemplateCategories } from '@ice/constants';

describe('types runtime barrel', () => {
  it('re-exports TEMPLATE_CATEGORIES sourced from @ice/constants', () => {
    expect(TEMPLATE_CATEGORIES).toBe(ConstantsTemplateCategories);
  });

  it('TEMPLATE_CATEGORIES has stable shape (id + label per entry)', () => {
    expect(TEMPLATE_CATEGORIES.length).toBeGreaterThan(0);
    for (const cat of TEMPLATE_CATEGORIES) {
      expect(typeof cat.id).toBe('string');
      expect(typeof cat.label).toBe('string');
    }
  });
});
