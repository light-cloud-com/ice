/**
 * Cleanup orphan DigitalOcean resources from crashed live tests.
 *
 * Strategy:
 *   1. Read every JSONL run-file in ./runs/, find each runId + lastTs.
 *   2. List DO resources tagged `managed-by:ice` via dots-wrapper.
 *   3. A resource is orphan when its run-id tag has no JSONL entry OR
 *      its lastTs is older than ORPHAN_AGE_HOURS.
 *   4. With --delete: delete via dots-wrapper. With --dry-run
 *      (default): just print.
 *
 * Required env:
 *   DIGITALOCEAN_TOKEN
 *   (DO_SPACES_ACCESS_KEY + DO_SPACES_SECRET_KEY for spaces buckets)
 *
 * Usage:
 *   pnpm exec tsx e2e/digitalocean-deployment-tests/cleanup-orphans.ts [--delete] [--dry-run]
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MANAGED_TAG = 'managed-by:ice';
export const RUN_TAG_PREFIX = 'ice-test-run-id:';
export const ORPHAN_AGE_HOURS = 1;

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUNS_DIR = resolve(__dirname, 'runs');

interface TaggedResource {
  namespace: string;
  kind: string;
  id: string | number;
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
 * dots-wrapper namespace → list + delete methods. Keep aligned with
 * packages/core/src/deploy/providers/digitalocean/digitalocean-deployer.ts.
 *
 * DO tag-filter API: list endpoints accept a `tag_name` query param
 * (we use `managed-by:ice`); the per-tag list returns all resources
 * with that tag. Then we filter further by the `ice-test-run-id:<runId>`
 * tag.
 */
const NS_DEFS = [
  { namespace: 'droplet', kind: 'Droplet', list: 'listDroplets', del: 'deleteDroplet' },
  { namespace: 'app', kind: 'App', list: 'listApps', del: 'deleteApp' },
  { namespace: 'database', kind: 'DatabaseCluster', list: 'listDatabaseClusters', del: 'destroyDatabaseCluster' },
  { namespace: 'kubernetes', kind: 'Cluster', list: 'listKubernetesClusters', del: 'deleteKubernetesCluster' },
  { namespace: 'loadBalancer', kind: 'LoadBalancer', list: 'listLoadBalancers', del: 'deleteLoadBalancer' },
  { namespace: 'vpc', kind: 'Vpc', list: 'listVpcs', del: 'deleteVpc' },
  { namespace: 'firewall', kind: 'Firewall', list: 'listFirewalls', del: 'deleteFirewall' },
  { namespace: 'volume', kind: 'Volume', list: 'listVolumes', del: 'deleteVolume' },
  { namespace: 'snapshot', kind: 'Snapshot', list: 'listSnapshots', del: 'deleteSnapshot' },
  { namespace: 'floatingIp', kind: 'FloatingIp', list: 'listFloatingIps', del: 'deleteFloatingIp' },
] as const;

/**
 * Walk every DO namespace + filter by the `managed-by:ice` tag. The
 * dots-wrapper list APIs accept `{ tag_name }` query param.
 *
 * TODO once first real-cloud round-trip surfaces tag semantics — DO
 * tagging coverage varies by service (droplets/dbs/lbs/k8s have full
 * tag support; vpcs do not; firewalls have tag-filtering by resource
 * tag), so each entry above needs to be vetted against the actual
 * API behaviour.
 */
async function findTaggedResources(): Promise<TaggedResource[]> {
  const token = process.env.DIGITALOCEAN_TOKEN;
  if (!token) throw new Error('Set DIGITALOCEAN_TOKEN');
  console.warn(
    `[cleanup-orphans] DigitalOcean per-namespace list+delete is TODO. ` +
      `Implement in this file as live tests surface real orphan patterns. ` +
      `Each NS_DEFS entry: client.<ns>.<list>({ tag_name: '${MANAGED_TAG}' }) → filter by ${RUN_TAG_PREFIX}<runId> → ${`{ id }`}.`,
  );
  return [];
}

async function deleteResource(_r: TaggedResource): Promise<void> {
  // TODO: per-namespace delete wiring.
}

async function main(): Promise<void> {
  const { dryRun } = parseArgs();
  const register = readRunRegister();
  const resources = await findTaggedResources();
  const orphans = resources.filter((r) => isOrphan(r.runId, register));

  console.log(`Found ${resources.length} ice-managed DigitalOcean resources, ${orphans.length} orphans.`);
  for (const o of orphans) {
    const marker = register.has(o.runId) ? '' : '(unknown runId)';
    console.log(`  ${dryRun ? '[dry]' : '[del]'} ${o.namespace}/${o.kind}/${o.id} runId=${o.runId} ${marker}`);
    if (!dryRun) await deleteResource(o);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
