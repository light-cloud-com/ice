/**
 * IBM Cloud SDK lazy loader.
 *
 * Auth flow:
 *   1. Build an `IamAuthenticator` from the API key
 *      (via ibm-cloud-sdk-core).
 *   2. Hand it to each typed service client (`new VpcV1({ authenticator })`,
 *      `new CodeEngineV2({ authenticator })`, …).
 *
 * Indirect `Function('m', 'return import(m)')` keeps bundlers from
 * resolving packages at build time when they're not installed.
 */

import type { IBMCredentials } from './types';

export async function load_ibm_sdk(module_name: string): Promise<any | null> {
  try {
    return await Function('m', 'return import(m)')(module_name);
  } catch {
    return null;
  }
}

const SERVICE_PACKAGES: Record<string, { pkg: string; clientName: string }> = {
  vpc: { pkg: '@ibm-cloud/vpc', clientName: 'VpcV1' },
  codeengine: { pkg: '@ibm-cloud/code-engine', clientName: 'CodeEngineV2' },
  resourcecontroller: { pkg: '@ibm-cloud/platform-services', clientName: 'ResourceControllerV2' },
  iam: { pkg: '@ibm-cloud/platform-services', clientName: 'IamIdentityV1' },
  secretsmanager: { pkg: '@ibm-cloud/secrets-manager', clientName: 'SecretsManagerV2' },
  cloudant: { pkg: '@ibm-cloud/cloudant', clientName: 'CloudantV1' },
  eventnotifications: { pkg: '@ibm-cloud/event-notifications', clientName: 'EventNotificationsV1' },
  eventstreams: { pkg: '@ibm-cloud/event-streams', clientName: 'AdminrestV1' },
  cis: { pkg: '@ibm-cloud/networking-services', clientName: 'DnsRecordsV1' },
};

export async function build_authenticator(credentials: IBMCredentials): Promise<unknown | null> {
  const core = await load_ibm_sdk('ibm-cloud-sdk-core');
  if (!core?.IamAuthenticator) return null;
  return new core.IamAuthenticator({ apikey: credentials.api_key });
}

export async function initialize_ibm_clients(
  credentials: IBMCredentials,
): Promise<{ clients: Map<string, unknown>; authenticator: unknown | null }> {
  const authenticator = await build_authenticator(credentials);
  const clients = new Map<string, unknown>();
  for (const svc of Object.keys(SERVICE_PACKAGES)) {
    const { pkg, clientName } = SERVICE_PACKAGES[svc];
    let client: unknown = undefined;
    const lazyClient = {
      async resolve() {
        if (client !== undefined) return client;
        if (!authenticator) {
          client = null;
          return null;
        }
        const mod = await load_ibm_sdk(pkg);
        if (!mod) {
          client = null;
          return null;
        }
        const Client = mod[clientName] ?? mod.default?.[clientName];
        if (!Client) {
          client = null;
          return null;
        }
        client = new Client({ authenticator });
        if (typeof (client as any).setServiceUrl === 'function') {
          // Service URL builders ship in many SDKs; use them when present.
          if (typeof mod.getServiceUrlForRegion === 'function') {
            (client as any).setServiceUrl(mod.getServiceUrlForRegion(credentials.region));
          }
        }
        return client;
      },
    };
    clients.set(svc, lazyClient);
  }
  return { clients, authenticator };
}

/**
 * Poll a Resource Controller managed instance until `state` is
 * `active` / `provisioning_failed`.
 */
export async function poll_resource_instance(
  resourceController: any,
  instanceId: string,
  timeout_ms = 10 * 60 * 1000,
): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < timeout_ms) {
    const result = await resourceController.getResourceInstance({ id: instanceId });
    const state = result?.result?.state as string | undefined;
    if (state === 'active' || state === 'provisioning_failed' || state === 'failed') return state;
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error(`Resource instance ${instanceId} timed out`);
}
