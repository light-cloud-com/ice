/**
 * EU Compliance Stack Template (~$120-250/mo)
 *
 * GDPR-aware infrastructure: gateway, backend service,
 * encrypted database + storage, Redis for sessions, secrets,
 * auth, and audit logging. All resources EU-region pinned.
 *
 * Architecture (deployable to AWS / GCP / Azure):
 *
 *   ┌── Public Zone ────────────────────────────────┐
 *   │  Internet ──► WAF                              │
 *   └────────────────────────────────────────────────┘
 *   ┌── VPC (EU Region) ─────────────────────────────────────────────┐
 *   │  ┌─ Public Subnet ─┐  ┌── Private Subnet (EU) ────────────┐  │
 *   │  │  Gateway         │  │  Node.js      PostgreSQL           │  │
 *   │  │                  │  │  Storage      Redis Cache           │  │
 *   │  └──────────────────┘  └───────────────────────────────────┘  │
 *   └────────────────────────────────────────────────────────────────┘
 *   ┌─ Security & Compliance ─┐
 *   │  Auth                    │
 *   │  Secrets                 │
 *   │  Audit Trail             │
 *   └─────────────────────────┘
 *
 * Layout grid (CARD 240×160, PAD 20, HEADER 36, GAP 16):
 *   Row 0: Public Zone              (2c,1r → 536×236)   at (30,30)
 *          Security & Compliance    (1c,3r → 280×588)   at (596,30)
 *   Row 1: VPC (EU Region)          (886×488)            at (30,296)
 *          ├ Public Subnet          (1c,1r → 280×236)   at (50,352)  parent→VPC
 *          └ Private Subnet (EU)    (2c,2r → 536×412)   at (360,352) parent→VPC
 */

import type { ComposedTemplate } from './types';

export const euComplianceTemplate: ComposedTemplate = {
  id: 'eu-compliance',
  name: 'EU Compliance Stack',
  description:
    'GDPR-compliant infrastructure with gateway, encrypted database & storage, Redis sessions, secrets, auth, and audit logging. EU-region pinned.',
  icon: 'ShieldCheck',
  estimatedCost: '$120-250/mo',
  category: 'compliance',
  provider: 'gcp',
  providers: ['gcp', 'aws', 'azure'],
  tags: ['GDPR', 'Encryption', 'EU-only', 'Audit Logs', 'VPC', 'Subnet'],
  securityLevel: 'compliance',
  difficulty: 'intermediate',
  trust: 'official',
  compliance: ['gdpr'],
  author: { name: 'ICE Team' },
  environmentPresets: [
    { type: 'production', name: 'Production', region: 'europe-west1', securityLevel: 'compliance' },
    { type: 'staging', name: 'Staging', region: 'europe-west1', securityLevel: 'strict' },
  ],

  groups: [
    // [0] Public Zone — outside VPC
    {
      subtype: 'Frontend',
      label: 'Public Zone',
      position: { x: 30, y: 30 },
      width: 536,
      height: 236,
      blockIndices: [0, 1],
      color: '#ef4444',
    },
    // [1] VPC (EU Region) — contains subnets, no direct blocks
    {
      subtype: 'Custom',
      iceType: 'Network.VPC',
      label: 'VPC (EU Region)',
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
      blockIndices: [2],
      color: '#3b82f6',
      parentGroupIndex: 1,
    },
    // [3] Private Subnet (EU) — inside VPC
    {
      subtype: 'Custom',
      iceType: 'Network.Subnet',
      label: 'Private Subnet (EU)',
      position: { x: 360, y: 352 },
      width: 536,
      height: 412,
      blockIndices: [3, 4, 5, 6],
      color: '#6366f1',
      parentGroupIndex: 1,
    },
    // [4] Security & Compliance — outside VPC
    {
      subtype: 'External',
      label: 'Security & Compliance',
      position: { x: 596, y: 30 },
      width: 280,
      height: 588,
      blockIndices: [7, 8, 9],
      color: '#ef4444',
    },
  ],

  blocks: [
    // ── Public Zone (outside VPC) ─────────────────────────────────────────
    // 0: Internet
    { iceType: 'Network.Internet', label: 'Public Traffic', position: { x: 50, y: 86 }, data: {} },
    // 1: WAF
    { iceType: 'Security.WAF', label: 'WAF', position: { x: 306, y: 86 }, data: {} },

    // ── Public Subnet (inside VPC) ────────────────────────────────────────
    // 2: Gateway
    { iceType: 'Network.Gateway', label: 'API Gateway', position: { x: 70, y: 408 }, data: { protocol: 'http' } },

    // ── Private Subnet (EU) (inside VPC) ──────────────────────────────────
    // Row 0
    // 3: Node.js
    {
      iceType: 'Compute.Container',
      label: 'App Service',
      position: { x: 380, y: 408 },
      data: { size: '2-4096', runtime: 'nodejs20', domain: 'app.eu.acme.io', port: 8080 },
    },
    // 4: PostgreSQL
    {
      iceType: 'Database.PostgreSQL',
      label: 'Encrypted Database',
      position: { x: 636, y: 408 },
      data: { size: 'db.r6g.large', storage: '100', version: '17' },
    },
    // Row 1
    // 5: Storage
    {
      iceType: 'Storage.Bucket',
      label: 'Audit Storage',
      position: { x: 380, y: 584 },
      data: { storage_class: 'standard' },
    },
    // 6: Redis Cache
    {
      iceType: 'Database.Redis',
      label: 'Session Store',
      position: { x: 636, y: 584 },
      data: { size: 'cache.r6g.large', port: 6379 },
    },

    // ── Security & Compliance (outside VPC) ───────────────────────────────
    // 7: Auth
    { iceType: 'Security.Identity', label: 'Auth', position: { x: 616, y: 86 }, data: {} },
    // 8: Secrets
    { iceType: 'Security.Secret', label: 'Secrets', position: { x: 616, y: 262 }, data: {} },
    // 9: Audit Trail
    { iceType: 'Monitoring.Log', label: 'Audit Trail', position: { x: 616, y: 438 }, data: { keep_logs: '90 days' } },
  ],

  connections: [
    // Internet → WAF → Gateway (Gateway→Gateway rule)
    { fromBlock: 0, toBlock: 1, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    { fromBlock: 1, toBlock: 2, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    // Gateway → Node.js (Gateway→Backend rule)
    { fromBlock: 2, toBlock: 3, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    // Node.js → data stores (Backend→Database, Backend→Storage, Backend→Cache rules)
    { fromBlock: 3, toBlock: 4, relationship: 'depends_on', protocol: 'TCP', port: 5432 },
    { fromBlock: 3, toBlock: 5, relationship: 'depends_on' },
    { fromBlock: 3, toBlock: 6, relationship: 'depends_on', protocol: 'TCP', port: 6379 },
    // Node.js → security services (Backend→Auth, Service→Secrets rules)
    { fromBlock: 3, toBlock: 7, relationship: 'connects_to' },
    { fromBlock: 3, toBlock: 8, relationship: 'depends_on' },
    // Audit trail (Service→Monitoring rule)
    { fromBlock: 3, toBlock: 9, relationship: 'connects_to' },
    { fromBlock: 4, toBlock: 9, relationship: 'connects_to' },
    { fromBlock: 5, toBlock: 9, relationship: 'connects_to' },
  ],
};
