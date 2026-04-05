/**
 * Backend API Templates
 *
 * Two templates: REST API (single service) and Microservices (three services).
 *
 * ============================================================================
 * REST API (~$40-90/mo)
 * ============================================================================
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
 *   ┌── Monitoring ──┐
 *   │  Logs          │
 *   └────────────────┘
 *   Secret   Domain   Repo   Env   (ungrouped control plane)
 *
 * Layout grid (CARD 240×160, PAD 20, HEADER 36, GAP 16):
 *   Row 0: Public Zone       (2c,1r → 536×236)   at (30,30)
 *   Row 1: VPC               (886×292)            at (30,296)
 *          ├ Public Subnet   (1c,1r → 280×236)   at (50,352)  parent→VPC
 *          └ Private Subnet  (3c,1r → 792×236)   at (360,352) parent→VPC
 *   Row 2: Monitoring        (1c,1r → 280×236)   at (30,618)
 *   Row 3: Ungrouped         y=884, y=1060
 *
 * ============================================================================
 * Microservices (~$150-350/mo)
 * ============================================================================
 *
 *   ┌── Public Zone ────────────────────────────────┐
 *   │  Internet ──► WAF                              │
 *   └────────────────────────────────────────────────┘
 *   ┌── VPC ──────────────────────────────────────────────────────────────┐
 *   │  ┌─ Public Subnet ─┐  ┌── Private Subnet ──────────────────────┐  │
 *   │  │  Gateway         │  │  Users      Orders      Notifications  │  │
 *   │  │                  │  │  Users DB   Orders DB   Cache          │  │
 *   │  │                  │  │  Message Queue                         │  │
 *   │  └──────────────────┘  └────────────────────────────────────────┘  │
 *   └─────────────────────────────────────────────────────────────────────┘
 *   ┌── Monitoring ──┐
 *   │  Logs          │
 *   └────────────────┘
 *   Secret   Domain   Repo   Env   (ungrouped control plane)
 *
 * Layout grid (CARD 240×160, PAD 20, HEADER 36, GAP 16):
 *   Row 0: Public Zone       (2c,1r → 536×236)   at (30,30)
 *   Row 1: VPC               (1142×664)           at (30,296)
 *          ├ Public Subnet   (1c,1r → 280×236)   at (50,352)  parent→VPC
 *          └ Private Subnet  (3c,3r → 792×588)   at (360,352) parent→VPC
 *   Row 2: Monitoring        (1c,1r → 280×236)   at (30,990)
 *   Row 3: Ungrouped         y=1256, y=1432
 */

import type { ComposedTemplate } from './types';

