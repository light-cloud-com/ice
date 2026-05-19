/**
 * Smoke test for the templates barrel re-export.
 *
 * The file is a pure `export { … } from '@ice/templates'` shim so the UI
 * code's existing imports keep working. We just import the barrel and
 * assert that every named export resolves.
 */

import { describe, it, expect } from 'vitest';
import * as Templates from '..';

describe('config/templates barrel re-export', () => {
  it('re-exports the registry constants', () => {
    expect(Array.isArray((Templates as any).ALL_TEMPLATES)).toBe(true);
    expect((Templates as any).ALL_TEMPLATES.length).toBeGreaterThan(0);
    expect(Array.isArray((Templates as any).COMPOSED_TEMPLATES)).toBe(true);
    expect((Templates as any).TEMPLATE_CATEGORIES).toBeDefined();
  });

  it('re-exports the lookup helpers', () => {
    expect(typeof (Templates as any).getTemplate).toBe('function');
    expect(typeof (Templates as any).getTemplatesByCategory).toBe('function');
    expect(typeof (Templates as any).getActiveCategories).toBe('function');
    expect(typeof (Templates as any).getFeaturedTemplates).toBe('function');
    expect(typeof (Templates as any).searchTemplates).toBe('function');
    expect(typeof (Templates as any).getProviderCompatibility).toBe('function');
    expect(typeof (Templates as any).filterByProvider).toBe('function');
  });
});
