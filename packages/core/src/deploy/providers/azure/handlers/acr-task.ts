/**
 * Azure Container Registry Task handler — `azure.containerregistry.task`.
 *
 * Backs Source.Build on Azure (parallel to AWS CodeBuild + GCP Cloud
 * Build). ACR Tasks builds container images directly inside the
 * registry — the closest managed equivalent to CodeBuild's
 * GitHub → container-image flow.
 *
 * Note: @azure/arm-containerregistry v12 removed the `tasks`
 * operations namespace; the tasks management API moved to a separate
 * REST surface (the SDK was scoped down to core registry primitives).
 * This handler is therefore stubbed: create returns a clear error
 * pointing operators at `az acr task create` or direct REST calls
 * via the ACR Tasks Management REST API, and delete is a no-op since
 * we can't track the task ID.
 *
 * Re-enable once Microsoft publishes a first-party Node SDK for ACR
 * Tasks management (likely as `@azure/container-registry-tasks` or
 * within a future arm-containerregistry minor).
 */

import { err, ok } from './_result';
import type { AzureResourceHandler } from '../types';

const TYPE = 'azure.containerregistry.task';

export const acr_task_handler: AzureResourceHandler = {
  async create(name, _properties, _ctx) {
    const start = Date.now();
    return err(
      name,
      TYPE,
      'create',
      start,
      'ACR Tasks management is unavailable in @azure/arm-containerregistry v12. Use `az acr task create` from the CLI or call the ACR Tasks Management REST API directly (https://learn.microsoft.com/rest/api/containerregistry/tasks). Re-enable this handler when Microsoft publishes a first-party Node SDK for ACR Tasks.',
    );
  },

  async update(name, provider_id, _properties, _current, _ctx) {
    return ok(name, TYPE, 'update', Date.now(), { provider_id });
  },

  async delete(name, provider_id, _ctx) {
    return ok(name, TYPE, 'delete', Date.now(), { provider_id });
  },
};
