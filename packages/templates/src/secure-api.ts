/**
 * Secure API Template (~$80-180/mo)
 *
 * Security-first API backend with defense-in-depth: WAF, API gateway,
 * VPC network isolation with private subnet, TLS certificates, secrets
 * management, identity provider, and audit logging.
 *
 * Architecture (deployable to AWS / GCP / Azure):
 *
 *   ┌── Public Zone ────────────────────────────────┐
 *   │  Internet ──► WAF                              │
 *   └────────────────────────────────────────────────┘
 *   ┌── VPC ─────────────────────────────────────────────────────────┐
 *   │  ┌─ Public Subnet ─┐  ┌── Private Subnet ─────────────────┐  │
 *   │  │  Gateway         │  │  API Service   PostgreSQL   Redis  │  │
 *   │  └──────────────────┘  └───────────────────────────────────┘  │
 *   └────────────────────────────────────────────────────────────────┘
 *   ┌── Security Controls ──────────────────────────────────────────────────┐
 *   │  TLS Cert     Secrets     Auth Provider     Audit Trail               │
 *   └──────────────────────────────────────────────────────────────────────┘
 *   Domain   Repo   Env   (ungrouped control plane)
 *
 * Layout grid (CARD 240×160, PAD 20, HEADER 36, GAP 16):
 *   Row 0: Public Zone       (2c,1r → 536×236)    at (30,30)
 *   Row 1: VPC               (886×292)             at (30,296)
 *          ├ Public Subnet   (1c,1r → 280×236)    at (50,352)  parent→VPC
 *          └ Private Subnet  (3c,1r → 792×236)    at (360,352) parent→VPC
 *   Row 2: Security Controls (4c,1r → 1048×236)   at (30,618)
 *   Row 3: Ungrouped         y=884
 */

import type { ComposedTemplate } from './types';

export const secureApiTemplate: ComposedTemplate = {
  id: 'secure-api',
  name: 'Secure API',
  description:
    'Security-first API with WAF, VPC network isolation, encrypted database, secrets management, TLS encryption, identity provider, and audit logging.',
  icon: 'Shield',
  estimatedCost: '$80-180/mo',
  category: 'compliance',
  provider: 'gcp',
  providers: ['gcp', 'aws', 'azure'],
  tags: ['Security', 'WAF', 'VPC', 'Encryption', 'IAM', 'Audit', 'Zero Trust', 'Subnet'],
  securityLevel: 'strict',
  difficulty: 'intermediate',
  trust: 'official',
  featured: true,
  compliance: ['soc2'],
  author: { name: 'ICE Team' },
  environmentPresets: [
    { type: 'production', name: 'Production', region: 'us-central1', securityLevel: 'strict' },
    { type: 'staging', name: 'Staging', region: 'us-central1', securityLevel: 'standard' },
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
    // [1] VPC — contains subnets, no direct blocks
    {
      subtype: 'Custom',
      iceType: 'Network.VPC',
      label: 'VPC',
      position: { x: 30, y: 296 },
      width: 886,
      height: 292,
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
    // [3] Private Subnet — inside VPC
    {
      subtype: 'Custom',
      iceType: 'Network.Subnet',
      label: 'Private Subnet',
      position: { x: 360, y: 352 },
      width: 792,
      height: 236,
      blockIndices: [3, 4, 5],
      color: '#6366f1',
      parentGroupIndex: 1,
    },
    // [4] Security Controls — outside VPC
    {
      subtype: 'External',
      label: 'Security Controls',
      position: { x: 30, y: 618 },
      width: 1048,
      height: 236,
      blockIndices: [6, 7, 8, 9],
      color: '#8b5cf6',
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

    // ── Private Subnet (inside VPC) ───────────────────────────────────────
    // 3: API Service
    {
      iceType: 'Compute.Container',
      label: 'API Service',
      position: { x: 380, y: 408 },
      data: { size: '2-4096', runtime: 'nodejs20', domain: 'api.secure.io', port: 8080 },
    },
    // 4: PostgreSQL
    {
      iceType: 'Database.PostgreSQL',
      label: 'Secure Database',
      position: { x: 636, y: 408 },
      data: { size: 'db.r6g.large', storage: '100', version: '17' },
    },
    // 5: Redis Sessions
    { iceType: 'Database.Redis', label: 'Redis Sessions', position: { x: 892, y: 408 }, data: { size: 'cache.r6g.large', port: 6379 } },

    // ── Security Controls (outside VPC) ───────────────────────────────────
    // 6: TLS Certificate
    { iceType: 'Security.Certificate', label: 'TLS Certificate', position: { x: 50, y: 674 }, data: {} },
    // 7: Secrets
    { iceType: 'Security.Secret', label: 'Secrets', position: { x: 306, y: 674 }, data: {} },
    // 8: Auth Provider
    { iceType: 'Security.Identity', label: 'Auth Provider', position: { x: 562, y: 674 }, data: {} },
    // 9: Audit Trail
    { iceType: 'Monitoring.Log', label: 'Audit Trail', position: { x: 818, y: 674 }, data: { keep_logs: '30 days' } },

    // ── Ungrouped (control plane) ─────────────────────────────────────────
    // 10: Domain
    { iceType: 'Network.Domain', label: 'Domain', position: { x: 50, y: 884 }, data: { hostname: 'api.secure.io' } },
    // 11: Repo
    { iceType: 'Source.Repository', label: 'GitHub Repo', position: { x: 306, y: 884 }, data: { repository: '', branch: 'main' } },
    // 12: Env
    { iceType: 'Config.Environment', label: 'Env Variables', position: { x: 562, y: 884 }, data: {} },
  ],

  connections: [
    // Internet → WAF → Gateway (Gateway→Gateway rule)
    { fromBlock: 0, toBlock: 1, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    { fromBlock: 1, toBlock: 2, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    // Gateway → Service (Gateway→Backend rule)
    { fromBlock: 2, toBlock: 3, relationship: 'connects_to', protocol: 'HTTP', port: 8080 },
    // Service → TLS (Service→Secrets config rule)
    { fromBlock: 3, toBlock: 6, relationship: 'depends_on' },
    // Service → data stores (Backend→Database, Backend→Cache rules)
    { fromBlock: 3, toBlock: 4, relationship: 'depends_on', protocol: 'TCP', port: 5432 },
    { fromBlock: 3, toBlock: 5, relationship: 'depends_on', protocol: 'TCP', port: 6379 },
    // Service → security controls (Service→Secrets, Backend→Auth rules)
    { fromBlock: 3, toBlock: 7, relationship: 'depends_on' },
    { fromBlock: 3, toBlock: 8, relationship: 'connects_to' },
    // Audit trail (Service→Monitoring rule)
    { fromBlock: 3, toBlock: 9, relationship: 'connects_to' },
    { fromBlock: 1, toBlock: 9, relationship: 'connects_to' },
    { fromBlock: 2, toBlock: 9, relationship: 'connects_to' },
    // Domain → Gateway (Domain→Routable rule)
    { fromBlock: 10, toBlock: 2, relationship: 'connects_to' },
    // Repo → Service (Repo→Service pipeline rule)
    { fromBlock: 11, toBlock: 3, relationship: 'connects_to' },
    // Service → Env (Service→EnvConfig config rule)
    { fromBlock: 3, toBlock: 12, relationship: 'depends_on' },
  ],
};
