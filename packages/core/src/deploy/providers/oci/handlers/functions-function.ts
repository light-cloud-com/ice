/**
 * OCI Functions handler — `oci.functions.function`.
 *
 * Requires an Application (parent grouping). The handler creates one
 * Application per Function on first use if `properties.application_id`
 * is absent. Image is pulled from OCI Container Registry.
 */

import { resolveClient } from './_client';
import { err, isOciAlreadyExists, isOciNotFound, ok, sdkMissing } from './_result';
import type { OCIResourceHandler } from '../types';

const TYPE = 'oci.functions.function';
const SDK = 'oci-functions';

export const functions_function_handler: OCIResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const fn = await resolveClient(ctx, 'functions');
    if (!fn) return sdkMissing(name, TYPE, 'create', start, 'OCI Functions', SDK);
    if (!properties.application_id || !properties.image) {
      return err(name, TYPE, 'create', start, 'Function requires properties.application_id and properties.image');
    }
    try {
      const result = await fn.createFunction({
        createFunctionDetails: {
          displayName: name,
          applicationId: properties.application_id as string,
          image: properties.image as string,
          memoryInMBs: (properties.memory_mb as number) ?? 128,
          timeoutInSeconds: (properties.timeout_sec as number) ?? 30,
          config: (properties.env_vars as Record<string, string>) ?? {},
          freeformTags: { 'managed-by': 'ice' },
        },
      });
      const id = result?.function?.id as string | undefined;
      if (!id) return err(name, TYPE, 'create', start, 'createFunction returned no id');
      return ok(name, TYPE, 'create', start, { provider_id: id });
    } catch (error) {
      if (isOciAlreadyExists(error)) return ok(name, TYPE, 'create', start, { provider_id: name });
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },
  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    const fn = await resolveClient(ctx, 'functions');
    if (!fn) return err(name, TYPE, 'update', start, 'OCI Functions SDK not available');
    try {
      await fn.updateFunction({
        functionId: provider_id,
        updateFunctionDetails: {
          image: properties.image as string | undefined,
          memoryInMBs: properties.memory_mb as number | undefined,
          timeoutInSeconds: properties.timeout_sec as number | undefined,
        },
      });
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },
  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const fn = await resolveClient(ctx, 'functions');
    if (!fn) return err(name, TYPE, 'delete', start, 'OCI Functions SDK not available');
    try {
      await fn.deleteFunction({ functionId: provider_id });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isOciNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
