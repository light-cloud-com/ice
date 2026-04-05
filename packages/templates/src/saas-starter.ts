/**
 * SaaS Platform Template (~$150-400/mo)
 *
 * Production-grade multi-tenant SaaS: SSR frontend, API gateway,
 * microservices, databases, cache, async workers, secrets, and observability.
 *
 * Architecture (deployable to AWS / GCP / Azure):
 *
 *   ┌── Public Zone ──────────────────────────────────────────────┐
 *   │  Internet ──► WAF ──► SSR Site (Next.js 14)                 │
 *   └─────────────────────────────────────────────────────────────┘
 *   ┌── VPC ──────────────────────────────────────────────────────────────┐
 *   │  ┌─ Public Subnet ─┐  ┌── Private Subnet ──────────────────────┐  │
 *   │  │  Gateway         │  │  Users      Auth        Billing        │  │
 *   │  │                  │  │  Users PG   Billing PG  Cache (Redis)  │  │
 *   │  └──────────────────┘  └────────────────────────────────────────┘  │
 *   └─────────────────────────────────────────────────────────────────────┘
 *   ┌── Async ────────────────────────┐  ┌── Platform Services ──────────────┐
 *   │  SQS ──► Worker                 │  │  Storage      Secrets              │
 *   └─────────────────────────────────┘  │  Auth         Logs                 │
 *                                         └───────────────────────────────────┘
 *   Domain   Repo   Env   (ungrouped control plane)
 *
 * Layout grid (CARD 240×160, PAD 20, HEADER 36, GAP 16):
 *   Row 0: Public Zone       (3c,1r → 792×236)    at (30,30)
 *   Row 1: VPC               (1142×488)            at (30,296)
 *          ├ Public Subnet   (1c,1r → 280×236)    at (50,352)  parent→VPC
 *          └ Private Subnet  (3c,2r → 792×412)    at (360,352) parent→VPC
 *   Row 2: Async             (2c,1r → 536×236)    at (30,814)
 *          Platform Services (2c,2r → 536×412)    at (596,814)
 *   Row 3: Ungrouped         y=1256
 */

import type { ComposedTemplate } from './types';

