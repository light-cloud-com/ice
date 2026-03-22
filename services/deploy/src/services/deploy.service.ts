/**
 * Deploy Service — Real deployment using @ice/core deployers
 *
 * Translates canvas card nodes → deployable graph → cloud provisioning.
 * Uses user's own cloud credentials (not Light Cloud's).
 */

import prisma from '@ice/db';
import { emitDeployProgress } from '@ice/shared';
import * as providerService from '@ice/service-credentials';
import fs from 'fs';

/** Clean up a specific temp credentials file */
function cleanupTempCredentialsFile(filePath: string | undefined) {
  if (filePath && filePath.includes('ice-sa-')) {
    try { fs.unlinkSync(filePath); } catch {}
  }
}

// Dynamic imports for core engine (ESM) — resolved from workspace
async function getCoreEngine(): Promise<any> {
  // @ts-ignore — resolved at runtime via pnpm workspace
  return import('@ice/core');
}

export async function planDeployment(
  cardId: string,
  nodes: any[],
  edges: any[],
  options: any,
  userId?: string,
) {
  try {
    const core = await getCoreEngine();
    const { translate_card_to_graph } = core;

    const translation = translate_card_to_graph({
      nodes: nodes.map((n: any) => ({
        id: n.id,
        type: n.type || 'block',
        data: n.data || {},
      })),
      edges: edges.map((e: any) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        data: e.data,
      })),
      provider: options.provider || 'gcp',
      projectName: options.projectName || 'untitled',
      environment: options.environment || 'development',
      gcpProject: options.gcpProject,
      region: options.region || 'us-central1',
    });

    const plan = {
      creates: translation.deployable_count || 0,
      deployable_count: translation.deployable_count,
      skipped: translation.skipped || [],
      warnings: translation.warnings || [],
      graph_summary: {
        nodes: translation.graph?.nodes?.length || translation.graph?.get_nodes?.()?.length || 0,
        edges: translation.graph?.edges?.length || translation.graph?.get_edges?.()?.length || 0,
      },
    };

    const deployment = await prisma.canvasDeployment.create({
      data: {
        card_id: cardId,
        user_id: userId,
        status: 'planned',
        provider: options.provider || 'gcp',
        region: options.region || 'us-central1',
        environment: options.environment || 'development',
        plan: plan as any,
      },
    });

    return { success: true, plan, deploymentId: deployment.id };
  } catch (err: any) {
    // Fallback to basic plan if core engine translation fails
    console.error('Core engine plan error, falling back:', err.message);
    return fallbackPlan(cardId, nodes, edges, options, userId);
  }
}

async function fallbackPlan(
  cardId: string,
  nodes: any[],
  edges: any[],
  options: any,
  userId?: string,
) {
  const deployableNodes = (nodes || []).filter(
    (n: any) => n.type === 'resource' && n.data?.provider === (options?.provider || 'gcp')
  );

  const plan = {
    creates: deployableNodes.length,
    deployable_count: deployableNodes.length,
    skipped: (nodes || [])
      .filter((n: any) => n.type === 'resource' && n.data?.provider !== (options?.provider || 'gcp'))
      .map((n: any) => ({
        nodeId: n.id,
        label: n.data?.label || n.id,
        reason: 'Non-matching provider',
      })),
    warnings: [],
    graph_summary: { nodes: deployableNodes.length, edges: (edges || []).length },
  };

  const deployment = await prisma.canvasDeployment.create({
    data: {
      card_id: cardId,
      user_id: userId,
      status: 'planned',
      provider: options?.provider || 'gcp',
      region: options?.region || 'us-central1',
      environment: options?.environment || 'development',
      plan: plan as any,
    },
  });

  return { success: true, plan, deploymentId: deployment.id };
}

