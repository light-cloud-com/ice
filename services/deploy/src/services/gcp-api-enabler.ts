/**
 * GCP API Enabler — extracted in rf-deploy-6 from `deploy.service.ts`.
 *
 * Two responsibilities:
 *   - `enableGcpApi(project, apiName, accessToken)` — single-API enabler
 *     used by the google-verification requirement during Plan, BEFORE the
 *     deploy flow runs. Idempotent.
 *   - `autoEnableGCPApis(project, accessToken, canvasNodes, log)` — bulk
 *     enabler called by the apply path right after auth resolution; walks
 *     the canvas, derives the union of required APIs from
 *     `ICE_TYPE_API_MAP` (plus `BASE_APIS`), and enables anything not
 *     already on.
 *
 * The orchestrator re-exports `enableGcpApi` so legacy import paths
 * (`from './deploy.service'`) keep resolving while
 * `google-verification.service.ts` switches to the canonical home here.
 */

// ── GCP API Auto-Enable ──────────────────────────────────────────────────────

/**
 * Map canvas iceType → required Google Cloud APIs.
 *
 * Using iceType (not the GCP resource type name) as the key because that's
 * what the canvas actually puts on node data, and because string-matching
 * on resource type names like `gcp.compute.backendBucket` against a list
 * of fragment patterns ("compute", "storage") was creating false positives
 * and missing genuine matches. An explicit map is dumb and correct.
 *
 * Every block type that hits a Google API during deploy or preflight
 * requirements MUST appear here, otherwise the user gets a cryptic
 * SERVICE_DISABLED error deep in the deploy flow.
 */
export const ICE_TYPE_API_MAP: Record<string, string[]> = {
  // Compute
  // Static sites compile to Firebase Hosting on GCP. Two APIs needed:
  //   - firebase.googleapis.com — Firebase Management API for the
  //     `addFirebase` call that turns a plain GCP project into a
  //     Firebase project. Required even on projects that have used
  //     other Firebase products before.
  //   - firebasehosting.googleapis.com — the Hosting REST API itself
  //     (sites/versions/releases). The handler hits this for every
  //     deploy step.
  'Compute.StaticSite': ['firebase.googleapis.com', 'firebasehosting.googleapis.com'],
  'Compute.SSRSite': ['run.googleapis.com', 'artifactregistry.googleapis.com', 'cloudbuild.googleapis.com'],
  'Compute.Container': ['run.googleapis.com', 'artifactregistry.googleapis.com', 'cloudbuild.googleapis.com'],
  'Compute.BackendAPI': ['run.googleapis.com', 'artifactregistry.googleapis.com', 'cloudbuild.googleapis.com'],
  'Compute.Worker': ['run.googleapis.com', 'artifactregistry.googleapis.com', 'cloudbuild.googleapis.com'],
  'Compute.ServerlessFunction': [
    'cloudfunctions.googleapis.com',
    'cloudbuild.googleapis.com',
    'artifactregistry.googleapis.com',
    'run.googleapis.com', // Cloud Functions v2 runs on Cloud Run
  ],
  'Compute.CronJob': ['cloudscheduler.googleapis.com', 'run.googleapis.com'],

  // Storage
  'Storage.Bucket': ['storage.googleapis.com'],
  'Storage.ObjectStorage': ['storage.googleapis.com'],

  // Database
  'Database.PostgreSQL': ['sqladmin.googleapis.com'],
  'Database.MySQL': ['sqladmin.googleapis.com'],
  'Database.Firestore': ['firestore.googleapis.com'],
  'Database.Redis': ['redis.googleapis.com'],

  // Network
  // `Network.PublicEndpoint` compiles to the full load-balancer chain
  // plus an optional managed SSL cert. The cert flow also uses the site
  // verification API (called during Plan BEFORE autoEnableGCPApis runs,
  // so we eagerly re-enable it in google-verification on 403 as well).
  'Network.PublicEndpoint': ['compute.googleapis.com', 'siteverification.googleapis.com'],
  'Network.LoadBalancer': ['compute.googleapis.com'],
  'Network.Gateway': ['apigateway.googleapis.com', 'servicecontrol.googleapis.com', 'servicemanagement.googleapis.com'],
  'Network.VPC': ['compute.googleapis.com'],
  'Network.Subnet': ['compute.googleapis.com'],

  // Messaging
  'Messaging.CloudPubSub': ['pubsub.googleapis.com'],
  'Messaging.Queue': ['pubsub.googleapis.com'],
  'Messaging.Topic': ['pubsub.googleapis.com'],

  // Security
  'Security.Secret': ['secretmanager.googleapis.com'],
  'Security.Identity': ['identitytoolkit.googleapis.com'],

  // Monitoring
  'Monitoring.Log': ['logging.googleapis.com'],

  // AI / Analytics
  'AI.VectorDB': ['aiplatform.googleapis.com'],
  'AI.LLMGateway': ['aiplatform.googleapis.com'],
  'AI.ModelServing': ['aiplatform.googleapis.com'],
  'Analytics.DataWarehouse': ['bigquery.googleapis.com'],
  'Analytics.Search': ['discoveryengine.googleapis.com'],

  // GKE / Container orchestration
  'Compute.GKE': ['container.googleapis.com'],
};

/** Always enable these APIs for any GCP deployment */
export const BASE_APIS = ['serviceusage.googleapis.com', 'cloudresourcemanager.googleapis.com'];

/**
 * Public helper so the google-verification service (which runs during the
 * requirements resolver BEFORE the deploy flow triggers autoEnableGCPApis)
 * can lazily enable the Site Verification API on first use. Idempotent —
 * Service Usage API returns an empty operation if the API is already on.
 */
export async function enableGcpApi(project: string, apiName: string, accessToken: string): Promise<boolean> {
  try {
    const res = await fetch(`https://serviceusage.googleapis.com/v1/projects/${project}/services/${apiName}:enable`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function autoEnableGCPApis(
  project: string,
  accessToken: string,
  canvasNodes: any[],
  log: (msg: string) => void,
) {
  const requiredApis = new Set<string>(BASE_APIS);

  for (const node of canvasNodes) {
    if (node.type !== 'resource') continue;
    const iceType = (node.data?.iceType as string) || '';
    const apis = ICE_TYPE_API_MAP[iceType];
    if (apis) {
      for (const api of apis) requiredApis.add(api);
    }
  }

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
    const data = (await res.json()) as { services?: Array<{ config?: { name: string } }> };
    enabledApis = new Set((data.services || []).map((s) => s.config?.name || '').filter(Boolean));
  } catch (err: any) {
    console.error('Service Usage API fetch error:', err.message);
    return;
  }

  const toEnable = [...requiredApis].filter((api) => !enabledApis.has(api));
  if (toEnable.length === 0) {
    log('All required GCP APIs are enabled');
    return;
  }

  log(`Enabling ${toEnable.length} required GCP API(s): ${toEnable.join(', ')}`);

  // Enable APIs in parallel (batch)
  const enablePromises = toEnable.map(async (api) => {
    try {
      const res = await fetch(`https://serviceusage.googleapis.com/v1/projects/${project}/services/${api}:enable`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
      });
      const responseText = await res.text();
      if (res.ok) {
        log(`  Enabled ${api}`);
        return true;
      }
      // Detect billing errors and provide clear message
      if (responseText.includes('Billing account') || responseText.includes('billing')) {
        log(
          `  Cannot enable ${api}: Billing is not enabled for this project. Link a billing account at https://console.cloud.google.com/billing/linkedaccount?project=${project}`,
        );
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
