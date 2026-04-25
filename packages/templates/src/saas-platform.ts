/**
 * SaaS Platform Templates
 *
 * Multi-tenant SaaS and analytics dashboard infrastructure
 * with tenant isolation, background jobs, and data warehousing.
 *
 * ============================================================================
 * Multi-Tenant SaaS (~$200-500/mo)
 * ============================================================================
 *
 * Architecture (deployable to AWS / GCP / Azure):
 *
 *   ┌── Public Zone ──────────────────────────────────────────────┐
 *   │  Internet ──► WAF ──► App Dashboard (SSR Next.js)           │
 *   └─────────────────────────────────────────────────────────────┘
 *   ┌── VPC ──────────────────────────────────────────────────────────────┐
 *   │  ┌─ Public Subnet ─┐  ┌── Private Subnet ──────────────────────┐  │
 *   │  │  Gateway         │  │  Tenant API    Tenant DB   Session Cache│  │
 *   │  │                  │  │  File Storage  Job Queue   Background   │  │
 *   │  └──────────────────┘  └────────────────────────────────────────┘  │
 *   └─────────────────────────────────────────────────────────────────────┘
 *   ┌── Monitoring ──┐
 *   │  Platform Logs │
 *   └────────────────┘
 *   Auth   Secrets   (ungrouped control plane)
 *   Domain   Repo   Env
 *
 * Layout grid (CARD 240×160, PAD 20, HEADER 36, GAP 16):
 *   Row 0: Public Zone       (3c,1r → 792×236)    at (30,30)
 *   Row 1: VPC               (1142×488)            at (30,296)
 *          ├ Public Subnet   (1c,1r → 280×236)    at (50,352)  parent→VPC
 *          └ Private Subnet  (3c,2r → 792×412)    at (360,352) parent→VPC
 *   Row 2: Monitoring        (1c,1r → 280×236)    at (30,814)
 *   Row 3: Ungrouped         y=1080, y=1256
 *
 * ============================================================================
 * Analytics Dashboard (~$150-350/mo)
 * ============================================================================
 *
 *   ┌── Public Zone ──────────────────────────────────────────────┐
 *   │  Internet ──► WAF ──► Dashboard UI (Static React)           │
 *   └─────────────────────────────────────────────────────────────┘
 *   ┌── VPC ──────────────────────────────────────────────────────────────┐
 *   │  ┌─ Public Subnet ─┐  ┌── Private Subnet ──────────────────────┐  │
 *   │  │  Gateway         │  │  Analytics API  Metrics DB  Query Cache │  │
 *   │  │                  │  │  Data Warehouse ETL Worker  Ingest Queue│  │
 *   │  └──────────────────┘  └────────────────────────────────────────┘  │
 *   └─────────────────────────────────────────────────────────────────────┘
 *   ┌── Monitoring ──┐
 *   │  Logs          │
 *   └────────────────┘
 *   Secrets   Domain   Repo   Env   (ungrouped control plane)
 *
 * Layout grid (CARD 240×160, PAD 20, HEADER 36, GAP 16):
 *   Row 0: Public Zone       (3c,1r → 792×236)    at (30,30)
 *   Row 1: VPC               (1142×488)            at (30,296)
 *          ├ Public Subnet   (1c,1r → 280×236)    at (50,352)  parent→VPC
 *          └ Private Subnet  (3c,2r → 792×412)    at (360,352) parent→VPC
 *   Row 2: Monitoring        (1c,1r → 280×236)    at (30,814)
 *   Row 3: Ungrouped         y=1080
 */

import type { ComposedTemplate } from './types';

// =============================================================================
// Multi-Tenant SaaS
// =============================================================================

