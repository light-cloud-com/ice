/**
 * Alibaba API Gateway API handler — `alibaba.apigateway.api`.
 *
 * Backs Network.Gateway blocks. Each canvas Gateway block maps to one
 * APIGateway API + group pair. The group is auto-created from
 * `properties.group_name` if missing.
 */

import { resolveClient } from './_client';
import { err, isAlibabaAlreadyExists, isAlibabaNotFound, ok, sdkMissing } from './_result';
import type { AlibabaResourceHandler } from '../types';

const TYPE = 'alibaba.apigateway.api';
const SDK = '@alicloud/cloudapi20160714';

export const apigateway_api_handler: AlibabaResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const apigw = await resolveClient(ctx, 'apigateway');
    if (!apigw) return sdkMissing(name, TYPE, 'create', start, 'Alibaba API Gateway', SDK);
    try {
      const groupId = properties.group_id as string | undefined;
      if (!groupId) return err(name, TYPE, 'create', start, 'API Gateway requires properties.group_id');
      const result = await apigw.createApi({
        groupId,
        apiName: name,
        visibility: 'PUBLIC',
        requestConfig: JSON.stringify({
          RequestProtocol: 'HTTP,HTTPS',
          RequestHttpMethod: (properties.method as string) || 'POST',
          RequestPath: (properties.path as string) || `/${name}`,
          RequestMode: 'PASSTHROUGH',
        }),
        serviceConfig: JSON.stringify({
          ServiceProtocol: 'HTTP',
          ServiceAddress: properties.backend_url as string | undefined,
          ServiceTimeout: (properties.timeout_ms as number) || 5000,
        }),
        resultType: 'JSON',
        resultSample: '{}',
        authType: (properties.auth_type as string) || 'ANONYMOUS',
      });
      const apiId = (result?.body?.apiId ?? result?.body?.ApiId) as string | undefined;
      if (!apiId) return err(name, TYPE, 'create', start, 'CreateApi returned no ApiId');
      return ok(name, TYPE, 'create', start, { provider_id: `${groupId}/${apiId}` });
    } catch (error) {
      if (isAlibabaAlreadyExists(error)) return ok(name, TYPE, 'create', start, { provider_id: name });
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    const apigw = await resolveClient(ctx, 'apigateway');
    if (!apigw) return err(name, TYPE, 'update', start, 'Alibaba API Gateway SDK not available');
    try {
      const [groupId, apiId] = provider_id.split('/');
      await apigw.modifyApi({ groupId, apiId, apiName: name, visibility: 'PUBLIC' });
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const apigw = await resolveClient(ctx, 'apigateway');
    if (!apigw) return err(name, TYPE, 'delete', start, 'Alibaba API Gateway SDK not available');
    try {
      const [groupId, apiId] = provider_id.split('/');
      await apigw.deleteApi({ groupId, apiId });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isAlibabaNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
