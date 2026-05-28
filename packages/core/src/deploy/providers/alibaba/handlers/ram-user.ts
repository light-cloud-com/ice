/**
 * Alibaba RAM user handler — `alibaba.ram.user`.
 *
 * Backs Security.Identity blocks (basic — full identity / SSO are P2).
 */

import { resolveClient } from './_client';
import { err, isAlibabaAlreadyExists, isAlibabaNotFound, ok, sdkMissing } from './_result';
import type { AlibabaResourceHandler } from '../types';

const TYPE = 'alibaba.ram.user';
const SDK = '@alicloud/ram20150501';

export const ram_user_handler: AlibabaResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const ram = await resolveClient(ctx, 'ram');
    if (!ram) return sdkMissing(name, TYPE, 'create', start, 'Alibaba RAM', SDK);
    try {
      await ram.createUser({
        UserName: name,
        DisplayName: (properties.display_name as string) || name,
        Comments: (properties.description as string) || `Managed by ice`,
      });
      return ok(name, TYPE, 'create', start, { provider_id: name });
    } catch (error) {
      if (isAlibabaAlreadyExists(error)) return ok(name, TYPE, 'create', start, { provider_id: name });
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    const ram = await resolveClient(ctx, 'ram');
    if (!ram) return err(name, TYPE, 'update', start, 'Alibaba RAM SDK not available');
    try {
      await ram.updateUser({
        UserName: provider_id,
        NewDisplayName: (properties.display_name as string) || name,
      });
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const ram = await resolveClient(ctx, 'ram');
    if (!ram) return err(name, TYPE, 'delete', start, 'Alibaba RAM SDK not available');
    try {
      await ram.deleteUser({ UserName: provider_id });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isAlibabaNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
