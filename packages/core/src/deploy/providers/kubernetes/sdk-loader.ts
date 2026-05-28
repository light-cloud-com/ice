/**
 * Kubernetes SDK lazy loader.
 *
 * Loads `@kubernetes/client-node` via the same
 * `Function('m', 'return import(m)')` indirection AWS/Azure/GCP use,
 * so bundlers don't try to resolve the package at build time when it
 * isn't installed.
 *
 * The K8s SDK is a single npm package that ships every typed API
 * class. We instantiate the ones handlers ask for via short-name keys.
 */

/**
 * Dynamically import an npm package. Returns null when missing so
 * handlers can surface a friendly "install …" error.
 */
export async function load_kubernetes_sdk(module_name: string): Promise<any | null> {
  try {
    return await Function('m', 'return import(m)')(module_name);
  } catch {
    return null;
  }
}

/**
 * Initialize a KubeConfig and the typed API clients handlers expect.
 *
 * Auth precedence:
 *   1. Operator-supplied inline kubeconfig (YAML string in `options.kubeconfig_raw`)
 *   2. Operator-supplied path (`options.kubeconfig_path`)
 *   3. `KUBECONFIG` env var
 *   4. `~/.kube/config` default
 *   5. In-cluster service-account (when `KUBERNETES_SERVICE_HOST` is set)
 *
 * Missing-package case: returns `{ kc: null, clients: new Map() }` so
 * `initialize()` can throw a clear "install @kubernetes/client-node"
 * error rather than crashing during SDK probe.
 */
export async function initialize_kubernetes_clients(opts: {
  kubeconfig_raw?: string;
  kubeconfig_path?: string;
}): Promise<{ kc: unknown; clients: Map<string, unknown> }> {
  const sdk = await load_kubernetes_sdk('@kubernetes/client-node');
  if (!sdk) {
    return { kc: null, clients: new Map() };
  }

  const kc = new sdk.KubeConfig();
  if (opts.kubeconfig_raw) {
    kc.loadFromString(opts.kubeconfig_raw);
  } else if (opts.kubeconfig_path) {
    kc.loadFromFile(opts.kubeconfig_path);
  } else if (process.env.KUBERNETES_SERVICE_HOST) {
    kc.loadFromCluster();
  } else {
    kc.loadFromDefault();
  }

  const clients = new Map<string, unknown>();
  clients.set('core', kc.makeApiClient(sdk.CoreV1Api));
  clients.set('apps', kc.makeApiClient(sdk.AppsV1Api));
  clients.set('batch', kc.makeApiClient(sdk.BatchV1Api));
  clients.set('networking', kc.makeApiClient(sdk.NetworkingV1Api));
  if (sdk.AutoscalingV2Api) clients.set('autoscaling', kc.makeApiClient(sdk.AutoscalingV2Api));
  if (sdk.RbacAuthorizationV1Api) clients.set('rbac', kc.makeApiClient(sdk.RbacAuthorizationV1Api));
  if (sdk.PolicyV1Api) clients.set('policy', kc.makeApiClient(sdk.PolicyV1Api));
  if (sdk.CustomObjectsApi) clients.set('custom', kc.makeApiClient(sdk.CustomObjectsApi));

  return { kc, clients };
}

/**
 * Strip @kubernetes/client-node down to the active context name for
 * the deployer's `cluster_name` field. Returns 'default' if no context.
 */
export function active_context_name(kc: any): string {
  return (kc?.getCurrentContext?.() as string | undefined) ?? 'default';
}
