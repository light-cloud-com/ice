/**
 * Cleanup orphan OCI resources from crashed live tests.
 *
 * Strategy:
 *   1. Read every JSONL run-file in ./runs/, find each runId + lastTs.
 *   2. List OCI resources tagged `managed-by: ice` per service.
 *   3. A resource is orphan when its `ice:test-run-id` freeformTag has
 *      no JSONL entry OR its lastTs is older than ORPHAN_AGE_HOURS.
 *   4. With --delete: delete via the oci-* SDK. With --dry-run
 *      (default): just print.
 *
 * Required env:
 *   OCI_COMPARTMENT_ID, OCI_REGION (+ ~/.oci/config or
 *   OCI_AUTH_MODE=instance-principal)
 *
 * Usage:
 *   pnpm exec tsx e2e/oci-deployment-tests/cleanup-orphans.ts [--delete] [--dry-run]
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TAG_KEY = 'ice:test-run-id';
export const MANAGED_BY_KEY = 'managed-by';
export const MANAGED_BY_VALUE = 'ice';
export const ORPHAN_AGE_HOURS = 1;

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUNS_DIR = resolve(__dirname, 'runs');

interface TaggedResource {
  service: string;
  kind: string;
  ocid: string;
  runId: string;
}

function parseArgs(): { dryRun: boolean } {
  return { dryRun: !process.argv.includes('--delete') };
}

async function lazyImport(name: string): Promise<any> {
  return await Function('m', 'return import(m)')(name);
}

function readRunRegister(): Map<string, Date> {
  const register = new Map<string, Date>();
  if (!existsSync(RUNS_DIR)) return register;
  for (const file of readdirSync(RUNS_DIR)) {
    if (!file.endsWith('.jsonl')) continue;
    const path = resolve(RUNS_DIR, file);
    const lines = readFileSync(path, 'utf8').trim().split('\n');
    let lastTs: Date | undefined;
    let runId: string | undefined;
    for (const line of lines) {
      if (!line) continue;
      try {
        const event = JSON.parse(line);
        if (event.runId) runId = event.runId;
        if (event.ts) lastTs = new Date(event.ts);
      } catch {
        // skip malformed
      }
    }
    if (runId && lastTs) register.set(runId, lastTs);
  }
  return register;
}

export function isOrphan(runId: string, register: Map<string, Date>, now: Date = new Date()): boolean {
  const lastSeen = register.get(runId);
  if (!lastSeen) return true;
  const ageHours = (now.getTime() - lastSeen.getTime()) / (1000 * 60 * 60);
  return ageHours >= ORPHAN_AGE_HOURS;
}

/**
 * Service short-name → SDK package + list/delete method names. Keep
 * aligned with packages/core/src/deploy/providers/oci/sdk-loader.ts.
 *
 * OCI tags: each create call sets freeformTags = { 'managed-by': 'ice',
 * 'ice:test-run-id': runId }. The list calls accept `compartmentId`
 * filter; we paginate + filter client-side on freeformTags.
 */
const SERVICE_DEFS = [
  { service: 'objectstorage', kind: 'Bucket', pkg: 'oci-objectstorage', client: 'ObjectStorageClient' },
  { service: 'core', kind: 'Vcn', pkg: 'oci-core', client: 'VirtualNetworkClient' },
  { service: 'core', kind: 'Subnet', pkg: 'oci-core', client: 'VirtualNetworkClient' },
  { service: 'core', kind: 'NetworkSecurityGroup', pkg: 'oci-core', client: 'VirtualNetworkClient' },
  { service: 'core', kind: 'Instance', pkg: 'oci-core', client: 'ComputeClient' },
  {
    service: 'containerinstance',
    kind: 'ContainerInstance',
    pkg: 'oci-containerinstances',
    client: 'ContainerInstanceClient',
  },
  { service: 'functions', kind: 'Function', pkg: 'oci-functions', client: 'FunctionsManagementClient' },
  { service: 'database', kind: 'AutonomousDatabase', pkg: 'oci-database', client: 'DatabaseClient' },
  { service: 'mysql', kind: 'DbSystem', pkg: 'oci-mysql', client: 'DbSystemClient' },
  { service: 'psql', kind: 'DbSystem', pkg: 'oci-psql', client: 'PostgresqlClient' },
  { service: 'nosql', kind: 'Table', pkg: 'oci-nosql', client: 'NosqlClient' },
  { service: 'redis', kind: 'RedisCluster', pkg: 'oci-redis', client: 'RedisClusterClient' },
  { service: 'vault', kind: 'Secret', pkg: 'oci-vault', client: 'VaultsClient' },
] as const;

/**
 * Per-service orphan finder. OCI list endpoints accept
 * `compartmentId` + return paginated list-summaries with freeformTags.
 * Filter by freeformTags['managed-by']=='ice' then extract the runId
 * tag.
 *
 * The handler at
 * packages/core/src/deploy/providers/oci/handlers/<service>.ts mirrors
 * the SDK shape; copy its client wiring here.
 */
async function findTaggedResources(): Promise<TaggedResource[]> {
  const compartmentId = process.env.OCI_COMPARTMENT_ID;
  const region = process.env.OCI_REGION ?? 'us-ashburn-1';
  if (!compartmentId) throw new Error('Set OCI_COMPARTMENT_ID');
  console.warn(
    `[cleanup-orphans] OCI per-service list+delete is TODO. Compartment=${compartmentId} region=${region}. ` +
      `Implement in this file as live tests surface real orphan patterns. Each SERVICE_DEFS entry needs:`,
  );
  console.warn(`  list<Kind>s({ compartmentId }) → paginate → freeformTags['managed-by']=='ice' filter`);
  console.warn(`  delete<Kind>({ <kind>Id, ifMatch? })`);
  return [];
}

async function deleteResource(_r: TaggedResource): Promise<void> {
  // TODO: per-service delete wiring (mirror the handler's delete()).
}

async function main(): Promise<void> {
  const { dryRun } = parseArgs();
  const register = readRunRegister();
  const resources = await findTaggedResources();
  const orphans = resources.filter((r) => isOrphan(r.runId, register));

  console.log(`Found ${resources.length} ice-managed OCI resources, ${orphans.length} orphans.`);
  for (const o of orphans) {
    const marker = register.has(o.runId) ? '' : '(unknown runId)';
    console.log(`  ${dryRun ? '[dry]' : '[del]'} ${o.service}/${o.kind}/${o.ocid} runId=${o.runId} ${marker}`);
    if (!dryRun) await deleteResource(o);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