export const saasStarterTemplate: ComposedTemplate = {
  id: 'saas-platform',
  name: 'SaaS Platform',
  description:
    'Multi-service SaaS with SSR frontend, gateway, microservices, PostgreSQL, Redis cache, worker queue, and observability.',
  icon: 'Zap',
  estimatedCost: '$150-400/mo',
  category: 'saas',
  provider: 'gcp',
  providers: ['gcp', 'aws', 'azure'],
  tags: ['Next.js', 'PostgreSQL', 'Redis', 'Microservices', 'Observability', 'VPC', 'Subnet'],
  securityLevel: 'standard',
  difficulty: 'advanced',
  trust: 'official',
  featured: true,
  author: { name: 'ICE Team' },
  environmentPresets: [
    { type: 'production', name: 'Production', region: 'us-central1', securityLevel: 'standard' },
    { type: 'staging', name: 'Staging', region: 'us-central1', securityLevel: 'standard' },
    { type: 'development', name: 'Development', region: 'us-central1', securityLevel: 'basic' },
  ],

  groups: [
    // [0] Public Zone — outside VPC
    {
      subtype: 'Frontend',
      label: 'Public Zone',
      position: { x: 30, y: 30 },
      width: 792,
      height: 236,
      blockIndices: [0, 1, 2],
      color: '#ef4444',
    },
    // [1] VPC — contains subnets, no direct blocks
    {
      subtype: 'Custom',
      iceType: 'Network.VPC',
      label: 'VPC',
      position: { x: 30, y: 296 },
      width: 1142,
      height: 488,
      blockIndices: [],
      color: '#22c55e',
    },
    // [2] Public Subnet — inside VPC
    {
      subtype: 'Custom',
      iceType: 'Network.Subnet',
      label: 'Public Subnet',
      position: { x: 50, y: 352 },
      width: 280,
      height: 236,
      blockIndices: [3],
      color: '#3b82f6',
      parentGroupIndex: 1,
    },
    // [3] Private Subnet — inside VPC
    {
      subtype: 'Custom',
      iceType: 'Network.Subnet',
      label: 'Private Subnet',
      position: { x: 360, y: 352 },
      width: 792,
      height: 412,
      blockIndices: [4, 5, 6, 7, 8, 9],
      color: '#6366f1',
      parentGroupIndex: 1,
    },
    // [4] Async — outside VPC
    {
      subtype: 'Messaging',
      label: 'Async',
      position: { x: 30, y: 814 },
      width: 536,
      height: 236,
      blockIndices: [10, 11],
      color: '#8b5cf6',
    },
    // [5] Platform Services — outside VPC
    {
      subtype: 'External',
      label: 'Platform Services',
      position: { x: 596, y: 814 },
      width: 536,
      height: 412,
      blockIndices: [12, 13, 14, 15],
      color: '#64748b',
    },
  ],

  blocks: [
    // ── Public Zone (outside VPC) ─────────────────────────────────────────
    // 0: Internet
    { iceType: 'Network.Internet', label: 'Public Traffic', position: { x: 50, y: 86 }, data: {} },
    // 1: WAF
    { iceType: 'Security.WAF', label: 'WAF', position: { x: 306, y: 86 }, data: {} },
    // 2: SSR Site
    {
      iceType: 'Compute.SSRSite',
      label: 'SaaS Dashboard',
      position: { x: 562, y: 86 },
      data: { framework: 'nextjs', domain: 'app.saas.io' },
    },

    // ── Public Subnet (inside VPC) ────────────────────────────────────────
    // 3: Gateway
    { iceType: 'Network.Gateway', label: 'API Gateway', position: { x: 70, y: 408 }, data: { protocol: 'http' } },

    // ── Private Subnet (inside VPC) ───────────────────────────────────────
    // Row 0
    // 4: Users Service
    {
      iceType: 'Compute.Container',
      label: 'Users Service',
      position: { x: 380, y: 408 },
      data: { size: '1-2048', runtime: 'nodejs20', port: 8080 },
    },
    // 5: Auth Service
    {
      iceType: 'Compute.Container',
      label: 'Auth Service',
      position: { x: 636, y: 408 },
      data: { size: '1-2048', runtime: 'nodejs20', port: 8081 },
    },
    // 6: Billing Service
    {
      iceType: 'Compute.Container',
      label: 'Billing Service',
      position: { x: 892, y: 408 },
      data: { size: '1-2048', runtime: 'go1.22', port: 8082 },
    },
    // Row 1
    // 7: Users PostgreSQL
    { iceType: 'Database.PostgreSQL', label: 'Users DB', position: { x: 380, y: 584 }, data: { size: 'db.t3.medium', storage: '100', version: '17' } },
    // 8: Billing PostgreSQL
    { iceType: 'Database.PostgreSQL', label: 'Billing DB', position: { x: 636, y: 584 }, data: { size: 'db.t3.medium', storage: '100', version: '17' } },
    // 9: Cache
    { iceType: 'Database.Redis', label: 'App Cache', position: { x: 892, y: 584 }, data: { size: 'cache.t3.medium', port: 6379 } },

    // ── Async (outside VPC) ───────────────────────────────────────────────
    // 10: SQS
    { iceType: 'Messaging.SQS', label: 'Task Queue', position: { x: 50, y: 870 }, data: { queue_type: 'standard' } },
    // 11: Worker
    { iceType: 'Compute.Worker', label: 'Background Worker', position: { x: 306, y: 870 }, data: { size: '1-2048', runtime: 'nodejs20' } },

    // ── Platform Services (outside VPC) ───────────────────────────────────
    // Row 0
    // 12: Storage
    { iceType: 'Storage.Bucket', label: 'Asset Storage', position: { x: 616, y: 870 }, data: { storage_class: 'standard' } },
    // 13: Secrets
    { iceType: 'Security.Secret', label: 'Secrets', position: { x: 872, y: 870 }, data: {} },
    // Row 1
    // 14: Auth
    { iceType: 'Security.Identity', label: 'Auth', position: { x: 616, y: 1046 }, data: {} },
    // 15: Logs
    { iceType: 'Monitoring.Log', label: 'Platform Logs', position: { x: 872, y: 1046 }, data: { keep_logs: '30 days' } },

    // ── Ungrouped (control plane) ─────────────────────────────────────────
    // 16: Domain
    { iceType: 'Network.Domain', label: 'Domain', position: { x: 50, y: 1256 }, data: { hostname: 'app.saas.io' } },
    // 17: Repo
    { iceType: 'Source.Repository', label: 'GitHub Repo', position: { x: 306, y: 1256 }, data: { repository: '', branch: 'main' } },
    // 18: Env
    { iceType: 'Config.Environment', label: 'Env Variables', position: { x: 562, y: 1256 }, data: {} },
  ],

  connections: [
    // Internet → SSR Site (Gateway→Frontend rule)
    { fromBlock: 0, toBlock: 2, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    // Internet → WAF → Gateway (Gateway→Gateway rule)
    { fromBlock: 0, toBlock: 1, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    { fromBlock: 1, toBlock: 3, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    // Gateway → microservices (Gateway→Backend rule)
    { fromBlock: 3, toBlock: 4, relationship: 'connects_to', protocol: 'HTTP', port: 8080 },
    { fromBlock: 3, toBlock: 5, relationship: 'connects_to', protocol: 'HTTP', port: 8081 },
    { fromBlock: 3, toBlock: 6, relationship: 'connects_to', protocol: 'HTTP', port: 8082 },
    // Services → PostgreSQL (Backend→Database rule)
    { fromBlock: 4, toBlock: 7, relationship: 'depends_on', protocol: 'TCP', port: 5432 },
    { fromBlock: 6, toBlock: 8, relationship: 'depends_on', protocol: 'TCP', port: 5432 },
    // Services → Cache (Backend→Cache rule)
    { fromBlock: 4, toBlock: 9, relationship: 'depends_on', protocol: 'TCP', port: 6379 },
    { fromBlock: 5, toBlock: 9, relationship: 'depends_on', protocol: 'TCP', port: 6379 },
    // Auth → platform services (Backend→Auth, Service→Secrets rules)
    { fromBlock: 5, toBlock: 14, relationship: 'depends_on' },
    { fromBlock: 5, toBlock: 13, relationship: 'depends_on' },
    { fromBlock: 6, toBlock: 13, relationship: 'depends_on' },
    // Async: Billing → SQS → Worker → Storage (Backend→Queue, Queue→Backend, Backend→Storage rules)
    { fromBlock: 6, toBlock: 10, relationship: 'connects_to' },
    { fromBlock: 10, toBlock: 11, relationship: 'connects_to' },
    { fromBlock: 11, toBlock: 12, relationship: 'depends_on' },
    // Observability (Service→Monitoring rule)
    { fromBlock: 4, toBlock: 15, relationship: 'connects_to' },
    { fromBlock: 5, toBlock: 15, relationship: 'connects_to' },
    { fromBlock: 6, toBlock: 15, relationship: 'connects_to' },
    { fromBlock: 11, toBlock: 15, relationship: 'connects_to' },
    // Domain → SSR Site (Domain→Routable rule)
    { fromBlock: 16, toBlock: 2, relationship: 'connects_to' },
    // Repo → Service (Repo→Service pipeline rule)
    { fromBlock: 17, toBlock: 4, relationship: 'connects_to' },
    // Service → Env (Service→EnvConfig config rule)
    { fromBlock: 4, toBlock: 18, relationship: 'depends_on' },
  ],
};
