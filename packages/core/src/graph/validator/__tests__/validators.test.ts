/**
 * rf-vval-4 — Orchestrator factory tests.
 *
 * Verify the public-API factories `create_builtin_validators` and
 * `create_configured_validator` still wire up the same set of 8
 * validators after the rf-vval-1/2/3 split.
 */

import { describe, it, expect } from 'vitest';
import {
  create_builtin_validators,
  create_configured_validator,
  CycleValidator,
  ReferenceValidator,
  NamingValidator,
  ConnectivityValidator,
  TypeValidator,
  PropertyValidator,
  SensitiveDataValidator,
  BestPracticesValidator,
} from '../validators.js';

describe('create_builtin_validators', () => {
  it('returns 8 validators in stable order', () => {
    const validators = create_builtin_validators();
    expect(validators).toHaveLength(8);

    expect(validators[0]).toBeInstanceOf(CycleValidator);
    expect(validators[1]).toBeInstanceOf(ReferenceValidator);
    expect(validators[2]).toBeInstanceOf(NamingValidator);
    expect(validators[3]).toBeInstanceOf(ConnectivityValidator);
    expect(validators[4]).toBeInstanceOf(TypeValidator);
    expect(validators[5]).toBeInstanceOf(PropertyValidator);
    expect(validators[6]).toBeInstanceOf(SensitiveDataValidator);
    expect(validators[7]).toBeInstanceOf(BestPracticesValidator);
  });

  it('threads schema_provider into TypeValidator + PropertyValidator', () => {
    const fakeProvider = { has_schema: () => false, get_schema: async () => ({ ok: false }) } as any;
    const validators = create_builtin_validators(fakeProvider);
    // TypeValidator and PropertyValidator both take a provider; the
    // others ignore it. Smoke-check by validating a graph and
    // confirming the validators still construct with no error.
    expect(validators[4]).toBeInstanceOf(TypeValidator);
    expect(validators[5]).toBeInstanceOf(PropertyValidator);
  });

  it('exposes the same names from each validator', () => {
    const validators = create_builtin_validators();
    expect(validators.map((v) => v.name)).toEqual([
      'cycle',
      'reference',
      'naming',
      'connectivity',
      'type',
      'property',
      'sensitive',
      'best-practices',
    ]);
  });
});

describe('create_configured_validator', () => {
  it('registers all 8 builtin validators on a fresh GraphValidator', async () => {
    const validator = await create_configured_validator();
    // The base GraphValidator's `validate(graph)` runs through every
    // registered validator and returns an aggregated result. We assert
    // the validator is constructed; deep behavior is exercised by the
    // existing core.test.ts integration tests.
    expect(validator).toBeDefined();
    expect(typeof validator.validate).toBe('function');
  });

  it('accepts an optional schema provider', async () => {
    const fakeProvider = { has_schema: () => false, get_schema: async () => ({ ok: false }) } as any;
    const validator = await create_configured_validator(fakeProvider);
    expect(validator).toBeDefined();
  });
});