export async function applyDeployment(
  cardId: string,
  nodes: any[],
  edges: any[],
  options: any,
  orgId: string,
  userId?: string,
) {
  // 1. Get user's provider credentials
  const credentials = await providerService.getDecryptedCredentials(orgId, options.provider || 'gcp');
  if (!credentials) {
    throw new Error('Provider not connected. Please connect your cloud provider first.');
  }

  // 2. Create deployment record
  const deployment = await prisma.canvasDeployment.create({
    data: {
      card_id: cardId,
      user_id: userId,
      status: 'deploying',
      provider: options.provider || 'gcp',
      region: options.region || 'us-central1',
      environment: options.environment || 'development',
    },
  });

  const startTime = Date.now();
  let tempCredentialsPath: string | undefined;

  emitDeployProgress(cardId, {
    type: 'log',
    message: `Starting deployment for card ${cardId}...`,
  });

  try {
    const core = await getCoreEngine();
    const { translate_card_to_graph, deploy_graph, GCPDeployer } = core;

    // 3. Translate card nodes to deployable graph
    const translation = translate_card_to_graph({
      nodes: nodes.map((n: any) => ({
        id: n.id,
        type: n.type || 'block',
        data: n.data || {},
      })),
      edges: edges.map((e: any) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        data: e.data,
      })),
      provider: options.provider || 'gcp',
      projectName: options.projectName || 'untitled',
      environment: options.environment || 'development',
      gcpProject: options.gcpProject || credentials.project_id,
      region: options.region || 'us-central1',
    });

    emitDeployProgress(cardId, {
      type: 'log',
      message: `Translated ${translation.deployable_count} resources for deployment`,
    });

    // 4. Create deployer with user's credentials
    let deployer: any;
    if (options.provider === 'aws') {
      const { AWSDeployer } = core;
      deployer = new AWSDeployer();
    } else if (options.provider === 'azure') {
      const { AzureDeployer } = core;
      deployer = new AzureDeployer();
    } else {
      deployer = new GCPDeployer();
    }

    // Build auth client based on credential type
    let authClient: any = credentials;
    if (credentials._auth_type === 'oauth') {
      // OAuth flow — use access token via OAuth2Client.
      // Note: Google Workspace accounts with RAPT policies may block OAuth deployments.
      // In that case, users should use a service account key instead.
      const accessToken = await providerService.getValidGCPAccessToken(orgId, credentials);
      if (!accessToken) {
        throw new Error(
          'GCP OAuth token expired. Please reconnect via Cloud Providers settings.\n' +
          'For Google Workspace accounts, we recommend using a Service Account Key instead.'
        );
      }

      const { OAuth2Client } = await import('google-auth-library');
      const oauthClient = new OAuth2Client();
      oauthClient.setCredentials({ access_token: accessToken });
      authClient = oauthClient;

      emitDeployProgress(cardId, {
        type: 'log',
        message: 'Authenticating via Google OAuth...',
      });
    } else {
      // Service account key flow — create a proper GoogleAuth client
      // AND set GOOGLE_APPLICATION_CREDENTIALS so SDK clients (Storage, Run, etc.)
      // also use the service account instead of ADC/gcloud credentials.
      const key = credentials.service_account_key || credentials.key;
      if (key) {
        try {
          const parsed = typeof key === 'string' ? JSON.parse(key) : key;
          const { GoogleAuth } = await import('google-auth-library');
          const auth = new GoogleAuth({
            credentials: parsed,
            scopes: ['https://www.googleapis.com/auth/cloud-platform'],
          });
          authClient = await auth.getClient();

          // Write temp credentials file for SDK clients
          const fsAsync = await import('fs');
          const os = await import('os');
          const path = await import('path');
          const tmpPath = path.join(os.tmpdir(), `ice-sa-${deployment.id}-${Date.now()}.json`);
          fsAsync.writeFileSync(tmpPath, typeof key === 'string' ? key : JSON.stringify(parsed));
          tempCredentialsPath = tmpPath;
          process.env.GOOGLE_APPLICATION_CREDENTIALS = tmpPath;

          emitDeployProgress(cardId, {
            type: 'log',
            message: 'Authenticating via Service Account...',
          });
        } catch (err: any) {
          throw new Error(`Invalid service account key: ${err.message}`);
        }
      }
    }

    // Auto-enable required GCP APIs before deploying
    const gcpProject = options.gcpProject || credentials.project_id || authClient.project_id;
    if ((options.provider || 'gcp') === 'gcp') {
      let accessToken: string | null = null;
      if (credentials._auth_type === 'oauth') {
        accessToken = await providerService.getValidGCPAccessToken(orgId, credentials);
      } else if (authClient?.getAccessToken) {
        // Service account — get token from the auth client
        try {
          const tokenRes = await authClient.getAccessToken();
          accessToken = tokenRes?.token || tokenRes?.access_token || null;
          console.log('SA access token obtained:', !!accessToken);
        } catch (err: any) {
          console.error('Failed to get SA access token for auto-enable:', err.message);
        }
      }
      console.log('Auto-enable: project=', gcpProject, 'hasToken=', !!accessToken);
      if (accessToken) {
        await autoEnableGCPApis(gcpProject, accessToken, nodes, (msg: string) => {
          emitDeployProgress(cardId, { type: 'log', message: msg });
        });
      }
    }

    // 5. Build current state from the last successful deployment (if any).
    // This enables update/skip semantics — without it, every deploy is "create all".
    // @ts-ignore — resolved at runtime via pnpm workspace
    const { MutableGraph } = await import('@ice/core/graph');
    let currentGraph = new MutableGraph('current');

    const lastDeploy = await prisma.canvasDeployment.findFirst({
      where: { card_id: cardId, status: 'success' },
      orderBy: { created_at: 'desc' },
    });

    if (lastDeploy?.results) {
      const prevResults = lastDeploy.results as any;
      const prevResources = prevResults.resources || [];
      for (const res of prevResources) {
        if (res.success && res.resource_id) {
          try {
            currentGraph.add_node({
              name: res.name,
              type: res.type,
              properties: {
                ...res.outputs,
                provider_id: res.provider_id,
              },
            });
          } catch {
            // Ignore duplicate or invalid nodes
          }
        }
      }
      emitDeployProgress(cardId, {
        type: 'log',
        message: `Found ${prevResources.filter((r: any) => r.success).length} existing resource(s) from previous deployment`,
      });
    }

    // Log diff for debugging
    const desiredNodes = translation.graph?.nodes?.values ? [...translation.graph.nodes.values()] : [];
    const currentNodes = currentGraph?.nodes?.values ? [...currentGraph.nodes.values()] : [];
    console.log(`Diff: desired=${desiredNodes.length} nodes, current=${currentNodes.length} nodes`);
    console.log('Desired:', desiredNodes.map((n: any) => `${n.type}::${n.name}`));
    console.log('Current:', currentNodes.map((n: any) => `${n.type}::${n.name}`));

    // Track progress across resources
    const totalResources = translation.deployable_count || 1;
    let completedResources = 0;

    const result = await deploy_graph(translation.graph, currentGraph, deployer, {
      provider: options.provider || 'gcp',
      project: gcpProject,
      regions: [options.region || 'us-central1'],
      continue_on_error: true,
      auth_client: authClient,
      on_progress: (resource: string, action: string, status: string) => {
        if (status === 'completed' || status === 'failed') {
          completedResources++;
        }
        const progress = Math.min(Math.round((completedResources / totalResources) * 100), 99);
        emitDeployProgress(cardId, {
          type: 'progress',
          progress,
          resource,
          message: `${action} ${resource}: ${status}`,
        });
      },
      on_log: (message: string) => {
        emitDeployProgress(cardId, { type: 'log', message });
      },
      on_resource_result: (resourceResult: any) => {
        // Find the source canvas node for this resource
        const sourceNode = nodes.find((n: any) =>
          resourceResult.resource_id?.includes(n.id) ||
          resourceResult.name?.includes(n.id?.split('-').slice(0, -1).join('-'))
        );
        emitDeployProgress(cardId, {
          type: 'resource_result',
          result: {
            ...resourceResult,
            source_node_id: sourceNode?.id,
          },
        });
      },
    });

    // Post-process results:
    // - NOT_FOUND on delete → treat as success (already gone)
    // - ALREADY_EXISTS on create → treat as success (already exists)
    if (result.resources?.length > 0) {
      for (const res of result.resources) {
        if (!res.success && res.error) {
          if (res.action === 'delete' && res.error.includes('NOT_FOUND')) {
            res.success = true;
            res.error = undefined;
            emitDeployProgress(cardId, {
              type: 'log',
              message: `${res.name}: already deleted (NOT_FOUND) — marking as removed`,
            });
          } else if (res.action === 'create' && res.error.includes('ALREADY_EXISTS')) {
            res.success = true;
            res.error = undefined;
            res.action = 'no_change';
            emitDeployProgress(cardId, {
              type: 'log',
              message: `${res.name}: already exists — skipping`,
            });
          }
        }
      }
      // Recalculate success
      result.success = result.resources.every((r: any) => r.success);
      if (result.summary) {
        result.summary.failed = result.resources.filter((r: any) => !r.success).length;
      }
    }

    const durationMs = Date.now() - startTime;

    // 6. Emit individual resource results (if on_resource_result wasn't called by core)
    if (result.resources?.length > 0) {
      for (const res of result.resources) {
        // Find source canvas node by matching resource name/id to node id or label
        const sourceNode = nodes.find((n: any) => {
          if (n.type !== 'resource') return false;
          const nodeId = (n.id || '').toLowerCase();
          const label = (n.data?.label || '').toLowerCase().replace(/\s+/g, '-');
          const resName = (res.name || '').toLowerCase();
          const resId = (res.resource_id || '').toLowerCase();
          // Match: resource name starts with label, or contains node id
          return (label && resName.startsWith(label))
            || (label && resId.startsWith(label))
            || resName.includes(nodeId)
            || resId.includes(nodeId);
        });
        console.log(`Resource result: ${res.name} → matched node: ${sourceNode?.id || 'NONE'} (label: ${sourceNode?.data?.label || '-'})`);
        emitDeployProgress(cardId, {
          type: 'resource_result',
          result: {
            ...res,
            source_node_id: sourceNode?.id,
          },
        });
      }
    }

    // Update deployment record
    await prisma.canvasDeployment.update({
      where: { id: deployment.id },
      data: {
        status: result.success ? 'success' : 'failed',
        results: result as any,
        duration_ms: durationMs,
        error: result.errors?.length > 0 ? result.errors.map((e: any) => e.message).join('; ') : null,
      },
    });

    await deployer.cleanup();

    // Build a meaningful error message from results
    let errorMsg: string | null = null;
    if (!result.success) {
      const resourceErrors = (result.resources || [])
        .filter((r: any) => !r.success && r.error)
        .map((r: any) => r.error);
      const topLevelErrors = (result.errors || [])
        .map((e: any) => e.message || e.error || String(e));
      const allErrors = [...topLevelErrors, ...resourceErrors];
      errorMsg = allErrors.length > 0 ? allErrors.join('; ') : 'Deployment failed — check resource configuration';
    }

    if (!result.success) {
      console.error('Deploy result (not success):', JSON.stringify(result, null, 2));
    }

    // Emit completion with full results
    emitDeployProgress(cardId, {
      type: 'complete',
      success: result.success,
      results: result,
      duration_ms: durationMs,
    });

    return {
      success: result.success,
      deploymentId: deployment.id,
      duration_ms: durationMs,
      error: errorMsg,
      result,
    };
  } catch (err: any) {
    console.error('Deploy error:', err.message, err.stack);

    const durationMs = Date.now() - startTime;

    await prisma.canvasDeployment.update({
      where: { id: deployment.id },
      data: {
        status: 'failed',
        duration_ms: durationMs,
        error: err.message,
      },
    });

    emitDeployProgress(cardId, {
      type: 'complete',
      success: false,
      results: { error: err.message },
    });

    return { success: false, deploymentId: deployment.id, duration_ms: durationMs, error: err.message };
  } finally {
    // Always clean up temp credentials file, even on crash
    cleanupTempCredentialsFile(tempCredentialsPath);
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS === tempCredentialsPath) {
      delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    }
  }
}

