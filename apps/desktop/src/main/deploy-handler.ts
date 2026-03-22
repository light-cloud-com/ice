/**
 * Deploy Handler — Main Process IPC
 *
 * Bridges the desktop renderer to the core deploy engine.
 * Handles: deploy:plan, deploy:apply, deploy:destroy, deploy:getStatus,
 *          deploy:authenticate, deploy:getResources, deploy:getDeployments
 *
 * Auth strategy: The main process can resolve google-auth-library via dynamic
 * import (unlike core's compiled dist in the Electron bundle). So we create
 * the auth client HERE and pass it to GCPDeployer via `auth_client` option.
 *
 * State persistence: Uses SqliteStateStore + adapter to persist provider_ids
 * and outputs after each deployment. On re-deploy, prior state is loaded to
 * classify resources as create/update/delete instead of always "create".
 */

import { ipcMain, BrowserWindow, app, shell } from 'electron';
import { join } from 'path';
import {
  translate_card_to_graph,
  GCPDeployer,
  SqliteStateStore,
  create_deploy_state_adapter,
  load_state_for_diff,
  sync_resource_results_to_state,
  type CardTranslationInput,
  type CardNodeInput,
  type CardEdgeInput,
  type DeployProvider,
  type EnvironmentType,
} from '@ice-engine/core';
import {
  DEPLOY_PROGRESS,
  AUTH_MESSAGES,
  isAuthMissingError,
  isAuthExpiredError,
  isApiNotEnabledError,
  extractApiEnableUrl,
  extractApiName,
  buildApiEnableUrl,
  IPC_ERRORS,
  ALLOWED_EXTERNAL_URL_PREFIXES,
} from '@ice-engine/core';
import { IPC_ERRORS as MAIN_IPC_ERRORS } from './messages';
import { connectGCPViaGcloud } from './ipc-handlers';

// ─── Types ──────────────────────────────────────────────────────────────────

interface DeployRequestOptions {
  provider: string;
  gcpProject: string;
  region: string;
  environment: 'development' | 'staging' | 'production';
}

interface PlanResult {
  success: boolean;
  needsAuth?: boolean;
  plan?: {
    creates: Array<{ name: string; type: string; action: 'create' }>;
    updates: Array<{ name: string; type: string; action: 'update'; provider_id?: string }>;
    deletes: Array<{ name: string; type: string; action: 'delete'; provider_id?: string }>;
    skipped: Array<{ name: string; reason: string }>;
    warnings: string[];
  };
  error?: string;
}

interface ApplyResult {
  success: boolean;
  needsAuth?: boolean;
  results?: Array<{
    name: string;
    type: string;
    action: string;
    success: boolean;
    error?: string;
    api_enable_url?: string;
    provider_id?: string;
    outputs?: Record<string, unknown>;
    duration_ms?: number;
    source_node_id?: string;
  }>;
  duration_ms?: number;
  error?: string;
}

// ─── State Store Singleton ──────────────────────────────────────────────────

let stateStore: SqliteStateStore | null = null;
let stateStoreInitFailed = false;

/**
 * Get or initialize the state store. Returns null if initialization fails
 * (e.g., better-sqlite3 not available). Callers must handle null gracefully.
 */
async function getStateStore(): Promise<SqliteStateStore | null> {
  if (stateStoreInitFailed) return null;
  if (stateStore) return stateStore;

  try {
    const store = new SqliteStateStore({
      path: join(app.getPath('userData'), 'deploy-state.db'),
    });
    const result = await store.initialize();
    if (!result.ok) {
      console.error('State store initialization failed:', result.error.message);
      stateStoreInitFailed = true;
      return null;
    }
    stateStore = store;
    return stateStore;
  } catch (err: any) {
    console.error('State store initialization error:', err.message || err);
    stateStoreInitFailed = true;
    return null;
  }
}

/**
 * Load prior state for diffing. Returns empty map if state store is unavailable.
 */
async function loadPriorState(
  cardId: string
): Promise<Map<string, import('@ice-engine/core').StoredResourceEntry>> {
  const store = await getStateStore();
  if (!store) return new Map();

  try {
    const adapter = create_deploy_state_adapter(store, cardId);
    return await load_state_for_diff(adapter, cardId);
  } catch (err: any) {
    console.error('Failed to load prior state:', err.message || err);
    return new Map();
  }
}

