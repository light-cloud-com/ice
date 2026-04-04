/**
 * Deploy Validation Rules
 *
 * Validates deployability: provider support, type mapping availability,
 * design-only provider detection, and environment-specific requirements.
 */

import { isContainer } from './classifiers.js';
import { getSupportedProviders } from './schema-bridge.js';
import type { CanvasIssue, ValidatableNode, ValidatableEdge, ValidationContext } from './types.js';

// ── Deploy type maps (mirrored from card-translator.ts) ─────────────────────
// These record which iceTypes have actual deployer implementations.

const GCP_DEPLOYABLE: Set<string> = new Set([
  'Compute.StaticSite', 'Compute.SSRSite', 'Compute.Container', 'Compute.BackendAPI',
  'Compute.Worker', 'Compute.CronJob', 'Compute.ServerlessFunction',
  'Database.PostgreSQL', 'Database.MySQL', 'Database.Firestore', 'Database.Redis',
  'Storage.Bucket', 'Storage.ObjectStorage',
  'Network.Gateway', 'Network.Internet', 'Network.LoadBalancer', 'Network.Domain',
  'Messaging.CloudPubSub', 'Messaging.Queue', 'Messaging.Topic', 'Messaging.RabbitMQ',
  'Security.Identity', 'Security.Secret',
  'Monitoring.Log',
  'AI.VectorDB', 'AI.LLMGateway', 'AI.ModelServing',
  'Analytics.DataWarehouse', 'Analytics.Search',
]);

const AWS_DEPLOYABLE: Set<string> = new Set([
  'Compute.StaticSite', 'Compute.SSRSite', 'Compute.Container', 'Compute.BackendAPI',
  'Compute.Worker', 'Compute.CronJob', 'Compute.ServerlessFunction',
  'Database.PostgreSQL', 'Database.MySQL', 'Database.DynamoDB', 'Database.Redis', 'Database.MongoDB',
  'Storage.Bucket', 'Storage.ObjectStorage',
  'Network.Gateway', 'Network.Internet', 'Network.LoadBalancer',
  'Messaging.Queue', 'Messaging.Topic', 'Messaging.CloudPubSub',
  'Security.Identity', 'Security.Secret',
  'Monitoring.Log',
  'AI.VectorDB', 'AI.LLMGateway', 'AI.ModelServing',
  'Analytics.DataWarehouse',
]);

const AZURE_DEPLOYABLE: Set<string> = new Set([
  'Compute.StaticSite', 'Compute.SSRSite', 'Compute.Container', 'Compute.BackendAPI',
  'Compute.Worker', 'Compute.CronJob', 'Compute.ServerlessFunction',
  'Database.PostgreSQL', 'Database.MySQL', 'Database.CosmosDB', 'Database.Redis', 'Database.MongoDB',
  'Storage.Bucket', 'Storage.ObjectStorage',
  'Network.Gateway', 'Network.Internet', 'Network.LoadBalancer',
  'Messaging.Queue', 'Messaging.Topic',
  'Security.Identity', 'Security.Secret',
  'Monitoring.Log',
  'AI.VectorDB', 'AI.LLMGateway', 'AI.ModelServing',
  'Analytics.DataWarehouse',
]);

const DEPLOY_MAPS: Record<string, Set<string>> = {
  gcp: GCP_DEPLOYABLE,
  aws: AWS_DEPLOYABLE,
  azure: AZURE_DEPLOYABLE,
};

const DESIGN_ONLY_PROVIDERS = new Set(['alibaba', 'digitalocean', 'kubernetes', 'oci']);
const UI_ONLY_TYPES = new Set(['Monitoring.Terminal']);

/**
 * Validate deployability of the canvas.
 * Only runs in 'pre-deploy' mode.
 */
