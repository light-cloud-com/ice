/**
 * Cloud Blocks — Bulk template registry and category definitions (orchestrator).
 *
 * Module layout (rf-cbdat split):
 *   - `./cloud-blocks-data/frontend.ts`      — static-site
 *   - `./cloud-blocks-data/backend.ts`       — scalable-backend, worker, scheduled-task
 *   - `./cloud-blocks-data/compute.ts`       — serverless-function
 *   - `./cloud-blocks-data/data.ts`          — database, redis-cache, nosql-database
 *   - `./cloud-blocks-data/storage.ts`       — file-storage
 *   - `./cloud-blocks-data/networking.ts`    — api-gateway, cdn
 *   - `./cloud-blocks-data/messaging.ts`     — event-stream, queue
 *   - `./cloud-blocks-data/observability.ts` — logs
 *   - `./cloud-blocks-data/security.ts`      — auth, secrets
 *
 *   This file assembles the per-category arrays into the `BLOCK_TEMPLATES`
 *   list and derives `BLOCK_CATEGORIES` (palette grouping) from it. Order is
 *   preserved verbatim from the original file so consumer code that depends
 *   on traversal order stays stable.
 *
 *   Types live in `./cloud-blocks-types.ts`.
 *   Helpers (`getBlockTemplate`, `createBlockFromTemplate`, `getBlockTypeTag`,
 *   `getProviderIcon`, `formatUptime`) and the public re-export shim live in
 *   `./cloud-blocks.ts`.
 */

import type { BlockTemplate } from './cloud-blocks-types.js';
import { BACKEND_TEMPLATES } from './cloud-blocks-data/backend.js';
import { COMPUTE_TEMPLATES } from './cloud-blocks-data/compute.js';
import { DATA_TEMPLATES } from './cloud-blocks-data/data.js';
import { FRONTEND_TEMPLATES } from './cloud-blocks-data/frontend.js';
import { MESSAGING_TEMPLATES } from './cloud-blocks-data/messaging.js';
import { NETWORKING_TEMPLATES } from './cloud-blocks-data/networking.js';
import { OBSERVABILITY_TEMPLATES } from './cloud-blocks-data/observability.js';
import { SECURITY_TEMPLATES } from './cloud-blocks-data/security.js';
import { STORAGE_TEMPLATES } from './cloud-blocks-data/storage.js';

// =============================================================================
// Block Templates Registry
// =============================================================================
//
// Assembly order matches the original file's section order: Frontend, Backend
// (3 templates), Data (3), Networking (2), Messaging (2), Compute, Data,
// Storage, Observability, Networking, Security (2). Splitting templates by
// category groups each `category:` value together; reproduce the original
// traversal order here.
export const BLOCK_TEMPLATES: BlockTemplate[] = [
  ...FRONTEND_TEMPLATES, // static-site
  BACKEND_TEMPLATES[0]!, // scalable-backend
  BACKEND_TEMPLATES[1]!, // worker
  DATA_TEMPLATES[0]!, // database
  DATA_TEMPLATES[1]!, // redis-cache
  BACKEND_TEMPLATES[2]!, // scheduled-task
  NETWORKING_TEMPLATES[0]!, // api-gateway
  MESSAGING_TEMPLATES[0]!, // event-stream
  MESSAGING_TEMPLATES[1]!, // queue
  ...COMPUTE_TEMPLATES, // serverless-function
  DATA_TEMPLATES[2]!, // nosql-database
  ...STORAGE_TEMPLATES, // file-storage
  ...OBSERVABILITY_TEMPLATES, // logs
  NETWORKING_TEMPLATES[1]!, // cdn
  SECURITY_TEMPLATES[0]!, // auth
  SECURITY_TEMPLATES[1]!, // secrets
];

// =============================================================================
// Block Categories for Palette
// =============================================================================

export const BLOCK_CATEGORIES = [
  {
    id: 'frontend',
    name: 'Frontend',
    description: 'Web apps and static sites',
    icon: 'Globe',
    blocks: BLOCK_TEMPLATES.filter((b) => b.category === 'Frontend'),
  },
  {
    id: 'compute',
    name: 'Compute',
    description: 'APIs, services, workers, and functions',
    icon: 'Server',
    blocks: BLOCK_TEMPLATES.filter((b) => b.category === 'Backend' || b.category === 'Compute'),
  },
  {
    id: 'data',
    name: 'Data',
    description: 'Databases and caches',
    icon: 'Database',
    blocks: BLOCK_TEMPLATES.filter((b) => b.category === 'Data'),
  },
  {
    id: 'storage',
    name: 'Storage',
    description: 'File and object storage',
    icon: 'HardDrive',
    blocks: BLOCK_TEMPLATES.filter((b) => b.category === 'Storage'),
  },
  {
    id: 'networking',
    name: 'Networking',
    description: 'Gateways, load balancers, and CDN',
    icon: 'Network',
    blocks: BLOCK_TEMPLATES.filter((b) => b.category === 'Networking'),
  },
  {
    id: 'messaging',
    name: 'Messaging',
    description: 'Queues and event streams',
    icon: 'MessageSquare',
    blocks: BLOCK_TEMPLATES.filter((b) => b.category === 'Messaging'),
  },
  {
    id: 'observability',
    name: 'Observability',
    description: 'Logging and monitoring',
    icon: 'Activity',
    blocks: BLOCK_TEMPLATES.filter((b) => b.category === 'Observability'),
  },
  {
    id: 'security',
    name: 'Security',
    description: 'Auth and secrets management',
    icon: 'Shield',
    blocks: BLOCK_TEMPLATES.filter((b) => b.category === 'Security'),
  },
];
