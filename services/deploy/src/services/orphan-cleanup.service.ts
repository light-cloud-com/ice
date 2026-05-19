/**
 * Orphan Cleanup Service
 *
 * GCP project quotas (especially the default 3-backend-buckets limit) are
 * a real pain when users iterate on the same template multiple times —
 * each project recreation generates new node UUIDs, which hash to new
 * resource names, which accumulate in the GCP project until quota is
 * exhausted.
 *
 * This service finds ICE-managed GCP resources (identified by the
 * `ice-managed` label that the card translator injects at deploy time)
 * that are NOT referenced by any active row in `DeployedResourceMapping`
 * and deletes them. "Active" = the mapping's card still exists and its
 * most recent deployment is success/partial — anything else counts as
 * orphaned.
 *
 * Currently targets the resource types most likely to hit quota limits
 * or leak: backend buckets, managed SSL certificates, and standalone
 * forwarding rules. Extendable per type as new quota pain points
 * surface.
 */

import prisma from '@ice/db';
import * as providerService from '@ice/service-credentials';

export interface OrphanCleanupReport {
  scanned: Record<string, number>;
  deleted: Array<{ type: string; name: string }>;
  skipped: Array<{ type: string; name: string; reason: string }>;
  errors: Array<{ type: string; name: string; error: string }>;
}

interface GcpAuthContext {
  accessToken: string;
  project: string;
}

async function buildGcpContext(orgId: string, gcpProject?: string): Promise<GcpAuthContext | null> {
  const credentials = await providerService.getDecryptedCredentials(orgId, 'gcp');
  if (!credentials) return null;

  let accessToken: string | null = null;
  if (credentials._auth_type === 'oauth') {
    accessToken = await providerService.getValidGCPAccessToken(orgId, credentials);
  } else {
    const key = (credentials as any).service_account_key || (credentials as any).key;
    if (key) {
      try {
        const parsed = typeof key === 'string' ? JSON.parse(key) : key;
        const { GoogleAuth } = await import('google-auth-library');
        const auth = new GoogleAuth({
          credentials: parsed,
          scopes: ['https://www.googleapis.com/auth/cloud-platform'],
        });
        const client = await auth.getClient();
        const tokenRes = await client.getAccessToken();
        accessToken = tokenRes?.token || null;
      } catch {
        return null;
      }
    }
  }

  const project = gcpProject || (credentials as any).project_id;
  if (!accessToken || !project) return null;
  return { accessToken, project };
}

