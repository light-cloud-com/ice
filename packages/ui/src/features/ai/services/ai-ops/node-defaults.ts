/**
 * AI ops — default size selection for AI-added nodes.
 *
 * Extracted from `operation-executor.ts` (rf-aiop-6). Pure helper that
 * picks the default width / height for a node based on its iceType +
 * type (container/non-container). The match table is preserved verbatim
 * from the source — every value here shifts on-canvas dimensions of
 * AI-placed nodes:
 *
 *   - Network.VPC      → 280 x 180
 *   - Network.Subnet   → 260 x 150
 *   - container (any)  → 260 x 150
 *   - helper iceType   → HELPER_NODE_WIDTH x HELPER_NODE_HEIGHT
 *   - default          → NODE_WIDTH x NODE_HEIGHT
 *
 * The VPC/Subnet/container branches all start "small" intentionally —
 * `autoResizeContainers` later expands them around their children.
 */

import { isHelperIceType } from './position-finder';
import { NODE_WIDTH, NODE_HEIGHT, HELPER_NODE_WIDTH, HELPER_NODE_HEIGHT } from './types';

export interface NodeDefaults {
  width: number;
  height: number;
}

export function pickNodeDefaults(nodeType: string, iceType: string): NodeDefaults {
  const isGroup = nodeType === 'container';
  const isVpc = iceType === 'Network.VPC';
  const isSubnet = iceType === 'Network.Subnet';
  const isHelper = isHelperIceType(iceType);

  const width = isVpc ? 280 : isSubnet ? 260 : isGroup ? 260 : isHelper ? HELPER_NODE_WIDTH : NODE_WIDTH;
  const height = isVpc ? 180 : isSubnet ? 150 : isGroup ? 150 : isHelper ? HELPER_NODE_HEIGHT : NODE_HEIGHT;

  return { width, height };
}
