/**
 * AWS CodeBuild handler — `aws.codebuild.project`.
 *
 * Stand-alone CodeBuild project: the operator wires a Source.Repository
 * to it for the source location, plus optional buildspec / image / role.
 * Used by the Lambda auto-build path as a fallback when local `git`/
 * `npm`/`zip` aren't present (see `handlers/lambda-builder.ts` step
 * `should_use_codebuild`).
 *
 * Provider id = project ARN. Delete = DeleteProject.
 */

import { load_aws_sdk } from '../sdk-loader';
import { err, ok, sdkMissing } from './_result';
import type { AWSResourceHandler } from '../types';

const TYPE = 'aws.codebuild.project';
const SDK = '@aws-sdk/client-codebuild';

export const codebuild_handler: AWSResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('codebuild') as any;
    if (!client) return sdkMissing(name, TYPE, 'create', start, 'CodeBuild', SDK);

    const sourceLocation = properties.source_location as string | undefined;
    const serviceRole = properties.service_role_arn as string | undefined;
    if (!sourceLocation) {
      return err(name, TYPE, 'create', start, 'CodeBuild project requires properties.source_location (git URL)');
    }
    if (!serviceRole) {
      return err(
        name,
        TYPE,
        'create',
        start,
        'CodeBuild project requires properties.service_role_arn (IAM role with codebuild + S3 + lambda + cloudwatch-logs perms)',
      );
    }

    try {
      const cb = await load_aws_sdk(SDK);
      if (!cb) return sdkMissing(name, TYPE, 'create', start, 'CodeBuild', SDK);

      const result = await client.send(
        new cb.CreateProjectCommand({
          name,
          source: {
            type: (properties.source_type as string) || 'GITHUB',
            location: sourceLocation,
            buildspec: (properties.buildspec as string) || undefined,
          },
          artifacts: { type: 'NO_ARTIFACTS' },
          environment: {
            type: (properties.environment_type as string) || 'LINUX_CONTAINER',
            image: (properties.image as string) || 'aws/codebuild/standard:7.0',
            computeType: (properties.compute_type as string) || 'BUILD_GENERAL1_SMALL',
            privilegedMode: properties.privileged_mode === true,
          },
          serviceRole,
          timeoutInMinutes: (properties.timeout_minutes as number) ?? 30,
          tags: properties.tags
            ? Object.entries(properties.tags as Record<string, string>).map(([Key, Value]) => ({
                key: Key,
                value: Value,
              }))
            : undefined,
        }),
      );
      const arn = result?.project?.arn ?? `arn:aws:codebuild:${ctx.region}:*:project/${name}`;
      return ok(name, TYPE, 'create', start, { provider_id: arn });
    } catch (error) {
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('codebuild') as any;
    if (!client) return sdkMissing(name, TYPE, 'update', start, 'CodeBuild', SDK);

    try {
      const cb = await load_aws_sdk(SDK);
      if (!cb) return sdkMissing(name, TYPE, 'update', start, 'CodeBuild', SDK);

      await client.send(
        new cb.UpdateProjectCommand({
          name,
          source: properties.source_location
            ? {
                type: (properties.source_type as string) || 'GITHUB',
                location: properties.source_location as string,
                buildspec: (properties.buildspec as string) || undefined,
              }
            : undefined,
          environment: properties.image
            ? {
                type: (properties.environment_type as string) || 'LINUX_CONTAINER',
                image: properties.image as string,
                computeType: (properties.compute_type as string) || 'BUILD_GENERAL1_SMALL',
                privilegedMode: properties.privileged_mode === true,
              }
            : undefined,
          timeoutInMinutes: properties.timeout_minutes as number | undefined,
        }),
      );
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, _provider_id, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('codebuild') as any;
    if (!client) return err(name, TYPE, 'delete', start, 'CodeBuild SDK not available');
    try {
      const cb = await load_aws_sdk(SDK);
      if (!cb) return err(name, TYPE, 'delete', start, 'CodeBuild SDK not available');
      await client.send(new cb.DeleteProjectCommand({ name }));
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