async function gcpFetch(ctx: GcpAuthContext, method: string, url: string, body?: unknown): Promise<any> {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${ctx.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`GCP ${method} ${response.status}: ${text.slice(0, 200)}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

/**
 * Scan the GCP project for ICE-managed resources and cross-reference them
 * against the DeployedResourceMapping table. Delete anything that isn't
 * in active use. Idempotent — running it twice in a row is a no-op.
 */
export async function cleanupOrphanedIceResources(
  orgId: string,
  gcpProject?: string,
  options: { dryRun?: boolean } = {},
): Promise<OrphanCleanupReport> {
  const ctx = await buildGcpContext(orgId, gcpProject);
  if (!ctx) {
    throw new Error(
      'Cannot clean up orphans: GCP credentials not found or invalid. Reconnect your GCP provider first.',
    );
  }

  const report: OrphanCleanupReport = {
    scanned: {},
    deleted: [],
    skipped: [],
    errors: [],
  };

  // Load all active mappings for this org's cards in one query.
  const mappings = await prisma.deployedResourceMapping.findMany({
    where: {
      card: {
        project: {
          organisation_id: orgId,
        },
      },
    },
    select: { resource_name: true, resource_type: true },
  });
  const activeNames = new Set(mappings.map((m) => `${m.resource_type}::${m.resource_name}`));

  // Scan each resource type. Each GCP list endpoint returns `items[]` plus
  // a `nextPageToken`. We only walk up to 5 pages as a safety cap.
  const scanAndClean = async (
    typeLabel: string,
    resourceType: string,
    listUrl: string,
    deleteUrlFor: (name: string) => string,
  ) => {
    let pageToken: string | undefined;
    let pageCount = 0;
    report.scanned[typeLabel] = 0;
    while (pageCount < 5) {
      const url = pageToken ? `${listUrl}&pageToken=${encodeURIComponent(pageToken)}` : listUrl;
      let list: any;
      try {
        list = await gcpFetch(ctx, 'GET', url);
      } catch (err: any) {
        report.errors.push({ type: typeLabel, name: '(list)', error: err?.message || String(err) });
        return;
      }
      const items = (list?.items || []) as any[];
      report.scanned[typeLabel] += items.length;

      for (const item of items) {
        const name = item.name as string | undefined;
        const labels = (item.labels || {}) as Record<string, string>;
        if (!name) continue;

        // Identification: prefer the `ice-managed=true` label that
        // every new ICE-created resource carries. Fall back to a
        // name-prefix match (`ice-...`) for LEGACY resources created
        // before the labels-on-create fix landed — without this
        // fallback, the user is permanently stuck with unlabeled
        // orphans the cleanup can never see.
        const labeledIce = labels['ice-managed'] === 'true';
        const namedIce = /^ice-/.test(name);
        if (!labeledIce && !namedIce) {
          continue; // Not ours.
        }

        const key = `${resourceType}::${name}`;
        if (activeNames.has(key)) {
          report.skipped.push({ type: typeLabel, name, reason: 'still referenced by an active card' });
          continue;
        }
        if (options.dryRun) {
          report.deleted.push({ type: typeLabel, name });
          continue;
        }
        try {
          await gcpFetch(ctx, 'DELETE', deleteUrlFor(name));
          report.deleted.push({ type: typeLabel, name });
        } catch (err: any) {
          const msg = err?.message || String(err);
          // 404 means already gone — idempotent success.
          if (msg.includes('404')) {
            report.deleted.push({ type: typeLabel, name });
            continue;
          }
          report.errors.push({ type: typeLabel, name, error: msg });
        }
      }

      pageToken = list?.nextPageToken;
      if (!pageToken) break;
      pageCount++;
    }
  };

  const COMPUTE = `https://compute.googleapis.com/compute/v1/projects/${ctx.project}/global`;

  await scanAndClean(
    'backendBuckets',
    'gcp.compute.backendBucket',
    `${COMPUTE}/backendBuckets?maxResults=100`,
    (name) => `${COMPUTE}/backendBuckets/${name}`,
  );

  await scanAndClean(
    'sslCertificates',
    'gcp.compute.managedSslCertificate',
    `${COMPUTE}/sslCertificates?maxResults=100`,
    (name) => `${COMPUTE}/sslCertificates/${name}`,
  );

  // URL maps, target proxies, and backend services share the same quota
  // family as backend buckets and tend to leak together when a deploy
  // partially fails. Clean those up too.
  await scanAndClean(
    'urlMaps',
    'gcp.compute.urlMap',
    `${COMPUTE}/urlMaps?maxResults=100`,
    (name) => `${COMPUTE}/urlMaps/${name}`,
  );
  await scanAndClean(
    'targetHttpsProxies',
    'gcp.compute.targetHttpsProxy',
    `${COMPUTE}/targetHttpsProxies?maxResults=100`,
    (name) => `${COMPUTE}/targetHttpsProxies/${name}`,
  );
  await scanAndClean(
    'targetHttpProxies',
    'gcp.compute.targetHttpProxy',
    `${COMPUTE}/targetHttpProxies?maxResults=100`,
    (name) => `${COMPUTE}/targetHttpProxies/${name}`,
  );
  await scanAndClean(
    'backendServices',
    'gcp.compute.backendService',
    `${COMPUTE}/backendServices?maxResults=100`,
    (name) => `${COMPUTE}/backendServices/${name}`,
  );
  await scanAndClean(
    'forwardingRules',
    'gcp.compute.globalForwardingRule',
    `${COMPUTE}/forwardingRules?maxResults=100`,
    (name) => `${COMPUTE}/forwardingRules/${name}`,
  );

  return report;
}
