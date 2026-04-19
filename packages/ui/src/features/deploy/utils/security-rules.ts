/**
 * Pre-Deploy Security Rules (AI-Native #3)
 *
 * Deterministic rules that scan the canvas for common security mis-configs.
 * Runs between `plan` and `apply`. No AI calls.
 */

import type { CardNode, CardEdge } from '../../../store/slices/cards-slice';

export type WarningSeverity = 'info' | 'warning' | 'critical';

export interface PreDeployWarning {
  id: string;
  severity: WarningSeverity;
  category: 'security' | 'cost' | 'best-practice';
  title: string;
  description: string;
  nodeId?: string;
  dismissible: boolean;
}

// ─── Classifiers ────────────────────────────────────────────────────────────

const isDatabase = (n: CardNode): boolean => {
  const iceType = (n.data?.iceType as string) || '';
  return iceType.startsWith('Database.');
};

const isStorage = (n: CardNode): boolean => {
  const iceType = (n.data?.iceType as string) || '';
  return iceType === 'Storage.Bucket';
};

const isGateway = (n: CardNode): boolean => {
  const iceType = (n.data?.iceType as string) || '';
  return iceType === 'Network.Gateway';
};

const isService = (n: CardNode): boolean => {
  const iceType = (n.data?.iceType as string) || '';
  return iceType.startsWith('Compute.');
};

const isAuth = (n: CardNode): boolean => (n.data?.iceType as string) === 'Security.Identity';
const isSecret = (n: CardNode): boolean => (n.data?.iceType as string) === 'Security.Secret';
const isMonitoring = (n: CardNode): boolean => {
  const iceType = (n.data?.iceType as string) || '';
  return iceType.startsWith('Monitoring.') || iceType === 'Monitoring.Log';
};
const isVpc = (n: CardNode): boolean => (n.data?.iceType as string) === 'Network.VPC';
const isSubnet = (n: CardNode): boolean => (n.data?.iceType as string) === 'Network.Subnet';

function isInsideVpc(node: CardNode, allNodes: CardNode[]): boolean {
  let cur: CardNode | undefined = node;
  let depth = 0;
  while (cur?.parentId && depth < 10) {
    const parent = allNodes.find((n) => n.id === cur!.parentId);
    if (!parent) return false;
    if (isVpc(parent) || isSubnet(parent)) return true;
    cur = parent;
    depth++;
  }
  return false;
}

function hasEdgeTo(sourceId: string, targetPredicate: (n: CardNode) => boolean, edges: CardEdge[], allNodes: CardNode[]): boolean {
  return edges.some((e) => {
    if (e.source !== sourceId) return false;
    const target = allNodes.find((n) => n.id === e.target);
    return target ? targetPredicate(target) : false;
  });
}

function hasEdgeFromOrTo(nodeId: string, predicate: (n: CardNode) => boolean, edges: CardEdge[], allNodes: CardNode[]): boolean {
  return edges.some((e) => {
    const other = e.source === nodeId ? allNodes.find((n) => n.id === e.target) : e.target === nodeId ? allNodes.find((n) => n.id === e.source) : null;
    return other ? predicate(other) : false;
  });
}

// ─── Rule runner ────────────────────────────────────────────────────────────

export function analyzeSecurityWarnings(nodes: CardNode[], edges: CardEdge[]): PreDeployWarning[] {
  const warnings: PreDeployWarning[] = [];

  // Rule 1: Public database — critical
  for (const db of nodes.filter(isDatabase)) {
    const insideVpc = isInsideVpc(db, nodes);
    const privateIp = db.data?.private_ip === true || db.data?.privateIp === true;
    if (!insideVpc && !privateIp) {
      warnings.push({
        id: `sec-public-db-${db.id}`,
        severity: 'critical',
        category: 'security',
        title: 'Database is publicly reachable',
        description: `"${(db.data?.label as string) || db.id}" is not inside a VPC and has no private IP. It will be exposed to the internet.`,
        nodeId: db.id,
        dismissible: false,
      });
    }
  }

  // Rule 2: Missing secrets — warning (service with env vars but no Secret edge)
  const secretNodes = nodes.filter(isSecret);
  for (const svc of nodes.filter(isService)) {
    const hasEnvVars = Array.isArray(svc.data?.env_vars) && (svc.data.env_vars as unknown[]).length > 0;
    if (!hasEnvVars) continue;
    if (secretNodes.length === 0 || !hasEdgeFromOrTo(svc.id, isSecret, edges, nodes)) {
      warnings.push({
        id: `sec-missing-secrets-${svc.id}`,
        severity: 'warning',
        category: 'security',
        title: 'Service has env vars but no Secret Manager',
        description: `"${(svc.data?.label as string) || svc.id}" declares environment variables but doesn't connect to a Secret Manager block. Raw values will deploy as plain config.`,
        nodeId: svc.id,
        dismissible: true,
      });
    }
  }

  // Rule 3: Public storage — warning
  for (const bucket of nodes.filter(isStorage)) {
    const isPublic = bucket.data?.public === true || bucket.data?.access === 'allUsers';
    if (isPublic) {
      warnings.push({
        id: `sec-public-storage-${bucket.id}`,
        severity: 'warning',
        category: 'security',
        title: 'Storage bucket is publicly accessible',
        description: `"${(bucket.data?.label as string) || bucket.id}" is marked public. Anyone on the internet can read its objects.`,
        nodeId: bucket.id,
        dismissible: true,
      });
    }
  }

  // Rule 4: No auth on gateway — warning
  const authNodes = nodes.filter(isAuth);
  for (const gw of nodes.filter(isGateway)) {
    if (authNodes.length === 0 || !hasEdgeFromOrTo(gw.id, isAuth, edges, nodes)) {
      warnings.push({
        id: `sec-gateway-no-auth-${gw.id}`,
        severity: 'warning',
        category: 'security',
        title: 'API Gateway has no auth block',
        description: `"${(gw.data?.label as string) || gw.id}" exposes services without an Auth block connected. Add Security.Identity to authenticate callers.`,
        nodeId: gw.id,
        dismissible: true,
      });
    }
  }

  // Rule 5: Missing monitoring — info
  if (nodes.filter(isMonitoring).length === 0 && nodes.some(isService)) {
    warnings.push({
      id: 'bp-missing-monitoring',
      severity: 'info',
      category: 'best-practice',
      title: 'No monitoring blocks on canvas',
      description: 'Add a Monitoring.Log block to capture service logs. Without it, you can\'t debug production issues.',
      dismissible: true,
    });
  }

  // Rule 6: No VPC — info
  const serviceCount = nodes.filter(isService).length;
  const hasVpc = nodes.some(isVpc);
  if (serviceCount >= 2 && !hasVpc) {
    warnings.push({
      id: 'bp-no-vpc',
      severity: 'info',
      category: 'best-practice',
      title: 'Multiple services without a VPC',
      description: 'Consider wrapping your services and databases in a Network.VPC for network isolation.',
      dismissible: true,
    });
  }

  return warnings;
}
