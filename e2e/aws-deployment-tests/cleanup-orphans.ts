#!/usr/bin/env tsx
/**
 * AWS cleanup-orphans
 *
 * Scans for resources tagged `ice:test-run-id=*` and deletes any whose
 * tag value points at a run that ended >1 hour ago.
 *
 * Why: a crashed live test (Ctrl-C during an RDS create, machine reboot,
 * etc.) can leak real AWS resources. This script is the recovery path.
 *
 * Usage:
 *   pnpm tsx e2e/aws-deployment-tests/cleanup-orphans.ts            # dry-run, list
 *   pnpm tsx e2e/aws-deployment-tests/cleanup-orphans.ts --delete   # actually delete
 *
 * Credentials picked up from the standard AWS SDK chain (AWS_PROFILE,
 * AWS_ACCESS_KEY_ID/SECRET, etc.). Region from AWS_REGION.
 *
 * Uses the AWS Resource Groups Tagging API to find any tagged resource
 * across services. Per-service delete is dispatched via the resource
 * ARN prefix.
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TAG_KEY = 'ice:test-run-id';
export const ORPHAN_AGE_HOURS = 1;

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUNS_DIR = resolve(__dirname, 'runs');

interface TaggedResource {
  arn: string;
  tags: Record<string, string>;
}

function parseArgs(): { dryRun: boolean } {
  return { dryRun: !process.argv.includes('--delete') };
}

async function lazyImport(name: string): Promise<any> {
  return await Function('m', 'return import(m)')(name);
}

/** Read every recent JSONL file and bucket run IDs by their last-event timestamp. */
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
  // Unknown runId → assume orphan (older than this script run by definition)
  if (!lastSeen) return true;
  const ageHours = (now.getTime() - lastSeen.getTime()) / (1000 * 60 * 60);
  return ageHours >= ORPHAN_AGE_HOURS;
}

async function findTaggedResources(): Promise<TaggedResource[]> {
  const tagging = await lazyImport('@aws-sdk/client-resource-groups-tagging-api');
  if (!tagging) {
    console.error('install @aws-sdk/client-resource-groups-tagging-api to run cleanup-orphans');
    process.exit(1);
  }
  const region = process.env.AWS_REGION;
  if (!region) {
    console.error('set AWS_REGION');
    process.exit(1);
  }
  const client = new tagging.ResourceGroupsTaggingAPIClient({ region });
  const collected: TaggedResource[] = [];
  let paginationToken: string | undefined;
  do {
    const resp = await client.send(
      new tagging.GetResourcesCommand({
        TagFilters: [{ Key: TAG_KEY }],
        PaginationToken: paginationToken,
      }),
    );
    for (const r of resp.ResourceTagMappingList ?? []) {
      const arn = r.ResourceARN as string;
      const tags: Record<string, string> = {};
      for (const t of r.Tags ?? []) {
        if (t.Key && t.Value !== undefined) tags[t.Key] = t.Value;
      }
      collected.push({ arn, tags });
    }
    paginationToken = resp.PaginationToken || undefined;
  } while (paginationToken);
  if (typeof client.destroy === 'function') client.destroy();
  return collected;
}

async function deleteResource(arn: string): Promise<void> {
  // ARN shape: arn:aws:<service>:<region>:<account>:<resource-type>/<name>
  const parts = arn.split(':');
  const service = parts[2];
  switch (service) {
    case 's3':
      await deleteS3(arn);
      break;
    case 'lambda':
      await deleteLambda(arn);
      break;
    case 'sqs':
      await deleteSqs(arn);
      break;
    case 'sns':
      await deleteSns(arn);
      break;
    case 'dynamodb':
      await deleteDynamoDb(arn);
      break;
    case 'logs':
      await deleteCloudWatchLogGroup(arn);
      break;
    case 'secretsmanager':
      await deleteSecretsManager(arn);
      break;
    case 'rds':
      await deleteRds(arn);
      break;
    case 'elasticache':
      await deleteElastiCache(arn);
      break;
    default:
      console.warn(`  skip: no deleter wired for service '${service}' (${arn})`);
  }
}

async function deleteS3(arn: string): Promise<void> {
  const s3pkg = await lazyImport('@aws-sdk/client-s3');
  const bucket = arn.split(':::')[1];
  const client = new s3pkg.S3Client({ region: process.env.AWS_REGION });
  // Bucket must be empty; best-effort
  try {
    const list = await client.send(new s3pkg.ListObjectsV2Command({ Bucket: bucket }));
    for (const obj of list.Contents ?? []) {
      await client.send(new s3pkg.DeleteObjectCommand({ Bucket: bucket, Key: obj.Key! }));
    }
    await client.send(new s3pkg.DeleteBucketCommand({ Bucket: bucket }));
  } finally {
    if (typeof client.destroy === 'function') client.destroy();
  }
}

