/**
 * Budget Web App Template (~$5-15/mo)
 *
 * Cost-optimized full-stack: serverless functions that scale to zero,
 * lightweight managed database, CDN-served frontend, and object storage.
 * Designed to minimize costs while remaining production-capable.
 *
 * Architecture (deployable to AWS / GCP / Azure):
 *
 *   ┌── Public Zone ──────────────────────────────────────────────┐
 *   │  Internet ──► Static Site (CDN) ──► API Gateway             │
 *   └─────────────────────────────────────────────────────────────┘
 *   ┌── VPC ──────────────────────────────────────────┐
 *   │  ┌── Private Subnet ───────────────────────┐   │
 *   │  │  Function          PostgreSQL             │   │
 *   │  │  Storage                                  │   │
 *   │  └──────────────────────────────────────────┘   │
 *   └─────────────────────────────────────────────────┘
 *   Secret   Domain   Env   (ungrouped control plane)
 *
 * Layout grid (CARD 240×160, PAD 20, HEADER 36, GAP 16):
 *   Row 0: Public Zone       (3c,1r → 792×236)   at (30,30)
 *   Row 1: VPC               (576×488)            at (30,296)
 *          └ Private Subnet  (2c,2r → 536×412)   at (50,352) parent→VPC
 *   Row 2: Ungrouped         y=814
 */

import type { ComposedTemplate } from './types';

export const budgetWebAppTemplate: ComposedTemplate = {
  id: 'budget-webapp',
  name: 'Budget Web App',
  description:
    'Cost-optimized full-stack with CDN frontend, serverless functions (scale to zero), lightweight database, and storage. Pay only for what you use.',
  icon: 'Coins',
  estimatedCost: '$5-15/mo',
  category: 'full-stack',
  provider: 'gcp',
  providers: ['gcp', 'aws', 'azure'],
  tags: ['Budget', 'Serverless', 'Cost-optimized', 'Scale-to-zero', 'VPC', 'Subnet'],
  securityLevel: 'basic',
  difficulty: 'starter',
  trust: 'official',
  featured: true,
  author: { name: 'ICE Team' },
  environmentPresets: [
    { type: 'production', name: 'Production', region: 'us-central1', securityLevel: 'basic' },
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
      width: 576,
      height: 488,
      blockIndices: [],
      color: '#22c55e',
    },
    // [2] Private Subnet — inside VPC
    {
      subtype: 'Custom',
      iceType: 'Network.Subnet',
      label: 'Private Subnet',
      position: { x: 50, y: 352 },
      width: 536,
      height: 412,
      blockIndices: [3, 4, 5],
      color: '#6366f1',
      parentGroupIndex: 1,
    },
  ],

  blocks: [
    // ── Public Zone (outside VPC) ─────────────────────────────────────────
    // 0: Internet
    { iceType: 'Network.Internet', label: 'Public Traffic', position: { x: 50, y: 86 } },
    // 1: Static Site
    {
      iceType: 'Compute.StaticSite',
      label: 'Web App',
      position: { x: 306, y: 86 },
      data: { framework: 'react', domain: 'app.mysite.com' },
    },
    // 2: API Gateway
    { iceType: 'Network.Gateway', label: 'API Gateway', position: { x: 562, y: 86 }, data: { protocol: 'http' } },

    // ── Private Subnet (inside VPC) ───────────────────────────────────────
    // Row 0
    // 3: API Handler
    {
      iceType: 'Compute.ServerlessFunction',
      label: 'API Handler',
      position: { x: 70, y: 408 },
      data: { memory: '128', timeout: '10', runtime: 'nodejs22.x' },
    },
    // 4: PostgreSQL
    { iceType: 'Database.PostgreSQL', label: 'App Database', position: { x: 326, y: 408 }, data: { storage: '20', version: '17' } },
    // Row 1
    // 5: Storage
    { iceType: 'Storage.Bucket', label: 'Media Storage', position: { x: 70, y: 584 } },

    // ── Ungrouped (control plane) ─────────────────────────────────────────
    // 6: Secret
    { iceType: 'Security.Secret', label: 'App Secrets', position: { x: 50, y: 814 } },
    // 7: Domain
    { iceType: 'Network.Domain', label: 'Domain', position: { x: 306, y: 814 }, data: { hostname: 'app.mysite.com' } },
    // 8: Env
    { iceType: 'Config.Environment', label: 'Env Variables', position: { x: 562, y: 814 } },
  ],

  connections: [
    // Internet → Static Site (Gateway→Frontend rule)
    { fromBlock: 0, toBlock: 1, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    // Internet → Gateway (Gateway→Gateway rule)
    { fromBlock: 0, toBlock: 2, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    // Gateway → Function (Gateway→Backend rule)
    { fromBlock: 2, toBlock: 3, relationship: 'connects_to', protocol: 'HTTP' },
    // Function → data (Backend→Database, Backend→Storage rules)
    { fromBlock: 3, toBlock: 4, relationship: 'depends_on', protocol: 'TCP', port: 5432 },
    { fromBlock: 3, toBlock: 5, relationship: 'depends_on' },
    // Function → Secrets (Service→Secrets config rule)
    { fromBlock: 3, toBlock: 6, relationship: 'depends_on' },
    // Domain → Static Site (Domain→Routable rule)
    { fromBlock: 7, toBlock: 1, relationship: 'connects_to' },
    // Function → Env (Service→EnvConfig config rule)
    { fromBlock: 3, toBlock: 8, relationship: 'depends_on' },
  ],
};
