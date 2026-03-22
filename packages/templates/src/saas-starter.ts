/**
 * SaaS Platform Template (~$150-400/mo)
 *
 * Production-grade multi-tenant SaaS: SSR frontend, API gateway,
 * microservices, databases, cache, async workers, secrets, and observability.
 *
 * Architecture:
 *   Public Traffic → SSR Site, Gateway
 *   Gateway → API Services → PostgreSQL / Cache
 *   API Services → SQS → Worker → Storage
 *   Auth, Secrets, Logs as cross-cutting
 */

import type { ComposedTemplate } from './types';

export const saasStarterTemplate: ComposedTemplate = {
  id: 'saas-platform',
  name: 'SaaS Platform',
  description:
    'Multi-service SaaS with SSR frontend, gateway, microservices, PostgreSQL, Redis cache, worker queue, and observability.',
  icon: 'Zap',
  estimatedCost: '$150-400/mo',
  category: 'full-stack',
  provider: 'gcp',
  tags: ['Next.js', 'PostgreSQL', 'Redis', 'Microservices', 'Observability'],
  securityLevel: 'standard',
  environmentPresets: [
    { type: 'production', name: 'Production', region: 'us-central1', securityLevel: 'standard' },
    { type: 'staging', name: 'Staging', region: 'us-central1', securityLevel: 'standard' },
    { type: 'development', name: 'Development', region: 'us-central1', securityLevel: 'basic' },
  ],

  groups: [
    {
      subtype: 'Frontend',
      label: 'Edge',
      position: { x: 30, y: 30 },
      width: 800,
      height: 170,
      blockIndices: [0, 1, 2],
      color: '#3b82f6',
    },
    {
      subtype: 'Services',
      label: 'Backend Services',
      position: { x: 30, y: 230 },
      width: 540,
      height: 310,
      blockIndices: [3, 4, 5],
      color: '#22c55e',
    },
    {
      subtype: 'Data',
      label: 'Data Layer',
      position: { x: 610, y: 30 },
      width: 300,
      height: 510,
      blockIndices: [6, 7, 8],
      color: '#f59e0b',
    },
    {
      subtype: 'Messaging',
      label: 'Async Processing',
      position: { x: 30, y: 570 },
      width: 540,
      height: 170,
      blockIndices: [9, 10],
      color: '#8b5cf6',
    },
    {
      subtype: 'External',
      label: 'Platform Services',
      position: { x: 610, y: 570 },
      width: 540,
      height: 170,
      blockIndices: [11, 12, 13, 14],
      color: '#64748b',
    },
  ],

  blocks: [
    // 0-2: Edge (with public traffic entry)
    { blockType: 'public-traffic', label: 'Public Traffic', position: { x: 60, y: 60 } },
    {
      blockType: 'ssr-site',
      label: 'SSR Site',
      position: { x: 310, y: 60 },
      data: { domain: 'app.saas.io', runtime: 'Next.js 14' },
    },
    { blockType: 'gateway', label: 'Gateway', position: { x: 560, y: 60 } },

    // 3-5: Backend microservices
    {
      blockType: 'scalable-backend',
      label: 'Users Service',
      position: { x: 60, y: 260 },
      data: { runtime: 'Node.js 20', port: 8080 },
    },
    {
      blockType: 'scalable-backend',
      label: 'Auth Service',
      position: { x: 310, y: 260 },
      data: { runtime: 'Node.js 20', port: 8081 },
    },
    {
      blockType: 'scalable-backend',
      label: 'Billing Service',
      position: { x: 60, y: 400 },
      data: { runtime: 'Go 1.22', port: 8082 },
    },

    // 6-8: Data stores
    { blockType: 'postgresql', label: 'Users PostgreSQL', position: { x: 640, y: 60 } },
    { blockType: 'postgresql', label: 'Billing PostgreSQL', position: { x: 640, y: 210 } },
    { blockType: 'redis-cache', label: 'Cache', position: { x: 640, y: 370 } },

    // 9-10: Async processing
    { blockType: 'sqs', label: 'SQS', position: { x: 60, y: 600 } },
    { blockType: 'worker', label: 'Worker', position: { x: 310, y: 600 } },

    // 11-14: Platform services
    { blockType: 'storage', label: 'Storage', position: { x: 640, y: 600 } },
    { blockType: 'secrets', label: 'Secrets', position: { x: 880, y: 600 } },
    { blockType: 'auth', label: 'Auth', position: { x: 880, y: 60 } },
    { blockType: 'logs', label: 'Logs', position: { x: 880, y: 210 } },
  ],

  connections: [
    // Public Traffic → SSR + Gateway
    { fromBlock: 0, toBlock: 1, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    { fromBlock: 0, toBlock: 2, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },

    // Gateway → microservices
    { fromBlock: 2, toBlock: 3, relationship: 'connects_to', protocol: 'HTTP', port: 8080 },
    { fromBlock: 2, toBlock: 4, relationship: 'connects_to', protocol: 'HTTP', port: 8081 },
    { fromBlock: 2, toBlock: 5, relationship: 'connects_to', protocol: 'HTTP', port: 8082 },

    // Service → PostgreSQL (each service owns its DB)
    { fromBlock: 3, toBlock: 6, relationship: 'depends_on', protocol: 'TCP', port: 5432 },
    { fromBlock: 5, toBlock: 7, relationship: 'depends_on', protocol: 'TCP', port: 5432 },

    // Services → Cache (sessions, auth tokens)
    { fromBlock: 3, toBlock: 8, relationship: 'depends_on', protocol: 'TCP', port: 6379 },
    { fromBlock: 4, toBlock: 8, relationship: 'depends_on', protocol: 'TCP', port: 6379 },

    // Auth service → Auth
    { fromBlock: 4, toBlock: 13, relationship: 'depends_on' },

    // Services → Secrets
    { fromBlock: 4, toBlock: 12, relationship: 'depends_on' },
    { fromBlock: 5, toBlock: 12, relationship: 'depends_on' },

    // Async: Billing → SQS → Worker → Storage
    { fromBlock: 5, toBlock: 9, relationship: 'connects_to' },
    { fromBlock: 9, toBlock: 10, relationship: 'connects_to' },
    { fromBlock: 10, toBlock: 11, relationship: 'depends_on' },

    // Observability (all services log)
    { fromBlock: 3, toBlock: 14, relationship: 'connects_to' },
    { fromBlock: 4, toBlock: 14, relationship: 'connects_to' },
    { fromBlock: 5, toBlock: 14, relationship: 'connects_to' },
    { fromBlock: 10, toBlock: 14, relationship: 'connects_to' },
  ],
};
