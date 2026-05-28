/**
 * OCI Subnet handler — `oci.core.subnet`.
 */

import { resolveClient } from './_client';
import { err, isOciAlreadyExists, isOciNotFound, ok, sdkMissing } from './_result';
import type { OCIResourceHandler } from '../types';

const TYPE = 'oci.core.subnet';
const SDK = 'oci-core';

export const core_subnet_handler: OCIResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const vn = await resolveClient(ctx, 'vnclient');
    if (!vn) return sdkMissing(name, TYPE, 'create', start, 'OCI VirtualNetwork', SDK);
    if (!properties.vcn_id) return err(name, TYPE, 'create', start, 'Subnet requires properties.vcn_id');
    try {
      const result = await vn.createSubnet({
        createSubnetDetails: {
          compartmentId: ctx.compartment_id,
          displayName: name,
          vcnId: properties.vcn_id as string,
          cidrBlock: (properties.cidr as string) || '10.0.1.0/24',
          availabilityDomain: properties.availability_domain as string | undefined,
          freeformTags: { 'managed-by': 'ice' },
        },
      });
      const id = result?.subnet?.id as string | undefined;
      if (!id) return err(name, TYPE, 'create', start, 'createSubnet returned no id');
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
      await vn.updateSubnet({ subnetId: provider_id, updateSubnetDetails: { displayName: name } });
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
      await vn.deleteSubnet({ subnetId: provider_id });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isOciNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
