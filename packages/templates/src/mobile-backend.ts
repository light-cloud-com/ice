/**
 * Mobile Backend Templates
 *
 * Mobile app backends with push notifications, media storage,
 * authentication, and social features.
 *
 * ============================================================================
 * Mobile App Backend (~$80-200/mo)
 * ============================================================================
 *
 * Architecture (deployable to AWS / GCP / Azure):
 *
 *   ┌── Public Zone ────────────────────────────────┐
 *   │  Internet ──► WAF                              │
 *   └────────────────────────────────────────────────┘
 *   ┌── VPC ──────────────────────────────────────────────────────────────┐
 *   │  ┌─ Public Subnet ─┐  ┌── Private Subnet ──────────────────────┐  │
 *   │  │  API Gateway     │  │  Mobile API    User DB    Session Cache │  │
 *   │  │                  │  │  Media Storage Push Queue  Push Worker  │  │
 *   │  └──────────────────┘  └────────────────────────────────────────┘  │
 *   └─────────────────────────────────────────────────────────────────────┘
 *   ┌── Monitoring ──┐
 *   │  API Logs      │
 *   └────────────────┘
 *   Auth   Secrets   (ungrouped control plane)
 *   Domain   Repo   Env
 *
 * Layout grid (CARD 240×160, PAD 20, HEADER 36, GAP 16):
 *   Row 0: Public Zone       (2c,1r → 536×236)    at (30,30)
 *   Row 1: VPC               (1142×488)            at (30,296)
 *          ├ Public Subnet   (1c,1r → 280×236)    at (50,352)  parent→VPC
 *          └ Private Subnet  (3c,2r → 792×412)    at (360,352) parent→VPC
 *   Row 2: Monitoring        (1c,1r → 280×236)    at (30,814)
 *   Row 3: Ungrouped         y=1080, y=1256
 *
 * ============================================================================
 * Social App Backend (~$150-400/mo)
 * ============================================================================
 *
 *   ┌── Public Zone ────────────────────────────────┐
 *   │  Internet ──► WAF                              │
 *   └────────────────────────────────────────────────┘
 *   ┌── VPC ──────────────────────────────────────────────────────────────┐
 *   │  ┌─ Public Subnet ─┐  ┌── Private Subnet ──────────────────────┐  │
 *   │  │  API Gateway     │  │  Social API    Social DB   Feed Cache  │  │
 *   │  │                  │  │  Media Storage Activity Q  Feed Worker │  │
 *   │  └──────────────────┘  └────────────────────────────────────────┘  │
 *   └─────────────────────────────────────────────────────────────────────┘
 *   ┌── Monitoring ──┐
 *   │  Social Logs   │
 *   └────────────────┘
 *   Auth   Secrets   Search   (ungrouped control plane)
 *   Domain   Repo   Env
 *
 * Layout grid (CARD 240×160, PAD 20, HEADER 36, GAP 16):
 *   Row 0: Public Zone       (2c,1r → 536×236)    at (30,30)
 *   Row 1: VPC               (1142×488)            at (30,296)
 *          ├ Public Subnet   (1c,1r → 280×236)    at (50,352)  parent→VPC
 *          └ Private Subnet  (3c,2r → 792×412)    at (360,352) parent→VPC
 *   Row 2: Monitoring        (1c,1r → 280×236)    at (30,814)
 *   Row 3: Ungrouped         y=1080, y=1256
 */

import type { ComposedTemplate } from './types';

// =============================================================================
// Mobile App Backend
// =============================================================================