export const backendApiTemplate: ComposedTemplate = {
  id: 'backend-rest-api',
  name: 'REST API',
  description:
    'Production backend API with gateway, service, PostgreSQL, Redis cache, and logging. API-first — no frontend.',
  icon: 'Server',
  estimatedCost: '$40-90/mo',
  category: 'backend',
  provider: 'gcp',
  providers: ['gcp', 'aws', 'azure'],
  tags: ['REST', 'Node.js', 'PostgreSQL', 'Redis', 'VPC', 'Subnet'],
  securityLevel: 'standard',
  difficulty: 'starter',
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
    // [4] Monitoring — outside VPC (managed service)
    {
      subtype: 'Monitoring',
      label: 'Monitoring',
      position: { x: 30, y: 618 },
      width: 280,
      height: 236,
      blockIndices: [6],
      color: '#f59e0b',
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
      data: { size: '1-2048', runtime: 'nodejs20', domain: 'api.myapp.com', port: 8080 },
    },
    // 4: PostgreSQL
    { iceType: 'Database.PostgreSQL', label: 'API Database', position: { x: 636, y: 408 }, data: { size: 'db.t3.small', storage: '20', version: '17' } },
    // 5: Redis
    { iceType: 'Database.Redis', label: 'API Cache', position: { x: 892, y: 408 }, data: { size: 'cache.t3.small', port: 6379 } },

    // ── Monitoring (outside VPC) ──────────────────────────────────────────
    // 6: Logs
    { iceType: 'Monitoring.Log', label: 'API Logs', position: { x: 50, y: 674 }, data: { keep_logs: '30 days' } },

    // ── Ungrouped (control plane) ─────────────────────────────────────────
    // 7: Secret
    { iceType: 'Security.Secret', label: 'API Secrets', position: { x: 50, y: 884 }, data: {} },
    // 8: Domain
    { iceType: 'Network.Domain', label: 'Domain', position: { x: 306, y: 884 }, data: { hostname: 'api.myapp.com' } },
    // 9: Repo
    { iceType: 'Source.Repository', label: 'GitHub Repo', position: { x: 50, y: 1060 }, data: { repository: '', branch: 'main' } },
    // 10: Env
    { iceType: 'Config.Environment', label: 'Env Variables', position: { x: 306, y: 1060 }, data: {} },
  ],

  connections: [
    // Internet → WAF → Gateway (Gateway→Gateway rule)
    { fromBlock: 0, toBlock: 1, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    { fromBlock: 1, toBlock: 2, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    // Gateway → Service (Gateway→Backend rule)
    { fromBlock: 2, toBlock: 3, relationship: 'connects_to', protocol: 'HTTP', port: 8080 },
    // Service → Data (Backend→Database, Backend→Cache rules)
    { fromBlock: 3, toBlock: 4, relationship: 'depends_on', protocol: 'TCP', port: 5432 },
    { fromBlock: 3, toBlock: 5, relationship: 'depends_on', protocol: 'TCP', port: 6379 },
    // Service → Secrets (Service→Secrets config rule)
    { fromBlock: 3, toBlock: 7, relationship: 'depends_on' },
    // Service → Logs (Service→Monitoring rule)
    { fromBlock: 3, toBlock: 6, relationship: 'connects_to' },
    // Domain → Gateway (Domain→Routable rule)
    { fromBlock: 8, toBlock: 2, relationship: 'connects_to' },
    // Repo → Service (Repo→Service pipeline rule)
    { fromBlock: 9, toBlock: 3, relationship: 'connects_to' },
    // Service → Env (Service→EnvConfig config rule)
    { fromBlock: 3, toBlock: 10, relationship: 'depends_on' },
  ],
};

/**
 * Microservices Template (~$150-350/mo)
 *
 * Three independent services behind a gateway, each with own database,
 * shared cache, message queue for inter-service communication, and monitoring.
 */
export const microservicesTemplate: ComposedTemplate = {
  id: 'backend-microservices',
  name: 'Microservices',
  description:
    'Three independent services behind a gateway, each with own database, shared message queue, and monitoring.',
  icon: 'Waypoints',
  estimatedCost: '$150-350/mo',
  category: 'backend',
  provider: 'gcp',
  providers: ['gcp', 'aws', 'azure'],
  tags: ['Microservices', 'Node.js', 'Go', 'PostgreSQL', 'RabbitMQ', 'VPC', 'Subnet'],
  securityLevel: 'standard',
  difficulty: 'advanced',
  trust: 'official',
  author: { name: 'ICE Team' },
  environmentPresets: [
    { type: 'production', name: 'Production', region: 'us-central1', securityLevel: 'standard' },
    { type: 'staging', name: 'Staging', region: 'us-central1', securityLevel: 'basic' },
    { type: 'development', name: 'Development', region: 'us-central1', securityLevel: 'basic' },
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
      width: 1142,
      height: 664,
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
      height: 588,
      blockIndices: [3, 4, 5, 6, 7, 8, 9],
      color: '#6366f1',
      parentGroupIndex: 1,
    },
    // [4] Monitoring — outside VPC (managed service)
    {
      subtype: 'Monitoring',
      label: 'Monitoring',
      position: { x: 30, y: 990 },
      width: 280,
      height: 236,
      blockIndices: [10],
      color: '#f59e0b',
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
    // Row 0
    // 3: Users Service
    {
      iceType: 'Compute.Container',
      label: 'Users Service',
      position: { x: 380, y: 408 },
      data: { size: '1-2048', runtime: 'nodejs20', port: 8080 },
    },
    // 4: Orders Service
    {
      iceType: 'Compute.Container',
      label: 'Orders Service',
      position: { x: 636, y: 408 },
      data: { size: '1-2048', runtime: 'go1.22', port: 8081 },
    },
    // 5: Notifications
    {
      iceType: 'Compute.Container',
      label: 'Notifications',
      position: { x: 892, y: 408 },
      data: { size: '1-2048', runtime: 'nodejs20', port: 8082 },
    },
    // Row 1
    // 6: Users DB
    { iceType: 'Database.PostgreSQL', label: 'Users DB', position: { x: 380, y: 584 }, data: { size: 'db.t3.medium', storage: '50', version: '17' } },
    // 7: Orders DB
    { iceType: 'Database.PostgreSQL', label: 'Orders DB', position: { x: 636, y: 584 }, data: { size: 'db.t3.medium', storage: '50', version: '17' } },
    // 8: Cache
    { iceType: 'Database.Redis', label: 'Shared Cache', position: { x: 892, y: 584 }, data: { size: 'cache.t3.medium', port: 6379 } },
    // Row 2
    // 9: Message Queue
    { iceType: 'Messaging.RabbitMQ', label: 'Message Queue', position: { x: 380, y: 760 }, data: { size: 'mq.m5.large' } },

    // ── Monitoring (outside VPC) ──────────────────────────────────────────
    // 10: Logs
    { iceType: 'Monitoring.Log', label: 'Service Logs', position: { x: 50, y: 1046 }, data: { keep_logs: '30 days' } },

    // ── Ungrouped (control plane) ─────────────────────────────────────────
    // 11: Secret
    { iceType: 'Security.Secret', label: 'App Secrets', position: { x: 50, y: 1256 }, data: {} },
    // 12: Domain
    { iceType: 'Network.Domain', label: 'Domain', position: { x: 306, y: 1256 }, data: { hostname: 'api.myapp.com' } },
    // 13: Repo
    { iceType: 'Source.Repository', label: 'GitHub Repo', position: { x: 50, y: 1432 }, data: { repository: '', branch: 'main' } },
    // 14: Env
    { iceType: 'Config.Environment', label: 'Env Variables', position: { x: 306, y: 1432 }, data: {} },
  ],

  connections: [
    // Internet → WAF → Gateway (Gateway→Gateway rule)
    { fromBlock: 0, toBlock: 1, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    { fromBlock: 1, toBlock: 2, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    // Gateway → Services (Gateway→Backend rule)
    { fromBlock: 2, toBlock: 3, relationship: 'connects_to', protocol: 'HTTP', port: 8080 },
    { fromBlock: 2, toBlock: 4, relationship: 'connects_to', protocol: 'HTTP', port: 8081 },
    { fromBlock: 2, toBlock: 5, relationship: 'connects_to', protocol: 'HTTP', port: 8082 },
    // Services → Databases (Backend→Database rule)
    { fromBlock: 3, toBlock: 6, relationship: 'depends_on', protocol: 'TCP', port: 5432 },
    { fromBlock: 4, toBlock: 7, relationship: 'depends_on', protocol: 'TCP', port: 5432 },
    // Services → Cache (Backend→Cache rule)
    { fromBlock: 3, toBlock: 8, relationship: 'depends_on', protocol: 'TCP', port: 6379 },
    { fromBlock: 4, toBlock: 8, relationship: 'depends_on', protocol: 'TCP', port: 6379 },
    // Orders → MQ → Notifications (Backend→Queue, Queue→Backend rules)
    { fromBlock: 4, toBlock: 9, relationship: 'connects_to' },
    { fromBlock: 9, toBlock: 5, relationship: 'connects_to' },
    // Services → Secrets (Service→Secrets config rule)
    { fromBlock: 3, toBlock: 11, relationship: 'depends_on' },
    { fromBlock: 4, toBlock: 11, relationship: 'depends_on' },
    { fromBlock: 5, toBlock: 11, relationship: 'depends_on' },
    // Services → Logs (Service→Monitoring rule)
    { fromBlock: 3, toBlock: 10, relationship: 'connects_to' },
    { fromBlock: 4, toBlock: 10, relationship: 'connects_to' },
    { fromBlock: 5, toBlock: 10, relationship: 'connects_to' },
    // Domain → Gateway (Domain→Routable rule)
    { fromBlock: 12, toBlock: 2, relationship: 'connects_to' },
    // Repo → Service (Repo→Service pipeline rule)
    { fromBlock: 13, toBlock: 3, relationship: 'connects_to' },
    // Service → Env (Service→EnvConfig config rule)
    { fromBlock: 3, toBlock: 14, relationship: 'depends_on' },
  ],
};
