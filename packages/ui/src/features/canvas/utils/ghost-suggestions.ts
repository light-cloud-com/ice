import type { CardNode, CardEdge } from '../../../store/slices/cards-slice';
import type { GhostNode } from '../../../store/slices/ghost-slice';

/**
 * Static rules mapping a dropped block's iceType to suggested companions.
 * Keys and values use real project iceTypes (see @ice/constants/ice-types).
 * Each entry lists at most 3 suggested targets, in priority order.
 */
const SUGGESTION_RULES: Record<
  string,
  Array<{
    iceType: string;
    label: string;
    relationship: 'connects_to' | 'depends_on';
    direction: 'from' | 'to';
  }>
> = {
  'Compute.Container': [
    { iceType: 'Database.PostgreSQL', label: 'Database', relationship: 'connects_to', direction: 'to' },
    { iceType: 'Security.Secret', label: 'Secrets', relationship: 'depends_on', direction: 'to' },
    { iceType: 'Database.Redis', label: 'Cache', relationship: 'connects_to', direction: 'to' },
  ],
  'Compute.SSRSite': [
    { iceType: 'Network.Gateway', label: 'API Gateway', relationship: 'connects_to', direction: 'to' },
    { iceType: 'Compute.Container', label: 'Backend', relationship: 'connects_to', direction: 'to' },
  ],
  'Compute.StaticSite': [
    { iceType: 'Network.CustomDomain', label: 'Custom Domain', relationship: 'connects_to', direction: 'from' },
  ],
  'Compute.ServerlessFunction': [
    { iceType: 'Storage.Bucket', label: 'Storage', relationship: 'connects_to', direction: 'to' },
    { iceType: 'Security.Secret', label: 'Secrets', relationship: 'depends_on', direction: 'to' },
  ],
  'Compute.Worker': [
    { iceType: 'Messaging.RabbitMQ', label: 'Queue', relationship: 'connects_to', direction: 'from' },
    { iceType: 'Database.Redis', label: 'Cache', relationship: 'connects_to', direction: 'to' },
  ],
  'Database.PostgreSQL': [
    { iceType: 'Security.Secret', label: 'Secrets', relationship: 'depends_on', direction: 'from' },
    { iceType: 'Compute.Container', label: 'Backend', relationship: 'connects_to', direction: 'from' },
  ],
  'Database.MySQL': [
    { iceType: 'Security.Secret', label: 'Secrets', relationship: 'depends_on', direction: 'from' },
    { iceType: 'Compute.Container', label: 'Backend', relationship: 'connects_to', direction: 'from' },
  ],
  'Database.Redis': [
    { iceType: 'Compute.Container', label: 'Backend', relationship: 'connects_to', direction: 'from' },
  ],
  'Network.Gateway': [
    { iceType: 'Compute.Container', label: 'Backend', relationship: 'connects_to', direction: 'to' },
    { iceType: 'Security.Identity', label: 'Auth', relationship: 'depends_on', direction: 'to' },
  ],
  'AI.LLMGateway': [
    { iceType: 'AI.VectorDB', label: 'Vector DB', relationship: 'connects_to', direction: 'to' },
    { iceType: 'Storage.Bucket', label: 'Storage', relationship: 'connects_to', direction: 'to' },
  ],
  'AI.VectorDB': [
    { iceType: 'AI.LLMGateway', label: 'LLM Gateway', relationship: 'connects_to', direction: 'from' },
    { iceType: 'Compute.Container', label: 'Backend', relationship: 'connects_to', direction: 'from' },
  ],
  'Storage.Bucket': [
    { iceType: 'Compute.Container', label: 'Backend', relationship: 'connects_to', direction: 'from' },
  ],
  'Messaging.RabbitMQ': [
    { iceType: 'Compute.Worker', label: 'Worker', relationship: 'connects_to', direction: 'to' },
    { iceType: 'Compute.Container', label: 'Backend', relationship: 'connects_to', direction: 'from' },
  ],
};

const GHOST_OFFSET_X = 220;
const GHOST_OFFSET_Y_STEP = 90;

/**
 * Generate ghost suggestions for a dropped node. Skips iceTypes already
 * present on the canvas (no duplicate suggestions). Returns at most 3.
 */
export function generateGhostSuggestions(
  droppedNode: CardNode,
  existingNodes: CardNode[],
  _existingEdges: CardEdge[],
): GhostNode[] {
  const iceType = (droppedNode.data?.iceType as string) || '';
  const rules = SUGGESTION_RULES[iceType];
  if (!rules || rules.length === 0) return [];

  const existingTypes = new Set(
    existingNodes.map((n) => (n.data?.iceType as string) || '').filter(Boolean),
  );

  const now = Date.now();
  const ghosts: GhostNode[] = [];

  for (let i = 0; i < rules.length && ghosts.length < 3; i++) {
    const rule = rules[i]!;
    if (existingTypes.has(rule.iceType)) continue;

    ghosts.push({
      id: `ghost-${rule.iceType.replace(/\./g, '-')}-${now}-${i}`,
      iceType: rule.iceType,
      label: rule.label,
      position: {
        x: droppedNode.position.x + GHOST_OFFSET_X,
        y: droppedNode.position.y + i * GHOST_OFFSET_Y_STEP,
      },
      sourceNodeId: droppedNode.id,
      edgeRelationship: rule.relationship,
      edgeDirection: rule.direction,
      createdAt: now,
    });
  }

  return ghosts;
}