/**
 * Check GCP Application Default Credentials.
 * Returns the authenticated client on success (for passing to GCPDeployer),
 * or an error with `needsAuth: true` when credentials are missing/expired.
 */
async function checkGcpAuth(): Promise<
  { ok: true; client: any } | { ok: false; needsAuth: boolean; error: string }
> {
  try {
    const googleAuth = await Function('m', 'return import(m)')('google-auth-library');
    if (!googleAuth?.GoogleAuth) {
      return { ok: false, needsAuth: true, error: AUTH_MESSAGES.AUTH_LIB_NOT_AVAILABLE };
    }

    const auth = new googleAuth.GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
    const client = await auth.getClient();
    const token = await client.getAccessToken();

    if (token?.token) {
      return { ok: true, client };
    }
    return { ok: false, needsAuth: true, error: AUTH_MESSAGES.COULD_NOT_OBTAIN_GCP_TOKEN };
  } catch (err: any) {
    const msg = err?.message || String(err);
    const isAuthIssue = isAuthMissingError(msg) || isAuthExpiredError(msg);

    return {
      ok: false,
      needsAuth: isAuthIssue,
      error: isAuthIssue
        ? AUTH_MESSAGES.CREDENTIALS_NOT_FOUND_OR_EXPIRED
        : AUTH_MESSAGES.AUTH_ERROR(msg),
    };
  }
}

// ─── Helper: send progress to renderer ──────────────────────────────────────

function sendProgress(event: any) {
  const win = BrowserWindow.getFocusedWindow();
  if (win) {
    win.webContents.send('deploy:progress', event);
  }
}

// ─── Helper: propagate repository/branch from parent groups to children ─────

/**
 * When a user sets a GitHub repo on a block/group node, child resource nodes
 * (Container, Worker, etc.) don't inherit it automatically. This propagates
 * `repository` and `branch` from parent groups to children that lack their own.
 */
function propagateParentData(nodes: any[]): any[] {
  // Build a map of group nodes that have a repository set
  const groupRepos = new Map<string, { repository: string; branch?: string }>();
  for (const n of nodes) {
    if (n.type === 'group' && n.data?.repository) {
      groupRepos.set(n.id, {
        repository: n.data.repository as string,
        branch: n.data.branch as string | undefined,
      });
    }
  }

  if (groupRepos.size === 0) return nodes;

  // Propagate to child nodes that don't have their own repository
  return nodes.map((n) => {
    if (n.type !== 'group' && n.parentId && !n.data?.repository) {
      const parentRepo = groupRepos.get(n.parentId);
      if (parentRepo) {
        return {
          ...n,
          data: {
            ...n.data,
            repository: parentRepo.repository,
            branch: n.data?.branch || parentRepo.branch,
          },
        };
      }
    }
    return n;
  });
}

// ─── Helper: translate card nodes to deploy graph ───────────────────────────

function translateCard(nodes: any[], edges: any[], options: DeployRequestOptions) {
  // Propagate repository from parent groups to child resource nodes
  const enrichedNodes = propagateParentData(nodes);

  const cardNodes: CardNodeInput[] = enrichedNodes.map((n: any) => ({
    id: n.id,
    type: n.type,
    data: n.data || {},
  }));

  const cardEdges: CardEdgeInput[] = edges.map((e: any) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    data: e.data,
  }));

  const input: CardTranslationInput = {
    nodes: cardNodes,
    edges: cardEdges,
    provider: options.provider as DeployProvider,
    projectName: options.gcpProject,
    environment: options.environment as EnvironmentType,
    gcpProject: options.gcpProject,
    region: options.region,
  };

  return translate_card_to_graph(input);
}

// ─── Helper: extract nodes array from Graph (ReadonlyMap) ───────────────────

function graphNodesToArray(graph: {
  nodes: ReadonlyMap<string, any>;
}): Array<{
  id: string;
  type: string;
  name: string;
  properties: Record<string, unknown>;
  labels?: Record<string, string>;
}> {
  const result: Array<{
    id: string;
    type: string;
    name: string;
    properties: Record<string, unknown>;
    labels?: Record<string, string>;
  }> = [];
  graph.nodes.forEach((node, id) => {
    result.push({
      id,
      type: node.type,
      name: node.name || id,
      properties: node.properties || {},
      labels: node.labels,
    });
  });
  return result;
}

// ─── Register IPC handlers ──────────────────────────────────────────────────

