/**
 * Full-Stack Web App Template (~$60-120/mo)
 *
 * Production-ready full-stack: static frontend, API gateway routing to
 * backend, PostgreSQL, Redis cache, object storage, and logging.
 *
 * Architecture:
 *   Public Traffic → Static Site (CDN), Gateway
 *   Gateway → API Service → PostgreSQL / Cache / Storage
 *   API Service → Logs
 */

import type { ComposedTemplate } from './types';

export const fullStackTemplate: ComposedTemplate = {
  id: 'fullstack-webapp',
  name: 'Full-Stack Web App',
  description:
    'Production-ready full-stack with static frontend, API gateway, backend service, PostgreSQL, Redis cache, storage, and logging.',
  icon: 'Rocket',
  estimatedCost: '$60-120/mo',
  category: 'full-stack',
  provider: 'gcp',
  tags: ['React', 'Node.js', 'PostgreSQL', 'Redis'],
  securityLevel: 'standard',
  environmentPresets: [
    { type: 'production', name: 'Production', region: 'us-central1', securityLevel: 'standard' },
    { type: 'staging', name: 'Staging', region: 'us-central1', securityLevel: 'basic' },
  ],

  groups: [
    {
      subtype: 'Frontend',
      label: 'Frontend',
      position: { x: 30, y: 30 },
      width: 800,
      height: 170,
      blockIndices: [0, 1, 2],
      color: '#3b82f6',
    },
    {
      subtype: 'Services',
      label: 'Backend',
      position: { x: 30, y: 230 },
      width: 280,
      height: 170,
      blockIndices: [3],
      color: '#22c55e',
    },
    {
      subtype: 'Data',
      label: 'Data Layer',
      position: { x: 350, y: 230 },
      width: 540,
      height: 310,
      blockIndices: [4, 5, 6],
      color: '#f59e0b',
    },
    {
      subtype: 'Monitoring',
      label: 'Monitoring',
      position: { x: 30, y: 430 },
      width: 280,
      height: 170,
      blockIndices: [7],
      color: '#ef4444',
    },
  ],

  blocks: [
    // 0-2: Frontend + entry
    { iceType: 'Network.Internet', label: 'Public Traffic', position: { x: 60, y: 60 } },
    {
      iceType: 'Compute.StaticSite',
      label: 'Static Site',
      position: { x: 310, y: 60 },
      data: { domain: 'app.acme.io' },
    },
    { iceType: 'Network.Gateway', label: 'Gateway', position: { x: 560, y: 60 } },

    // 3: Backend
    {
      iceType: 'Compute.Container',
      label: 'Node.js Service',
      position: { x: 60, y: 260 },
      data: { domain: 'api.acme.io', runtime: 'Node.js 20', port: 8080 },
    },

    // 4-6: Data stores
    { iceType: 'Database.PostgreSQL', label: 'PostgreSQL', position: { x: 380, y: 260 } },
    { iceType: 'Database.Redis', label: 'Cache', position: { x: 630, y: 260 } },
    { iceType: 'Storage.Bucket', label: 'Storage', position: { x: 380, y: 400 } },

    // 7: Monitoring
    { iceType: 'Monitoring.Log', label: 'Logs', position: { x: 60, y: 460 } },
  ],

  connections: [
    // Public Traffic → frontend + gateway
    { fromBlock: 0, toBlock: 1, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    { fromBlock: 0, toBlock: 2, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    // Gateway routes API traffic to backend
    { fromBlock: 2, toBlock: 3, relationship: 'connects_to', protocol: 'HTTP', port: 8080 },
    // Backend depends on data stores
    { fromBlock: 3, toBlock: 4, relationship: 'depends_on', protocol: 'TCP', port: 5432 },
    { fromBlock: 3, toBlock: 5, relationship: 'depends_on', protocol: 'TCP', port: 6379 },
    { fromBlock: 3, toBlock: 6, relationship: 'depends_on' },
    // Backend logs
    { fromBlock: 3, toBlock: 7, relationship: 'connects_to' },
  ],
};
