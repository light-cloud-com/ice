/**
 * OCI SDK lazy loader.
 *
 * OCI ships ~80 npm packages, one per service (`oci-core`,
 * `oci-database`, …). Each exports a `<Service>Client` plus auth
 * detail providers (in `oci-common`). The loader instantiates the
 * clients handlers ask for via short-name keys.
 *
 * Indirect `Function('m', 'return import(m)')` keeps bundlers from
 * resolving packages at build time when they're not installed.
 */

import type { OCICredentials } from './types';

export async function load_oci_sdk(module_name: string): Promise<any | null> {
  try {
    return await Function('m', 'return import(m)')(module_name);
  } catch {
    return null;
  }
}

const SERVICE_PACKAGES: Record<string, { pkg: string; clientName: string }> = {
  core: { pkg: 'oci-core', clientName: 'ComputeClient' },
  vnclient: { pkg: 'oci-core', clientName: 'VirtualNetworkClient' },
  database: { pkg: 'oci-database', clientName: 'DatabaseClient' },
  mysql: { pkg: 'oci-mysql', clientName: 'DbSystemClient' },
  psql: { pkg: 'oci-psql', clientName: 'PostgresqlClient' },
  nosql: { pkg: 'oci-nosql', clientName: 'NosqlClient' },
  redis: { pkg: 'oci-redis', clientName: 'RedisClusterClient' },
  objectstorage: { pkg: 'oci-objectstorage', clientName: 'ObjectStorageClient' },
  functions: { pkg: 'oci-functions', clientName: 'FunctionsManagementClient' },
  containerinstance: { pkg: 'oci-containerinstances', clientName: 'ContainerInstanceClient' },
  resourcescheduler: { pkg: 'oci-resourcescheduler', clientName: 'ScheduleClient' },
  vault: { pkg: 'oci-vault', clientName: 'VaultsClient' },
  loadbalancer: { pkg: 'oci-loadbalancer', clientName: 'LoadBalancerClient' },
  dns: { pkg: 'oci-dns', clientName: 'DnsClient' },
  apigateway: { pkg: 'oci-apigateway', clientName: 'ApiGatewayClient' },
  containerengine: { pkg: 'oci-containerengine', clientName: 'ContainerEngineClient' },
  artifacts: { pkg: 'oci-artifacts', clientName: 'ArtifactsClient' },
  identitydomains: { pkg: 'oci-identitydomains', clientName: 'IdentityDomainsClient' },
  certificatesmanagement: { pkg: 'oci-certificatesmanagement', clientName: 'CertificatesManagementClient' },
  waf: { pkg: 'oci-waf', clientName: 'WafClient' },
  logging: { pkg: 'oci-logging', clientName: 'LoggingManagementClient' },
  queue: { pkg: 'oci-queue', clientName: 'QueueAdminClient' },
  streaming: { pkg: 'oci-streaming', clientName: 'StreamAdminClient' },
  ons: { pkg: 'oci-ons', clientName: 'NotificationControlPlaneClient' },
  analytics: { pkg: 'oci-analytics', clientName: 'AnalyticsClient' },
  monitoring: { pkg: 'oci-monitoring', clientName: 'MonitoringClient' },
  generativeai: { pkg: 'oci-generativeai', clientName: 'GenerativeAiClient' },
  datascience: { pkg: 'oci-datascience', clientName: 'DataScienceClient' },
};

/**
 * Build an OCI auth provider. Defaults to config-file at
 * ~/.oci/config; flips to instance-principal when running on an OCI
 * VM and `OCI_AUTH_MODE=instance-principal`.
 */
async function build_auth_provider(creds: OCICredentials): Promise<unknown | null> {
  const common = await load_oci_sdk('oci-common');
  if (!common) return null;
  const mode = creds.auth_mode ?? (process.env.OCI_AUTH_MODE as OCICredentials['auth_mode']) ?? 'config-file';
  if (mode === 'instance-principal' && common.InstancePrincipalsAuthenticationDetailsProviderBuilder) {
    return await new common.InstancePrincipalsAuthenticationDetailsProviderBuilder().build();
  }
  if (mode === 'resource-principal' && common.ResourcePrincipalAuthenticationDetailsProvider) {
    return common.ResourcePrincipalAuthenticationDetailsProvider.builder();
  }
  if (mode === 'session-token' && common.SessionAuthDetailProvider) {
    return new common.SessionAuthDetailProvider(creds.config_path, creds.profile ?? 'DEFAULT');
  }
  // Default: config-file
  if (common.ConfigFileAuthenticationDetailsProvider) {
    return new common.ConfigFileAuthenticationDetailsProvider(creds.config_path, creds.profile ?? 'DEFAULT');
  }
  return null;
}

export async function initialize_oci_clients(
  credentials: OCICredentials,
): Promise<{ clients: Map<string, unknown>; namespace?: string }> {
  const clients = new Map<string, unknown>();
  const provider = await build_auth_provider(credentials);
  for (const svc of Object.keys(SERVICE_PACKAGES)) {
    const entry = SERVICE_PACKAGES[svc];
    if (!entry) continue;
    const { pkg, clientName } = entry;
    let client: unknown = undefined;
    const lazyClient = {
      async resolve() {
        if (client !== undefined) return client;
        if (!provider) {
          client = null;
          return null;
        }
        const mod = await load_oci_sdk(pkg);
        if (!mod) {
          client = null;
          return null;
        }
        const Client = mod[clientName] ?? mod.default?.[clientName];
        if (!Client) {
          client = null;
          return null;
        }
        client = new Client({ authenticationDetailsProvider: provider });
        if (credentials.region && (client as any).regionId !== credentials.region) {
          try {
            (client as any).regionId = credentials.region;
          } catch {
            // ignore — some clients accept region via constructor only.
          }
        }
        return client;
      },
    };
    clients.set(svc, lazyClient);
  }
  return { clients };
}

/**
 * Poll OCI WorkRequest until SUCCEEDED / FAILED / CANCELED. Most OCI
 * long-running ops return an `opc-work-request-id`; handlers call
 * this to wait for terminal state.
 */
export async function poll_work_request(
  workRequestClient: any,
  workRequestId: string,
  timeout_ms = 10 * 60 * 1000,
): Promise<'SUCCEEDED' | 'FAILED' | 'CANCELED'> {
  const start = Date.now();
  while (Date.now() - start < timeout_ms) {
    const wr = await workRequestClient.getWorkRequest({ workRequestId });
    const status = wr?.workRequest?.status as string | undefined;
    if (status === 'SUCCEEDED' || status === 'FAILED' || status === 'CANCELED') {
      return status;
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error(`WorkRequest ${workRequestId} timed out after ${timeout_ms / 1000}s`);
}
