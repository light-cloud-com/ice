/**
 * AWS Amplify Hosting handler — `aws.amplify.app`.
 *
 * Backs the `Compute.SSRSite` block. Amplify auto-detects the
 * framework (Next.js / Nuxt / Astro / Remix) from the repository's
 * source. The operator wires a `Source.Repository` to the block;
 * pass-1-4 propagates `repository` + `branch` + build settings.
 *
 * Provider id = Amplify App ARN. Delete = DeleteApp (cascades branches +
 * deployments).
 */

import { load_aws_sdk } from '../sdk-loader';
import { err, ok, sdkMissing } from './_result';
import type { AWSResourceHandler } from '../types';

const TYPE = 'aws.amplify.app';
const SDK = '@aws-sdk/client-amplify';

export const amplify_hosting_handler: AWSResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('amplify') as any;
    if (!client) return sdkMissing(name, TYPE, 'create', start, 'Amplify', SDK);

    const repository = properties.repository as string | undefined;
    if (!repository) {
      return err(
        name,
        TYPE,
        'create',
        start,
        'Amplify app requires a connected Source.Repository (sets properties.repository).',
      );
    }

    try {
      const amplify = await load_aws_sdk(SDK);
      if (!amplify) return sdkMissing(name, TYPE, 'create', start, 'Amplify', SDK);

      const created = await client.send(
        new amplify.CreateAppCommand({
          name,
          repository,
          platform: (properties.platform as string) || 'WEB_COMPUTE',
          oauthToken: properties.oauth_token as string | undefined,
          accessToken: properties.access_token as string | undefined,
          buildSpec: properties.build_spec as string | undefined,
          environmentVariables: properties.environment_variables as Record<string, string> | undefined,
          tags: properties.tags as Record<string, string> | undefined,
        }),
      );
      const appId = created?.app?.appId;
      const arn = created?.app?.appArn ?? `arn:aws:amplify:${ctx.region}:*:apps/${appId ?? name}`;

      // Create the branch so Amplify can kick the first build.
      if (appId) {
        await client.send(
          new amplify.CreateBranchCommand({
            appId,
            branchName: (properties.branch as string) || 'main',
            enableAutoBuild: properties.auto_build !== false,
          }),
        );
      }

      return ok(name, TYPE, 'create', start, { provider_id: arn });
    } catch (error) {
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('amplify') as any;
    if (!client) return sdkMissing(name, TYPE, 'update', start, 'Amplify', SDK);

    try {
      const amplify = await load_aws_sdk(SDK);
      if (!amplify) return sdkMissing(name, TYPE, 'update', start, 'Amplify', SDK);

      const appId = provider_id.split('/').pop();
      await client.send(
        new amplify.UpdateAppCommand({
          appId,
          name,
          buildSpec: properties.build_spec as string | undefined,
          environmentVariables: properties.environment_variables as Record<string, string> | undefined,
        }),
      );
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('amplify') as any;
    if (!client) return err(name, TYPE, 'delete', start, 'Amplify SDK not available');
    try {
      const amplify = await load_aws_sdk(SDK);
      if (!amplify) return err(name, TYPE, 'delete', start, 'Amplify SDK not available');
      const appId = provider_id.split('/').pop();
      await client.send(new amplify.DeleteAppCommand({ appId }));
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
