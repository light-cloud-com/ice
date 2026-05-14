/**
 * Drift detection — extracted from deploy.service.ts in rf-deploy-16.
 *
 * `checkDrift` keeps the same public signature; the orchestrator
 * (`deploy.service.ts`) re-exports this symbol so the package barrel
 * (`services/deploy/src/index.ts`'s `export *`) and existing test
 * imports continue to resolve unchanged.
 */

import prisma from '@ice/db';
import * as providerService from '@ice/service-credentials';
import { resolveProviderAuth, cleanupProviderAuth } from '../providers/registry';
import { createDeployer } from './deployer-factory';

/**
 * Phase 7 — real drift detection.
 *
 * Compares the canvas desired state against *actual* GCP state by calling
 * each handler's `describe` method. This catches drift that the old
 * stored-vs-canvas comparison missed entirely (e.g., someone deleted a
 * bucket in the console — the old check would report in_sync because the
 * stored record still showed it as deployed).
 *
 * Sources of truth:
 *   - Mapping table (`DeployedResourceMapping`): the node_id → resource_name
 *     contract that survived Phase 1.
 *   - GCP `describe` calls: the real cloud state.
 *   - Canvas desired state: what the user wants right now.
 */
export async function checkDrift(cardId: string, nodes: any[], options?: { environment?: string; orgId?: string }) {
  const environment = options?.environment || 'development';

  const mapping = await prisma.deployedResourceMapping.findMany({
    where: { card_id: cardId, environment },
  });
  if (mapping.length === 0) {
    return { driftResults: [], checkedAt: new Date().toISOString(), unsupported: false };
  }

  // If we have an org id, spin up a real deployer so describe calls can hit GCP.
  // Without one, we fall back to stored-state comparison which is still better
  // than nothing for sanity checking canvas consistency.
  const canQueryGcp = Boolean(options?.orgId);
  let deployer: any = null;
  let driftScopedAuth: any = null;
  if (canQueryGcp) {
    try {
      const credentials = await providerService.getDecryptedCredentials(options!.orgId!, 'gcp');
      if (credentials) {
        deployer = await createDeployer('gcp');
        driftScopedAuth = await resolveProviderAuth('gcp', {
          orgId: options!.orgId!,
          credentials,
          requestedScope: { project: credentials.project_id },
        });
        await deployer.initialize({
          provider: 'gcp',
          project: driftScopedAuth.scope.project || (driftScopedAuth.authClient as any)?.projectId,
          regions: ['us-central1'],
          auth_client: driftScopedAuth.authClient,
          auth_credentials: driftScopedAuth.parsedCredentials,
          auth_key_file: driftScopedAuth.keyFilePath,
        });
      }
    } catch (err: any) {
      console.warn('[drift] failed to initialize deployer, falling back to stored-state drift:', err.message);
      deployer = null;
    }
  }

  const driftResults: Array<{
    nodeId: string;
    status: 'in_sync' | 'drifted' | 'missing' | 'extra' | 'unknown';
    changes: Array<{ path: string; desired: unknown; actual: unknown }>;
  }> = [];

  const canvasById = new Map<string, any>();
  for (const n of nodes) if (n.type === 'resource') canvasById.set(n.id, n);

  try {
    // 1. For every mapped (node_id → resource) entry, describe the real resource.
    for (const m of mapping) {
      const canvasNode = canvasById.get(m.node_id);

      if (deployer && typeof deployer.describe === 'function') {
        const desc = await deployer.describe(m.resource_type, m.resource_name, m.provider_id || m.resource_name);
        if (desc.supported === false) {
          driftResults.push({ nodeId: m.node_id, status: 'unknown', changes: [] });
          continue;
        }
        if (!desc.exists) {
          // Deleted externally — report as missing regardless of canvas state.
          driftResults.push({ nodeId: m.node_id, status: 'missing', changes: [] });
          continue;
        }

        // Compare desired (from canvas) vs actual (from GCP).
        const changes: Array<{ path: string; desired: unknown; actual: unknown }> = [];
        if (canvasNode) {
          const desiredProps = (canvasNode.data?.properties || {}) as Record<string, unknown>;
          const actualProps = (desc.properties || {}) as Record<string, unknown>;
          for (const [key, desiredVal] of Object.entries(desiredProps)) {
            if (key.startsWith('_') || desiredVal == null || desiredVal === '') continue;
            const actualVal = actualProps[key];
            if (actualVal === undefined) continue; // ICE doesn't manage this field for this type
            if (JSON.stringify(actualVal) !== JSON.stringify(desiredVal)) {
              changes.push({ path: key, desired: desiredVal, actual: actualVal });
            }
          }
        }
        driftResults.push({
          nodeId: m.node_id,
          status: changes.length > 0 ? 'drifted' : canvasNode ? 'in_sync' : 'extra',
          changes,
        });
      } else {
        // No GCP query available — fall back to "if canvas has it, call it in-sync".
        driftResults.push({
          nodeId: m.node_id,
          status: canvasNode ? 'in_sync' : 'extra',
          changes: [],
        });
      }
    }

    // 2. Canvas nodes with no mapping are new (never deployed).
    for (const [nodeId, node] of canvasById.entries()) {
      if (!node.data?.iceType) continue;
      if (!mapping.find((m) => m.node_id === nodeId)) {
        // Not yet deployed — report as unknown so the UI can show it distinctly.
        driftResults.push({ nodeId, status: 'unknown', changes: [] });
      }
    }
  } finally {
    if (deployer) {
      try {
        await deployer.cleanup();
      } catch {}
    }
    if (driftScopedAuth) {
      try {
        await cleanupProviderAuth('gcp', driftScopedAuth);
      } catch {}
    }
  }

  return { driftResults, checkedAt: new Date().toISOString(), unsupported: !deployer };
}