export async function destroyDeployment(cardId: string, orgId: string, userId?: string) {
  // Find latest successful deployment
  const deployment = await prisma.canvasDeployment.findFirst({
    where: { card_id: cardId, status: 'success' },
    orderBy: { created_at: 'desc' },
  });

  if (!deployment || !deployment.results) {
    throw new Error('No successful deployment found to destroy');
  }

  const provider = deployment.provider || 'gcp';
  const credentials = await providerService.getDecryptedCredentials(orgId, provider);
  if (!credentials) {
    throw new Error('Provider not connected');
  }

  // Create destroy record
  const destroyRecord = await prisma.canvasDeployment.create({
    data: {
      card_id: cardId,
      user_id: userId,
      status: 'deploying',
      provider,
      region: deployment.region,
      environment: deployment.environment,
    },
  });

  const startTime = Date.now();
  let tempCredentialsPath: string | undefined;

  emitDeployProgress(cardId, {
    type: 'log',
    message: `Starting destroy for card ${cardId}...`,
  });

  try {
    const core = await getCoreEngine();
    const { GCPDeployer, AWSDeployer, AzureDeployer } = core;

    let deployer: any;
    if (provider === 'aws') {
      deployer = new AWSDeployer();
    } else if (provider === 'azure') {
      deployer = new AzureDeployer();
    } else {
      deployer = new GCPDeployer();
    }

    let authClient: any = credentials;
    if (credentials._auth_type === 'oauth') {
      const accessToken = await providerService.getValidGCPAccessToken(orgId, credentials);
      if (!accessToken) {
        throw new Error(
          'GCP OAuth token expired. Please reconnect via Cloud Providers settings.\n' +
          'For Google Workspace accounts, we recommend using a Service Account Key instead.'
        );
      }
      const { OAuth2Client } = await import('google-auth-library');
      const oauthClient = new OAuth2Client();
      oauthClient.setCredentials({ access_token: accessToken });
      authClient = oauthClient;
    } else {
      const key = credentials.service_account_key || credentials.key;
      if (key) {
        try {
          const parsed = typeof key === 'string' ? JSON.parse(key) : key;
          const { GoogleAuth } = await import('google-auth-library');
          const auth = new GoogleAuth({
            credentials: parsed,
            scopes: ['https://www.googleapis.com/auth/cloud-platform'],
          });
          authClient = await auth.getClient();

          // Write temp credentials file for SDK clients
          const os = await import('os');
          const path = await import('path');
          const tmpPath = path.join(os.tmpdir(), `ice-sa-${destroyRecord.id}-${Date.now()}.json`);
          fs.writeFileSync(tmpPath, typeof key === 'string' ? key : JSON.stringify(parsed));
          tempCredentialsPath = tmpPath;
          process.env.GOOGLE_APPLICATION_CREDENTIALS = tmpPath;
        } catch (err: any) {
          throw new Error(`Invalid service account key: ${err.message}`);
        }
      }
    }

    await deployer.initialize({
      provider,
      project: credentials.project_id || authClient.project_id,
      regions: [deployment.region],
      continue_on_error: true,
      on_progress: (resource: string, action: string, status: string) => {
        emitDeployProgress(cardId, { type: 'progress', resource, action, status });
      },
      on_log: (message: string) => {
        emitDeployProgress(cardId, { type: 'log', message });
      },
      auth_client: authClient,
    });

    // Delete each resource from the previous deployment results
    const results = deployment.results as any;
    const resources = results.resources || [];
    const deleteResults: any[] = [];

    for (const res of resources) {
      if (res.success && res.provider_id) {
        try {
          const deleteResult = await deployer.delete(res.type, res.name, res.provider_id, {
            provider,
            project: credentials.project_id || authClient.project_id,
          });
          deleteResults.push(deleteResult);
          emitDeployProgress(cardId, {
            type: 'progress',
            resource: res.name,
            action: 'delete',
            status: deleteResult.success ? 'completed' : 'failed',
          });
        } catch (err: any) {
          deleteResults.push({ resource_id: res.resource_id, success: false, error: err.message });
          emitDeployProgress(cardId, {
            type: 'log',
            message: `Failed to delete ${res.name}: ${err.message}`,
          });
        }
      }
    }

    await deployer.cleanup();

    const durationMs = Date.now() - startTime;
    const allSuccess = deleteResults.every((r: any) => r.success);

    await prisma.canvasDeployment.update({
      where: { id: destroyRecord.id },
      data: {
        status: allSuccess ? 'success' : 'failed',
        results: { action: 'destroy', resources: deleteResults } as any,
        duration_ms: durationMs,
      },
    });

    emitDeployProgress(cardId, {
      type: 'complete',
      success: allSuccess,
    });

    return { success: allSuccess, deploymentId: destroyRecord.id, duration_ms: durationMs };
  } catch (err: any) {
    const durationMs = Date.now() - startTime;

    await prisma.canvasDeployment.update({
      where: { id: destroyRecord.id },
      data: {
        status: 'failed',
        duration_ms: durationMs,
        error: err.message,
      },
    });

    emitDeployProgress(cardId, {
      type: 'complete',
      success: false,
      results: { error: err.message },
    });

    return { success: false, deploymentId: destroyRecord.id, error: err.message };
  } finally {
    // BE-12: Always clean up temp credentials file
    cleanupTempCredentialsFile(tempCredentialsPath);
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS === tempCredentialsPath) {
      delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    }
  }
}