async function deleteLambda(arn: string): Promise<void> {
  const lambdaPkg = await lazyImport('@aws-sdk/client-lambda');
  const fnName = arn.split(':function:')[1];
  const client = new lambdaPkg.LambdaClient({ region: process.env.AWS_REGION });
  try {
    await client.send(new lambdaPkg.DeleteFunctionCommand({ FunctionName: fnName }));
  } finally {
    if (typeof client.destroy === 'function') client.destroy();
  }
}

async function deleteSqs(arn: string): Promise<void> {
  const sqsPkg = await lazyImport('@aws-sdk/client-sqs');
  const queueName = arn.split(':').pop()!;
  const client = new sqsPkg.SQSClient({ region: process.env.AWS_REGION });
  try {
    const url = await client.send(new sqsPkg.GetQueueUrlCommand({ QueueName: queueName }));
    await client.send(new sqsPkg.DeleteQueueCommand({ QueueUrl: url.QueueUrl }));
  } finally {
    if (typeof client.destroy === 'function') client.destroy();
  }
}

async function deleteSns(arn: string): Promise<void> {
  const snsPkg = await lazyImport('@aws-sdk/client-sns');
  const client = new snsPkg.SNSClient({ region: process.env.AWS_REGION });
  try {
    await client.send(new snsPkg.DeleteTopicCommand({ TopicArn: arn }));
  } finally {
    if (typeof client.destroy === 'function') client.destroy();
  }
}

async function deleteDynamoDb(arn: string): Promise<void> {
  const ddbPkg = await lazyImport('@aws-sdk/client-dynamodb');
  const tableName = arn.split('/').pop()!;
  const client = new ddbPkg.DynamoDBClient({ region: process.env.AWS_REGION });
  try {
    await client.send(new ddbPkg.DeleteTableCommand({ TableName: tableName }));
  } finally {
    if (typeof client.destroy === 'function') client.destroy();
  }
}

async function deleteCloudWatchLogGroup(arn: string): Promise<void> {
  const logsPkg = await lazyImport('@aws-sdk/client-cloudwatch-logs');
  const logGroupName = arn.split(':log-group:')[1]?.split(':')[0];
  const client = new logsPkg.CloudWatchLogsClient({ region: process.env.AWS_REGION });
  try {
    await client.send(new logsPkg.DeleteLogGroupCommand({ logGroupName }));
  } finally {
    if (typeof client.destroy === 'function') client.destroy();
  }
}

async function deleteSecretsManager(arn: string): Promise<void> {
  const smPkg = await lazyImport('@aws-sdk/client-secrets-manager');
  const client = new smPkg.SecretsManagerClient({ region: process.env.AWS_REGION });
  try {
    await client.send(new smPkg.DeleteSecretCommand({ SecretId: arn, ForceDeleteWithoutRecovery: true }));
  } finally {
    if (typeof client.destroy === 'function') client.destroy();
  }
}

async function deleteRds(arn: string): Promise<void> {
  const rdsPkg = await lazyImport('@aws-sdk/client-rds');
  const dbInstanceId = arn.split(':db:')[1];
  if (!dbInstanceId) return;
  const client = new rdsPkg.RDSClient({ region: process.env.AWS_REGION });
  try {
    await client.send(
      new rdsPkg.DeleteDBInstanceCommand({
        DBInstanceIdentifier: dbInstanceId,
        SkipFinalSnapshot: true,
        DeleteAutomatedBackups: true,
      }),
    );
  } finally {
    if (typeof client.destroy === 'function') client.destroy();
  }
}

async function deleteElastiCache(arn: string): Promise<void> {
  const ecPkg = await lazyImport('@aws-sdk/client-elasticache');
  const cacheId = arn.split(':cluster:')[1];
  if (!cacheId) return;
  const client = new ecPkg.ElastiCacheClient({ region: process.env.AWS_REGION });
  try {
    await client.send(new ecPkg.DeleteCacheClusterCommand({ CacheClusterId: cacheId }));
  } finally {
    if (typeof client.destroy === 'function') client.destroy();
  }
}

async function main(): Promise<void> {
  const { dryRun } = parseArgs();
  const register = readRunRegister();
  const resources = await findTaggedResources();
  if (resources.length === 0) {
    console.log('No tagged ICE test resources found in this region.');
    return;
  }
  const orphans = resources.filter((r) => isOrphan(r.tags[TAG_KEY] ?? '', register));
  console.log(`Found ${resources.length} tagged resource(s); ${orphans.length} flagged as orphan(s).`);
  for (const o of orphans) {
    const ageMarker = register.has(o.tags[TAG_KEY] ?? '') ? '' : '(unknown runId)';
    console.log(`  orphan: ${o.arn} ${ageMarker}`);
  }
  if (dryRun) {
    console.log('\nDry-run; pass --delete to actually remove these.');
    return;
  }
  let deleted = 0;
  let failed = 0;
  for (const o of orphans) {
    try {
      await deleteResource(o.arn);
      console.log(`  deleted: ${o.arn}`);
      deleted += 1;
    } catch (e) {
      console.error(`  failed: ${o.arn} — ${(e as Error).message}`);
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
