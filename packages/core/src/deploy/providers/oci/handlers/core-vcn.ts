/**
 * OCI VCN handler — `oci.core.vcn`.
 */

import { resolveClient } from './_client';
import { err, isOciAlreadyExists, isOciNotFound, ok, sdkMissing } from './_result';
import type { OCIResourceHandler } from '../types';

const TYPE = 'oci.core.vcn';
const SDK = 'oci-core';

export const core_vcn_handler: OCIResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const vn = await resolveClient(ctx, 'vnclient');
    if (!vn) return sdkMissing(name, TYPE, 'create', start, 'OCI VirtualNetwork', SDK);
    try {
      const result = await vn.createVcn({
        createVcnDetails: {
          compartmentId: ctx.compartment_id,
          displayName: name,
          cidrBlocks: [(properties.cidr as string) || '10.0.0.0/16'],
          dnsLabel: (properties.dns_label as string) || name.replace(/[^a-z0-9]/g, '').slice(0, 15),
          freeformTags: { 'managed-by': 'ice' },
        },
      });
      const id = result?.vcn?.id as string | undefined;
      if (!id) return err(name, TYPE, 'create', start, 'createVcn returned no id');
      return ok(name, TYPE, 'create', start, { provider_id: id });
    } catch (error) {
      if (isOciAlreadyExists(error)) return ok(name, TYPE, 'create', start, { provider_id: name });
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },
  async update(name, provider_id, _properties, _current, ctx) {
    const start = Date.now();
    const vn = await resolveClient(ctx, 'vnclient');
    if (!vn) return err(name, TYPE, 'update', start, 'OCI VirtualNetwork SDK not available');
    try {
      await vn.updateVcn({ vcnId: provider_id, updateVcnDetails: { displayName: name } });
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },
  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const vn = await resolveClient(ctx, 'vnclient');
    if (!vn) return err(name, TYPE, 'delete', start, 'OCI VirtualNetwork SDK not available');
    try {
      await vn.deleteVcn({ vcnId: provider_id });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isOciNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
