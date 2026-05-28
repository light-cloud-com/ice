/**
 * OCI Object Storage bucket handler — `oci.objectstorage.bucket`.
 *
 * Object Storage requires a tenancy namespace; the deployer resolves
 * it on init and passes it via `ctx.objectstorage_namespace`.
 */

import { resolveClient } from './_client';
import { err, isOciAlreadyExists, isOciNotFound, ok, sdkMissing } from './_result';
import type { OCIResourceHandler } from '../types';

const TYPE = 'oci.objectstorage.bucket';
const SDK = 'oci-objectstorage';

async function resolveNamespace(ctx: any, os: any): Promise<string> {
  if (ctx.objectstorage_namespace) return ctx.objectstorage_namespace;
  const result = await os.getNamespace({});
  return result?.value ?? '';
}

export const objectstorage_bucket_handler: OCIResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const os = await resolveClient(ctx, 'objectstorage');
    if (!os) return sdkMissing(name, TYPE, 'create', start, 'OCI Object Storage', SDK);
    try {
      const namespaceName = await resolveNamespace(ctx, os);
      await os.createBucket({
        namespaceName,
        createBucketDetails: {
          name,
          compartmentId: ctx.compartment_id,
          publicAccessType: (properties.public_access as string) || 'NoPublicAccess',
          storageTier: (properties.storage_tier as string) || 'Standard',
          freeformTags: { 'managed-by': 'ice' },
        },
      });
      return ok(name, TYPE, 'create', start, { provider_id: `${namespaceName}/${name}` });
    } catch (error) {
      if (isOciAlreadyExists(error)) return ok(name, TYPE, 'create', start, { provider_id: name });
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },
  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    const os = await resolveClient(ctx, 'objectstorage');
    if (!os) return err(name, TYPE, 'update', start, 'OCI Object Storage SDK not available');
    try {
      const [namespaceName, bucketName] = provider_id.split('/');
      await os.updateBucket({
        namespaceName,
        bucketName,
        updateBucketDetails: { publicAccessType: properties.public_access as string | undefined },
      });
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },
  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const os = await resolveClient(ctx, 'objectstorage');
    if (!os) return err(name, TYPE, 'delete', start, 'OCI Object Storage SDK not available');
    try {
      const [namespaceName, bucketName] = provider_id.split('/');
      await os.deleteBucket({ namespaceName, bucketName });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isOciNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
