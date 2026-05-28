/**
 * Kubernetes auth helpers.
 *
 * Auth is purely kubeconfig-driven — there's no "username/password"
 * concept like a cloud account. The settings UI surfaces:
 *   - "Use default kubeconfig" — reads ~/.kube/config or $KUBECONFIG
 *   - "Paste kubeconfig YAML" — operator pastes a context
 *   - "Use in-cluster service account" — KUBERNETES_SERVICE_HOST detected
 */

import { initialize_kubernetes_clients, load_kubernetes_sdk } from './sdk-loader';

export interface KubernetesValidationResult {
  valid: boolean;
  context?: string;
  contexts?: string[];
  server?: string;
  error?: string;
}

/**
 * Probe a kubeconfig by listing namespaces (the cheapest cluster-level
 * read). Returns the active context name + the cluster server URL so
 * the settings UI can echo "Connected to <context> @ <server>".
 */
export async function validate_kubeconfig(opts: {
  kubeconfig_raw?: string;
  kubeconfig_path?: string;
}): Promise<KubernetesValidationResult> {
  try {
    const { kc, clients } = await initialize_kubernetes_clients(opts);
    if (!kc) {
      return { valid: false, error: '@kubernetes/client-node not installed' };
    }
    const coreApi = clients.get('core') as any;
    if (!coreApi) return { valid: false, error: 'CoreV1Api unavailable' };
    await coreApi.listNamespace({ limit: 1 });
    const context = (kc as any).getCurrentContext?.() as string | undefined;
    const cluster = (kc as any).getCurrentCluster?.() as { name?: string; server?: string } | undefined;
    return {
      valid: true,
      context: context ?? 'default',
      server: cluster?.server,
    };
  } catch (error) {
    return { valid: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Read the local kubeconfig and return the list of context names. The
 * settings UI uses this to offer a picker. Returns an empty list when
 * the SDK isn't installed.
 */
export async function list_contexts(opts: { kubeconfig_path?: string } = {}): Promise<string[]> {
  const sdk = await load_kubernetes_sdk('@kubernetes/client-node');
  if (!sdk) return [];
  try {
    const kc = new sdk.KubeConfig();
    if (opts.kubeconfig_path) kc.loadFromFile(opts.kubeconfig_path);
    else kc.loadFromDefault();
    const ctxs = (kc.contexts ?? []) as Array<{ name: string }>;
    return ctxs.map((c) => c.name);
  } catch {
    return [];
  }
}
