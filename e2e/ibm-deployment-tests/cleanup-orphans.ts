/**
 * Cleanup orphan IBM Cloud resources from crashed live tests.
 *
 * Strategy:
 *   1. Read every JSONL run-file in ./runs/, find each runId + lastTs.
 *   2. List IBM Cloud resources tagged `managed-by:ice` per service.
 *   3. A resource is orphan when its `ice:test-run-id` tag value has
 *      no JSONL entry OR its lastTs is older than ORPHAN_AGE_HOURS.
 *   4. With --delete: delete via the IBM SDK subpaths. With --dry-run
 *      (default): just print.
 *
 * Required env:
 *   IBMCLOUD_API_KEY, IBMCLOUD_REGION, IBMCLOUD_RESOURCE_GROUP_ID
 *
 * Usage:
 *   pnpm exec tsx e2e/ibm-deployment-tests/cleanup-orphans.ts [--delete] [--dry-run]
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
 * Service short-name → SDK subpath + list/delete method names.
 * Keep aligned with packages/core/src/deploy/providers/ibm/sdk-loader.ts.
 *
 * IBM tagging: Global Tagging API attaches `managed-by:ice` +
 * `ice:test-run-id:<runId>` to each resource's CRN. Discover via
 * `globalTagging.listTags` then filter by CRN → list-resources call.
 *
 * Resource Controller-managed instances (most RC handlers — databases,
 * cis, iks, etc.) can be listed via
 * `resourceController.listResourceInstances({ tagNames: 'managed-by:ice' })`.
 */
const SERVICE_DEFS = [
  { service: 'vpc', kind: 'Vpc', pkg: 'ibm-vpc/vpc/v1', list: 'listVpcs', del: 'deleteVpc' },
  { service: 'vpc', kind: 'Subnet', pkg: 'ibm-vpc/vpc/v1', list: 'listSubnets', del: 'deleteSubnet' },
  { service: 'vpc', kind: 'Instance', pkg: 'ibm-vpc/vpc/v1', list: 'listInstances', del: 'deleteInstance' },
  {
    service: 'vpc',
    kind: 'SecurityGroup',
    pkg: 'ibm-vpc/vpc/v1',
    list: 'listSecurityGroups',
    del: 'deleteSecurityGroup',
  },
  { service: 'vpc', kind: 'LoadBalancer', pkg: 'ibm-vpc/vpc/v1', list: 'listLoadBalancers', del: 'deleteLoadBalancer' },
  {
    service: 'codeengine',
    kind: 'Application',
    pkg: 'ibm-code-engine-sdk/ibm-cloud-code-engine/v1',
    list: 'listApps',
    del: 'deleteApp',
  },
  {
    service: 'codeengine',
    kind: 'Function',
    pkg: 'ibm-code-engine-sdk/ibm-cloud-code-engine/v1',
    list: 'listFunctions',
    del: 'deleteFunction',
  },
  {
    service: 'codeengine',
    kind: 'Job',
    pkg: 'ibm-code-engine-sdk/ibm-cloud-code-engine/v1',
    list: 'listJobs',
    del: 'deleteJob',
  },
  {
    service: 'resourcecontroller',
    kind: 'ResourceInstance',
    pkg: '@ibm-cloud/platform-services/resource-controller/v2',
    list: 'listResourceInstances',
    del: 'deleteResourceInstance',
  },
  {
    service: 'secretsmanager',
    kind: 'Secret',
    pkg: '@ibm-cloud/secrets-manager/secrets-manager/v2',
    list: 'listSecrets',
    del: 'deleteSecret',
  },
] as const;

/**
 * Per-service orphan finder. IBM tagging: each handler sets
 * freeformTags = { 'managed-by': 'ice', 'ice:test-run-id': runId }
 * (or relies on Global Tagging where direct tag support is absent).
 *
 * VPC: list*({ resourceGroupId }) → filter user_tags includes managed-by:ice
 * Resource Controller: listResourceInstances({ tagNames: 'managed-by:ice' })
 * Code Engine: list*({ projectId }) — these don't carry tags directly;
 *   filter by name prefix `ice-test-`.
 */
async function findTaggedResources(): Promise<TaggedResource[]> {
  const apiKey = process.env.IBMCLOUD_API_KEY;
  const region = process.env.IBMCLOUD_REGION ?? 'us-south';
  const rg = process.env.IBMCLOUD_RESOURCE_GROUP_ID;
  if (!apiKey) throw new Error('Set IBMCLOUD_API_KEY');
  if (!rg) throw new Error('Set IBMCLOUD_RESOURCE_GROUP_ID');
  console.warn(
    `[cleanup-orphans] IBM Cloud per-service list+delete is TODO. Region=${region} resourceGroup=${rg}. ` +
      `Implement in this file as live tests surface real orphan patterns. Each SERVICE_DEFS entry needs:`,
  );
  console.warn(`  VPC family: list*({ resourceGroupId }) → filter user_tags include 'managed-by:ice'`);
  console.warn(`  Resource Controller: listResourceInstances({ tagNames: '${MANAGED_TAG}' })`);
  console.warn(`  Code Engine: list*({ projectId }) — filter name.startsWith('ice-test-')`);
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

  console.log(`Found ${resources.length} ice-managed IBM resources, ${orphans.length} orphans.`);
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
