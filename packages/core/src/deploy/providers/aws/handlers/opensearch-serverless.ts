/**
 * AWS OpenSearch Serverless handler — `aws.opensearchserverless.collection`.
 *
 * Backs the `AI.VectorDB` block. Serverless collections are billed by
 * OCU-hours and scale on demand — no instance type, no node count.
 * The `type` property picks the collection flavour:
 *   - VECTORSEARCH (default for AI.VectorDB) — k-NN + similarity.
 *   - SEARCH                                  — full-text only.
 *   - TIMESERIES                              — log analytics.
 *
 * Required AWS prerequisites the handler doesn't create:
 *   - Encryption policy (KMS / AWS-owned) covering the collection name.
 *   - Network policy (public or VPC) covering the same name.
 *   - Data-access policy granting the caller principal permission.
 * These are operator-side IAM artefacts; the live test documents the
 * one-time setup.
 *
 * Provider id = collection ARN. Delete = DeleteCollection (the policies
 * stay until the operator removes them).
 */

import { load_aws_sdk } from '../sdk-loader';
import { err, ok, sdkMissing } from './_result';
import type { AWSResourceHandler } from '../types';

const TYPE = 'aws.opensearchserverless.collection';
const SDK = '@aws-sdk/client-opensearchserverless';

export const opensearch_serverless_handler: AWSResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('opensearch-serverless') as any;
    if (!client) return sdkMissing(name, TYPE, 'create', start, 'OpenSearch Serverless', SDK);

    try {
      const oss = await load_aws_sdk(SDK);
      if (!oss) return sdkMissing(name, TYPE, 'create', start, 'OpenSearch Serverless', SDK);

      const created = await client.send(
        new oss.CreateCollectionCommand({
          name,
          type: (properties.collection_type as string) || 'VECTORSEARCH',
          description: (properties.description as string) || `ICE-managed ${name}`,
          standbyReplicas: (properties.standby_replicas as string) || 'DISABLED',
          tags: properties.tags
            ? Object.entries(properties.tags as Record<string, string>).map(([key, value]) => ({ key, value }))
            : undefined,
        }),
      );
      const detail = created?.createCollectionDetail;
      const arn = detail?.arn ?? `arn:aws:aoss:${ctx.region}:*:collection/${detail?.id ?? name}`;
      return ok(name, TYPE, 'create', start, { provider_id: arn });
    } catch (error) {
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('opensearch-serverless') as any;
    if (!client) return sdkMissing(name, TYPE, 'update', start, 'OpenSearch Serverless', SDK);

    try {
      const oss = await load_aws_sdk(SDK);
      if (!oss) return sdkMissing(name, TYPE, 'update', start, 'OpenSearch Serverless', SDK);
      // collection id sits after the last slash in the ARN.
      const id = provider_id.split('/').pop()!;
      await client.send(
        new oss.UpdateCollectionCommand({
          id,
          description: properties.description as string | undefined,
        }),
      );
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('opensearch-serverless') as any;
    if (!client) return err(name, TYPE, 'delete', start, 'OpenSearch Serverless SDK not available');
    try {
      const oss = await load_aws_sdk(SDK);
      if (!oss) return err(name, TYPE, 'delete', start, 'OpenSearch Serverless SDK not available');
      const id = provider_id.split('/').pop()!;
      await client.send(new oss.DeleteCollectionCommand({ id }));
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
