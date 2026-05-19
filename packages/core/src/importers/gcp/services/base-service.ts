/**
 * Base GCP Service
 *
 * Abstract base class for GCP service importers.
 */

import type { GCPResource, ServiceDiscoveryResult, GCPServiceType, GCPImportError, GCPImportWarning } from '../types';

/**
 * Abstract base class for GCP service resource discovery.
 */
export abstract class BaseGCPService {
  protected readonly project: string;
  protected readonly regions: string[];
  protected readonly zones: string[];
  protected readonly key_file?: string;

  constructor(project: string, regions: string[], zones: string[], key_file?: string) {
    this.project = project;
    this.regions = regions;
    this.zones = zones;
    this.key_file = key_file;
  }

  /**
   * Get the service type identifier.
   */
  abstract get service_type(): GCPServiceType;

  /**
   * Discover all resources for this service.
   */
  abstract discover(): Promise<ServiceDiscoveryResult>;

  /**
   * Create a standardized GCP resource from API response.
   */
  protected create_resource(data: Record<string, unknown>, kind: string, zone?: string, region?: string): GCPResource {
    return {
      self_link: (data.selfLink as string) || '',
      name: (data.name as string) || '',
      id: (data.id as string) || (data.name as string) || '',
      kind,
      zone,
      region,
      project: this.project,
      properties: data,
      labels: (data.labels as Record<string, string>) || undefined,
      creation_timestamp: data.creationTimestamp as string | undefined,
    };
  }

  /**
   * Create an error result.
   */
  protected create_error(code: string, message: string, resource?: string): GCPImportError {
    return {
      code,
      message,
      service: this.service_type,
      resource,
    };
  }

  /**
   * Create a warning result.
   */
  protected create_warning(code: string, message: string, resource?: string): GCPImportWarning {
    return {
      code,
      message,
      service: this.service_type,
      resource,
    };
  }

  /**
   * Create an empty discovery result.
   */
  protected create_empty_result(): ServiceDiscoveryResult {
    return {
      service: this.service_type,
      resources: [],
      errors: [],
      warnings: [],
    };
  }
}
