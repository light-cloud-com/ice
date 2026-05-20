/**
 * Cloud Blocks - Level 1 Abstractions
 *
 * Cloud Blocks are the highest-level abstractions in ICE, representing
 * logical deployment units that users think about when building applications.
 *
 * Block Hierarchy:
 *   Level 1: Cloud Blocks (StaticSite, ScalableBackend, DataStore, etc.)
 *   Level 2: High-Level Resources (Frontend App, Backend API, PostgreSQL)
 *   Level 3: Cloud Resources (S3, CloudFront, RDS, Lambda, etc.)
 *
 * Blocks contain:
 *   - Deployment metadata (URL, status, GitHub source)
 *   - Configuration (instance type, region, env vars)
 *   - Underlying resources (expandable)
 *
 * Module layout (rf-data-2 split):
 *   - `./cloud-blocks-types.ts` — types + interfaces
 *   - `./cloud-blocks-data.ts`  — bulk BLOCK_TEMPLATES + BLOCK_CATEGORIES (size-exception)
 *   - this file                 — public re-export shim + 5 helpers
 */

import { BLOCK_TEMPLATES } from './cloud-blocks-data';
import type { BlockTemplate, BlockType, CloudBlock, CloudProvider } from './cloud-blocks-types';

// Re-exports — public API consumers import from `./cloud-blocks.js`.
export { BLOCK_TEMPLATES, BLOCK_CATEGORIES } from './cloud-blocks-data';
export {
  type BlockConfig,
  type BlockDeployment,
  type BlockSource,
  type BlockStatus,
  type BlockTemplate,
  type BlockType,
  type CloudBlock,
  type CloudProvider,
  type EnvVar,
} from './cloud-blocks-types';

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get block template by name
 */
export function getBlockTemplate(name: string): BlockTemplate | undefined {
  return BLOCK_TEMPLATES.find((t) => t.name === name);
}

/**
 * Create a new block from a template
 */
export function createBlockFromTemplate(
  template: BlockTemplate,
  inputs: Record<string, unknown>,
  provider: CloudProvider = 'aws',
): CloudBlock {
  const now = new Date().toISOString();
  const id = `block-${template.name}-${Date.now()}`;

  return {
    id,
    name: (inputs.name as string) || template.display_name,
    type: template.type,
    description: template.description,
    provider,
    deployment: {
      status: 'unknown',
    },
    config: {
      ...template.default_config,
      ...inputs,
    },
    tags: {},
    created_at: now,
    updated_at: now,
  };
}

/**
 * Get the display tag for a block type
 */
export function getBlockTypeTag(type: BlockType): { label: string; color: string } {
  const tags: Record<BlockType, { label: string; color: string }> = {
    'static-site': { label: 'Frontend', color: 'blue' },
    'scalable-backend': { label: 'Backend', color: 'green' },
    worker: { label: 'Worker', color: 'purple' },
    database: { label: 'Database', color: 'orange' },
    'nosql-database': { label: 'NoSQL', color: 'amber' },
    cache: { label: 'Cache', color: 'red' },
    storage: { label: 'Storage', color: 'cyan' },
    gateway: { label: 'Gateway', color: 'pink' },
    'scheduled-task': { label: 'Cron', color: 'yellow' },
    'serverless-function': { label: 'Function', color: 'lime' },
    queue: { label: 'Queue', color: 'violet' },
    'event-stream': { label: 'Stream', color: 'indigo' },
    logs: { label: 'Logs', color: 'slate' },
    cdn: { label: 'CDN', color: 'sky' },
    auth: { label: 'Auth', color: 'emerald' },
    secrets: { label: 'Secrets', color: 'rose' },
    custom: { label: 'Custom', color: 'gray' },
  };
  return tags[type] || tags.custom;
}

/**
 * Get provider icon
 */
export function getProviderIcon(provider: CloudProvider): string {
  const icons: Record<CloudProvider, string> = {
    aws: 'aws',
    gcp: 'gcp',
    azure: 'azure',
    kubernetes: 'kubernetes',
    alibaba: 'alibaba',
    oci: 'oci',
    digitalocean: 'digitalocean',
    ibm: 'ibm',
    custom: 'cloud',
  };
  return icons[provider];
}

/**
 * Format uptime from timestamp
 */
export function formatUptime(deployedAt?: string): string {
  if (!deployedAt) return 'Unknown';

  const deployed = new Date(deployedAt);
  const now = new Date();
  const diff = now.getTime() - deployed.getTime();

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days} day${days > 1 ? 's' : ''}`;
  }
  return `${hours} hour${hours !== 1 ? 's' : ''}`;
}