export const mobileAppBackendTemplate: ComposedTemplate = {
  id: 'mobile-app-backend',
  name: 'Mobile App Backend',
  description: 'Mobile API with push notifications, media storage, authentication, WAF, and VPC network isolation.',
  icon: 'Smartphone',
  estimatedCost: '$80-200/mo',
  category: 'mobile',
  provider: 'gcp',
  providers: ['gcp', 'aws', 'azure'],
  tags: ['mobile', 'iOS', 'Android', 'push-notifications', 'API', 'VPC', 'Subnet'],
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
    // [3] Private Subnet — inside VPC
    {
      subtype: 'Custom',
      iceType: 'Network.Subnet',
      label: 'Private Subnet',
      position: { x: 360, y: 352 },
      width: 792,
      height: 412,
      blockIndices: [3, 4, 5, 6, 7, 8],
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
      blockIndices: [9],
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
    // 2: API Gateway
    { iceType: 'Network.Gateway', label: 'API Gateway', position: { x: 70, y: 408 }, data: { protocol: 'http' } },

    // ── Private Subnet (inside VPC) ───────────────────────────────────────
    // Row 0
    // 3: Mobile API
    {
      iceType: 'Compute.Container',
      label: 'Mobile API',
      position: { x: 380, y: 408 },
      data: { size: '1-2048', runtime: 'nodejs20', port: 8080 },
    },
    // 4: User DB
    {
      iceType: 'Database.PostgreSQL',
      label: 'User DB',
      position: { x: 636, y: 408 },
      data: { size: 'db.t3.small', storage: '50', version: '17' },
    },
    // 5: Session Cache
    {
      iceType: 'Database.Redis',
      label: 'Session Cache',
      position: { x: 892, y: 408 },
      data: { size: 'cache.t3.small', port: 6379 },
    },
    // Row 1
    // 6: Media Storage
    {
      iceType: 'Storage.Bucket',
      label: 'Media Storage',
      position: { x: 380, y: 584 },
      data: { storage_class: 'standard' },
    },
    // 7: Push Queue
    {
      iceType: 'Messaging.SQS',
      label: 'Push Queue',
      position: { x: 636, y: 584 },
      data: { queue_type: 'standard' },
    },
    // 8: Push Worker
    {
      iceType: 'Compute.Worker',
      label: 'Push Worker',
      position: { x: 892, y: 584 },
      data: { size: '1-2048', runtime: 'nodejs20' },
    },

    // ── Monitoring (outside VPC) ──────────────────────────────────────────
    // 9: API Logs
    { iceType: 'Monitoring.Log', label: 'API Logs', position: { x: 50, y: 870 }, data: { keep_logs: '30 days' } },

    // ── Ungrouped (control plane) ─────────────────────────────────────────
    // 10: Auth
    { iceType: 'Security.Identity', label: 'Auth', position: { x: 50, y: 1080 }, data: {} },
    // 11: Secrets
    { iceType: 'Security.Secret', label: 'App Secrets', position: { x: 306, y: 1080 }, data: {} },
    // 12: Domain
    { iceType: 'Network.Domain', label: 'Domain', position: { x: 50, y: 1256 }, data: { hostname: 'api.mobile.io' } },
    // 13: Repo
    {
      iceType: 'Source.Repository',
      label: 'GitHub Repo',
      position: { x: 306, y: 1256 },
      data: { repository: '', branch: 'main' },
    },
    // 14: Env
    { iceType: 'Config.Environment', label: 'Env Variables', position: { x: 562, y: 1256 }, data: {} },
  ],

  connections: [
    // Internet → WAF → Gateway (Internet→WAF, WAF→Gateway rules)
    { fromBlock: 0, toBlock: 1, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    { fromBlock: 1, toBlock: 2, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    // Gateway → Mobile API (Gateway→Backend rule)
    { fromBlock: 2, toBlock: 3, relationship: 'connects_to', protocol: 'HTTP', port: 8080 },
    // Mobile API → data stores (Backend→Database, Backend→Cache, Backend→Storage rules)
    { fromBlock: 3, toBlock: 4, relationship: 'depends_on', protocol: 'TCP', port: 5432 },
    { fromBlock: 3, toBlock: 5, relationship: 'depends_on', protocol: 'TCP', port: 6379 },
    { fromBlock: 3, toBlock: 6, relationship: 'depends_on' },
    // Mobile API → Push Queue (Backend→Queue publish rule)
    { fromBlock: 3, toBlock: 7, relationship: 'connects_to' },
    // Push Queue → Push Worker (Queue→Backend subscribe rule)
    { fromBlock: 7, toBlock: 8, relationship: 'connects_to' },
    // Mobile API → Auth (Backend→Auth rule)
    { fromBlock: 3, toBlock: 10, relationship: 'connects_to' },
    // Mobile API → Secrets (Service→Secrets config rule)
    { fromBlock: 3, toBlock: 11, relationship: 'depends_on' },
    // Mobile API → API Logs (Service→Monitoring rule)
    { fromBlock: 3, toBlock: 9, relationship: 'connects_to' },
    // Domain → API Gateway (Domain→Routable rule)
    { fromBlock: 12, toBlock: 2, relationship: 'connects_to' },
    // Repo → Mobile API (Repo→Service pipeline rule)
    { fromBlock: 13, toBlock: 3, relationship: 'connects_to' },
    // Mobile API → Env (Service→EnvConfig config rule)
    { fromBlock: 3, toBlock: 14, relationship: 'depends_on' },
  ],
};

// =============================================================================
// Social App Backend
// =============================================================================

export const mobileSocialAppTemplate: ComposedTemplate = {
  id: 'mobile-social-app',
  name: 'Social App Backend',
  description: 'Social app with activity feeds, media sharing, search, notifications, WAF, and VPC network isolation.',
  icon: 'Users',
  estimatedCost: '$150-400/mo',
  category: 'mobile',
  provider: 'gcp',
  providers: ['gcp', 'aws', 'azure'],
  tags: ['social', 'feed', 'messaging', 'notifications', 'VPC', 'Subnet'],
  securityLevel: 'standard',
  difficulty: 'advanced',
  trust: 'official',
  author: { name: 'ICE Team' },
  environmentPresets: [{ type: 'production', name: 'Production', region: 'us-central1', securityLevel: 'standard' }],

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
    // [3] Private Subnet — inside VPC
    {
      subtype: 'Custom',
      iceType: 'Network.Subnet',
      label: 'Private Subnet',
      position: { x: 360, y: 352 },
      width: 792,
      height: 412,
      blockIndices: [3, 4, 5, 6, 7, 8],
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
      blockIndices: [9],
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
    // 2: API Gateway
    { iceType: 'Network.Gateway', label: 'API Gateway', position: { x: 70, y: 408 }, data: { protocol: 'http' } },

    // ── Private Subnet (inside VPC) ───────────────────────────────────────
    // Row 0
    // 3: Social API
    {
      iceType: 'Compute.Container',
      label: 'Social API',
      position: { x: 380, y: 408 },
      data: { size: '2-4096', runtime: 'nodejs20', port: 8080 },
    },
    // 4: Social DB
    {
      iceType: 'Database.PostgreSQL',
      label: 'Social DB',
      position: { x: 636, y: 408 },
      data: { size: 'db.t3.medium', storage: '100', version: '17' },
    },
    // 5: Feed Cache
    {
      iceType: 'Database.Redis',
      label: 'Feed Cache',
      position: { x: 892, y: 408 },
      data: { size: 'cache.t3.medium', port: 6379 },
    },
    // Row 1
    // 6: Media Storage
    {
      iceType: 'Storage.Bucket',
      label: 'Media Storage',
      position: { x: 380, y: 584 },
      data: { storage_class: 'standard' },
    },
    // 7: Activity Queue
    {
      iceType: 'Messaging.SQS',
      label: 'Activity Queue',
      position: { x: 636, y: 584 },
      data: { queue_type: 'standard' },
    },
    // 8: Feed Worker
    {
      iceType: 'Compute.Worker',
      label: 'Feed Worker',
      position: { x: 892, y: 584 },
      data: { size: '1-2048', runtime: 'nodejs20' },
    },

    // ── Monitoring (outside VPC) ──────────────────────────────────────────
    // 9: Social Logs
    { iceType: 'Monitoring.Log', label: 'Social Logs', position: { x: 50, y: 870 }, data: { keep_logs: '30 days' } },

    // ── Ungrouped (control plane) ─────────────────────────────────────────
    // 10: Auth
    { iceType: 'Security.Identity', label: 'Auth', position: { x: 50, y: 1080 }, data: {} },
    // 11: Secrets
    { iceType: 'Security.Secret', label: 'App Secrets', position: { x: 306, y: 1080 }, data: {} },
    // 12: Search
    { iceType: 'Analytics.Search', label: 'Search', position: { x: 562, y: 1080 }, data: {} },
    // 13: Domain
    { iceType: 'Network.Domain', label: 'Domain', position: { x: 50, y: 1256 }, data: { hostname: 'api.social.io' } },
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
    { fromBlock: 1, toBlock: 2, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    // Gateway → Social API (Gateway→Backend rule)
    { fromBlock: 2, toBlock: 3, relationship: 'connects_to', protocol: 'HTTP', port: 8080 },
    // Social API → data stores (Backend→Database, Backend→Cache, Backend→Storage rules)
    { fromBlock: 3, toBlock: 4, relationship: 'depends_on', protocol: 'TCP', port: 5432 },
    { fromBlock: 3, toBlock: 5, relationship: 'depends_on', protocol: 'TCP', port: 6379 },
    { fromBlock: 3, toBlock: 6, relationship: 'depends_on' },
    // Social API → Activity Queue (Backend→Queue publish rule)
    { fromBlock: 3, toBlock: 7, relationship: 'connects_to' },
    // Activity Queue → Feed Worker (Queue→Backend subscribe rule)
    { fromBlock: 7, toBlock: 8, relationship: 'connects_to' },
    // Feed Worker → Social DB (Worker→Database rule)
    { fromBlock: 8, toBlock: 4, relationship: 'depends_on', protocol: 'TCP', port: 5432 },
    // Social API → Search (Backend→Search rule)
    { fromBlock: 3, toBlock: 12, relationship: 'depends_on' },
    // Social API → Auth (Backend→Auth rule)
    { fromBlock: 3, toBlock: 10, relationship: 'connects_to' },
    // Social API → Secrets (Service→Secrets config rule)
    { fromBlock: 3, toBlock: 11, relationship: 'depends_on' },
    // Social API → Social Logs (Service→Monitoring rule)
    { fromBlock: 3, toBlock: 9, relationship: 'connects_to' },
    // Feed Worker → Social Logs (Service→Monitoring rule)
    { fromBlock: 8, toBlock: 9, relationship: 'connects_to' },
    // Domain → API Gateway (Domain→Routable rule)
    { fromBlock: 13, toBlock: 2, relationship: 'connects_to' },
    // Repo → Social API (Repo→Service pipeline rule)
    { fromBlock: 14, toBlock: 3, relationship: 'connects_to' },
    // Social API → Env (Service→EnvConfig config rule)
    { fromBlock: 3, toBlock: 15, relationship: 'depends_on' },
  ],
};
