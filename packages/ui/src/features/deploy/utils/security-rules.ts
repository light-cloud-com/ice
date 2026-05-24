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

// ─── Schema-shaped security role table ──────────────────────────────────────
//
// Per-iceType + per-category-prefix declarations of which security role
// each block plays. The rule evaluator (below) consults this generically
// — no iceType strings appear in rule code. New blocks join a role by
// adding a table entry or by inheriting a category prefix (e.g. any new
// `Database.*` iceType is automatically a database for security purposes).

type SecurityRole =
  | 'database'
  | 'storage'
  | 'gateway'
  | 'compute'
  | 'auth'
  | 'secretManager'
  | 'monitoringSink'
  /** Satisfies "this node is nested inside an isolation container" — VPC,
   *  Subnet (always inside a VPC), or PrivateNetwork. */
  | 'isolatesNestedChildren'
  /** Top-level boundary you can sensibly drop at the canvas root to
   *  isolate everything inside it — VPC or PrivateNetwork. Subnet alone
   *  does NOT count: a Subnet at the root is meaningless without a VPC
   *  parent. */
  | 'topLevelNetworkBoundary';

const SECURITY_ROLES_BY_ICE_TYPE: Record<string, ReadonlyArray<SecurityRole>> = {
  'Storage.Bucket': ['storage'],
  'Network.Gateway': ['gateway'],
  'Security.Identity': ['auth'],
  'Security.Secret': ['secretManager'],
  // Three iceTypes act as "inside a private network" for the ancestor
  // check — the high-level PrivateNetwork (auto-mode VPC) plus the
  // explicit VPC + Subnet primitives. Only VPC + PrivateNetwork are
  // top-level boundaries (a lone Subnet at the canvas root doesn't
  // isolate anything).
  'Network.VPC': ['isolatesNestedChildren', 'topLevelNetworkBoundary'],
  'Network.Subnet': ['isolatesNestedChildren'],
  'Network.PrivateNetwork': ['isolatesNestedChildren', 'topLevelNetworkBoundary'],
};

// Category-prefix inheritance. Any iceType matching one of these prefixes
// gets the corresponding role for free, so adding a new database/compute/
// monitoring block doesn't require a table edit.
const SECURITY_ROLES_BY_PREFIX: ReadonlyArray<{ prefix: string; role: SecurityRole }> = [
  { prefix: 'Database.', role: 'database' },
  { prefix: 'Compute.', role: 'compute' },
  { prefix: 'Monitoring.', role: 'monitoringSink' },
];

function hasSecurityRole(iceType: string, role: SecurityRole): boolean {
  if (SECURITY_ROLES_BY_ICE_TYPE[iceType]?.includes(role)) return true;
  for (const entry of SECURITY_ROLES_BY_PREFIX) {
    if (entry.role === role && iceType.startsWith(entry.prefix)) return true;
  }
  return false;
}

// Thin role-readers used by the rule evaluator. Each is a one-line
// lookup against the schema-shaped table — no iceType strings here.
const ice = (n: CardNode): string => (n.data?.iceType as string) || '';
const isDatabase = (n: CardNode): boolean => hasSecurityRole(ice(n), 'database');
const isStorage = (n: CardNode): boolean => hasSecurityRole(ice(n), 'storage');
const isGateway = (n: CardNode): boolean => hasSecurityRole(ice(n), 'gateway');
const isService = (n: CardNode): boolean => hasSecurityRole(ice(n), 'compute');
const isAuth = (n: CardNode): boolean => hasSecurityRole(ice(n), 'auth');
const isSecret = (n: CardNode): boolean => hasSecurityRole(ice(n), 'secretManager');
const isMonitoring = (n: CardNode): boolean => hasSecurityRole(ice(n), 'monitoringSink');
const isVpcLike = (n: CardNode): boolean => hasSecurityRole(ice(n), 'isolatesNestedChildren');
const isTopLevelBoundary = (n: CardNode): boolean => hasSecurityRole(ice(n), 'topLevelNetworkBoundary');

function isInsideVpc(node: CardNode, allNodes: CardNode[]): boolean {
  let cur: CardNode | undefined = node;
  let depth = 0;
  while (cur?.parentId && depth < 10) {
    const parent = allNodes.find((n) => n.id === cur!.parentId);
    if (!parent) return false;
    if (isVpcLike(parent)) return true;
    cur = parent;
    depth++;
  }
  return false;
}

function hasEdgeFromOrTo(
  nodeId: string,
  predicate: (n: CardNode) => boolean,
  edges: CardEdge[],
  allNodes: CardNode[],
): boolean {
  return edges.some((e) => {
    const other =
      e.source === nodeId
        ? allNodes.find((n) => n.id === e.target)
        : e.target === nodeId
          ? allNodes.find((n) => n.id === e.source)
          : null;
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
      description: "Add a Monitoring.Log block to capture service logs. Without it, you can't debug production issues.",
      dismissible: true,
    });
  }

  // Rule 6: No private network — info. Counts only top-level boundaries
  // (VPC + PrivateNetwork). Subnet alone doesn't satisfy this rule
  // because a Subnet at the canvas root has no parent VPC and isolates
  // nothing — see the `topLevelNetworkBoundary` role.
  const serviceCount = nodes.filter(isService).length;
  const hasNetworkBoundary = nodes.some(isTopLevelBoundary);
  if (serviceCount >= 2 && !hasNetworkBoundary) {
    warnings.push({
      id: 'bp-no-vpc',
      severity: 'info',
      category: 'best-practice',
      title: 'Multiple services without a private network',
      description: 'Consider wrapping your services and databases in a Network.PrivateNetwork for network isolation.',
      dismissible: true,
    });
  }

  return warnings;
}
