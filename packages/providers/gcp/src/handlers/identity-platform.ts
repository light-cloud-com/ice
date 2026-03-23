/**
 * Identity Platform Handler
 *
 * Handles: gcp.identityplatform.config
 * Uses REST API.
 */

import type { GCPResourceHandler } from '../types.js';
import type { ResourceDeployResult } from '@ice/core';

const TYPE = 'gcp.identityplatform.config';
const BASE_URL = 'https://identitytoolkit.googleapis.com/v2';

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

export const identity_platform_handler: GCPResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();

    try {
      // Enable Identity Platform for the project
      await ctx.rest_client.post(`${BASE_URL}/projects/${ctx.project}/identityPlatform:initializeAuth`, {});

      // Configure sign-in providers
      const providers = (properties.sign_in_providers as string[]) || ['email'];
      const config: any = {
        signIn: {
          email: { enabled: providers.includes('email'), passwordRequired: true },
        },
        mfa: properties.mfa_enabled ? { state: 'ENABLED' } : { state: 'DISABLED' },
      };

      await ctx.rest_client.patch(`${BASE_URL}/projects/${ctx.project}/config`, config);

      return result(name, 'create', start, {
        provider_id: `projects/${ctx.project}/config/identityPlatform`,
      });
    } catch (error) {
      return fail(name, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();

    try {
      const config: any = {};
      if (properties.mfa_enabled !== undefined) {
        config.mfa = { state: properties.mfa_enabled ? 'ENABLED' : 'DISABLED' };
      }

      await ctx.rest_client.patch(`${BASE_URL}/projects/${ctx.project}/config`, config);

      return result(name, 'update', start, { provider_id });
    } catch (error) {
      return fail(name, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, _provider_id, _ctx) {
    const start = Date.now();
    // Identity Platform cannot be fully deleted, only disabled
    return result(name, 'delete', start);
  },
};