export async function getDeploymentStatus(deploymentId: string) {
  return prisma.canvasDeployment.findUnique({ where: { id: deploymentId } });
}

export async function getDeployedResources(cardId: string) {
  const deployment = await prisma.canvasDeployment.findFirst({
    where: { card_id: cardId, status: 'success' },
    orderBy: { created_at: 'desc' },
  });
  return deployment?.results || [];
}

export async function getDeploymentHistory(cardId: string) {
  return prisma.canvasDeployment.findMany({
    where: { card_id: cardId },
    orderBy: { created_at: 'desc' },
    take: 20,
  });
}

// ── GCP API Auto-Enable ──────────────────────────────────────────────────────

/** Map resource types to required GCP APIs */
const RESOURCE_API_MAP: Record<string, string[]> = {
  'gcp.run.service': ['run.googleapis.com', 'artifactregistry.googleapis.com', 'cloudbuild.googleapis.com'],
  'gcp.run.job': ['run.googleapis.com', 'artifactregistry.googleapis.com', 'cloudbuild.googleapis.com'],
  'gcp.storage.bucket': ['storage.googleapis.com'],
  'gcp.cloudfunctions.function': ['cloudfunctions.googleapis.com', 'cloudbuild.googleapis.com', 'artifactregistry.googleapis.com'],
  'gcp.pubsub.topic': ['pubsub.googleapis.com'],
  'gcp.pubsub.subscription': ['pubsub.googleapis.com'],
  'gcp.secretmanager.secret': ['secretmanager.googleapis.com'],
  'gcp.bigquery.dataset': ['bigquery.googleapis.com'],
  'gcp.firestore.database': ['firestore.googleapis.com'],
  'gcp.sql.instance': ['sqladmin.googleapis.com'],
  'gcp.redis.instance': ['redis.googleapis.com'],
  'gcp.scheduler.job': ['cloudscheduler.googleapis.com'],
  'gcp.logging.sink': ['logging.googleapis.com'],
  'gcp.compute.instance': ['compute.googleapis.com'],
  'gcp.container.cluster': ['container.googleapis.com'],
  'gcp.aiplatform.endpoint': ['aiplatform.googleapis.com'],
};

