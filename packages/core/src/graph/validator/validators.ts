/**
 * Built-in Validators (rf-vval shim)
 *
 * Re-export shim — the validator classes have been split into
 * domain-grouped files under `validators/`. The factory functions
 * remain here so the public API (consumed by `validator/index.ts` and
 * `core/src/index.ts`) is unchanged.
 *
 *   - `validators/structure.ts` — Cycle, Reference, Naming, Connectivity
 *   - `validators/schema.ts` — Type, Property
 *   - `validators/security.ts` — SensitiveData, BestPractices
 *
 * rf-vval-1/2/3/4 (P3 cohort 6).
 */

import type { Validator } from './base-validator';
import type { SchemaProvider } from '../../schema/schema-provider';

import {
  CycleValidator,
  ReferenceValidator,
  NamingValidator,
  ConnectivityValidator,
} from './validators/structure';
import { TypeValidator, PropertyValidator } from './validators/schema';
import { SensitiveDataValidator, BestPracticesValidator } from './validators/security';

// Public API re-exports (consumed by `validator/index.ts` and the `core/src/index.ts` barrel).
export {
  CycleValidator,
  ReferenceValidator,
  NamingValidator,
  ConnectivityValidator,
} from './validators/structure';
export { TypeValidator, PropertyValidator } from './validators/schema';
export { SensitiveDataValidator, BestPracticesValidator } from './validators/security';

/**
 * Create all built-in validators.
 */
export function create_builtin_validators(schema_provider?: SchemaProvider): Validator[] {
  return [
    new CycleValidator(),
    new ReferenceValidator(),
    new NamingValidator(),
    new ConnectivityValidator(),
    new TypeValidator(schema_provider),
    new PropertyValidator(schema_provider),
    new SensitiveDataValidator(),
    new BestPracticesValidator(),
  ];
}

/**
 * Create a configured graph validator with all built-in validators.
 */
export async function create_configured_validator(
  schema_provider?: SchemaProvider,
): Promise<import('./base-validator').GraphValidator> {
  const { create_graph_validator } = await import('./base-validator');
  const validator = create_graph_validator();

  for (const v of create_builtin_validators(schema_provider)) {
    validator.register(v);
  }

  return validator;
}
