/**
 * Cleanup orphan Kubernetes resources from crashed live tests.
 *
 * Strategy:
 *   1. Read every JSONL run-file in ./runs/, find each runId + lastTs.
 *   2. List every resource in the test namespace with
 *      label `app.kubernetes.io/managed-by=ice`.
 *   3. A resource is an orphan when its runId label has no JSONL entry
 *      OR its lastTs is older than ORPHAN_AGE_HOURS.
 *   4. With --delete: delete via the typed K8s API. With --dry-run
 *      (default): just print.
 *
 * Usage:
 *   pnpm exec tsx e2e/kubernetes-deployment-tests/cleanup-orphans.ts [--delete] [--dry-run]
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TAG_KEY = 'ice.deploy/test-run-id';
export const MANAGED_BY = 'app.kubernetes.io/managed-by=ice';
export const ORPHAN_AGE_HOURS = 1;
const TEST_NAMESPACE = process.env.ICE_K8S_TEST_NAMESPACE || 'ice-test';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUNS_DIR = resolve(__dirname, 'runs');

interface TaggedResource {
  kind: string;
  name: string;
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

const KIND_TO_API = [
  { kind: 'Deployment', api: 'apps', list: 'listNamespacedDeployment', del: 'deleteNamespacedDeployment' },
  { kind: 'StatefulSet', api: 'apps', list: 'listNamespacedStatefulSet', del: 'deleteNamespacedStatefulSet' },
  { kind: 'Service', api: 'core', list: 'listNamespacedService', del: 'deleteNamespacedService' },
  { kind: 'ConfigMap', api: 'core', list: 'listNamespacedConfigMap', del: 'deleteNamespacedConfigMap' },
  { kind: 'Secret', api: 'core', list: 'listNamespacedSecret', del: 'deleteNamespacedSecret' },
  {
    kind: 'PersistentVolumeClaim',
    api: 'core',
    list: 'listNamespacedPersistentVolumeClaim',
    del: 'deleteNamespacedPersistentVolumeClaim',
  },
  { kind: 'Ingress', api: 'networking', list: 'listNamespacedIngress', del: 'deleteNamespacedIngress' },
  {
    kind: 'NetworkPolicy',
    api: 'networking',
    list: 'listNamespacedNetworkPolicy',
    del: 'deleteNamespacedNetworkPolicy',
  },
  { kind: 'Job', api: 'batch', list: 'listNamespacedJob', del: 'deleteNamespacedJob' },
  { kind: 'CronJob', api: 'batch', list: 'listNamespacedCronJob', del: 'deleteNamespacedCronJob' },
] as const;

async function findTaggedResources(): Promise<{ clients: Map<string, any>; resources: TaggedResource[] }> {
  const sdk = await lazyImport('@kubernetes/client-node');
  const kc = new sdk.KubeConfig();
  kc.loadFromDefault();
  const clients = new Map<string, any>();
  clients.set('core', kc.makeApiClient(sdk.CoreV1Api));
  clients.set('apps', kc.makeApiClient(sdk.AppsV1Api));
  clients.set('batch', kc.makeApiClient(sdk.BatchV1Api));
  clients.set('networking', kc.makeApiClient(sdk.NetworkingV1Api));

  const resources: TaggedResource[] = [];
  for (const def of KIND_TO_API) {
    const api = clients.get(def.api);
    try {
      const list = await api[def.list]({
        namespace: TEST_NAMESPACE,
        labelSelector: MANAGED_BY,
      });
      for (const item of list?.items ?? []) {
        const runId = item.metadata?.labels?.[TAG_KEY] ?? '';
        resources.push({ kind: def.kind, name: item.metadata?.name ?? '', runId });
      }
    } catch (e) {
      console.warn(`Listing ${def.kind} failed: ${(e as Error).message}`);
    }
  }
  return { clients, resources };
}

async function deleteResource(clients: Map<string, any>, r: TaggedResource): Promise<void> {
  const def = KIND_TO_API.find((d) => d.kind === r.kind);
  if (!def) return;
  const api = clients.get(def.api);
  try {
    await api[def.del]({ name: r.name, namespace: TEST_NAMESPACE });
  } catch (e) {
    console.warn(`Delete ${r.kind}/${r.name} failed: ${(e as Error).message}`);
  }
}

async function main(): Promise<void> {
  const { dryRun } = parseArgs();
  const register = readRunRegister();
  const { clients, resources } = await findTaggedResources();
  const orphans = resources.filter((r) => isOrphan(r.runId, register));

  console.log(`Found ${resources.length} ice-managed resources in ${TEST_NAMESPACE}, ${orphans.length} orphans.`);
  for (const o of orphans) {
    const marker = register.has(o.runId) ? '' : '(unknown runId)';
    console.log(`  ${dryRun ? '[dry]' : '[del]'} ${o.kind}/${o.name} runId=${o.runId} ${marker}`);
    if (!dryRun) await deleteResource(clients, o);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
