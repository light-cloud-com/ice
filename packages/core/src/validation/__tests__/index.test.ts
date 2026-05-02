/**
 * Index Re-export Tests
 *
 * The barrel file is type/re-export only — these tests confirm every named
 * binding makes it through to consumers.
 */

import { describe, it, expect } from 'vitest';
import {
  validateCanvas,
  validateNode,
  validateProperties,
  validateConnections,
  validateStructure,
  validateDeployability,
  validateArchitecture,
  getResourceForIceType,
  getPropertiesForIceType,
  getSupportedProviders,
  isKnownIceType,
  validateTemplate,
} from '../index.js';

describe('validation index re-exports', () => {
  it('exports every public function with the correct callable signature', () => {
    expect(typeof validateCanvas).toBe('function');
    expect(typeof validateNode).toBe('function');
    expect(typeof validateProperties).toBe('function');
    expect(typeof validateConnections).toBe('function');
    expect(typeof validateStructure).toBe('function');
    expect(typeof validateDeployability).toBe('function');
    expect(typeof validateArchitecture).toBe('function');
    expect(typeof getResourceForIceType).toBe('function');
    expect(typeof getPropertiesForIceType).toBe('function');
    expect(typeof getSupportedProviders).toBe('function');
    expect(typeof isKnownIceType).toBe('function');
    expect(typeof validateTemplate).toBe('function');
  });

  it('re-exports validateCanvas with a usable shape (smoke test through the barrel)', () => {
    const r = validateCanvas([], []);
    expect(r.summary).toEqual({ errors: 0, warnings: 0, info: 0 });
  });
});
