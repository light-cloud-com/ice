/**
 * Timestream Handler
 *
 * Handles: aws.timestream.database — backs the data-explorer block on
 * AWS (Azure Data Explorer / Kusto equivalent — time-series + adhoc
 * analytics over append-only data).
 */

import { load_aws_sdk } from '../sdk-loader';
import { err, ok, sdkMissing } from './_result';
import type { AWSResourceHandler } from '../types';

const TYPE = 'aws.timestream.database';
const SDK = '@aws-sdk/client-timestream-write';

export const timestream_handler: AWSResourceHandler = {
  async create(name, _properties, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('timestream') as any;
    if (!client) return sdkMissing(name, TYPE, 'create', start, 'Timestream', SDK);

    try {
      const ts = await load_aws_sdk(SDK);
      if (!ts) return sdkMissing(name, TYPE, 'create', start, 'Timestream', SDK);
      const result = await client.send(new ts.CreateDatabaseCommand({ DatabaseName: name }));
      return ok(name, TYPE, 'create', start, { provider_id: result?.Database?.Arn ?? '' });
    } catch (error) {
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, _properties, _current, ctx) {
    const start = Date.now();
    return ok(name, TYPE, 'update', start, { provider_id });
  },

  async delete(name, _provider_id, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('timestream') as any;
    if (!client) return err(name, TYPE, 'delete', start, 'Timestream SDK not available');
    try {
      const ts = await load_aws_sdk(SDK);
      if (!ts) return err(name, TYPE, 'delete', start, 'Timestream SDK not available');
      await client.send(new ts.DeleteDatabaseCommand({ DatabaseName: name }));
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
