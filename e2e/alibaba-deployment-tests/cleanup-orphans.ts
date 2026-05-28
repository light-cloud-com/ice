/**
 * Cleanup orphan Alibaba Cloud resources from crashed live tests.
 *
 * Strategy:
 *   1. Read every JSONL run-file in ./runs/, find each runId + lastTs.
 *   2. List Alibaba resources tagged `managed-by:ice` per service.
 *   3. A resource is orphan when its `ice:test-run-id` tag value has no
 *      JSONL entry OR its lastTs is older than ORPHAN_AGE_HOURS.
 *   4. With --delete: delete via the @alicloud/* SDK. With --dry-run
 *      (default): just print.
 *
 * Required env:
 *   ALIBABA_CLOUD_ACCESS_KEY_ID, ALIBABA_CLOUD_ACCESS_KEY_SECRET,
 *   ALIBABA_CLOUD_REGION
 *
 * Usage:
 *   pnpm exec tsx e2e/alibaba-deployment-tests/cleanup-orphans.ts [--delete] [--dry-run]
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TAG_KEY = 'ice:test-run-id';
export const MANAGED_BY = 'managed-by:ice';
export const ORPHAN_AGE_HOURS = 1;

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUNS_DIR = resolve(__dirname, 'runs');

interface TaggedResource {
  service: string;
  kind: string;
  id: string;
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
 * Service short-name → SDK package + region-endpoint-prefix + list /
 * delete method names. Keep aligned with
 * packages/core/src/deploy/providers/alibaba/sdk-loader.ts.
 *
 * NOTE: most Alibaba resources support tags via `tag.{N}.Key` filter
 * on Describe* calls. Specific filter syntax varies per service.
 */
const SERVICE_DEFS = [
  { service: 'oss', kind: 'Bucket', pkg: '@alicloud/oss20190517', endpoint: 'oss' },
  { service: 'vpc', kind: 'Vpc', pkg: '@alicloud/vpc20160428', endpoint: 'vpc' },
  { service: 'vpc', kind: 'VSwitch', pkg: '@alicloud/vpc20160428', endpoint: 'vpc' },
  { service: 'ecs', kind: 'SecurityGroup', pkg: '@alicloud/ecs20140526', endpoint: 'ecs' },
  { service: 'ecs', kind: 'Instance', pkg: '@alicloud/ecs20140526', endpoint: 'ecs' },
  { service: 'rds', kind: 'DBInstance', pkg: '@alicloud/rds20140815', endpoint: 'rds' },
  { service: 'dds', kind: 'DBInstance', pkg: '@alicloud/dds20151201', endpoint: 'mongodb' },
  { service: 'kvstore', kind: 'Instance', pkg: '@alicloud/r-kvstore20150101', endpoint: 'r-kvstore' },
  { service: 'mns', kind: 'Queue', pkg: '@alicloud/mns', endpoint: 'mns-open' },
  { service: 'mns', kind: 'Topic', pkg: '@alicloud/mns', endpoint: 'mns-open' },
  { service: 'fc', kind: 'Function', pkg: '@alicloud/fc20230330', endpoint: 'fcv3' },
  { service: 'kms', kind: 'Secret', pkg: '@alicloud/kms20160120', endpoint: 'kms' },
  { service: 'sae', kind: 'Application', pkg: '@alicloud/sae20190506', endpoint: 'sae' },
  { service: 'eci', kind: 'ContainerGroup', pkg: '@alicloud/eci20180808', endpoint: 'eci' },
  { service: 'eventbridge', kind: 'Rule', pkg: '@alicloud/eventbridge20200401', endpoint: 'eventbridge' },
] as const;

/**
 * Per-service orphan finder: each Alibaba SDK has its own Describe /
 * List shape, so this loop is provider-specific TODO. The skeleton
 * documents the contract; first real-cloud run will fill in the
 * per-service list + delete calls.
 *
 * The handler in
 * packages/core/src/deploy/providers/alibaba/handlers/<service>.ts
 * has the SDK + region + auth wiring we can mirror here.
 */
async function findTaggedResources(): Promise<TaggedResource[]> {
  const region = process.env.ALIBABA_CLOUD_REGION ?? 'cn-hangzhou';
  const accessKeyId = process.env.ALIBABA_CLOUD_ACCESS_KEY_ID;
  const accessKeySecret = process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET;
  if (!accessKeyId || !accessKeySecret) {
    throw new Error('Set ALIBABA_CLOUD_ACCESS_KEY_ID + ALIBABA_CLOUD_ACCESS_KEY_SECRET');
  }
  console.warn(
    `[cleanup-orphans] Alibaba per-service list+delete is TODO. Region=${region}. ` +
      `Implement in this file as live tests surface real orphan patterns. ` +
      `Each SERVICE_DEFS entry needs a list call + a runId-tag filter + a delete call.`,
  );
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

  console.log(`Found ${resources.length} ice-managed Alibaba resources, ${orphans.length} orphans.`);
  for (const o of orphans) {
    const marker = register.has(o.runId) ? '' : '(unknown runId)';
    console.log(`  ${dryRun ? '[dry]' : '[del]'} ${o.service}/${o.kind}/${o.id} runId=${o.runId} ${marker}`);
    if (!dryRun) await deleteResource(o);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
