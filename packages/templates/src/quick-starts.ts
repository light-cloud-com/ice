/**
 * Quick-Start Micro-Templates
 *
 * Minimal ComposedTemplate definitions for the empty canvas overlay.
 * Each archetype expands into 3-5 blocks + connections.
 * All blocks are real palette components.
 */

import type { ComposedTemplate } from './types';

/** SSR Site + Database: Server-rendered app with a managed database */
export const quickStartWebsiteDb: ComposedTemplate = {
  id: 'qs-website-db',
  name: 'Website + Database',
  description: 'Server-rendered app with a managed database',
  icon: 'Globe',
  estimatedCost: '$30-60/mo',
  category: 'quick-start',
  provider: 'gcp',
  tags: ['Next.js', 'PostgreSQL'],
  securityLevel: 'basic',
  environmentPresets: [
    { type: 'production', name: 'Production', region: 'us-central1', securityLevel: 'basic' },
  ],
  blocks: [
    { blockType: 'public-traffic', label: 'Public Traffic', position: { x: 100, y: 200 } },
    {
      blockType: 'ssr-site',
      label: 'SSR Site',
      position: { x: 380, y: 200 },
      data: { domain: 'mysite.com' },
    },
    { blockType: 'postgresql', label: 'PostgreSQL', position: { x: 660, y: 200 } },
  ],
  connections: [
    { fromBlock: 0, toBlock: 1, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    { fromBlock: 1, toBlock: 2, relationship: 'depends_on', protocol: 'TCP', port: 5432 },
  ],
};

/** Web App + API: Static frontend, gateway, API service, and database */
export const quickStartWebAppApi: ComposedTemplate = {
  id: 'qs-webapp-api',
  name: 'Web App + API',
  description: 'Static frontend with a backend API and database',
  icon: 'Rocket',
  estimatedCost: '$40-80/mo',
  category: 'quick-start',
  provider: 'gcp',
  tags: ['React', 'API', 'PostgreSQL'],
  securityLevel: 'basic',
  environmentPresets: [
    { type: 'production', name: 'Production', region: 'us-central1', securityLevel: 'basic' },
  ],
  blocks: [
    { blockType: 'public-traffic', label: 'Public Traffic', position: { x: 100, y: 200 } },
    {
      blockType: 'static-site',
      label: 'Static Site',
      position: { x: 380, y: 100 },
      data: { domain: 'app.mysite.com' },
    },
    { blockType: 'gateway', label: 'Gateway', position: { x: 380, y: 300 } },
    {
      blockType: 'scalable-backend',
      label: 'Node.js Service',
      position: { x: 660, y: 300 },
      data: { runtime: 'Node.js 20', domain: 'api.mysite.com', port: 8080 },
    },
    { blockType: 'postgresql', label: 'PostgreSQL', position: { x: 940, y: 300 } },
  ],
  connections: [
    { fromBlock: 0, toBlock: 1, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    { fromBlock: 0, toBlock: 2, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    { fromBlock: 2, toBlock: 3, relationship: 'connects_to', protocol: 'HTTP', port: 8080 },
    { fromBlock: 3, toBlock: 4, relationship: 'depends_on', protocol: 'TCP', port: 5432 },
  ],
};

/** API Only: Gateway, API service, and database */
export const quickStartApiOnly: ComposedTemplate = {
  id: 'qs-api-only',
  name: 'API Only',
  description: 'Backend API with database — no frontend',
  icon: 'Server',
  estimatedCost: '$30-60/mo',
  category: 'quick-start',
  provider: 'gcp',
  tags: ['API', 'PostgreSQL'],
  securityLevel: 'basic',
  environmentPresets: [
    { type: 'production', name: 'Production', region: 'us-central1', securityLevel: 'basic' },
  ],
  blocks: [
    { blockType: 'public-traffic', label: 'Public Traffic', position: { x: 100, y: 200 } },
    { blockType: 'gateway', label: 'Gateway', position: { x: 380, y: 200 } },
    {
      blockType: 'scalable-backend',
      label: 'Node.js Service',
      position: { x: 660, y: 200 },
      data: { runtime: 'Node.js 20', domain: 'api.mysite.com', port: 8080 },
    },
    { blockType: 'postgresql', label: 'PostgreSQL', position: { x: 940, y: 200 } },
  ],
  connections: [
    { fromBlock: 0, toBlock: 1, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    { fromBlock: 1, toBlock: 2, relationship: 'connects_to', protocol: 'HTTP', port: 8080 },
    { fromBlock: 2, toBlock: 3, relationship: 'depends_on', protocol: 'TCP', port: 5432 },
  ],
};

/** Data Pipeline: Queue, worker, database, and storage */
export const quickStartDataPipeline: ComposedTemplate = {
  id: 'qs-data-pipeline',
  name: 'Data Pipeline',
  description: 'Queue-driven processing with storage',
  icon: 'Activity',
  estimatedCost: '$30-70/mo',
  category: 'quick-start',
  provider: 'gcp',
  tags: ['SQS', 'Worker', 'Storage'],
  securityLevel: 'basic',
  environmentPresets: [
    { type: 'production', name: 'Production', region: 'us-central1', securityLevel: 'basic' },
  ],
  blocks: [
    { blockType: 'sqs', label: 'SQS', position: { x: 200, y: 200 } },
    { blockType: 'worker', label: 'Worker', position: { x: 480, y: 200 } },
    { blockType: 'postgresql', label: 'PostgreSQL', position: { x: 760, y: 100 } },
    { blockType: 'storage', label: 'Storage', position: { x: 760, y: 300 } },
  ],
  connections: [
    { fromBlock: 0, toBlock: 1, relationship: 'connects_to' },
    { fromBlock: 1, toBlock: 2, relationship: 'depends_on', protocol: 'TCP', port: 5432 },
    { fromBlock: 1, toBlock: 3, relationship: 'depends_on' },
  ],
};

/** All quick-start templates */
export const QUICK_STARTS: ComposedTemplate[] = [
  quickStartWebsiteDb,
  quickStartWebAppApi,
  quickStartApiOnly,
  quickStartDataPipeline,
];
