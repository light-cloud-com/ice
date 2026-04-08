/**
 * Block Category Definitions — shared between resource palette and context menu
 */

export interface BlockCategoryDef {
  id: string;
  label: string;
}

export const BLOCK_CATEGORIES: BlockCategoryDef[] = [
  { id: 'Compute', label: 'Compute' },
  { id: 'Scheduler', label: 'Scheduler' },
  { id: 'Frontend', label: 'Frontend' },
  { id: 'Network', label: 'Network' },
  { id: 'Database', label: 'Database' },
  { id: 'Cache', label: 'Cache' },
  { id: 'Messaging', label: 'Messaging' },
  { id: 'Storage', label: 'Storage' },
  { id: 'Security', label: 'Security' },
  { id: 'AI', label: 'AI' },
  { id: 'Analytics', label: 'Analytics' },
  { id: 'Monitoring', label: 'Monitoring' },
  { id: 'Source', label: 'Source' },
  { id: 'Config', label: 'Config' },
];

export const BLOCK_CATEGORY_ORDER = BLOCK_CATEGORIES.map((c) => c.id);

/** Case-insensitive lookup: 'compute' → 'Compute', 'ai' → 'AI' */
const CATEGORY_LABEL_MAP = new Map(
  BLOCK_CATEGORIES.map((c) => [c.id.toLowerCase(), c.label]),
);

export function getBlockCategoryLabel(raw: string): string {
  return CATEGORY_LABEL_MAP.get(raw.toLowerCase()) || raw.charAt(0).toUpperCase() + raw.slice(1);
}
