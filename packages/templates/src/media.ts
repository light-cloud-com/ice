/**
 * Media & Streaming Templates
 *
 * Two templates: Video Streaming Platform and Podcast Platform.
 *
 * ============================================================================
 * Video Streaming Platform (~$200-500/mo)
 * ============================================================================
 *
 * Architecture (deployable to AWS / GCP / Azure):
 *
 *   ┌── Public Zone ────────────────────────────────┐
 *   │  Internet ──► WAF                              │
 *   └────────────────────────────────────────────────┘
 *   ┌── VPC ──────────────────────────────────────────────────────────────┐
 *   │  ┌─ Public Subnet ─┐  ┌── Private Subnet ──────────────────────┐  │
 *   │  │  CDN Gateway     │  │  Streaming API  Content DB  View Cache  │  │
 *   │  │                  │  │  Video Storage  Transcode Q  Transcoder │  │
 *   │  └──────────────────┘  └────────────────────────────────────────┘  │
 *   └─────────────────────────────────────────────────────────────────────┘
 *   ┌── Monitoring ──┐
 *   │  Stream Logs   │
 *   └────────────────┘
 *   Secrets   Search   (ungrouped control plane)
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
 * Podcast Platform (~$50-120/mo)
 * ============================================================================
 *
 *   ┌── Public Zone ──────────────────────────────────────────────┐
 *   │  Internet ──► WAF ──► Podcast App (SSR Next.js)             │
 *   └─────────────────────────────────────────────────────────────┘
 *   ┌── VPC ──────────────────────────────────────────────────────────────┐
 *   │  ┌─ Public Subnet ─┐  ┌── Private Subnet ──────────────────────┐  │
 *   │  │  Gateway         │  │  Podcast API   Episode DB  Audio Store  │  │
 *   │  └──────────────────┘  └────────────────────────────────────────┘  │
 *   └─────────────────────────────────────────────────────────────────────┘
 *   ┌── Monitoring ──┐
 *   │  Logs          │
 *   └────────────────┘
 *   Secrets   Search   (ungrouped control plane)
 *   Domain   Repo   Env
 *
 * Layout grid (CARD 240×160, PAD 20, HEADER 36, GAP 16):
 *   Row 0: Public Zone       (3c,1r → 792×236)    at (30,30)
 *   Row 1: VPC               (1142×312)            at (30,296)
 *          ├ Public Subnet   (1c,1r → 280×236)    at (50,352)  parent→VPC
 *          └ Private Subnet  (3c,1r → 792×236)    at (360,352) parent→VPC
 *   Row 2: Monitoring        (1c,1r → 280×236)    at (30,638)
 *   Row 3: Ungrouped         y=904, y=1080
 */

import type { ComposedTemplate } from './types';

