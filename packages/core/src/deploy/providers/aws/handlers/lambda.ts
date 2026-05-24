/**
 * Lambda Handler
 *
 * Handles: aws.lambda.function
 *
 * Migrated from the monolithic aws-deployer.ts. Baseline accepts the
 * S3-ref code source today (`properties.s3_bucket` + `properties.s3_key`
 * or a base64 `properties.zip_file`). Auto-build from a connected
 * Source.Repository is wired in commit #28 (Phase 3).
 */

import { load_aws_sdk } from '../sdk-loader';
import type { ResourceDeployResult } from '../../../types';
import type { AWSResourceHandler } from '../types';

const TYPE = 'aws.lambda.function';

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

export const lambda_handler: AWSResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('lambda') as any;
    if (!client) return fail(name, 'create', start, 'Lambda SDK not available. Install @aws-sdk/client-lambda');

    // Fail fast on missing required fields — the SDK error for these
    // is cryptic ("Could not find resource ...") and burns user time.
    const role = (properties.role as string) || '';
    if (!role) {
      return fail(
        name,
        'create',
        start,
        'Lambda function requires an IAM execution role ARN (properties.role). Wire one in or use the auto-role helper.',
      );
    }
    const hasS3Ref = !!(properties.s3_bucket && properties.s3_key);
    const hasZipFile = !!properties.zip_file;
    if (!hasS3Ref && !hasZipFile) {
      return fail(
        name,
        'create',
        start,
        'Lambda function code source is missing. Provide properties.code.{s3Bucket,s3Key} or zip_file (auto-build from Source.Repository lands in a later commit).',
      );
    }

    try {
      const lambda = await load_aws_sdk('@aws-sdk/client-lambda');
      if (!lambda) return fail(name, 'create', start, 'Lambda SDK not available. Install @aws-sdk/client-lambda');

      const command = new lambda.CreateFunctionCommand({
        FunctionName: name,
        Runtime: (properties.runtime as string) || 'nodejs18.x',
        Role: role,
        Handler: (properties.handler as string) || 'index.handler',
        Code: {
          S3Bucket: properties.s3_bucket as string,
          S3Key: properties.s3_key as string,
          ZipFile: properties.zip_file ? Buffer.from(properties.zip_file as string, 'base64') : undefined,
        },
        Description: properties.description as string,
        Timeout: (properties.timeout as number) || 30,
        MemorySize: (properties.memory_size as number) || 128,
        Environment: properties.environment
          ? { Variables: properties.environment as Record<string, string> }
          : undefined,
        Tags: properties.tags as Record<string, string>,
      });

      const sendResult = await client.send(command);
      return result(name, 'create', start, { provider_id: sendResult.FunctionArn });
    } catch (error) {
      return fail(name, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('lambda') as any;
    if (!client) return fail(name, 'update', start, 'Lambda SDK not available');

    try {
      const lambda = await load_aws_sdk('@aws-sdk/client-lambda');
      if (!lambda) return fail(name, 'update', start, 'Lambda SDK not available');

      const config_command = new lambda.UpdateFunctionConfigurationCommand({
        FunctionName: name,
        Description: properties.description as string,
        Timeout: properties.timeout as number,
        MemorySize: properties.memory_size as number,
        Environment: properties.environment
          ? { Variables: properties.environment as Record<string, string> }
          : undefined,
      });
      await client.send(config_command);

      if (properties.s3_bucket && properties.s3_key) {
        const code_command = new lambda.UpdateFunctionCodeCommand({
          FunctionName: name,
          S3Bucket: properties.s3_bucket as string,
          S3Key: properties.s3_key as string,
        });
        await client.send(code_command);
      }
      return result(name, 'update', start, { provider_id });
    } catch (error) {
      return fail(name, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, _provider_id, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('lambda') as any;
    if (!client) return fail(name, 'delete', start, 'Lambda SDK not available');

    try {
      const lambda = await load_aws_sdk('@aws-sdk/client-lambda');
      if (!lambda) return fail(name, 'delete', start, 'Lambda SDK not available');

      const command = new lambda.DeleteFunctionCommand({ FunctionName: name });
      await client.send(command);
      return result(name, 'delete', start);
    } catch (error) {
      return fail(name, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
