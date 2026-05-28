/**
 * Live-test helpers (developer tool, NOT CI).
 *
 * Provides skip-aware describe wrappers + name generators + deployer
 * factories + JSONL logger for AWS, Azure, Kubernetes, Alibaba, OCI,
 * DigitalOcean, and IBM Cloud.
 *
 * Required env (or test skips with banner):
 *   AWS:          AWS_REGION + credentials via AWS SDK chain
 *   Azure:        AZURE_SUBSCRIPTION_ID + AZURE_LOCATION + credentials
 *                 via DefaultAzureCredential chain
 *   Kubernetes:   KUBECONFIG (or ~/.kube/config default) +
 *                 ICE_K8S_TEST_NAMESPACE (optional, default ice-test)
 *   Alibaba:      ALIBABA_CLOUD_ACCESS_KEY_ID +
 *                 ALIBABA_CLOUD_ACCESS_KEY_SECRET +
 *                 ALIBABA_CLOUD_REGION
 *   OCI:          OCI_COMPARTMENT_ID + OCI_REGION + ~/.oci/config
 *                 (or OCI_AUTH_MODE=instance-principal etc.)
 *   DigitalOcean: DIGITALOCEAN_TOKEN + DIGITALOCEAN_REGION
 *                 (+ DO_SPACES_ACCESS_KEY/DO_SPACES_SECRET_KEY for
 *                 spaces-bucket tests)
 *   IBM:          IBMCLOUD_API_KEY + IBMCLOUD_REGION +
 *                 IBMCLOUD_RESOURCE_GROUP_ID
 *
 * Tag every resource you create with `ice:test-run-id=<runId()>` so
 * `e2e/<provider>-deployment-tests/cleanup-orphans.ts` can sweep leaks.
 */

import { appendFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { describe } from 'vitest';
import { AWSDeployer, create_aws_deployer } from '../../aws-deployer';
import { AzureDeployer, create_azure_deployer } from '../../azure-deployer';
import { AlibabaDeployer, create_alibaba_deployer } from '../../alibaba/alibaba-deployer';
import { DigitalOceanDeployer, create_digitalocean_deployer } from '../../digitalocean/digitalocean-deployer';
import { IBMDeployer, create_ibm_deployer } from '../../ibm/ibm-deployer';
import { KubernetesDeployer, create_kubernetes_deployer } from '../../kubernetes/kubernetes-deployer';
import { OCIDeployer, create_oci_deployer } from '../../oci/oci-deployer';
import type { LiveEvent, LiveEventInput, LiveProvider } from './_live-types';

// ─── runId ─────────────────────────────────────────────────────────────────

const RUN_ID = (() => {
  const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `${ymd}-${randomBytes(4).toString('hex')}`;
})();

const RAND_SUFFIX = randomBytes(4).toString('hex');

export function runId(): string {
  return RUN_ID;
}

export const TEST_RUN_TAG_KEY = 'ice:test-run-id';
export function testRunTagValue(): string {
  return RUN_ID;
}

// ─── env gates ─────────────────────────────────────────────────────────────

const AWS_BANNER =
  'set AWS_REGION (and provide AWS credentials via AWS_PROFILE, AWS_ACCESS_KEY_ID/SECRET, SSO, or instance metadata)';
const AZURE_BANNER =
  'set AZURE_SUBSCRIPTION_ID + AZURE_LOCATION (and provide credentials via az login, service-principal env, or managed identity)';
const K8S_BANNER =
  'set KUBECONFIG (or use the default ~/.kube/config) and ensure kubectl reaches the cluster — pnpm test:live:kubernetes';
const ALIBABA_BANNER =
  'set ALIBABA_CLOUD_ACCESS_KEY_ID + ALIBABA_CLOUD_ACCESS_KEY_SECRET + ALIBABA_CLOUD_REGION — pnpm test:live:alibaba';
const OCI_BANNER =
  'set OCI_COMPARTMENT_ID + OCI_REGION (and provide OCI auth via ~/.oci/config, OCI_AUTH_MODE=instance-principal, etc.) — pnpm test:live:oci';
const DO_BANNER =
  'set DIGITALOCEAN_TOKEN + DIGITALOCEAN_REGION (and DO_SPACES_ACCESS_KEY/DO_SPACES_SECRET_KEY for Spaces tests) — pnpm test:live:digitalocean';
const IBM_BANNER = 'set IBMCLOUD_API_KEY + IBMCLOUD_REGION + IBMCLOUD_RESOURCE_GROUP_ID — pnpm test:live:ibm';

function awsEnvOk(): boolean {
  return !!process.env.AWS_REGION;
}

function azureEnvOk(): boolean {
  return !!process.env.AZURE_SUBSCRIPTION_ID && !!process.env.AZURE_LOCATION;
}

function k8sEnvOk(): boolean {
  return !!process.env.KUBECONFIG || !!process.env.HOME;
}

function alibabaEnvOk(): boolean {
  return (
    !!process.env.ALIBABA_CLOUD_ACCESS_KEY_ID &&
    !!process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET &&
    !!process.env.ALIBABA_CLOUD_REGION
  );
}

function ociEnvOk(): boolean {
  return !!process.env.OCI_COMPARTMENT_ID && !!process.env.OCI_REGION;
}

function doEnvOk(): boolean {
  return !!process.env.DIGITALOCEAN_TOKEN && !!process.env.DIGITALOCEAN_REGION;
}

function ibmEnvOk(): boolean {
  return !!process.env.IBMCLOUD_API_KEY && !!process.env.IBMCLOUD_REGION && !!process.env.IBMCLOUD_RESOURCE_GROUP_ID;
}

/**
 * describe-wrapper for AWS live tests. Skips with a banner if env is missing.
 *
 * Vitest reports the skipped suite by name, so the banner is visible in
 * `pnpm test:live:aws` output — the developer immediately sees what to export.
 */
export function awsLive(name: string, fn: () => void): void {
  if (!awsEnvOk()) {
    describe.skip(`${name} [skipped — ${AWS_BANNER}]`, fn);
    return;
  }
  describe(name, fn);
}

export function azureLive(name: string, fn: () => void): void {
  if (!azureEnvOk()) {
    describe.skip(`${name} [skipped — ${AZURE_BANNER}]`, fn);
    return;
  }
  describe(name, fn);
}

export function kubernetesLive(name: string, fn: () => void): void {
  if (!k8sEnvOk()) {
    describe.skip(`${name} [skipped — ${K8S_BANNER}]`, fn);
    return;
  }
  describe(name, fn);
}

export function alibabaLive(name: string, fn: () => void): void {
  if (!alibabaEnvOk()) {
    describe.skip(`${name} [skipped — ${ALIBABA_BANNER}]`, fn);
    return;
  }
  describe(name, fn);
}

export function ociLive(name: string, fn: () => void): void {
  if (!ociEnvOk()) {
    describe.skip(`${name} [skipped — ${OCI_BANNER}]`, fn);
    return;
  }
  describe(name, fn);
}

export function digitaloceanLive(name: string, fn: () => void): void {
  if (!doEnvOk()) {
    describe.skip(`${name} [skipped — ${DO_BANNER}]`, fn);
    return;
  }
  describe(name, fn);
}

export function ibmLive(name: string, fn: () => void): void {
  if (!ibmEnvOk()) {
    describe.skip(`${name} [skipped — ${IBM_BANNER}]`, fn);
    return;
  }
  describe(name, fn);
}

// ─── name generators ───────────────────────────────────────────────────────

function trim(name: string, max: number): string {
  return name.length <= max ? name : name.slice(0, max);
}

/**
 * AWS resource name with the standard ICE test shape:
 *   `ice-test-<service>-<runId>-<rand>` trimmed to `maxLen`.
 *
 * Per-service AWS limits to pass:
 *   S3 bucket:      63
 *   Lambda fn:      64
 *   IAM role:       64
 *   SQS queue:      80 (160 with .fifo suffix)
 *   SNS topic:      256
 *   DynamoDB table: 255
 *   RDS db id:      63 (lowercase only — caller must lowercase)
 *   ECS service:    255
 *   ELBv2 LB:       32
 *   CloudFront ID:  generated by AWS; name not user-supplied
 *   CloudWatch lg:  512
 */
export function uniqueAwsName(service: string, maxLen = 64): string {
  return trim(`ice-test-${service}-${RUN_ID}-${RAND_SUFFIX}`, maxLen);
}

/**
 * Azure resource name. Tighter limits than AWS. For services like Storage
 * Accounts (3-24 chars, lowercase alphanumeric only), pass maxLen = 24 and
 * the caller should know to lowercase + strip non-alphanumeric.
 *
 * For most ARM resources, names allow dashes and 64+ chars; use default.
 *
 * Per-service Azure limits to pass:
 *   Storage Account:  24 (alphanumeric lowercase only)
 *   Key Vault:        24
 *   Function App:     60
 *   App Service:      60
 *   Cosmos DB:        50
 *   SQL Server:       63
 *   Postgres flex:    63
 *   VM:               64
 *   VNet:             64
 *   Resource group:   90
 */
export function uniqueAzureName(service: string, maxLen = 64): string {
  return trim(`ice-test-${service}-${RUN_ID}-${RAND_SUFFIX}`, maxLen);
}

/**
 * Storage-account-flavour name: lowercase, alphanumeric only, max 24.
 */
export function uniqueAzureStorageName(prefix = 'sa'): string {
  const compact = `icet${prefix}${RUN_ID.replace(/-/g, '').slice(-8)}${RAND_SUFFIX.slice(0, 4)}`.toLowerCase();
  return trim(compact, 24);
}

/**
 * Kubernetes resource name. K8s names: 1-253 chars, lowercase
 * alphanumeric + hyphens, must start/end with alphanumeric.
 * `service.metadata.name` is more restrictive (63 chars) — pass
 * maxLen=63 for those.
 */
export function uniqueK8sName(kind: string, maxLen = 63): string {
  const compact = `ice-test-${kind}-${RAND_SUFFIX}`.toLowerCase().replace(/[^a-z0-9-]/g, '');
  return trim(compact, maxLen);
}

/**
 * Alibaba resource name. Most services accept dashes + 64 chars.
 *   OSS bucket:    3-63, lowercase + numbers + dashes, no uppercase
 *   RDS instance:  64
 *   ECS:           128
 *   SAE app:       36 (alphanumeric + dashes)
 *   FC function:   64 (alphanumeric + underscore + dash)
 *
 * For OSS, pass maxLen=63 and lowercase outside this helper.
 */
export function uniqueAlibabaName(service: string, maxLen = 64): string {
  return trim(`ice-test-${service}-${RUN_ID}-${RAND_SUFFIX}`, maxLen);
}

/**
 * OCI resource displayName — Compute / VCN / Subnet / Buckets all
 * accept 1-255 chars + most punctuation. Default 64 keeps log output
 * readable.
 *
 *   Object Storage bucket: 1-255, alphanumeric + dash + underscore
 *   Autonomous DB name:    1-14 chars, alphanumeric only (DB name,
 *                          distinct from displayName)
 *   VM displayName:        1-255
 */
export function uniqueOciName(service: string, maxLen = 64): string {
  return trim(`ice-test-${service}-${RUN_ID}-${RAND_SUFFIX}`, maxLen);
}

/**
 * DigitalOcean resource name. Most resources accept 64 chars.
 *   Droplet name:    1-255, alphanumeric + dash + dot
 *   Database name:   3-63, alphanumeric + dash
 *   Domain name:     valid DNS, operator-supplied (this helper isn't
 *                    used for DNS)
 *   Spaces bucket:   3-63, lowercase + numbers + dash
 */
export function uniqueDoName(service: string, maxLen = 63): string {
  return trim(`ice-test-${service}-${RUN_ID}-${RAND_SUFFIX}`, maxLen);
}

/**
 * IBM Cloud resource name. Code Engine + VPC + most managed services
 * accept 1-63 chars (alphanumeric + dash).
 *   VPC instance name:   1-63
 *   Code Engine app:     1-63 (alphanumeric + dash, must start with letter)
 *   COS bucket:          3-63 (lowercase + numbers + dash; globally unique)
 *   Secrets Manager:     2-256 chars
 */
export function uniqueIbmName(service: string, maxLen = 63): string {
  return trim(`ice-test-${service}-${RUN_ID}-${RAND_SUFFIX}`, maxLen);
}

// ─── deployer factories ────────────────────────────────────────────────────

export async function createAwsDeployer(): Promise<AWSDeployer> {
  const region = process.env.AWS_REGION!;
  const deployer = create_aws_deployer();
  await deployer.initialize({ regions: [region] });
  return deployer;
}

export interface AzureLiveContext {
  deployer: AzureDeployer;
  subscription: string;
  location: string;
  resourceGroup: string;
}

/**
 * Azure live tests need an existing test resource group. The developer
 * creates it once:
 *
 *   az group create --name ice-test-rg --location <AZURE_LOCATION>
 *
 * Each test tags resources with `ice:test-run-id=<runId>` so
 * `cleanup-orphans.ts` can sweep leaks without nuking unrelated state.
 */
export function azureTestResourceGroup(): string {
  return process.env.AZURE_TEST_RESOURCE_GROUP || 'ice-test-rg';
}

export async function createAzureDeployer(): Promise<AzureLiveContext> {
  const subscription = process.env.AZURE_SUBSCRIPTION_ID!;
  const location = process.env.AZURE_LOCATION!;
  const resourceGroup = azureTestResourceGroup();
  const deployer = create_azure_deployer();
  await deployer.initialize({
    subscriptions: [subscription],
    resource_groups: [resourceGroup],
    regions: [location],
  });
  return { deployer, subscription, location, resourceGroup };
}

export interface KubernetesLiveContext {
  deployer: KubernetesDeployer;
  namespace: string;
}

/**
 * Default test namespace. Operator can override via
 * `ICE_K8S_TEST_NAMESPACE`. The deployer auto-creates it.
 */
export function kubernetesTestNamespace(): string {
  return process.env.ICE_K8S_TEST_NAMESPACE || 'ice-test';
}

export async function createKubernetesDeployer(): Promise<KubernetesLiveContext> {
  const namespace = kubernetesTestNamespace();
  const deployer = create_kubernetes_deployer();
  await deployer.initialize({ provider: 'kubernetes', namespaces: [namespace] });
  return { deployer, namespace };
}

export interface AlibabaLiveContext {
  deployer: AlibabaDeployer;
  region: string;
}

export async function createAlibabaDeployer(): Promise<AlibabaLiveContext> {
  const region = process.env.ALIBABA_CLOUD_REGION!;
  const deployer = create_alibaba_deployer();
  await deployer.initialize({ provider: 'alibaba', region });
  return { deployer, region };
}

export interface OCILiveContext {
  deployer: OCIDeployer;
  region: string;
  compartmentId: string;
}

export async function createOCIDeployer(): Promise<OCILiveContext> {
  const region = process.env.OCI_REGION!;
  const compartmentId = process.env.OCI_COMPARTMENT_ID!;
  const deployer = create_oci_deployer();
  await deployer.initialize({
    provider: 'oci',
    region,
    oci_credentials: {
      compartment_id: compartmentId,
      region,
      config_path: process.env.OCI_CONFIG_FILE,
      profile: process.env.OCI_CONFIG_PROFILE ?? 'DEFAULT',
      auth_mode: (process.env.OCI_AUTH_MODE as 'config-file' | 'instance-principal') ?? 'config-file',
    },
  } as any);
  return { deployer, region, compartmentId };
}

export interface DigitalOceanLiveContext {
  deployer: DigitalOceanDeployer;
  region: string;
}

export async function createDigitalOceanDeployer(): Promise<DigitalOceanLiveContext> {
  const region = process.env.DIGITALOCEAN_REGION!;
  const deployer = create_digitalocean_deployer();
  await deployer.initialize({ provider: 'digitalocean', region } as any);
  return { deployer, region };
}

export interface IBMLiveContext {
  deployer: IBMDeployer;
  region: string;
  resourceGroupId: string;
}

export async function createIBMDeployer(): Promise<IBMLiveContext> {
  const region = process.env.IBMCLOUD_REGION!;
  const resourceGroupId = process.env.IBMCLOUD_RESOURCE_GROUP_ID!;
  const deployer = create_ibm_deployer();
  await deployer.initialize({ provider: 'ibm', region } as any);
  return { deployer, region, resourceGroupId };
}

// ─── JSONL logger ──────────────────────────────────────────────────────────

const E2E_RUNS_DIRS: Record<LiveProvider, string> = {
  aws: resolve(process.cwd(), 'e2e/aws-deployment-tests/runs'),
  azure: resolve(process.cwd(), 'e2e/azure-deployment-tests/runs'),
  kubernetes: resolve(process.cwd(), 'e2e/kubernetes-deployment-tests/runs'),
  alibaba: resolve(process.cwd(), 'e2e/alibaba-deployment-tests/runs'),
  oci: resolve(process.cwd(), 'e2e/oci-deployment-tests/runs'),
  digitalocean: resolve(process.cwd(), 'e2e/digitalocean-deployment-tests/runs'),
  ibm: resolve(process.cwd(), 'e2e/ibm-deployment-tests/runs'),
};

function providerOfHandlerName(handlerName: string): LiveProvider {
  if (handlerName.startsWith('azure-')) return 'azure';
  if (handlerName.startsWith('k8s-') || handlerName.startsWith('kubernetes-')) return 'kubernetes';
  if (handlerName.startsWith('alibaba-')) return 'alibaba';
  if (handlerName.startsWith('oci-')) return 'oci';
  if (handlerName.startsWith('digitalocean-') || handlerName.startsWith('do-')) return 'digitalocean';
  if (handlerName.startsWith('ibm-')) return 'ibm';
  return 'aws';
}

export class JsonlLogger {
  private path: string;

  constructor(handlerName: string) {
    const provider = providerOfHandlerName(handlerName);
    const dir = E2E_RUNS_DIRS[provider];
    mkdirSync(dir, { recursive: true });
    this.path = resolve(dir, `${RUN_ID}.jsonl`);
  }

  log(event: LiveEventInput): void {
    const full = { ...event, runId: RUN_ID, ts: new Date().toISOString() } as LiveEvent;
    appendFileSync(this.path, JSON.stringify(full) + '\n');
  }

  /**
   * No-op — appendFileSync flushes per call. Method exists so tests can
   * call `logger.close()` symmetrically with `createAwsDeployer().cleanup()`.
   */
  close(): void {}

  getPath(): string {
    return this.path;
  }
}
