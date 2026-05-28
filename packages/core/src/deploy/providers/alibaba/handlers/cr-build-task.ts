/**
 * Alibaba CR build task handler — `alibaba.cr.buildTask`.
 *
 * Backs Source.Build blocks. Container Image Build trigger inside an
 * ACR Instance / Repository. The build runs against a Git source
 * (operator-supplied build context).
 */

import { resolveClient } from './_client';
import { err, isAlibabaAlreadyExists, isAlibabaNotFound, ok, sdkMissing } from './_result';
import type { AlibabaResourceHandler } from '../types';

const TYPE = 'alibaba.cr.buildTask';
const SDK = '@alicloud/cr20181201';

export const cr_build_task_handler: AlibabaResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const cr = await resolveClient(ctx, 'cr');
    if (!cr) return sdkMissing(name, TYPE, 'create', start, 'Alibaba CR', SDK);
    if (!properties.instance_id || !properties.repo_id) {
      return err(name, TYPE, 'create', start, 'CR build task requires instance_id and repo_id');
    }
    try {
      const result = await cr.createRepoBuildRule({
        instanceId: properties.instance_id as string,
        repoId: properties.repo_id as string,
        body: {
          buildRuleName: name,
          dockerfileLocation: (properties.dockerfile_path as string) || '/',
          dockerfileName: (properties.dockerfile_name as string) || 'Dockerfile',
          imageTag: (properties.image_tag as string) || 'latest',
          pushName: (properties.branch as string) || 'main',
          pushType: 'GIT_BRANCH',
        },
      });
      const id = (result?.body?.buildRuleId ?? result?.body?.BuildRuleId) as string | undefined;
      if (!id) return err(name, TYPE, 'create', start, 'CreateRepoBuildRule returned no BuildRuleId');
      return ok(name, TYPE, 'create', start, {
        provider_id: `${properties.instance_id}/${properties.repo_id}/${id}`,
      });
    } catch (error) {
      if (isAlibabaAlreadyExists(error)) return ok(name, TYPE, 'create', start, { provider_id: name });
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, _properties, _current, _ctx) {
    const start = Date.now();
    return ok(name, TYPE, 'update', start, { provider_id });
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const cr = await resolveClient(ctx, 'cr');
    if (!cr) return err(name, TYPE, 'delete', start, 'Alibaba CR SDK not available');
    try {
      const [instanceId, repoId, buildRuleId] = provider_id.split('/');
      await cr.deleteRepoBuildRule({ instanceId, repoId, buildRuleId });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isAlibabaNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
