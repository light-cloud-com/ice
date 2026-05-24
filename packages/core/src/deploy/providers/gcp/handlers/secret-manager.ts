/**
 * Secret Manager Handler
 *
 * Handles: gcp.secretmanager.secret
 *
 * Translator expansion: one Secret Store block emits one of these per
 * binding row (see `card-translator.ts` Security.Secret expansion). The
 * resource `name` is the upstream ref (`ref || key` from the binding),
 * so service `secretRefs` entries — wired by the canvas propagation
 * rules — resolve against the same id GCP knows.
 *
 * Values are NOT written. This handler creates the parent `Secret`
 * resource only; `SecretVersion`s must be populated by the operator in
 * the GCP console / IaC. That keeps actual secret values out of the
 * ICE project file (and out of the canvas), which is the security
 * tradeoff we want.
 */

import { SERVICE_NAMES, sdk_not_available, sdk_not_available_short } from '../messages';
import type { ResourceDeployResult } from '../../../types';
import type { GCPResourceHandler } from '../types';

const TYPE = 'gcp.secretmanager.secret';

function result(
  name: string,
  action: 'create' | 'update' | 'delete',
  start: number,
  overrides: Partial<ResourceDeployResult> = {},
): ResourceDeployResult {
  return {
    resource_id: name,
    name,
    type: TYPE,
    action,
    success: true,
    duration_ms: Date.now() - start,
    ...overrides,
  };
}

function fail(
  name: string,
  action: 'create' | 'update' | 'delete',
  start: number,
  error: string,
): ResourceDeployResult {
  return {
    resource_id: name,
    name,
    type: TYPE,
    action,
    success: false,
    error,
    duration_ms: Date.now() - start,
  };
}

export const secret_manager_handler: GCPResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();

    try {
      const client = ctx.clients.get('secretmanager') as any;
      if (!client) return fail(name, 'create', start, sdk_not_available(SERVICE_NAMES.SECRET_MANAGER, 'secretmanager'));

      const replication_type = (properties.replication_type as string) || 'automatic';
      const replication =
        replication_type === 'automatic'
          ? { automatic: {} }
          : { userManaged: { replicas: [{ location: ctx.region }] } };

      const [secret] = await client.createSecret({
        parent: `projects/${ctx.project}`,
        secretId: name,
        secret: {
          replication,
          labels: properties.labels || {},
        },
      });

      return result(name, 'create', start, {
        provider_id: secret.name || `projects/${ctx.project}/secrets/${name}`,
      });
    } catch (error) {
      return fail(name, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();

    try {
      const client = ctx.clients.get('secretmanager') as any;
      if (!client) return fail(name, 'update', start, sdk_not_available_short(SERVICE_NAMES.SECRET_MANAGER));

      if (properties.labels) {
        await client.updateSecret({
          secret: {
            name: `projects/${ctx.project}/secrets/${name}`,
            labels: properties.labels,
          },
          updateMask: { paths: ['labels'] },
        });
      }

      return result(name, 'update', start, { provider_id });
    } catch (error) {
      return fail(name, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, _provider_id, ctx) {
    const start = Date.now();

    try {
      const client = ctx.clients.get('secretmanager') as any;
      if (!client) return fail(name, 'delete', start, sdk_not_available_short(SERVICE_NAMES.SECRET_MANAGER));

      await client.deleteSecret({
        name: `projects/${ctx.project}/secrets/${name}`,
      });

      return result(name, 'delete', start);
    } catch (error) {
      return fail(name, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
