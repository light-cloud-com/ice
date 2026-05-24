/**
 * S3 Handler
 *
 * Handles: aws.s3.bucket
 *
 * Migrated from the monolithic aws-deployer.ts. Behaviour-equivalent
 * baseline:
 *   - CreateBucketCommand on create (with LocationConstraint for
 *     non-us-east-1 regions)
 *   - PutBucketTaggingCommand on create (when tags present) + update
 *   - ListObjectsV2 → DeleteObjects → DeleteBucketCommand on delete
 *
 * The account-id suffix for global S3 name uniqueness is added in
 * commit #8, after the shared STS infra lands.
 */

import { load_aws_sdk } from '../sdk-loader';
import type { ResourceDeployResult } from '../../../types';
import type { AWSResourceHandler } from '../types';

const TYPE = 'aws.s3.bucket';

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

export const s3_handler: AWSResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('s3') as any;
    if (!client) return fail(name, 'create', start, 'S3 SDK not available. Install @aws-sdk/client-s3');

    try {
      const s3 = await load_aws_sdk('@aws-sdk/client-s3');
      if (!s3) return fail(name, 'create', start, 'S3 SDK not available. Install @aws-sdk/client-s3');

      const command = new s3.CreateBucketCommand({
        Bucket: name,
        CreateBucketConfiguration: ctx.region !== 'us-east-1' ? { LocationConstraint: ctx.region } : undefined,
      });
      await client.send(command);

      if (properties.tags) {
        const tag_command = new s3.PutBucketTaggingCommand({
          Bucket: name,
          Tagging: {
            TagSet: Object.entries(properties.tags as Record<string, string>).map(([Key, Value]) => ({ Key, Value })),
          },
        });
        await client.send(tag_command);
      }

      return result(name, 'create', start, { provider_id: `arn:aws:s3:::${name}` });
    } catch (error) {
      return fail(name, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('s3') as any;
    if (!client) return fail(name, 'update', start, 'S3 SDK not available');

    try {
      const s3 = await load_aws_sdk('@aws-sdk/client-s3');
      if (!s3) return fail(name, 'update', start, 'S3 SDK not available');

      if (properties.tags) {
        const command = new s3.PutBucketTaggingCommand({
          Bucket: name,
          Tagging: {
            TagSet: Object.entries(properties.tags as Record<string, string>).map(([Key, Value]) => ({ Key, Value })),
          },
        });
        await client.send(command);
      }
      return result(name, 'update', start, { provider_id });
    } catch (error) {
      return fail(name, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, _provider_id, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('s3') as any;
    if (!client) return fail(name, 'delete', start, 'S3 SDK not available');

    try {
      const s3 = await load_aws_sdk('@aws-sdk/client-s3');
      if (!s3) return fail(name, 'delete', start, 'S3 SDK not available');

      // Empty the bucket first — DeleteBucket fails on non-empty buckets.
      const list_command = new s3.ListObjectsV2Command({ Bucket: name });
      const objects = await client.send(list_command);
      if (objects.Contents && objects.Contents.length > 0) {
        const delete_command = new s3.DeleteObjectsCommand({
          Bucket: name,
          Delete: { Objects: objects.Contents.map((obj: any) => ({ Key: obj.Key })) },
        });
        await client.send(delete_command);
      }

      const command = new s3.DeleteBucketCommand({ Bucket: name });
      await client.send(command);
      return result(name, 'delete', start);
    } catch (error) {
      return fail(name, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
