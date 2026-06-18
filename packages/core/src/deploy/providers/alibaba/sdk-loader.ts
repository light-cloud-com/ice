/**
 * Alibaba SDK lazy loader.
 *
 * Each `@alicloud/<service><version>` package exports a default client
 * class (e.g. `@alicloud/ecs20140526` → `default` class `Ecs20140526`).
 * The loader instantiates one client per service, configured for the
 * caller's region, and stashes them in a Map for handlers to retrieve.
 *
 * Indirect `Function('m', 'return import(m)')` keeps bundlers from
 * resolving packages at build time when they're not installed.
 */

import { service_endpoint } from './region';
import type { AlibabaCredentials } from './types';

export async function load_alibaba_sdk(module_name: string): Promise<any | null> {
  try {
    return await Function('m', 'return import(m)')(module_name);
  } catch {
    return null;
  }
}

/**
 * Service short-name → npm package + endpoint host prefix. Adding a
 * new service handler usually means adding one row here.
 */
const SERVICE_PACKAGES: Record<string, { pkg: string; endpoint_prefix: string }> = {
  ecs: { pkg: '@alicloud/ecs20140526', endpoint_prefix: 'ecs' },
  vpc: { pkg: '@alicloud/vpc20160428', endpoint_prefix: 'vpc' },
  rds: { pkg: '@alicloud/rds20140815', endpoint_prefix: 'rds' },
  dds: { pkg: '@alicloud/dds20151201', endpoint_prefix: 'mongodb' },
  kvstore: { pkg: '@alicloud/r-kvstore20150101', endpoint_prefix: 'r-kvstore' },
  oss: { pkg: '@alicloud/oss20190517', endpoint_prefix: 'oss' },
  mns: { pkg: '@alicloud/mns', endpoint_prefix: 'mns-open' },
  fc: { pkg: '@alicloud/fc20230330', endpoint_prefix: 'fcv3' },
  sae: { pkg: '@alicloud/sae20190506', endpoint_prefix: 'sae' },
  eci: { pkg: '@alicloud/eci20180808', endpoint_prefix: 'eci' },
  eventbridge: { pkg: '@alicloud/eventbridge20200401', endpoint_prefix: 'eventbridge' },
  kms: { pkg: '@alicloud/kms20160120', endpoint_prefix: 'kms' },
  slb: { pkg: '@alicloud/slb20140515', endpoint_prefix: 'slb' },
  alidns: { pkg: '@alicloud/alidns20150109', endpoint_prefix: 'alidns' },
  privatelink: { pkg: '@alicloud/privatelink20200415', endpoint_prefix: 'privatelink' },
  apigateway: { pkg: '@alicloud/cloudapi20160714', endpoint_prefix: 'apigateway' },
  cs: { pkg: '@alicloud/cs20151215', endpoint_prefix: 'cs' },
  cr: { pkg: '@alicloud/cr20181201', endpoint_prefix: 'cr' },
  cdn: { pkg: '@alicloud/cdn20180510', endpoint_prefix: 'cdn' },
  ram: { pkg: '@alicloud/ram20150501', endpoint_prefix: 'ram' },
  cas: { pkg: '@alicloud/cas20200407', endpoint_prefix: 'cas' },
  waf: { pkg: '@alicloud/waf-openapi20211001', endpoint_prefix: 'wafopenapi' },
  sls: { pkg: '@alicloud/sls20201230', endpoint_prefix: 'sls' },
  // amqp: @alicloud/amqp-open20210309 — not published on npm; revisit
  // when an official Node.js SDK ships.
  maxcompute: { pkg: '@alicloud/maxcompute20220104', endpoint_prefix: 'maxcompute' },
  opensearch: { pkg: '@alicloud/opensearch20171225', endpoint_prefix: 'opensearch' },
  pai: { pkg: '@alicloud/eas20210701', endpoint_prefix: 'pai-eas' },
  paiworkspace: { pkg: '@alicloud/aiworkspace20210204', endpoint_prefix: 'aiworkspacenew' },
};

export function service_package(service: string): string | undefined {
  return SERVICE_PACKAGES[service]?.pkg;
}

/**
 * Instantiate the default client class from a `@alicloud/<svc>` module.
 * Most modules export the client as default; some export it as a named
 * export matching the module's PascalCase name. Tries both.
 */
function instantiate_client(mod: any, credentials: AlibabaCredentials, endpoint: string): unknown {
  const Config = (mod.OpenApi?.Config ?? mod.Config) as new (cfg: unknown) => unknown;
  const Client = (mod.default ?? mod[Object.keys(mod).find((k) => /^[A-Z]/.test(k)) ?? '']) as
    | (new (cfg: unknown) => unknown)
    | undefined;
  if (!Client) throw new Error('Alibaba SDK module did not export a client constructor');
  const config = Config
    ? new Config({
        accessKeyId: credentials.access_key_id,
        accessKeySecret: credentials.access_key_secret,
        securityToken: credentials.security_token,
        endpoint,
      })
    : {
        accessKeyId: credentials.access_key_id,
        accessKeySecret: credentials.access_key_secret,
        endpoint,
      };
  return new Client(config);
}

/**
 * Initialize lazily — handlers ask for a service by short-name and the
 * loader caches the client on first hit. This keeps SDK probing cheap
 * for canvases that only deploy one or two Alibaba blocks.
 */
export async function initialize_alibaba_clients(
  credentials: AlibabaCredentials,
): Promise<{ clients: Map<string, unknown> }> {
  const clients = new Map<string, unknown>();
  // Attach a thunk per service rather than instantiating up-front: the
  // sdk-loader resolves on first `clients.get(<svc>)`.
  for (const svc of Object.keys(SERVICE_PACKAGES)) {
    const entry = SERVICE_PACKAGES[svc];
    if (!entry) continue;
    const { pkg, endpoint_prefix } = entry;
    let client: unknown = undefined;
    const lazyClient = {
      async resolve() {
        if (client !== undefined) return client;
        const mod = await load_alibaba_sdk(pkg);
        if (!mod) {
          client = null;
          return null;
        }
        const endpoint = service_endpoint(endpoint_prefix, credentials.region);
        client = instantiate_client(mod, credentials, endpoint);
        return client;
      },
    };
    clients.set(svc, lazyClient);
  }
  return { clients };
}
