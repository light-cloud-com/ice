/**
 * Smoke test for the Azure importer index re-export surface.
 *
 * `index.ts` only re-exports — these tests confirm the public binding
 * shape so a future rename of an importer-internal function trips the
 * test rather than silently breaking consumers.
 */

import { describe, it, expect } from 'vitest';
import {
  import_azure,
  import_azure_to_graph,
  azure_result_to_graph,
  get_ice_type,
  is_type_supported,
  get_supported_types,
  map_properties,
} from '..';

describe('azure importer index', () => {
  it('exports the four importer entry points', () => {
    expect(typeof import_azure).toBe('function');
    expect(typeof import_azure_to_graph).toBe('function');
    expect(typeof azure_result_to_graph).toBe('function');
  });

  it('exports the four type-mapper helpers', () => {
    expect(typeof get_ice_type).toBe('function');
    expect(typeof is_type_supported).toBe('function');
    expect(typeof get_supported_types).toBe('function');
    expect(typeof map_properties).toBe('function');
  });
});
