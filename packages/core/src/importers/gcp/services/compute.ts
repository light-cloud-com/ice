/**
 * GCP Compute Engine Service
 *
 * Discovers Compute Engine resources: instances, disks, networks, subnetworks, firewall rules.
 */

import { BaseGCPService } from './base-service.js';
import type {
  ServiceDiscoveryResult,
  GCPServiceType,
  GCPResource,
  GCPImportError,
  GCPImportWarning,
} from '../types.js';

/**
 * Compute Engine resource discovery service.
 */
export class ComputeService extends BaseGCPService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private clients: Record<string, any> | null = null;

  get service_type(): GCPServiceType {
    return 'compute';
  }

  /**
   * Initialize the Compute Engine clients.
   */
  private async init_clients(): Promise<void> {
    if (this.clients) return;

    try {
      // Dynamic import to make the dependency optional
      // Use string variable to prevent TypeScript from trying to resolve the module
      const module_name = '@google-cloud/compute';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const compute: any = await Function('moduleName', 'return import(moduleName)')(module_name);

      const options: Record<string, unknown> = {
        projectId: this.project,
      };

      if (this.key_file) {
        options.keyFilename = this.key_file;
      }

      // Store the compute module for creating clients
      this.clients = {
        instances: new compute.InstancesClient(options),
        disks: new compute.DisksClient(options),
        networks: new compute.NetworksClient(options),
        subnetworks: new compute.SubnetworksClient(options),
        firewalls: new compute.FirewallsClient(options),
      };
    } catch (error) {
      throw new Error(
        `Failed to initialize GCP Compute client. Make sure @google-cloud/compute is installed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async discover(): Promise<ServiceDiscoveryResult> {
    const resources: GCPResource[] = [];
    const errors: GCPImportError[] = [];
    const warnings: GCPImportWarning[] = [];

    try {
      await this.init_clients();
    } catch (error) {
      return {
        service: this.service_type,
        resources: [],
        errors: [this.create_error('INIT_ERROR', error instanceof Error ? error.message : String(error))],
        warnings: [],
      };
    }

    if (!this.clients) {
      return {
        service: this.service_type,
        resources: [],
        errors: [this.create_error('INIT_ERROR', 'Clients not initialized')],
        warnings: [],
      };
    }

    // Discover instances (zonal)
    for (const zone of this.zones) {
      try {
        const [instances] = await this.clients.instances.list({
          project: this.project,
          zone,
        });

        for (const instance of instances || []) {
          resources.push(this.create_resource(instance as Record<string, unknown>, 'compute#instance', zone));
        }
      } catch (error: unknown) {
        const err = error as { code?: number; message?: string };
        if (err.code === 403 || err.code === 404) {
          warnings.push(
            this.create_warning('ACCESS_DENIED', `Cannot list instances in ${zone}: ${err.message || 'Access denied'}`),
          );
        } else {
          errors.push(
            this.create_error('API_ERROR', `Failed to list instances in ${zone}: ${err.message || String(error)}`),
          );
        }
      }
    }

    // Discover disks (zonal)
    for (const zone of this.zones) {
      try {
        const [disks] = await this.clients.disks.list({
          project: this.project,
          zone,
        });

        for (const disk of disks || []) {
          resources.push(this.create_resource(disk as Record<string, unknown>, 'compute#disk', zone));
        }
      } catch (error: unknown) {
        const err = error as { code?: number; message?: string };
        if (err.code === 403 || err.code === 404) {
          warnings.push(
            this.create_warning('ACCESS_DENIED', `Cannot list disks in ${zone}: ${err.message || 'Access denied'}`),
          );
        } else {
          errors.push(
            this.create_error('API_ERROR', `Failed to list disks in ${zone}: ${err.message || String(error)}`),
          );
        }
      }
    }

    // Discover networks (global)
    try {
      const [networks] = await this.clients.networks.list({
        project: this.project,
      });

      for (const network of networks || []) {
        resources.push(this.create_resource(network as Record<string, unknown>, 'compute#network'));
      }
    } catch (error: unknown) {
      const err = error as { code?: number; message?: string };
      if (err.code === 403 || err.code === 404) {
        warnings.push(this.create_warning('ACCESS_DENIED', `Cannot list networks: ${err.message || 'Access denied'}`));
      } else {
        errors.push(this.create_error('API_ERROR', `Failed to list networks: ${err.message || String(error)}`));
      }
    }

    // Discover subnetworks (regional)
    for (const region of this.regions) {
      try {
        const [subnetworks] = await this.clients.subnetworks.list({
          project: this.project,
          region,
        });

        for (const subnetwork of subnetworks || []) {
          resources.push(
            this.create_resource(subnetwork as Record<string, unknown>, 'compute#subnetwork', undefined, region),
          );
        }
      } catch (error: unknown) {
        const err = error as { code?: number; message?: string };
        if (err.code === 403 || err.code === 404) {
          warnings.push(
            this.create_warning(
              'ACCESS_DENIED',
              `Cannot list subnetworks in ${region}: ${err.message || 'Access denied'}`,
            ),
          );
        } else {
          errors.push(
            this.create_error('API_ERROR', `Failed to list subnetworks in ${region}: ${err.message || String(error)}`),
          );
        }
      }
    }

    // Discover firewall rules (global)
    try {
      const [firewalls] = await this.clients.firewalls.list({
        project: this.project,
      });

      for (const firewall of firewalls || []) {
        resources.push(this.create_resource(firewall as Record<string, unknown>, 'compute#firewall'));
      }
    } catch (error: unknown) {
      const err = error as { code?: number; message?: string };
      if (err.code === 403 || err.code === 404) {
        warnings.push(
          this.create_warning('ACCESS_DENIED', `Cannot list firewall rules: ${err.message || 'Access denied'}`),
        );
      } else {
        errors.push(this.create_error('API_ERROR', `Failed to list firewall rules: ${err.message || String(error)}`));
      }
    }

    return { service: this.service_type, resources, errors, warnings };
  }
}
