/**
 * OCI Artifacts container image repository handler —
 * `oci.artifacts.repository`.
 */

import { resolveClient } from './_client';
import { err, isOciAlreadyExists, isOciNotFound, ok, sdkMissing } from './_result';
import type { OCIResourceHandler } from '../types';

const TYPE = 'oci.artifacts.repository';
const SDK = 'oci-artifacts';

export const artifacts_repository_handler: OCIResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const ar = await resolveClient(ctx, 'artifacts');
    if (!ar) return sdkMissing(name, TYPE, 'create', start, 'OCI Artifacts', SDK);
    try {
      const result = await ar.createContainerRepository({
        createContainerRepositoryDetails: {
          compartmentId: ctx.compartment_id,
          displayName: name,
          isPublic: (properties.public as boolean) ?? false,
          isImmutable: (properties.immutable as boolean) ?? false,
          freeformTags: { 'managed-by': 'ice' },
        },
      });
      const id = result?.containerRepository?.id as string | undefined;
      if (!id) return err(name, TYPE, 'create', start, 'createContainerRepository returned no id');
      return ok(name, TYPE, 'create', start, { provider_id: id });
    } catch (error) {
      if (isOciAlreadyExists(error)) return ok(name, TYPE, 'create', start, { provider_id: name });
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },
  async update(name, provider_id, _properties, _current, _ctx) {
    const start = Date.now();
    return ok(name, TYPE, 'update', start, { provider_id });
  },
  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const ar = await resolveClient(ctx, 'artifacts');
    if (!ar) return err(name, TYPE, 'delete', start, 'OCI Artifacts SDK not available');
    try {
      await ar.deleteContainerRepository({ repositoryId: provider_id });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isOciNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
