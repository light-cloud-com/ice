#!/usr/bin/env tsx
/**
 * Azure cleanup-orphans
 *
 * Scans for resources tagged `ice:test-run-id=*` and deletes any whose
 * tag value points at a run that ended >1 hour ago.
 *
 * Why: a crashed live test can leak real Azure resources inside the
 * shared test resource group. This script is the recovery path.
 *
 * Usage:
 *   pnpm tsx e2e/azure-deployment-tests/cleanup-orphans.ts            # dry-run, list
 *   pnpm tsx e2e/azure-deployment-tests/cleanup-orphans.ts --delete   # actually delete
 *
 * Credentials picked up from `DefaultAzureCredential` (az login,
 * service-principal env vars, managed identity, etc.).
 * Required env:
 *   AZURE_SUBSCRIPTION_ID
 * Optional:
 *   AZURE_TEST_RESOURCE_GROUP (default 'ice-test-rg')
 *
 * Uses ARM resources.list with a tag filter, then ARM's generic
 * deleteById for resource removal (works across any provider/type).
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TAG_KEY = 'ice:test-run-id';
export const ORPHAN_AGE_HOURS = 1;

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUNS_DIR = resolve(__dirname, 'runs');

interface TaggedResource {
  id: string;
  name: string;
  type: string;
  apiVersion?: string;
  tags: Record<string, string>;
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
        // skip malformed lines
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

async function findTaggedResources(subscriptionId: string): Promise<{
  client: any;
  resources: TaggedResource[];
}> {
  const identity = await lazyImport('@azure/identity');
  const resourcesMod = await lazyImport('@azure/arm-resources');
  if (!identity || !resourcesMod) {
    console.error('install @azure/identity and @azure/arm-resources to run cleanup-orphans');
    process.exit(1);
  }
  const credential = new identity.DefaultAzureCredential();
  const client = new resourcesMod.ResourceManagementClient(credential, subscriptionId);
  const collected: TaggedResource[] = [];
  // ARM resources.list filter: tagName=<key> matches any resource carrying that tag key.
  const iterator = client.resources.list({ filter: `tagName eq '${TAG_KEY}'` });
  for await (const r of iterator) {
    const tags = (r.tags ?? {}) as Record<string, string>;
    collected.push({
      id: r.id ?? '',
      name: r.name ?? '',
      type: r.type ?? '',
      apiVersion: undefined, // resolve later from provider metadata
      tags,
    });
  }
  return { client, resources: collected };
}

async function resolveApiVersion(client: any, resourceType: string): Promise<string | undefined> {
  // resource type shape: 'Microsoft.<rp>/<plural>'. Provider namespace is the
  // first segment; remaining segments are the resource path under that RP.
  const [namespace, ...rest] = resourceType.split('/');
  if (!namespace || rest.length === 0) return undefined;
  try {
    const provider = await client.providers.get(namespace);
    const subType = rest.join('/').toLowerCase();
    const match = provider.resourceTypes?.find(
      (t: { resourceType?: string }) => t.resourceType?.toLowerCase() === subType,
    );
    return match?.apiVersions?.[0];
  } catch {
    return undefined;
  }
}

async function deleteById(client: any, id: string, apiVersion: string): Promise<void> {
  await client.resources.beginDeleteByIdAndWait(id, apiVersion);
}

async function main(): Promise<void> {
  const { dryRun } = parseArgs();
  const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID;
  if (!subscriptionId) {
    console.error('set AZURE_SUBSCRIPTION_ID');
    process.exit(1);
  }
  const register = readRunRegister();
  const { client, resources } = await findTaggedResources(subscriptionId);
  if (resources.length === 0) {
    console.log('No tagged ICE test resources found in this subscription.');
    return;
  }
  const orphans = resources.filter((r) => isOrphan(r.tags[TAG_KEY] ?? '', register));
  console.log(`Found ${resources.length} tagged resource(s); ${orphans.length} flagged as orphan(s).`);
  for (const o of orphans) {
    const ageMarker = register.has(o.tags[TAG_KEY] ?? '') ? '' : '(unknown runId)';
    console.log(`  orphan: ${o.id} ${ageMarker}`);
  }
  if (dryRun) {
    console.log('\nDry-run; pass --delete to actually remove these.');
    return;
  }
  let deleted = 0;
  let failed = 0;
  for (const o of orphans) {
    try {
      const apiVersion = await resolveApiVersion(client, o.type);
      if (!apiVersion) {
        console.error(`  failed: ${o.id} — could not resolve apiVersion for ${o.type}`);
        failed += 1;
        continue;
      }
      await deleteById(client, o.id, apiVersion);
      console.log(`  deleted: ${o.id}`);
      deleted += 1;
    } catch (e) {
      console.error(`  failed: ${o.id} — ${(e as Error).message}`);
      failed += 1;
    }
  }
  console.log(`\nDeleted ${deleted} / ${orphans.length}; ${failed} failure(s).`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
