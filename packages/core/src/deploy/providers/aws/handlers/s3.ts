/**
 * S3 Handler
 *
 * Handles: aws.s3.bucket
 *
 * Two enhancements over the Phase 0 baseline:
 *
 *   1. **Account-id suffix.** S3 bucket names are globally unique
 *      across all AWS accounts. The handler appends `-{accountId}`
 *      to the translator's resource name before calling the SDK so
 *      `ice-myapp-bucket` becomes `ice-myapp-bucket-111122223333`,
 *      eliminating the collision class. The provider_id ARN carries
 *      the actual S3 bucket name (post-suffix) so update + delete
 *      round-trip cleanly.
 *
 *   2. **publicWebsite bucket policy.** When the extractor flags the
 *      bucket as `public_access` + `website_hosting` (today only
 *      Compute.StaticSite triggers this via the publicWebsiteSource
 *      role), the handler attaches a public-read bucket policy AND
 *      sets the static-website configuration with the index/404
 *      pages the extractor supplied. Plain Storage.Bucket stays
 *      private.
 *
 * Delete is symmetric — uses the stored provider_id ARN to recover
 * the suffixed name.
 */

import { load_aws_sdk } from '../sdk-loader';
import type { ResourceDeployResult } from '../../../types';
import type { AWSHandlerContext, AWSResourceHandler } from '../types';

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

/**
 * Build the actual S3 bucket name. Appends `-{accountId}` so deploys
 * in different AWS accounts don't fight over a globally-unique name.
 * Suffix-already-present is preserved (idempotent).
 */
async function resolve_bucket_name(translator_name: string, ctx: AWSHandlerContext): Promise<string> {
  const accountId = await ctx.ensure_account_id();
  if (translator_name.endsWith(`-${accountId}`)) return translator_name;
  return `${translator_name}-${accountId}`;
}

/** Parse the S3 bucket name back out of `arn:aws:s3:::<name>`. */
function bucket_name_from_arn(arn: string): string {
  const idx = arn.lastIndexOf(':');
  return idx === -1 ? arn : arn.slice(idx + 1);
}

function public_read_policy(bucket_name: string): string {
  return JSON.stringify({
    Version: '2012-10-17',
    Statement: [
      {
        Sid: 'PublicReadGetObject',
        Effect: 'Allow',
        Principal: '*',
        Action: 's3:GetObject',
        Resource: `arn:aws:s3:::${bucket_name}/*`,
      },
    ],
  });
}

export const s3_handler: AWSResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('s3') as any;
    if (!client) return fail(name, 'create', start, 'S3 SDK not available. Install @aws-sdk/client-s3');

    try {
      const s3 = await load_aws_sdk('@aws-sdk/client-s3');
      if (!s3) return fail(name, 'create', start, 'S3 SDK not available. Install @aws-sdk/client-s3');

      const bucket = await resolve_bucket_name(name, ctx);
      const isPublicWebsite = properties.public_access === true && properties.website_hosting === true;

      // 1. Create the bucket. us-east-1 must NOT pass LocationConstraint
      // (AWS treats it as "default" and rejects the explicit value).
      await client.send(
        new s3.CreateBucketCommand({
          Bucket: bucket,
          CreateBucketConfiguration: ctx.region !== 'us-east-1' ? { LocationConstraint: ctx.region } : undefined,
        }),
      );

      // 2. Tags pass-through (when the translator/extractor populates them).
      if (properties.tags && Object.keys(properties.tags as Record<string, string>).length > 0) {
        await client.send(
          new s3.PutBucketTaggingCommand({
            Bucket: bucket,
            Tagging: {
              TagSet: Object.entries(properties.tags as Record<string, string>).map(([Key, Value]) => ({ Key, Value })),
            },
          }),
        );
      }

      // 3. Public-website branch — must drop the default block-public-acls
      // policy before attaching the public-read bucket policy.
      if (isPublicWebsite) {
        // 3a. Loosen account-default public-access block on the bucket.
        await client.send(
          new s3.PutPublicAccessBlockCommand({
            Bucket: bucket,
            PublicAccessBlockConfiguration: {
              BlockPublicAcls: false,
              IgnorePublicAcls: false,
              BlockPublicPolicy: false,
              RestrictPublicBuckets: false,
            },
          }),
        );
        // 3b. Attach the read-only bucket policy.
        await client.send(new s3.PutBucketPolicyCommand({ Bucket: bucket, Policy: public_read_policy(bucket) }));
        // 3c. Enable static website hosting with index/404 pages.
        await client.send(
          new s3.PutBucketWebsiteCommand({
            Bucket: bucket,
            WebsiteConfiguration: {
              IndexDocument: { Suffix: (properties.index_page as string) || 'index.html' },
              ErrorDocument: { Key: (properties.not_found_page as string) || '404.html' },
            },
          }),
        );
      }

      return result(name, 'create', start, { provider_id: `arn:aws:s3:::${bucket}` });
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

      // Recover the actual bucket name from the provider_id ARN.
      const bucket = bucket_name_from_arn(provider_id);

      if (properties.tags && Object.keys(properties.tags as Record<string, string>).length > 0) {
        await client.send(
          new s3.PutBucketTaggingCommand({
            Bucket: bucket,
            Tagging: {
              TagSet: Object.entries(properties.tags as Record<string, string>).map(([Key, Value]) => ({ Key, Value })),
            },
          }),
        );
      }
      return result(name, 'update', start, { provider_id });
    } catch (error) {
      return fail(name, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('s3') as any;
    if (!client) return fail(name, 'delete', start, 'S3 SDK not available');

    try {
      const s3 = await load_aws_sdk('@aws-sdk/client-s3');
      if (!s3) return fail(name, 'delete', start, 'S3 SDK not available');

      // Recover bucket name from the ARN; fall back to resolving the
      // suffix again if the caller passed the translator name.
      const bucket = provider_id ? bucket_name_from_arn(provider_id) : await resolve_bucket_name(name, ctx);

      // DeleteBucket fails on non-empty buckets — empty first.
      const list = await client.send(new s3.ListObjectsV2Command({ Bucket: bucket }));
      if (list.Contents && list.Contents.length > 0) {
        await client.send(
          new s3.DeleteObjectsCommand({
            Bucket: bucket,
            Delete: { Objects: list.Contents.map((obj: any) => ({ Key: obj.Key })) },
          }),
        );
      }
      await client.send(new s3.DeleteBucketCommand({ Bucket: bucket }));
      return result(name, 'delete', start);
    } catch (error) {
      return fail(name, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