export const mediaStreamingTemplate: ComposedTemplate = {
  id: 'media-streaming',
  name: 'Video Streaming Platform',
  description:
    'CDN-backed video delivery with transcoding pipeline, search, WAF protection, and VPC network isolation.',
  icon: 'Play',
  estimatedCost: '$200-500/mo',
  category: 'media',
  provider: 'gcp',
  providers: ['gcp', 'aws', 'azure'],
  tags: ['video', 'streaming', 'CDN', 'transcoding', 'VPC', 'Subnet'],
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
    { iceType: 'Network.PublicEndpoint', label: 'Public Traffic', position: { x: 50, y: 86 }, data: { domain: 'stream.acme.io', enableHttps: true, autoProvisionCert: true, redirectHttpToHttps: true } },
    // 1: WAF
    { iceType: 'Security.WAF', label: 'WAF', position: { x: 306, y: 86 }, data: {} },

    // ── Public Subnet (inside VPC) ────────────────────────────────────────
    // 2: CDN Gateway
    { iceType: 'Network.Gateway', label: 'CDN Gateway', position: { x: 70, y: 408 }, data: { protocol: 'http' } },

    // ── Private Subnet (inside VPC) ───────────────────────────────────────
    // Row 0
    // 3: Streaming API
    {
      iceType: 'Compute.Container',
      label: 'Streaming API',
      position: { x: 380, y: 408 },
      data: { size: '1-2048', runtime: 'nodejs20', port: 8080 },
    },
    // 4: Content DB
    {
      iceType: 'Database.PostgreSQL',
      label: 'Content DB',
      position: { x: 636, y: 408 },
      data: { size: 'db.t3.small', storage: '50', version: '17' },
    },
    // 5: View Cache
    {
      iceType: 'Database.Redis',
      label: 'View Cache',
      position: { x: 892, y: 408 },
      data: { size: 'cache.t3.small', port: 6379 },
    },
    // Row 1
    // 6: Video Storage
    {
      iceType: 'Storage.Bucket',
      label: 'Video Storage',
      position: { x: 380, y: 584 },
      data: { storage_class: 'standard' },
    },
    // 7: Transcode Queue
    {
      iceType: 'Messaging.SQS',
      label: 'Transcode Queue',
      position: { x: 636, y: 584 },
      data: { queue_type: 'standard' },
    },
    // 8: Transcoding Worker
    {
      iceType: 'Compute.Worker',
      label: 'Transcoding Worker',
      position: { x: 892, y: 584 },
      data: { size: '1-2048', runtime: 'nodejs20' },
    },

    // ── Monitoring (outside VPC) ──────────────────────────────────────────
    // 9: Stream Logs
    { iceType: 'Monitoring.Log', label: 'Stream Logs', position: { x: 50, y: 870 }, data: { keep_logs: '30 days' } },

    // ── Ungrouped (control plane) ─────────────────────────────────────────
    // 10: Secrets
    { iceType: 'Security.Secret', label: 'App Secrets', position: { x: 50, y: 1080 }, data: {} },
    // 11: Search
    { iceType: 'Analytics.Search', label: 'Content Search', position: { x: 306, y: 1080 }, data: {} },
    // 13: Repo
    {
      iceType: 'Source.Repository',
      label: 'GitHub Repo',
      position: { x: 306, y: 1256 },
      data: { repository: '', branch: 'main' },
    },
    // 14: Env
    { iceType: 'Config.Environment', label: 'Env Variables', position: { x: 562, y: 1256 }, data: {} },],

  connections: [
    // Internet → WAF → CDN Gateway (Internet→WAF, WAF→Gateway rules)
    { fromBlock: 0, toBlock: 1, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    { fromBlock: 1, toBlock: 2, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    // CDN Gateway → Streaming API (Gateway→Backend rule)
    { fromBlock: 2, toBlock: 3, relationship: 'connects_to', protocol: 'HTTP', port: 8080 },
    // Streaming API → Data (Backend→Database, Backend→Cache, Backend→Storage rules)
    { fromBlock: 3, toBlock: 4, relationship: 'depends_on', protocol: 'TCP', port: 5432 },
    { fromBlock: 3, toBlock: 5, relationship: 'depends_on', protocol: 'TCP', port: 6379 },
    { fromBlock: 3, toBlock: 6, relationship: 'depends_on' },
    // Streaming API → Transcode Queue (Backend→Queue rule)
    { fromBlock: 3, toBlock: 7, relationship: 'connects_to' },
    // Transcode Queue → Transcoding Worker (Queue→Backend rule)
    { fromBlock: 7, toBlock: 8, relationship: 'connects_to' },
    // Transcoding Worker → Video Storage (Backend→Storage rule)
    { fromBlock: 8, toBlock: 6, relationship: 'depends_on' },
    // Streaming API → Search (Backend→Search rule)
    { fromBlock: 3, toBlock: 11, relationship: 'depends_on' },
    // Streaming API → Secrets (Service→Secrets config rule)
    { fromBlock: 3, toBlock: 10, relationship: 'depends_on' },
    // Streaming API → Logs (Service→Monitoring rule)
    { fromBlock: 3, toBlock: 9, relationship: 'connects_to' },
    // Transcoding Worker → Logs (Service→Monitoring rule)
    { fromBlock: 8, toBlock: 9, relationship: 'connects_to' },
    // Domain → CDN Gateway (Domain→Routable rule)
    { fromBlock: 0, toBlock: 2, relationship: 'connects_to' },
    // Repo → Streaming API (Repo→Service pipeline rule)
    { fromBlock: 12, toBlock: 3, relationship: 'connects_to' },
    // Streaming API → Env (Service→EnvConfig config rule)
    { fromBlock: 3, toBlock: 13, relationship: 'depends_on' },
  ],
};

export const mediaPodcastTemplate: ComposedTemplate = {
  id: 'media-podcast',
  name: 'Podcast Platform',
  description: 'Audio hosting platform with RSS feeds, episode search, and VPC network isolation.',
  icon: 'Mic',
  estimatedCost: '$50-120/mo',
  category: 'media',
  provider: 'gcp',
  providers: ['gcp', 'aws', 'azure'],
  tags: ['podcast', 'audio', 'RSS', 'content', 'VPC', 'Subnet'],
  securityLevel: 'basic',
  difficulty: 'starter',
  trust: 'official',
  author: { name: 'ICE Team' },
  environmentPresets: [{ type: 'production', name: 'Production', region: 'us-central1', securityLevel: 'basic' }],

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
      height: 312,
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
      height: 236,
      blockIndices: [4, 5, 6],
      color: '#6366f1',
      parentGroupIndex: 1,
    },
    // [4] Monitoring — outside VPC (managed service)
    {
      subtype: 'Monitoring',
      label: 'Monitoring',
      position: { x: 30, y: 638 },
      width: 280,
      height: 236,
      blockIndices: [7],
      color: '#f59e0b',
    },
  ],

  blocks: [
    // ── Public Zone (outside VPC) ─────────────────────────────────────────
    // 0: Internet
    { iceType: 'Network.PublicEndpoint', label: 'Public Traffic', position: { x: 50, y: 86 }, data: { domain: 'podcast.acme.io', enableHttps: true, autoProvisionCert: true, redirectHttpToHttps: true } },
    // 1: WAF
    { iceType: 'Security.WAF', label: 'WAF', position: { x: 306, y: 86 }, data: {} },
    // 2: Podcast App (SSR)
    {
      iceType: 'Compute.SSRSite',
      label: 'Podcast App',
      position: { x: 562, y: 86 },
      data: { framework: 'nextjs', domain: 'podcast.acme.io' },
    },

    // ── Public Subnet (inside VPC) ────────────────────────────────────────
    // 3: Gateway
    { iceType: 'Network.Gateway', label: 'API Gateway', position: { x: 70, y: 408 }, data: { protocol: 'http' } },

    // ── Private Subnet (inside VPC) ───────────────────────────────────────
    // 4: Podcast API
    {
      iceType: 'Compute.Container',
      label: 'Podcast API',
      position: { x: 380, y: 408 },
      data: { size: '1-2048', runtime: 'nodejs20', port: 8080 },
    },
    // 5: Episode DB
    {
      iceType: 'Database.PostgreSQL',
      label: 'Episode DB',
      position: { x: 636, y: 408 },
      data: { size: 'db.t3.small', storage: '50', version: '17' },
    },
    // 6: Audio Storage
    {
      iceType: 'Storage.Bucket',
      label: 'Audio Storage',
      position: { x: 892, y: 408 },
      data: { storage_class: 'standard' },
    },

    // ── Monitoring (outside VPC) ──────────────────────────────────────────
    // 7: Logs
    { iceType: 'Monitoring.Log', label: 'Podcast Logs', position: { x: 50, y: 694 }, data: { keep_logs: '30 days' } },

    // ── Ungrouped (control plane) ─────────────────────────────────────────
    // 8: Secrets
    { iceType: 'Security.Secret', label: 'App Secrets', position: { x: 50, y: 904 }, data: {} },
    // 9: Search
    { iceType: 'Analytics.Search', label: 'Episode Search', position: { x: 306, y: 904 }, data: {} },
    // 11: Repo
    {
      iceType: 'Source.Repository',
      label: 'GitHub Repo',
      position: { x: 306, y: 1080 },
      data: { repository: '', branch: 'main' },
    },
    // 12: Env
    { iceType: 'Config.Environment', label: 'Env Variables', position: { x: 562, y: 1080 }, data: {} },],

  connections: [
    // Internet → WAF → Gateway (Internet→WAF, WAF→Gateway rules)
    { fromBlock: 0, toBlock: 1, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    { fromBlock: 1, toBlock: 3, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    // Internet → Podcast App (Internet→Frontend rule)
    { fromBlock: 0, toBlock: 2, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    // Gateway → Podcast API (Gateway→Backend rule)
    { fromBlock: 3, toBlock: 4, relationship: 'connects_to', protocol: 'HTTP', port: 8080 },
    // Podcast API → Data (Backend→Database, Backend→Storage rules)
    { fromBlock: 4, toBlock: 5, relationship: 'depends_on', protocol: 'TCP', port: 5432 },
    { fromBlock: 4, toBlock: 6, relationship: 'depends_on' },
    // Podcast API → Search (Backend→Search rule)
    { fromBlock: 4, toBlock: 9, relationship: 'depends_on' },
    // Podcast API → Secrets (Service→Secrets config rule)
    { fromBlock: 4, toBlock: 8, relationship: 'depends_on' },
    // Podcast API → Logs (Service→Monitoring rule)
    { fromBlock: 4, toBlock: 7, relationship: 'connects_to' },
    // Domain → Podcast App (Domain→Routable rule)
    // Repo → Podcast API (Repo→Service pipeline rule)
    { fromBlock: 10, toBlock: 4, relationship: 'connects_to' },
    // Podcast API → Env (Service→EnvConfig config rule)
    { fromBlock: 4, toBlock: 11, relationship: 'depends_on' },
  ],
};