export function validateDeployability(
  nodes: readonly ValidatableNode[],
  edges: readonly ValidatableEdge[],
  ctx: ValidationContext,
): CanvasIssue[] {
  const issues: CanvasIssue[] = [];
  const provider = ctx.provider;

  if (!provider) {
    issues.push({
      id: 'deploy:NO_PROVIDER',
      severity: 'error',
      category: 'deploy',
      code: 'NO_CREDENTIALS',
      message: 'No target provider selected',
      suggestion: 'Select a cloud provider (AWS, GCP, or Azure) before deploying',
    });
    return issues;
  }

  // ── Design-only provider ──────────────────────────────────────────────
  if (DESIGN_ONLY_PROVIDERS.has(provider)) {
    issues.push({
      id: `deploy:${provider}:DESIGN_ONLY_PROVIDER`,
      severity: 'error',
      category: 'deploy',
      code: 'DESIGN_ONLY_PROVIDER',
      message: `${provider} is design-only — deployment is not yet supported`,
      suggestion: 'Export to Terraform or Pulumi, or switch to AWS, GCP, or Azure',
    });
    return issues;
  }

  // ── Credentials ─────────────────────────────────────────────────────
  if (ctx.hasCredentials === false) {
    issues.push({
      id: `deploy:${provider}:NO_CREDENTIALS`,
      severity: 'error',
      category: 'deploy',
      code: 'NO_CREDENTIALS',
      message: `No ${provider.toUpperCase()} credentials connected`,
      suggestion: `Connect ${provider.toUpperCase()} credentials in Settings → Integrations`,
    });
  }

  const deployableSet = DEPLOY_MAPS[provider];

  for (const node of nodes) {
    const iceType = node.data.iceType as string | undefined;
    if (!iceType) continue;

    // Skip containers, groups, and special types
    if (isContainer(iceType, node.type)) continue;
    if (node.type === 'container' || node.type === 'group') continue;
    if (iceType === 'Source.Repository' || iceType === 'Config.Environment') continue;

    const label = (node.data.label as string) || iceType.split('.').pop() || 'Resource';

    // ── UI-only type ──────────────────────────────────────────────────
    if (UI_ONLY_TYPES.has(iceType)) {
      // Info only — these are expected to be skipped
      continue;
    }

    // ── Provider support check ────────────────────────────────────────
    const nodeProvider = (node.data.provider as string) ?? provider;
    if (DESIGN_ONLY_PROVIDERS.has(nodeProvider)) {
      issues.push({
        id: `deploy:${node.id}:DESIGN_ONLY_PROVIDER`,
        severity: 'warning',
        category: 'deploy',
        code: 'DESIGN_ONLY_PROVIDER',
        message: `${label} uses ${nodeProvider} which is design-only — will be skipped`,
        nodeId: node.id,
      });
      continue;
    }

    // ── Provider unsupported flag (from template expansion) ───────────
    if (node.data.providerUnsupported) {
      issues.push({
        id: `deploy:${node.id}:UNSUPPORTED_PROVIDER`,
        severity: 'warning',
        category: 'deploy',
        code: 'UNSUPPORTED_PROVIDER',
        message: `${label} is not supported on ${nodeProvider} — will be skipped`,
        nodeId: node.id,
      });
      continue;
    }

    // ── Type mapping check ────────────────────────────────────────────
    if (deployableSet && !deployableSet.has(iceType)) {
      // Check if any provider supports this iceType
      const supportedProviders = getSupportedProviders(iceType);
      if (supportedProviders.length > 0) {
        issues.push({
          id: `deploy:${node.id}:NO_TYPE_MAPPING`,
          severity: 'warning',
          category: 'deploy',
          code: 'NO_TYPE_MAPPING',
          message: `${label} (${iceType}) has no ${provider.toUpperCase()} deployer — will be skipped`,
          nodeId: node.id,
          suggestion: supportedProviders.length > 0
            ? `Supported on: ${supportedProviders.join(', ')}`
            : undefined,
        });
      }
    }

    // ── Production-specific property requirements ─────────────────────
    if (ctx.environment === 'production') {
      const data = node.data;

      // Scalable services should have scaling configured
      if (data.behavior === 'scalable') {
        if (!data.maxInstances || (data.maxInstances as number) <= 1) {
          issues.push({
            id: `deploy:${node.id}:scaling:MISSING_DEPLOY_PROPERTY`,
            severity: 'warning',
            category: 'deploy',
            code: 'MISSING_DEPLOY_PROPERTY',
            message: `${label} has no auto-scaling configured for production`,
            nodeId: node.id,
            suggestion: 'Set max instances > 1 for production workloads',
          });
        }
      }
    }
  }

  return issues;
}
