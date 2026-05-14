/**
 * Schema graph traversal queries.
 *
 * Standalone functions extracted from `EmbeddedSchemaProvider` (rf-esp-3).
 * Each function takes the registry as its first arg.
 *
 * Behaviour preserved verbatim:
 *  - All three return an InternalError if the registry is null.
 *  - get_dependencies / get_dependents default `max_depth` to 10 (kept on
 *    the orchestrator class so the public API still exposes the default;
 *    these helpers expect the depth as an explicit arg).
 *  - Each row is converted via `convert_resource_to_schema`.
 */
import { InternalError } from '../../types/errors';
import { failure, success } from '../../types/result';
import type { IceType, ResourceSchema } from '../schema-provider';
import type { IceError } from '../../types/errors';
import type { Result } from '../../types/result';
import { convert_resource_to_schema } from './converters';
import type { SqliteSchemaRegistry } from './sqlite-types';

export async function get_dependencies(
  registry: SqliteSchemaRegistry | null,
  ice_type: IceType,
  max_depth: number,
): Promise<Result<ResourceSchema[], IceError>> {
  if (!registry) {
    return failure(new InternalError('Schema provider not initialized', 'INTERNAL_ERROR'));
  }
  const deps = registry.get_dependencies(ice_type, max_depth);
  return success(deps.map((r) => convert_resource_to_schema(registry, r)));
}

export async function get_dependents(
  registry: SqliteSchemaRegistry | null,
  ice_type: IceType,
  max_depth: number,
): Promise<Result<ResourceSchema[], IceError>> {
  if (!registry) {
    return failure(new InternalError('Schema provider not initialized', 'INTERNAL_ERROR'));
  }
  const dependents = registry.get_dependents(ice_type, max_depth);
  return success(dependents.map((r) => convert_resource_to_schema(registry, r)));
}

export async function get_equivalents(
  registry: SqliteSchemaRegistry | null,
  ice_type: IceType,
): Promise<Result<ResourceSchema[], IceError>> {
  if (!registry) {
    return failure(new InternalError('Schema provider not initialized', 'INTERNAL_ERROR'));
  }
  const equivalents = registry.get_equivalents(ice_type);
  return success(equivalents.map((r) => convert_resource_to_schema(registry, r)));
}
