/**
 * Alibaba PAI workspace handler — `alibaba.pai.workspace`.
 *
 * Backs AI.ModelServing blocks. PAI workspace is the project /
 * organization unit for ML experiments + jobs + datasets.
 */

import { resolveClient } from './_client';
import { err, isAlibabaAlreadyExists, isAlibabaNotFound, ok, sdkMissing } from './_result';
import type { AlibabaResourceHandler } from '../types';

const TYPE = 'alibaba.pai.workspace';
const SDK = '@alicloud/aiworkspace20210204';

export const pai_workspace_handler: AlibabaResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const ws = await resolveClient(ctx, 'paiworkspace');
    if (!ws) return sdkMissing(name, TYPE, 'create', start, 'Alibaba PAI Workspace', SDK);
    try {
      const result = await ws.createWorkspace({
        workspaceName: name,
        displayName: (properties.display_name as string) || name,
        description: (properties.description as string) || 'Managed by ice',
        envTypes: (properties.env_types as string[]) ?? ['dev', 'prod'],
      });
      const id = (result?.body?.workspaceId ?? result?.body?.WorkspaceId) as string | undefined;
      if (!id) return err(name, TYPE, 'create', start, 'CreateWorkspace returned no WorkspaceId');
      return ok(name, TYPE, 'create', start, { provider_id: String(id) });
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
    const ws = await resolveClient(ctx, 'paiworkspace');
    if (!ws) return err(name, TYPE, 'delete', start, 'Alibaba PAI Workspace SDK not available');
    try {
      await ws.deleteWorkspace({ WorkspaceId: provider_id });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isAlibabaNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
