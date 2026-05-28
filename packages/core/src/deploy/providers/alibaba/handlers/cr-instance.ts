/**
 * Alibaba Container Registry handler — `alibaba.cr.instance`.
 *
 * Backs Compute.ContainerRegistry blocks. CR has a two-level hierarchy:
 * Instance (regional container of repositories) ↔ Repository (per
 * image).
 *
 * Note: CR Instances are provisioned through the Alibaba Cloud
 * Marketplace, not the `@alicloud/cr20181201` SDK. This handler
 * verifies an instance exists via `getInstance` and records its
 * ID — instance creation must happen via the marketplace or console.
 * Tier upgrades / direct lifecycle are also marketplace-driven.
 */

import { resolveClient } from './_client';
import { err, isAlibabaNotFound, ok, sdkMissing } from './_result';
import type { AlibabaResourceHandler } from '../types';

const TYPE = 'alibaba.cr.instance';
const SDK = '@alicloud/cr20181201';

export const cr_instance_handler: AlibabaResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const cr = await resolveClient(ctx, 'cr');
    if (!cr) return sdkMissing(name, TYPE, 'create', start, 'Alibaba CR', SDK);
    const instanceId = properties.instance_id as string | undefined;
    if (!instanceId) {
      return err(
        name,
        TYPE,
        'create',
        start,
        'CR Instances are provisioned via the Alibaba Cloud Marketplace. ' +
          'Supply the existing instance ID via properties.instance_id.',
      );
    }
    try {
      // Verify the instance exists.
      await cr.getInstance({ instanceId });
      return ok(name, TYPE, 'create', start, { provider_id: instanceId });
    } catch (error) {
      if (isAlibabaNotFound(error)) {
        return err(name, TYPE, 'create', start, `CR instance ${instanceId} not found in region ${ctx.region}`);
      }
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, _properties, _current, _ctx) {
    const start = Date.now();
    return ok(name, TYPE, 'update', start, { provider_id });
  },

  async delete(name, provider_id, _ctx) {
    const start = Date.now();
    // CR Instance lifecycle is marketplace-driven; SDK has no delete
    // method. We don't refund / release the instance — operator must
    // release through the marketplace.
    return ok(name, TYPE, 'delete', start, {
      provider_id,
      outputs: {
        note: `CR instance ${provider_id} unmanaged on delete. Release via the Alibaba Cloud Marketplace if no longer needed.`,
      },
    });
  },
};
