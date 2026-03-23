/**
 * BigQuery Handler
 *
 * Handles: gcp.bigquery.dataset
 */

import { SERVICE_NAMES, sdk_not_available, sdk_not_available_short } from '../messages.js';
import type { GCPResourceHandler } from '../types.js';
import type { ResourceDeployResult } from '@ice/core';

const TYPE = 'gcp.bigquery.dataset';

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

export const bigquery_handler: GCPResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();

    try {
      const bq = ctx.clients.get('bigquery') as any;
      if (!bq) return fail(name, 'create', start, sdk_not_available(SERVICE_NAMES.BIGQUERY, 'bigquery'));

      // Sanitize dataset ID — only letters, numbers, underscores
      const dataset_id = name.replace(/[^a-zA-Z0-9_]/g, '_');

      await bq.createDataset(dataset_id, {
        location: properties.location || ctx.region,
        defaultTableExpirationMs: properties.default_table_expiration_ms,
        labels: properties.labels || {},
      });

      return result(name, 'create', start, {
        provider_id: `projects/${ctx.project}/datasets/${dataset_id}`,
      });
    } catch (error) {
      return fail(name, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();

    try {
      const bq = ctx.clients.get('bigquery') as any;
      if (!bq) return fail(name, 'update', start, sdk_not_available_short(SERVICE_NAMES.BIGQUERY));

      const dataset_id = name.replace(/[^a-zA-Z0-9_]/g, '_');
      const dataset = bq.dataset(dataset_id);

      const metadata: any = {};
      if (properties.labels) metadata.labels = properties.labels;
      if (properties.default_table_expiration_ms)
        metadata.defaultTableExpirationMs = properties.default_table_expiration_ms;

      if (Object.keys(metadata).length > 0) {
        await dataset.setMetadata(metadata);
      }

      return result(name, 'update', start, { provider_id });
    } catch (error) {
      return fail(name, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, _provider_id, ctx) {
    const start = Date.now();

    try {
      const bq = ctx.clients.get('bigquery') as any;
      if (!bq) return fail(name, 'delete', start, sdk_not_available_short(SERVICE_NAMES.BIGQUERY));

      const dataset_id = name.replace(/[^a-zA-Z0-9_]/g, '_');
      const dataset = bq.dataset(dataset_id);
      await dataset.delete({ force: true });

      return result(name, 'delete', start);
    } catch (error) {
      return fail(name, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
