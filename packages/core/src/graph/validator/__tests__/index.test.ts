/**
 * Tests for the validator barrel module.
 *
 * Pure re-export — see learnings.md `v8-coverage-zeros-pure-barrel-files-
 * as-zero-of-zero`. The barrel test asserts identity to each underlying
 * source so a future delete or rename breaks here.
 */

import { describe, it, expect } from 'vitest';
import * as barrel from '..';
import { ValidationContext, GraphValidator, create_graph_validator, create_validator } from '../base-validator';
import {
  CycleValidator,
  ReferenceValidator,
  NamingValidator,
  ConnectivityValidator,
  TypeValidator,
  PropertyValidator,
  SensitiveDataValidator,
  BestPracticesValidator,
  create_builtin_validators,
  create_configured_validator,
} from '../validators';

describe('validator barrel', () => {
  it('re-exports the base-validator runtime entry points', () => {
    expect(barrel.ValidationContext).toBe(ValidationContext);
    expect(barrel.GraphValidator).toBe(GraphValidator);
    expect(barrel.create_graph_validator).toBe(create_graph_validator);
    expect(barrel.create_validator).toBe(create_validator);
  });

  it('re-exports the built-in validator classes', () => {
    expect(barrel.CycleValidator).toBe(CycleValidator);
    expect(barrel.ReferenceValidator).toBe(ReferenceValidator);
    expect(barrel.NamingValidator).toBe(NamingValidator);
    expect(barrel.ConnectivityValidator).toBe(ConnectivityValidator);
    expect(barrel.TypeValidator).toBe(TypeValidator);
    expect(barrel.PropertyValidator).toBe(PropertyValidator);
    expect(barrel.SensitiveDataValidator).toBe(SensitiveDataValidator);
    expect(barrel.BestPracticesValidator).toBe(BestPracticesValidator);
  });

  it('re-exports the built-in validator factories', () => {
    expect(barrel.create_builtin_validators).toBe(create_builtin_validators);
    expect(barrel.create_configured_validator).toBe(create_configured_validator);
  });
});