export const saasMultiTenantTemplate: ComposedTemplate = {
  id: 'saas-multi-tenant',
  name: 'Multi-Tenant SaaS',
  description:
    'Full SaaS platform with tenant isolation, background jobs, auth, WAF protection, and VPC network isolation.',
  icon: 'Cloud',
  estimatedCost: '$200-500/mo',
  category: 'saas',
  provider: 'gcp',
  providers: ['gcp', 'aws', 'azure'],
  tags: ['multi-tenant', 'SaaS', 'subscription', 'billing', 'VPC', 'Subnet'],
  securityLevel: 'standard',
  difficulty: 'advanced',
  trust: 'official',
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
    // [4] Monitoring — outside VPC (managed service)
    {
      subtype: 'Monitoring',
      label: 'Monitoring',
      position: { x: 30, y: 814 },
      width: 280,
      height: 236,
      blockIndices: [10],
      color: '#f59e0b',
    },
  ],

  blocks: [
    // ── Public Zone (outside VPC) ─────────────────────────────────────────
    // 0: Internet
    {
      iceType: 'Network.PublicEndpoint',
      label: 'Public Traffic',
      position: { x: 50, y: 86 },
      data: { domain: 'app.saas.io', enableHttps: true, autoProvisionCert: true, redirectHttpToHttps: true },
    },
    // 1: WAF
    { iceType: 'Security.WAF', label: 'WAF', position: { x: 306, y: 86 }, data: {} },
    // 2: App Dashboard (SSR)
    {
      iceType: 'Compute.SSRSite',
      label: 'App Dashboard',
      position: { x: 562, y: 86 },
      data: { framework: 'nextjs', domain: 'app.saas.io' },
    },

    // ── Public Subnet (inside VPC) ────────────────────────────────────────
    // 3: Gateway
    { iceType: 'Network.Gateway', label: 'API Gateway', position: { x: 70, y: 408 }, data: { protocol: 'http' } },

    // ── Private Subnet (inside VPC) ───────────────────────────────────────
    // Row 0
    // 4: Tenant API
    {
      iceType: 'Compute.Container',
      label: 'Tenant API',
      position: { x: 380, y: 408 },
      data: { size: '2-4096', runtime: 'nodejs20', port: 8080 },
    },
    // 5: Tenant DB
    {
      iceType: 'Database.PostgreSQL',
      label: 'Tenant DB',
      position: { x: 636, y: 408 },
      data: { size: 'db.t3.medium', storage: '100', version: '17' },
    },
    // 6: Session Cache
    {
      iceType: 'Database.Redis',
      label: 'Session Cache',
      position: { x: 892, y: 408 },
      data: { size: 'cache.t3.medium', port: 6379 },
    },
    // Row 1
    // 7: File Storage
    {
      iceType: 'Storage.Bucket',
      label: 'File Storage',
      position: { x: 380, y: 584 },
      data: { storage_class: 'standard' },
    },
    // 8: Job Queue
    {
      iceType: 'Messaging.SQS',
      label: 'Job Queue',
      position: { x: 636, y: 584 },
      data: { queue_type: 'standard' },
    },
    // 9: Background Jobs
    {
      iceType: 'Compute.Worker',
      label: 'Background Jobs',
      position: { x: 892, y: 584 },
      data: { size: '1-2048', runtime: 'nodejs20' },
    },

    // ── Monitoring (outside VPC) ──────────────────────────────────────────
    // 10: Platform Logs
    { iceType: 'Monitoring.Log', label: 'Platform Logs', position: { x: 50, y: 870 }, data: { keep_logs: '30 days' } },

    // ── Ungrouped (control plane) ─────────────────────────────────────────
    // 11: Auth
    { iceType: 'Security.Identity', label: 'Auth', position: { x: 50, y: 1080 }, data: {} },
    // 12: Secrets
    { iceType: 'Security.Secret', label: 'App Secrets', position: { x: 306, y: 1080 }, data: {} },
    // 14: Repo
    {
      iceType: 'Source.Repository',
      label: 'GitHub Repo',
      position: { x: 306, y: 1256 },
      data: { repository: '', branch: 'main' },
    },
    // 15: Env
    { iceType: 'Config.Environment', label: 'Env Variables', position: { x: 562, y: 1256 }, data: {} },
  ],

  connections: [
    // Internet → WAF → Gateway (Internet→WAF, WAF→Gateway rules)
    { fromBlock: 0, toBlock: 1, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    { fromBlock: 1, toBlock: 3, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    // Internet → App Dashboard (Internet→Frontend rule)
    { fromBlock: 0, toBlock: 2, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    // App Dashboard → Gateway (Frontend→Gateway rule)
    { fromBlock: 2, toBlock: 3, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    // Gateway → Tenant API (Gateway→Backend rule)
    { fromBlock: 3, toBlock: 4, relationship: 'connects_to', protocol: 'HTTP', port: 8080 },
    // Tenant API → data stores (Backend→Database, Backend→Cache rules)
    { fromBlock: 4, toBlock: 5, relationship: 'depends_on', protocol: 'TCP', port: 5432 },
    { fromBlock: 4, toBlock: 6, relationship: 'depends_on', protocol: 'TCP', port: 6379 },
    // Tenant API → File Storage (Backend→Storage rule)
    { fromBlock: 4, toBlock: 7, relationship: 'depends_on' },
    // Tenant API → Job Queue (Backend→Queue publish rule)
    { fromBlock: 4, toBlock: 8, relationship: 'connects_to' },
    // Job Queue → Background Jobs (Queue→Backend subscribe rule)
    { fromBlock: 8, toBlock: 9, relationship: 'connects_to' },
    // Background Jobs → Tenant DB (Worker→Database rule)
    { fromBlock: 9, toBlock: 5, relationship: 'depends_on', protocol: 'TCP', port: 5432 },
    // Tenant API → Auth (Backend→Auth rule)
    { fromBlock: 4, toBlock: 11, relationship: 'connects_to' },
    // Tenant API → Secrets (Service→Secrets config rule)
    { fromBlock: 4, toBlock: 12, relationship: 'depends_on' },
    // Tenant API → Platform Logs (Service→Monitoring rule)
    { fromBlock: 4, toBlock: 10, relationship: 'connects_to' },
    // Background Jobs → Platform Logs (Service→Monitoring rule)
    { fromBlock: 9, toBlock: 10, relationship: 'connects_to' },
    // Domain → App Dashboard (Domain→Routable rule)
    // Repo → Tenant API (Repo→Service pipeline rule)
    { fromBlock: 13, toBlock: 4, relationship: 'connects_to' },
    // Tenant API → Env (Service→EnvConfig config rule)
    { fromBlock: 4, toBlock: 14, relationship: 'depends_on' },
  ],
};

// =============================================================================
// Analytics Dashboard
// =============================================================================

export const saasAnalyticsDashboardTemplate: ComposedTemplate = {
  id: 'saas-analytics-dashboard',
  name: 'Analytics Dashboard',
  description: 'Metrics collection, data warehousing, real-time dashboard with WAF and VPC isolation.',
  icon: 'BarChart3',
  estimatedCost: '$150-350/mo',
  category: 'saas',
  provider: 'gcp',
  providers: ['gcp', 'aws', 'azure'],
  tags: ['analytics', 'dashboard', 'metrics', 'BI', 'VPC', 'Subnet'],
  securityLevel: 'standard',
  difficulty: 'intermediate',
  trust: 'official',
  author: { name: 'ICE Team' },
  environmentPresets: [{ type: 'production', name: 'Production', region: 'us-central1', securityLevel: 'standard' }],

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
    // [4] Monitoring — outside VPC (managed service)
    {
      subtype: 'Monitoring',
      label: 'Monitoring',
      position: { x: 30, y: 814 },
      width: 280,
      height: 236,
      blockIndices: [10],
      color: '#f59e0b',
    },
  ],

  blocks: [
    // ── Public Zone (outside VPC) ─────────────────────────────────────────
    // 0: Internet
    {
      iceType: 'Network.PublicEndpoint',
      label: 'Public Traffic',
      position: { x: 50, y: 86 },
      data: { domain: 'analytics.acme.io', enableHttps: true, autoProvisionCert: true, redirectHttpToHttps: true },
    },
    // 1: WAF
    { iceType: 'Security.WAF', label: 'WAF', position: { x: 306, y: 86 }, data: {} },
    // 2: Dashboard UI (Static)
    {
      iceType: 'Compute.StaticSite',
      label: 'Dashboard UI',
      position: { x: 562, y: 86 },
      data: { framework: 'react', domain: 'analytics.acme.io' },
    },

    // ── Public Subnet (inside VPC) ────────────────────────────────────────
    // 3: Gateway
    { iceType: 'Network.Gateway', label: 'API Gateway', position: { x: 70, y: 408 }, data: { protocol: 'http' } },

    // ── Private Subnet (inside VPC) ───────────────────────────────────────
    // Row 0
    // 4: Analytics API
    {
      iceType: 'Compute.Container',
      label: 'Analytics API',
      position: { x: 380, y: 408 },
      data: { size: '1-2048', runtime: 'python3.12', port: 8080 },
    },
    // 5: Metrics DB
    {
      iceType: 'Database.PostgreSQL',
      label: 'Metrics DB',
      position: { x: 636, y: 408 },
      data: { size: 'db.t3.small', storage: '200', version: '17' },
    },
    // 6: Query Cache
    {
      iceType: 'Database.Redis',
      label: 'Query Cache',
      position: { x: 892, y: 408 },
      data: { size: 'cache.t3.small', port: 6379 },
    },
    // Row 1
    // 7: Data Warehouse
    {
      iceType: 'Analytics.DataWarehouse',
      label: 'Data Warehouse',
      position: { x: 380, y: 584 },
      data: {},
    },
    // 8: ETL Worker
    {
      iceType: 'Compute.Worker',
      label: 'ETL Worker',
      position: { x: 636, y: 584 },
      data: { size: '1-2048', runtime: 'python3.12' },
    },
    // 9: Ingest Queue
    {
      iceType: 'Messaging.SQS',
      label: 'Ingest Queue',
      position: { x: 892, y: 584 },
      data: { queue_type: 'standard' },
    },

    // ── Monitoring (outside VPC) ──────────────────────────────────────────
    // 10: Logs
    { iceType: 'Monitoring.Log', label: 'Platform Logs', position: { x: 50, y: 870 }, data: { keep_logs: '30 days' } },

    // ── Ungrouped (control plane) ─────────────────────────────────────────
    // 11: Secrets
    { iceType: 'Security.Secret', label: 'App Secrets', position: { x: 50, y: 1080 }, data: {} },
    // 13: Repo
    {
      iceType: 'Source.Repository',
      label: 'GitHub Repo',
      position: { x: 562, y: 1080 },
      data: { repository: '', branch: 'main' },
    },
    // 14: Env
    { iceType: 'Config.Environment', label: 'Env Variables', position: { x: 50, y: 1256 }, data: {} },
  ],

  connections: [
    // Internet → WAF → Gateway (Internet→WAF, WAF→Gateway rules)
    { fromBlock: 0, toBlock: 1, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    { fromBlock: 1, toBlock: 3, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    // Dashboard UI is publicly reachable on its own — Firebase Hosting
    // (GCP), AWS Amplify, and Azure Static Web Apps include HTTPS, CDN,
    // and custom domain. The `domain` field on the StaticSite block
    // does the wiring; no Public Endpoint edge needed.
    // Gateway → Analytics API (Gateway→Backend rule)
    { fromBlock: 3, toBlock: 4, relationship: 'connects_to', protocol: 'HTTP', port: 8080 },
    // Analytics API → data stores (Backend→Database, Backend→Cache rules)
    { fromBlock: 4, toBlock: 5, relationship: 'depends_on', protocol: 'TCP', port: 5432 },
    { fromBlock: 4, toBlock: 6, relationship: 'depends_on', protocol: 'TCP', port: 6379 },
    // Ingest Queue → ETL Worker (Queue→Backend subscribe rule)
    { fromBlock: 9, toBlock: 8, relationship: 'connects_to' },
    // ETL Worker → Data Warehouse (Worker→Warehouse rule)
    { fromBlock: 8, toBlock: 7, relationship: 'depends_on' },
    // ETL Worker → Metrics DB (Worker→Database rule)
    { fromBlock: 8, toBlock: 5, relationship: 'depends_on', protocol: 'TCP', port: 5432 },
    // Analytics API → Secrets (Service→Secrets config rule)
    { fromBlock: 4, toBlock: 11, relationship: 'depends_on' },
    // Analytics API → Logs (Service→Monitoring rule)
    { fromBlock: 4, toBlock: 10, relationship: 'connects_to' },
    // ETL Worker → Logs (Service→Monitoring rule)
    { fromBlock: 8, toBlock: 10, relationship: 'connects_to' },
    // Domain → Dashboard UI (Domain→Routable rule)
    // Repo → Analytics API (Repo→Service pipeline rule)
    { fromBlock: 12, toBlock: 4, relationship: 'connects_to' },
    // Analytics API → Env (Service→EnvConfig config rule)
    { fromBlock: 4, toBlock: 13, relationship: 'depends_on' },
  ],
};