/** Always enable these APIs for any GCP deployment */
const BASE_APIS = ['serviceusage.googleapis.com', 'cloudresourcemanager.googleapis.com'];

async function autoEnableGCPApis(
  project: string,
  accessToken: string,
  canvasNodes: any[],
  log: (msg: string) => void,
) {
  // Collect required APIs from the actual canvas resource nodes
  console.log('autoEnableGCPApis called, nodes:', canvasNodes.length, 'node types:', canvasNodes.map((n: any) => `${n.data?.iceType}|${n.data?.resourceId}|${n.data?.blockTypeName}`));
  const requiredApis = new Set<string>(BASE_APIS);

  for (const node of canvasNodes) {
    if (node.type !== 'resource') continue;
    // Try to match the resource type against our API map
    const resourceId = node.data?.resourceId || '';
    const iceType = node.data?.iceType || '';
    const blockType = node.data?.blockTypeName || '';

    // Match by resource ID patterns, iceType, or blockType
    for (const [pattern, apis] of Object.entries(RESOURCE_API_MAP)) {
      const parts = pattern.split('.');
      const service = parts[1] || ''; // e.g. 'run', 'storage', 'pubsub'
      if (
        resourceId.includes(service) ||
        iceType.toLowerCase().includes(service) ||
        blockType.toLowerCase().includes(service) ||
        // Also check for broader matches
        (service === 'run' && (iceType.includes('Container') || blockType.includes('Service') || resourceId.includes('container'))) ||
        (service === 'storage' && (iceType.includes('Storage') || blockType.includes('Static') || blockType.includes('Bucket') || resourceId.includes('static'))) ||
        (service === 'cloudfunctions' && (iceType.includes('Function') || blockType.includes('Function'))) ||
        (service === 'pubsub' && (iceType.includes('PubSub') || iceType.includes('Messaging'))) ||
        (service === 'sql' && (iceType.includes('SQL') || iceType.includes('PostgreSQL') || iceType.includes('MySQL'))) ||
        (service === 'redis' && iceType.includes('Redis')) ||
        (service === 'secretmanager' && iceType.includes('Secret')) ||
        (service === 'bigquery' && iceType.includes('BigQuery')) ||
        (service === 'firestore' && iceType.includes('Firestore')) ||
        (service === 'scheduler' && iceType.includes('Scheduler'))
      ) {
        apis.forEach((api) => requiredApis.add(api));
      }
    }
  }

  console.log('Required APIs:', [...requiredApis]);

  // Check which APIs are already enabled
  let enabledApis: Set<string>;
  try {
    const res = await fetch(
      `https://serviceusage.googleapis.com/v1/projects/${project}/services?filter=state:ENABLED&pageSize=200`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) {
      const errText = await res.text();
      console.error('Service Usage API error:', res.status, errText);
      log(`Warning: Could not check enabled APIs (${res.status}). Will try deploying anyway.`);
      return;
    }
    const data = await res.json() as { services?: Array<{ config?: { name: string } }> };
    enabledApis = new Set(
      (data.services || []).map((s) => s.config?.name || '').filter(Boolean)
    );
    console.log('Enabled APIs count:', enabledApis.size);
  } catch (err: any) {
    console.error('Service Usage API fetch error:', err.message);
    return; // Non-fatal
  }

  const toEnable = [...requiredApis].filter((api) => !enabledApis.has(api));
  console.log('APIs to enable:', toEnable);
  if (toEnable.length === 0) {
    console.log('All required APIs already enabled');
    log('All required GCP APIs are enabled');
    return;
  }

  console.log('Enabling APIs:', toEnable);
  log(`Enabling ${toEnable.length} required GCP API(s): ${toEnable.join(', ')}`);

  // Enable APIs in parallel (batch)
  const enablePromises = toEnable.map(async (api) => {
    try {
      const res = await fetch(
        `https://serviceusage.googleapis.com/v1/projects/${project}/services/${api}:enable`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: '{}',
        },
      );
      const responseText = await res.text();
      console.log(`Enable ${api}: status=${res.status}`, responseText.slice(0, 200));
      if (res.ok) {
        log(`  Enabled ${api}`);
        return true;
      }
      // Detect billing errors and provide clear message
      if (responseText.includes('Billing account') || responseText.includes('billing')) {
        log(`  Cannot enable ${api}: Billing is not enabled for this project. Link a billing account at https://console.cloud.google.com/billing/linkedaccount?project=${project}`);
      } else {
        log(`  Failed to enable ${api}: ${responseText.slice(0, 200)}`);
      }
      return false;
    } catch (err: any) {
      console.error(`Enable ${api} error:`, err.message);
      log(`  Failed to enable ${api}: ${err.message}`);
      return false;
    }
  });

  const results = await Promise.all(enablePromises);
  const succeeded = results.filter(Boolean).length;

  if (succeeded > 0 && succeeded < toEnable.length) {
    log(`Enabled ${succeeded}/${toEnable.length} APIs. Some may need manual enabling.`);
  } else if (succeeded === toEnable.length) {
    // Wait a moment for APIs to propagate
    log('All APIs enabled. Waiting for propagation...');
    await new Promise((r) => setTimeout(r, 5000));
  }
}
