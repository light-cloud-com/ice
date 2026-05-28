/**
 * OCI Identity Domains user handler — `oci.identitydomains.user`.
 *
 * Identity Domains is OCI's IdP. Each domain has its own endpoint
 * (the operator must point the client at the right host); the loader
 * uses the default profile region.
 */

import { resolveClient } from './_client';
import { err, isOciAlreadyExists, isOciNotFound, ok, sdkMissing } from './_result';
import type { OCIResourceHandler } from '../types';

const TYPE = 'oci.identitydomains.user';
const SDK = 'oci-identitydomains';

export const identitydomains_user_handler: OCIResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const ids = await resolveClient(ctx, 'identitydomains');
    if (!ids) return sdkMissing(name, TYPE, 'create', start, 'OCI Identity Domains', SDK);
    try {
      const result = await ids.createUser({
        user: {
          userName: name,
          name: { givenName: (properties.given_name as string) || name },
          emails: [{ value: properties.email as string | undefined, type: 'work', primary: true }],
          schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
        },
      });
      const id = result?.user?.id ?? result?.id;
      if (!id) return err(name, TYPE, 'create', start, 'createUser returned no id');
      return ok(name, TYPE, 'create', start, { provider_id: String(id) });
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
    const ids = await resolveClient(ctx, 'identitydomains');
    if (!ids) return err(name, TYPE, 'delete', start, 'OCI Identity Domains SDK not available');
    try {
      await ids.deleteUser({ userId: provider_id });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isOciNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