export function registerDeployHandlers() {
  // ── deploy:authenticate ────────────────────────────────────────────
  // Triggers the gcloud CLI auth flow (opens browser for OAuth).
  // Called automatically by DeployPanel when credentials are missing/expired.
  ipcMain.handle('deploy:authenticate', async () => {
    try {
      sendProgress({ type: 'log', message: DEPLOY_PROGRESS.OPENING_AUTH });
      const result = await connectGCPViaGcloud();
      if (result.success) {
        sendProgress({ type: 'log', message: DEPLOY_PROGRESS.AUTH_SUCCESSFUL });
      }
      return result;
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  // ── deploy:plan ─────────────────────────────────────────────────────
  ipcMain.handle(
    'deploy:plan',
    async (
      _event,
      cardId: string,
      nodes: any[],
      edges: any[],
      options: DeployRequestOptions
    ): Promise<PlanResult> => {
      try {
        // Pre-flight auth check
        sendProgress({ type: 'log', message: DEPLOY_PROGRESS.CHECKING_CREDENTIALS });
        const authCheck = await checkGcpAuth();
        if (!authCheck.ok) {
          return { success: false, needsAuth: authCheck.needsAuth, error: authCheck.error };
        }
        sendProgress({ type: 'log', message: DEPLOY_PROGRESS.CREDENTIALS_VERIFIED });

        sendProgress({ type: 'log', message: DEPLOY_PROGRESS.TRANSLATING_CANVAS });

        const translation = translateCard(nodes, edges, options);

        if (!translation.graph) {
          return {
            success: false,
            error:
              translation.warnings.length > 0
                ? `Translation failed: ${translation.warnings.join('; ')}`
                : DEPLOY_PROGRESS.NO_DEPLOYABLE_RESOURCES_CANVAS,
          };
        }

        sendProgress({
          type: 'log',
          message: DEPLOY_PROGRESS.TRANSLATED(translation.deployable_count),
        });

        // Load prior state for accurate create/update/delete classification
        const priorState = await loadPriorState(cardId);

        if (priorState.size > 0) {
          sendProgress({
            type: 'log',
            message: DEPLOY_PROGRESS.LOADED_PRIOR_STATE(priorState.size),
          });
        }

        // Build plan by comparing current graph with prior state
        const nodeList = graphNodesToArray(translation.graph);
        const currentNames = new Set(nodeList.map((n) => n.name));

        const creates: Array<{ name: string; type: string; action: 'create' }> = [];
        const updates: Array<{
          name: string;
          type: string;
          action: 'update';
          provider_id?: string;
        }> = [];
        const deletes: Array<{
          name: string;
          type: string;
          action: 'delete';
          provider_id?: string;
        }> = [];

        for (const node of nodeList) {
          const prior = priorState.get(node.name);
          if (prior?.provider_id) {
            updates.push({
              name: node.name,
              type: node.type,
              action: 'update',
              provider_id: prior.provider_id,
            });
          } else {
            creates.push({ name: node.name, type: node.type, action: 'create' });
          }
        }

        // Resources in state but not in current graph → deletes
        for (const [name, entry] of priorState) {
          if (!currentNames.has(name)) {
            deletes.push({
              name,
              type: entry.ice_type,
              action: 'delete',
              provider_id: entry.provider_id,
            });
          }
        }

        const plan = {
          creates,
          updates,
          deletes,
          skipped: translation.skipped.map((s) => ({
            name: s.nodeId,
            reason: s.reason,
          })),
          warnings: translation.warnings,
        };

        return { success: true, plan };
      } catch (err: any) {
        console.error('Deploy plan error:', err);
        return { success: false, error: err.message || String(err) };
      }
    }
  );

  // ── deploy:apply ────────────────────────────────────────────────────
  ipcMain.handle(
    'deploy:apply',
    async (
      _event,
      cardId: string,
      nodes: any[],
      edges: any[],
      options: DeployRequestOptions
    ): Promise<ApplyResult> => {
      const start = Date.now();

      try {
        // Pre-flight auth check — also obtains the auth client to pass to deployer
        sendProgress({ type: 'log', message: DEPLOY_PROGRESS.VERIFYING_CREDENTIALS });
        sendProgress({
          type: 'progress',
          progress: 2,
          resource: '',
          message: DEPLOY_PROGRESS.VERIFYING_CREDENTIALS,
        });
        const authCheck = await checkGcpAuth();
        if (!authCheck.ok) {
          return {
            success: false,
            needsAuth: authCheck.needsAuth,
            error: authCheck.error,
            duration_ms: Date.now() - start,
          };
        }
        sendProgress({ type: 'log', message: DEPLOY_PROGRESS.CREDENTIALS_OK });

        sendProgress({ type: 'log', message: DEPLOY_PROGRESS.STARTING_DEPLOYMENT });
        sendProgress({ type: 'log', message: 'Deploy engine v2 — source build support enabled' });
        sendProgress({
          type: 'progress',
          progress: 5,
          resource: '',
          message: DEPLOY_PROGRESS.TRANSLATING_GRAPH,
        });

        const translation = translateCard(nodes, edges, options);

        if (!translation.graph) {
          return {
            success: false,
            error: DEPLOY_PROGRESS.NO_DEPLOYABLE_RESOURCES,
          };
        }

        // Load prior state for create vs update routing
        const store = await getStateStore();
        const adapter = store ? create_deploy_state_adapter(store, cardId) : null;
        const priorState = await loadPriorState(cardId);

        sendProgress({
          type: 'progress',
          progress: 10,
          resource: '',
          message: DEPLOY_PROGRESS.DEPLOYING_RESOURCES(
            translation.deployable_count,
            options.gcpProject,
            priorState.size > 0 ? priorState.size : undefined
          ),
        });

        // Create deployer — pass auth_client from main process so the core
        // doesn't need to resolve google-auth-library from compiled dist
        const deployer = new GCPDeployer();
        await deployer.initialize({
          provider: 'gcp',
          project: options.gcpProject,
          regions: [options.region],
          auth_client: authCheck.client,
          on_log: (message: string) => sendProgress({ type: 'log', message }),
        });

        // Get nodes as array from graph
        const nodeList = graphNodesToArray(translation.graph);
        const currentNames = new Set(nodeList.map((n) => n.name));
        const totalResources = nodeList.length;
        let completed = 0;

        // Deploy each resource (create or update based on prior state)
        const results: ApplyResult['results'] = [];

        for (const node of nodeList) {
          const progress = 10 + Math.round((completed / totalResources) * 80);
          const prior = priorState.get(node.name);
          const action = prior?.provider_id ? 'update' : 'create';

          // Log source info for Cloud Run nodes so build progress is visible
          if (node.type === 'gcp.run.service' || node.type === 'gcp.run.job') {
            const repo = node.properties.repository as string;
            const img = node.properties.image as string;
            if (repo) {
              sendProgress({
                type: 'log',
                message: `Source: repository ${repo} (branch: ${node.properties.branch || 'main'})`,
              });
            } else if (img) {
              sendProgress({ type: 'log', message: `Source: image ${img}` });
            } else {
              sendProgress({
                type: 'log',
                message: `Warning: No image or repository configured for ${node.name}`,
              });
            }
          }

          sendProgress({
            type: 'progress',
            progress,
            resource: node.name,
            message:
              action === 'update'
                ? DEPLOY_PROGRESS.UPDATING_RESOURCE(node.name, node.type)
                : DEPLOY_PROGRESS.CREATING_RESOURCE(node.name, node.type),
          });

          try {
            let result;
            if (action === 'update' && prior?.provider_id) {
              result = await deployer.update(
                node.type,
                node.name,
                prior.provider_id,
                node.properties,
                prior.properties ?? {},
                { region: options.region }
              );
            } else {
              result = await deployer.create(node.type, node.name, node.properties, {
                region: options.region,
              });
            }

            results.push({
              name: node.name,
              type: node.type,
              action,
              success: result.success,
              error: result.error,
              api_enable_url: result.api_enable_url,
              provider_id: result.provider_id,
              outputs: result.outputs,
              duration_ms: result.duration_ms,
              source_node_id: node.labels?.['ice-source-id'],
            });

            sendProgress({
              type: 'resource_result',
              result: results[results.length - 1],
            });

            if (result.success) {
              // Cloud Run services: set IAM policy to allow unauthenticated access.
              // Done here (not in handler) because the handler's REST client silently
              // fails and we need direct access to the auth client for reliable REST calls.
              if (
                node.type === 'gcp.run.service' &&
                result.provider_id &&
                node.properties.allow_unauthenticated !== false
              ) {
                try {
                  const iamUrl = `https://run.googleapis.com/v2/${result.provider_id}:setIamPolicy`;
                  sendProgress({
                    type: 'log',
                    message: `Setting public access on ${node.name}...`,
                  });
                  await authCheck.client.request({
                    url: iamUrl,
                    method: 'POST',
                    data: {
                      policy: {
                        bindings: [{ role: 'roles/run.invoker', members: ['allUsers'] }],
                      },
                    },
                    headers: { 'Content-Type': 'application/json' },
                  });
                  sendProgress({ type: 'log', message: `Public access enabled for ${node.name}` });
                } catch (iamErr: any) {
                  sendProgress({
                    type: 'log',
                    message: `Warning: Could not set public access on ${node.name}: ${iamErr.message || iamErr}`,
                  });
                }
              }

              sendProgress({
                type: 'log',
                message:
                  action === 'update'
                    ? DEPLOY_PROGRESS.UPDATED_RESOURCE(
                        node.name,
                        node.type,
                        ((result.duration_ms || 0) / 1000).toFixed(1)
                      )
                    : DEPLOY_PROGRESS.CREATED_RESOURCE(
                        node.name,
                        node.type,
                        ((result.duration_ms || 0) / 1000).toFixed(1)
                      ),
              });

              // Log the deployed URL if available (Cloud Run services)
              if (result.outputs?.url) {
                sendProgress({ type: 'log', message: `${result.outputs.url}` });
              }

              // Persist to state store immediately after success
              if (adapter) {
                try {
                  await sync_resource_results_to_state(
                    adapter,
                    [
                      {
                        resource_id: node.id,
                        name: node.name,
                        type: node.type,
                        action,
                        success: true,
                        provider_id: result.provider_id,
                        outputs: result.outputs,
                        duration_ms: result.duration_ms ?? 0,
                      },
                    ],
                    cardId
                  );
                } catch (stateErr: any) {
                  console.error(`Failed to persist state for ${node.name}:`, stateErr);
                }
              }
            } else {
              // Detect API-not-enabled errors and set api_enable_url on the result
              const lastResult = results[results.length - 1];
              if (
                lastResult &&
                !lastResult.api_enable_url &&
                result.error &&
                isApiNotEnabledError(result.error)
              ) {
                const directUrl = extractApiEnableUrl(result.error);
                if (directUrl) {
                  lastResult.api_enable_url = directUrl;
                } else {
                  const apiName = extractApiName(result.error);
                  if (apiName) {
                    lastResult.api_enable_url = buildApiEnableUrl(
                      apiName,
                      options.gcpProject || ''
                    );
                  }
                }
              }

              sendProgress({
                type: 'log',
                message: DEPLOY_PROGRESS.FAILED_TO_ACTION(
                  action,
                  node.name,
                  result.error || 'Unknown error'
                ),
              });
            }
          } catch (err: any) {
            results.push({
              name: node.name,
              type: node.type,
              action,
              success: false,
              error: err.message || String(err),
            });
          }

          completed++;
        }

        // Handle deletes: resources in prior state but not in current graph
        for (const [name, entry] of priorState) {
          if (!currentNames.has(name) && entry.provider_id) {
            const progress = 90 + Math.round((completed / (totalResources + 1)) * 5);

            sendProgress({
              type: 'progress',
              progress,
              resource: name,
              message: DEPLOY_PROGRESS.DELETING_RESOURCE(name, entry.ice_type),
            });

            try {
              const result = await deployer.delete(entry.ice_type, name, entry.provider_id, {
                region: options.region,
              });

              results.push({
                name,
                type: entry.ice_type,
                action: 'delete',
                success: result.success,
                error: result.error,
                provider_id: entry.provider_id,
                duration_ms: result.duration_ms,
              });

              if (result.success) {
                if (adapter) {
                  try {
                    await adapter.delete_resource(`${entry.ice_type}:${name}`);
                  } catch (stateErr: any) {
                    console.error(`Failed to remove state for ${name}:`, stateErr);
                  }
                }
                sendProgress({
                  type: 'log',
                  message: DEPLOY_PROGRESS.DELETED_RESOURCE(
                    name,
                    entry.ice_type,
                    ((result.duration_ms || 0) / 1000).toFixed(1)
                  ),
                });
              } else {
                sendProgress({
                  type: 'log',
                  message: DEPLOY_PROGRESS.FAILED_TO_DELETE(name, result.error || 'Unknown error'),
                });
              }
            } catch (err: any) {
              results.push({
                name,
                type: entry.ice_type,
                action: 'delete',
                success: false,
                error: err.message || String(err),
              });
            }
          }
        }

        await deployer.cleanup();

        // Save deployment record
        if (store)
          try {
            const successCount = results.filter((r) => r?.success).length;
            const failureCount = results.filter((r) => !r?.success).length;
            await store.save_deployment({
              id: `deploy-${Date.now()}` as any,
              graph_id: cardId,
              status: failureCount === 0 ? 'succeeded' : 'failed',
              started_at: new Date(start).toISOString(),
              completed_at: new Date().toISOString(),
              resource_count: results.length,
              success_count: successCount,
              failure_count: failureCount,
              version: 1,
            });
          } catch (recordErr: any) {
            console.error('Failed to save deployment record:', recordErr);
          }

        const duration_ms = Date.now() - start;
        const allSuccess = results.every((r) => r?.success);

        sendProgress({
          type: 'progress',
          progress: 100,
          resource: '',
          message: DEPLOY_PROGRESS.DEPLOYMENT_COMPLETED(
            allSuccess,
            (duration_ms / 1000).toFixed(1)
          ),
        });

        return {
          success: allSuccess,
          results: results as ApplyResult['results'],
          duration_ms,
          error: allSuccess ? undefined : DEPLOY_PROGRESS.SOME_RESOURCES_FAILED,
        };
      } catch (err: any) {
        console.error('Deploy apply error:', err);
        return {
          success: false,
          error: err.message || String(err),
          duration_ms: Date.now() - start,
        };
      }
    }
  );

  // ── deploy:destroy ──────────────────────────────────────────────────
  ipcMain.handle(
    'deploy:destroy',
    async (_event, _cardId: string, _options: DeployRequestOptions) => {
      try {
        sendProgress({ type: 'log', message: MAIN_IPC_ERRORS.DESTROY_NOT_IMPLEMENTED_LOG });
        return { success: false, error: MAIN_IPC_ERRORS.DESTROY_NOT_IMPLEMENTED };
      } catch (err: any) {
        return { success: false, error: err.message || String(err) };
      }
    }
  );

  // ── deploy:getStatus ────────────────────────────────────────────────
  ipcMain.handle('deploy:getStatus', async (_event, deploymentId: string) => {
    return { status: 'unknown', deploymentId };
  });

  // ── deploy:getResources ─────────────────────────────────────────────
  ipcMain.handle('deploy:getResources', async (_event, cardId: string) => {
    try {
      const store = await getStateStore();
      if (!store) {
        return { success: true, resources: [] };
      }

      const result = await store.get_resources(cardId);
      if (!result.ok) {
        return { success: false, error: result.error.message, resources: [] };
      }

      const resources = result.value.map((r) => ({
        node_id: r.node_id,
        name: r.name,
        type: r.ice_type,
        provider_id: r.state.cloud_id || undefined,
        status: r.state.status,
        outputs: r.state.outputs,
        deployed_at: r.updated_at,
      }));

      return { success: true, resources };
    } catch (err: any) {
      return { success: false, error: err.message || String(err), resources: [] };
    }
  });

  // ── deploy:openExternal ──────────────────────────────────────────
  // Opens a URL in the user's default browser (for GCP Console links, etc.)
  ipcMain.handle('deploy:openExternal', async (_event, url: string) => {
    try {
      // Only allow known-safe URL patterns (GCP Console, Google APIs)
      if (ALLOWED_EXTERNAL_URL_PREFIXES.some((prefix) => url.startsWith(prefix))) {
        await shell.openExternal(url);
        return { success: true };
      }
      return { success: false, error: IPC_ERRORS.URL_NOT_ALLOWED };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  // ── deploy:getDeployments ───────────────────────────────────────────
  ipcMain.handle('deploy:getDeployments', async (_event, cardId: string) => {
    try {
      const store = await getStateStore();
      if (!store) {
        return { success: true, deployments: [] };
      }

      const result = await store.get_deployments(cardId);
      if (!result.ok) {
        return { success: false, error: result.error.message, deployments: [] };
      }

      return { success: true, deployments: result.value };
    } catch (err: any) {
      return { success: false, error: err.message || String(err), deployments: [] };
    }
  });
}
