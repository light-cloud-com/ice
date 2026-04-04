/**
 * Full-Stack Web App Template (~$60-120/mo)
 *
 * Architecture (deployable to AWS / GCP / Azure):
 *
 *   ┌── Public Zone ─────────────────────────────────────┐
 *   │  Internet ──► WAF ──► Static Site (CDN)            │
 *   └───────────────────────────────────────────────────-─┘
 *   ┌── VPC ─────────────────────────────────────────────────────────┐
 *   │  ┌─ Public Subnet ─┐  ┌── Private Subnet ─────────────────┐  │
 *   │  │  Gateway         │  │  Node.js     PostgreSQL           │  │
 *   │  │                  │  │  Redis       Storage               │  │
 *   │  └──────────────────┘  └───────────────────────────────────┘  │
 *   └────────────────────────────────────────────────────────────────┘
 *   ┌── Monitoring ──┐
 *   │  Logs          │
 *   └────────────────┘
 *   Secrets   Domain   Repo   Env   (ungrouped control plane)
 *
 * Layout grid (CARD 240×160, PAD 20, HEADER 36, GAP 16):
 *   Row 0: Public Zone       (3c,1r → 792×236)   at (30,30)
 *   Row 1: VPC               (886×488)            at (30,296)
 *          ├ Public Subnet   (1c,1r → 280×236)   at (50,352)  parent→VPC
 *          └ Private Subnet  (2c,2r → 536×412)   at (360,352) parent→VPC
 *   Row 2: Monitoring        (1c,1r → 280×236)   at (30,814)
 *   Row 3: Ungrouped         y=1080
 */

import type { ComposedTemplate } from './types';

export const fullStackTemplate: ComposedTemplate = {
  id: 'fullstack-webapp',
  name: 'Full-Stack Web App',
  description:
    'Production-ready full-stack with CDN frontend, WAF, API gateway in public subnet, backend service + PostgreSQL + Redis in private subnet.',
  icon: 'Rocket',
  estimatedCost: '$60-120/mo',
  category: 'full-stack',
  provider: 'gcp',
  providers: ['gcp', 'aws', 'azure'],
  tags: ['React', 'Node.js', 'PostgreSQL', 'Redis', 'VPC', 'Subnet'],
  securityLevel: 'standard',
  difficulty: 'intermediate',
  trust: 'official',
  featured: true,
  author: { name: 'ICE Team' },
  environmentPresets: [
    { type: 'production', name: 'Production', region: 'us-central1', securityLevel: 'standard' },
    { type: 'staging', name: 'Staging', region: 'us-central1', securityLevel: 'basic' },
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
      width: 886,
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
      width: 536,
      height: 412,
      blockIndices: [4, 5, 6, 7],
      color: '#6366f1',
      parentGroupIndex: 1,
    },
    // [4] Monitoring — outside VPC (managed service)
    {
      subtype: 'Monitoring',
      label: 'Monitoring',
      position: { x: 30, y: 814 },
      width: 280,
      height: 236,
      blockIndices: [8],
      color: '#f59e0b',
    },
  ],

  blocks: [
    // ── Public Zone (outside VPC) ─────────────────────────────────────────
    // 0: Internet
    { iceType: 'Network.Internet', label: 'Public Traffic', position: { x: 50, y: 86 } },
    // 1: WAF
    { iceType: 'Security.WAF', label: 'WAF', position: { x: 306, y: 86 } },
    // 2: Static Site (CDN)
    {
      iceType: 'Compute.StaticSite',
      label: 'Web App',
      position: { x: 562, y: 86 },
      data: { framework: 'react', domain: 'app.acme.io' },
    },

    // ── Public Subnet (inside VPC) ────────────────────────────────────────
    // 3: Gateway
    { iceType: 'Network.Gateway', label: 'API Gateway', position: { x: 70, y: 408 }, data: { protocol: 'http' } },

    // ── Private Subnet (inside VPC) ───────────────────────────────────────
    // 4: Node.js Service
    {
      iceType: 'Compute.Container',
      label: 'API Server',
      position: { x: 380, y: 408 },
      data: { runtime: 'nodejs20', domain: 'api.acme.io', port: 8080 },
    },
    // 5: PostgreSQL
    { iceType: 'Database.PostgreSQL', label: 'App Database', position: { x: 636, y: 408 }, data: { storage: '50', version: '17' } },
    // 6: Redis
    { iceType: 'Database.Redis', label: 'Session Cache', position: { x: 380, y: 584 } },
    // 7: Storage
    { iceType: 'Storage.Bucket', label: 'File Storage', position: { x: 636, y: 584 } },

    // ── Monitoring (outside VPC) ──────────────────────────────────────────
    // 8: Logs
    { iceType: 'Monitoring.Log', label: 'App Logs', position: { x: 50, y: 870 }, data: { keep_logs: '30 days' } },

    // ── Ungrouped (control plane) ─────────────────────────────────────────
    // 9: Secrets
    { iceType: 'Security.Secret', label: 'App Secrets', position: { x: 50, y: 1080 } },
    // 10: Domain
    { iceType: 'Network.Domain', label: 'Domain', position: { x: 306, y: 1080 }, data: { hostname: 'app.acme.io' } },
    // 11: Repo
    { iceType: 'Source.Repository', label: 'GitHub Repo', position: { x: 562, y: 1080 }, data: { repository: '', branch: 'main' } },
    // 12: Env
    { iceType: 'Config.Environment', label: 'Env Variables', position: { x: 50, y: 1256 } },
  ],

  connections: [
    // Internet → WAF → Gateway (Gateway→Gateway rule)
    { fromBlock: 0, toBlock: 1, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    { fromBlock: 1, toBlock: 3, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    // Internet → Static Site (Gateway→Frontend rule)
    { fromBlock: 0, toBlock: 2, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    // Gateway → Service (Gateway→Backend rule)
    { fromBlock: 3, toBlock: 4, relationship: 'connects_to', protocol: 'HTTP', port: 8080 },
    // Service → Data (Backend→Database, Backend→Cache, Backend→Storage rules)
    { fromBlock: 4, toBlock: 5, relationship: 'depends_on', protocol: 'TCP', port: 5432 },
    { fromBlock: 4, toBlock: 6, relationship: 'depends_on', protocol: 'TCP', port: 6379 },
    { fromBlock: 4, toBlock: 7, relationship: 'depends_on' },
    // Service → Secrets (Service→Secrets config rule)
    { fromBlock: 4, toBlock: 9, relationship: 'depends_on' },
    // Service → Logs (Service→Monitoring rule)
    { fromBlock: 4, toBlock: 8, relationship: 'connects_to' },
    // Domain → Static Site (Domain→Routable rule)
    { fromBlock: 10, toBlock: 2, relationship: 'connects_to' },
    // Repo → Service (Repo→Service pipeline rule)
    { fromBlock: 11, toBlock: 4, relationship: 'connects_to' },
    // Service → Env (Service→EnvConfig config rule)
    { fromBlock: 4, toBlock: 12, relationship: 'depends_on' },
  ],
};
