/**
 * Static Cost Estimator (AI-Native #3)
 *
 * Rough monthly USD cost per resource, based on GCP list prices. Estimates
 * scale with a few key properties (replicas, size). Accurate to an order of
 * magnitude — meant as a "sanity check" number, not a billing forecast.
 */

import type { CardNode } from '../../../store/slices/cards-slice';

export interface CostEstimate {
  resourceName: string;
  nodeId: string;
  resourceType: string;
  monthlyEstimate: number; // USD
  notes?: string;
}

export interface CostResult {
  estimates: CostEstimate[];
  total: number;
}

const HOURS_PER_MONTH = 730;

function estimateOne(node: CardNode): CostEstimate | null {
  const iceType = (node.data?.iceType as string) || '';
  const label = (node.data?.label as string) || node.id;
  const size = (node.data?.size as string) || '';
  const replicas = Number(node.data?.replicas ?? node.data?.minInstances ?? 1) || 1;

  const base = (monthly: number, notes?: string): CostEstimate => ({
    resourceName: label,
    nodeId: node.id,
    resourceType: iceType,
    monthlyEstimate: Math.round(monthly * 100) / 100,
    notes,
  });

  // Compute
  if (iceType === 'Compute.Container' || iceType === 'Compute.Worker' || iceType === 'Compute.SSRSite') {
    const vCpuSec = 0.00002400 * 0.25 * 3600 * HOURS_PER_MONTH * replicas;
    return base(vCpuSec, `~${replicas}× replica(s), 0.25 vCPU avg`);
  }
  if (iceType === 'Compute.ServerlessFunction') {
    const estInvocations = Number(node.data?.expected_invocations_per_month) || 1_000_000;
    return base((estInvocations / 1_000_000) * 0.40, `~${estInvocations.toLocaleString()} invocations/mo`);
  }
  if (iceType === 'Compute.StaticSite') {
    return base(5, 'GCS + Cloud CDN');
  }
  if (iceType === 'Compute.CronJob') {
    return base(1, 'Cloud Scheduler');
  }

  // Databases
  if (iceType === 'Database.PostgreSQL' || iceType === 'Database.MySQL') {
    if (size.includes('Large')) return base(52, 'db-n1-standard-1');
    if (size.includes('Medium')) return base(20, 'db-g1-small');
    return base(7, 'db-f1-micro');
  }
  if (iceType === 'Database.Redis') {
    const memoryGb = Number(node.data?.memory_gb ?? 1) || 1;
    return base(35 * memoryGb, `${memoryGb}GB Memorystore`);
  }
  if (iceType === 'Database.MongoDB' || iceType === 'Database.DynamoDB' || iceType === 'Database.Firestore') {
    return base(15);
  }

  // Storage
  if (iceType === 'Storage.Bucket') {
    const gb = Number(node.data?.storage_gb ?? 50) || 50;
    return base(0.020 * gb, `~${gb}GB stored`);
  }

  // Messaging
  if (iceType === 'Messaging.Topic' || iceType === 'Messaging.Queue' || iceType === 'Messaging.RabbitMQ') {
    return base(10);
  }

  // Networking
  if (iceType === 'Network.Gateway') {
    return base(18, 'Load Balancer forwarding rule');
  }
  if (iceType === 'Network.CustomDomain') {
    return base(0.50, 'Cloud DNS');
  }

  // Security
  if (iceType === 'Security.Secret') {
    const secretCount = Array.isArray(node.data?.secrets) ? (node.data.secrets as unknown[]).length : 1;
    return base(0.06 * secretCount, `${secretCount} secret(s)`);
  }
  if (iceType === 'Security.Identity') {
    return base(0);
  }

  // AI
  if (iceType === 'AI.VectorDB') {
    return base(35, 'Vertex AI Vector Search');
  }
  if (iceType === 'AI.LLMGateway' || iceType === 'AI.ModelServing') {
    return base(20, 'per-token usage not included');
  }

  // Monitoring
  if (iceType.startsWith('Monitoring.')) {
    return base(5);
  }

  return null;
}

export function estimateCosts(nodes: CardNode[]): CostResult {
  const estimates: CostEstimate[] = [];
  for (const node of nodes) {
    const est = estimateOne(node);
    if (est) estimates.push(est);
  }
  const total = estimates.reduce((sum, e) => sum + e.monthlyEstimate, 0);
  return { estimates, total: Math.round(total * 100) / 100 };
}
