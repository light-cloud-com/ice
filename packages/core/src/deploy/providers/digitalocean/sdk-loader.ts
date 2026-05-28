/**
 * DigitalOcean SDK lazy loader.
 *
 * Uses `dots-wrapper` for the v2 REST API + `@aws-sdk/client-s3` for
 * Spaces (S3-compatible object storage).
 */

import type { DOCredentials } from './types';

export async function load_digitalocean_sdk(module_name: string): Promise<any | null> {
  try {
    return await Function('m', 'return import(m)')(module_name);
  } catch {
    return null;
  }
}

export async function initialize_digitalocean_client(credentials: DOCredentials): Promise<{ client: any | null }> {
  const mod = await load_digitalocean_sdk('dots-wrapper');
  if (!mod) return { client: null };
  const createApiClient = mod.createApiClient ?? mod.default?.createApiClient;
  if (!createApiClient) return { client: null };
  return { client: createApiClient({ token: credentials.access_token }) };
}

export async function initialize_spaces_client(credentials: DOCredentials): Promise<any | null> {
  if (!credentials.spaces_access_key || !credentials.spaces_secret_key) return null;
  const s3mod = await load_digitalocean_sdk('@aws-sdk/client-s3');
  if (!s3mod?.S3Client) return null;
  return new s3mod.S3Client({
    endpoint: `https://${credentials.region}.digitaloceanspaces.com`,
    region: credentials.region,
    credentials: {
      accessKeyId: credentials.spaces_access_key,
      secretAccessKey: credentials.spaces_secret_key,
    },
    forcePathStyle: false,
  });
}

/**
 * Poll a DigitalOcean Action until `completed` or `errored`.
 */
export async function poll_action(client: any, actionId: number, timeout_ms = 5 * 60 * 1000): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < timeout_ms) {
    const result = await client.action.getAction({ action_id: actionId });
    const status = result?.data?.action?.status as string | undefined;
    if (status === 'completed' || status === 'errored') return status;
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error(`DO Action ${actionId} timed out after ${timeout_ms / 1000}s`);
}
