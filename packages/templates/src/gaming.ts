/**
 * Gaming Templates
 *
 * Multiplayer game servers, leaderboards,
 * and mobile game backend infrastructure.
 *
 * ============================================================================
 * Multiplayer Game Server (~$200-500/mo)
 * ============================================================================
 *
 * Architecture (deployable to AWS / GCP / Azure):
 *
 *   ┌── Public Zone ────────────────────────────────┐
 *   │  Internet ──► WAF                              │
 *   └────────────────────────────────────────────────┘
 *   ┌── VPC ──────────────────────────────────────────────────────────────┐
 *   │  ┌─ Public Subnet ─┐  ┌── Private Subnet ──────────────────────┐  │
 *   │  │  Game Gateway    │  │  Game Server   Match DB   Session Cache │  │
 *   │  │                  │  │  Event Queue   Leaderboard Wkr          │  │
 *   │  └──────────────────┘  └────────────────────────────────────────┘  │
 *   └─────────────────────────────────────────────────────────────────────┘
 *   ┌─ Monitoring ─┐
 *   │  Game Logs   │
 *   └──────────────┘
 *   Player Auth   Secrets   Domain   (ungrouped control plane)
 *   Repo   Env
 *
 * Layout grid (CARD 240x160, PAD 20, HEADER 36, GAP 16):
 *   Row 0: Public Zone           (2c,1r -> 536x236)    at (30,30)
 *   Row 1: VPC                   (1142x488)             at (30,296)
 *          |- Public Subnet      (1c,1r -> 280x236)    at (50,352)  parent->VPC
 *          +- Private Subnet     (3c,2r -> 792x412)    at (360,352) parent->VPC
 *   Row 2: Monitoring            (1c,1r -> 280x236)    at (30,814)
 *   Row 3: Ungrouped             y=1080, y=1256
 *
 * ============================================================================
 * Mobile Game Backend (~$80-200/mo)
 * ============================================================================
 *
 *   ┌── Public Zone ────────────────────────────────┐
 *   │  Internet ──► WAF                              │
 *   └────────────────────────────────────────────────┘
 *   ┌── VPC ────────────────────────────────────────────────────┐
 *   │  ┌─ Public Subnet ─┐  ┌── Private Subnet ────────────┐  │
 *   │  │  Gateway         │  │  Game API      Player DB      │  │
 *   │  │                  │  │  LB Cache      Asset Storage  │  │
 *   │  └──────────────────┘  └──────────────────────────────┘  │
 *   └───────────────────────────────────────────────────────────┘
 *   ┌─ Monitoring ─┐
 *   │  Game Logs   │
 *   └──────────────┘
 *   Auth   Secrets   Push Queue   (ungrouped control plane)
 *   Domain   Repo   Env
 *
 * Layout grid (CARD 240x160, PAD 20, HEADER 36, GAP 16):
 *   Row 0: Public Zone           (2c,1r -> 536x236)    at (30,30)
 *   Row 1: VPC                   (886x488)              at (30,296)
 *          |- Public Subnet      (1c,1r -> 280x236)    at (50,352)  parent->VPC
 *          +- Private Subnet     (2c,2r -> 536x412)    at (360,352) parent->VPC
 *   Row 2: Monitoring            (1c,1r -> 280x236)    at (30,814)
 *   Row 3: Ungrouped             y=1080, y=1256
 */

import type { ComposedTemplate } from './types';

// =============================================================================
// Multiplayer Game Server
// =============================================================================

export const gamingMultiplayerTemplate: ComposedTemplate = {
  id: 'gaming-multiplayer',
  name: 'Multiplayer Game Server',
  description:
    'Real-time game server with matchmaking, leaderboards, session management, WAF, and VPC network isolation.',
  icon: 'Gamepad2',
  estimatedCost: '$200-500/mo',
  category: 'gaming',
  provider: 'gcp',
  providers: ['gcp', 'aws', 'azure'],
  tags: ['multiplayer', 'game-server', 'real-time', 'leaderboard', 'VPC', 'Subnet'],
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
      blockIndices: [3, 4, 5, 6, 7],
      color: '#6366f1',
      parentGroupIndex: 1,
    },
    // [4] Monitoring — outside VPC
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
    { iceType: 'Network.PublicEndpoint', label: 'Public Traffic', position: { x: 50, y: 86 }, data: { domain: 'play.game.io', enableHttps: true, autoProvisionCert: true, redirectHttpToHttps: true } },
    // 1: WAF
    { iceType: 'Security.WAF', label: 'WAF', position: { x: 306, y: 86 }, data: {} },

    // ── Public Subnet (inside VPC) ────────────────────────────────────────
    // 2: Game Gateway
    { iceType: 'Network.Gateway', label: 'Game Gateway', position: { x: 70, y: 408 }, data: { protocol: 'http' } },

    // ── Private Subnet (inside VPC) ───────────────────────────────────────
    // Row 0
    // 3: Game Server
    {
      iceType: 'Compute.Container',
      label: 'Game Server',
      position: { x: 380, y: 408 },
      data: { size: '2-4096', runtime: 'nodejs20', port: 8080 },
    },
    // 4: Match DB
    {
      iceType: 'Database.PostgreSQL',
      label: 'Match DB',
      position: { x: 636, y: 408 },
      data: { size: 'db.t3.medium', storage: '50', version: '17' },
    },
    // 5: Session Cache
    {
      iceType: 'Database.Redis',
      label: 'Session Cache',
      position: { x: 892, y: 408 },
      data: { size: 'cache.t3.medium', port: 6379 },
    },
    // Row 1
    // 6: Event Queue
    {
      iceType: 'Messaging.SQS',
      label: 'Event Queue',
      position: { x: 380, y: 584 },
      data: { queue_type: 'standard' },
    },
    // 7: Leaderboard Worker
    {
      iceType: 'Compute.Worker',
      label: 'Leaderboard Worker',
      position: { x: 636, y: 584 },
      data: { size: '1-2048', runtime: 'nodejs20' },
    },

    // ── Monitoring (outside VPC) ──────────────────────────────────────────
    // 8: Game Logs
    { iceType: 'Monitoring.Log', label: 'Game Logs', position: { x: 50, y: 870 }, data: { keep_logs: '30 days' } },

    // ── Ungrouped (control plane) ─────────────────────────────────────────
    // 9: Player Auth
    { iceType: 'Security.Identity', label: 'Player Auth', position: { x: 50, y: 1080 }, data: {} },
    // 10: Secrets
    { iceType: 'Security.Secret', label: 'Secrets', position: { x: 306, y: 1080 }, data: {} },
    // 12: Repo
    {
      iceType: 'Source.Repository',
      label: 'GitHub Repo',
      position: { x: 50, y: 1256 },
      data: { repository: '', branch: 'main' },
    },
    // 13: Env
    { iceType: 'Config.Environment', label: 'Env Variables', position: { x: 306, y: 1256 }, data: {} },],

  connections: [
    // Internet → WAF → Gateway
    { fromBlock: 0, toBlock: 1, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    { fromBlock: 1, toBlock: 2, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    // Gateway → Game Server (Gateway→Backend rule)
    { fromBlock: 2, toBlock: 3, relationship: 'connects_to', protocol: 'HTTP', port: 8080 },
    // Game Server → data stores (Backend→Database, Backend→Cache rules)
    { fromBlock: 3, toBlock: 4, relationship: 'depends_on', protocol: 'TCP', port: 5432 },
    { fromBlock: 3, toBlock: 5, relationship: 'depends_on', protocol: 'TCP', port: 6379 },
    // Game Server → Event Queue (Backend→Queue publish rule)
    { fromBlock: 3, toBlock: 6, relationship: 'connects_to' },
    // Event Queue → Leaderboard Worker (Queue→Backend subscribe rule)
    { fromBlock: 6, toBlock: 7, relationship: 'connects_to' },
    // Leaderboard Worker → Match DB (Worker→Database rule)
    { fromBlock: 7, toBlock: 4, relationship: 'depends_on', protocol: 'TCP', port: 5432 },
    // Game Server → Player Auth (Backend→Auth rule)
    { fromBlock: 3, toBlock: 9, relationship: 'connects_to' },
    // Game Server → Secrets (Service→Secrets config rule)
    { fromBlock: 3, toBlock: 10, relationship: 'depends_on' },
    // Game Server → Game Logs (Service→Monitoring rule)
    { fromBlock: 3, toBlock: 8, relationship: 'connects_to' },
    // Domain → Game Gateway (Domain→Routable rule)
    { fromBlock: 0, toBlock: 2, relationship: 'connects_to' },
    // Repo → Game Server (Repo→Service pipeline rule)
    { fromBlock: 11, toBlock: 3, relationship: 'connects_to' },
    // Game Server → Env (Service→EnvConfig config rule)
    { fromBlock: 3, toBlock: 12, relationship: 'depends_on' },
  ],
};

// =============================================================================
// Mobile Game Backend
// =============================================================================

export const gamingMobileGameTemplate: ComposedTemplate = {
  id: 'gaming-mobile-backend',
  name: 'Mobile Game Backend',
  description: 'Mobile game backend with player profiles, leaderboards, push notifications, and VPC network isolation.',
  icon: 'Smartphone',
  estimatedCost: '$80-200/mo',
  category: 'gaming',
  provider: 'gcp',
  providers: ['gcp', 'aws', 'azure'],
  tags: ['mobile-game', 'leaderboard', 'IAP', 'push-notifications', 'VPC', 'Subnet'],
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
    // [3] Private Subnet — inside VPC
    {
      subtype: 'Custom',
      iceType: 'Network.Subnet',
      label: 'Private Subnet',
      position: { x: 360, y: 352 },
      width: 536,
      height: 412,
      blockIndices: [3, 4, 5, 6],
      color: '#6366f1',
      parentGroupIndex: 1,
    },
    // [4] Monitoring — outside VPC
    {
      subtype: 'Monitoring',
      label: 'Monitoring',
      position: { x: 30, y: 814 },
      width: 280,
      height: 236,
      blockIndices: [7],
      color: '#f59e0b',
    },
  ],

  blocks: [
    // ── Public Zone (outside VPC) ─────────────────────────────────────────
    // 0: Internet
    { iceType: 'Network.PublicEndpoint', label: 'Public Traffic', position: { x: 50, y: 86 }, data: { domain: 'mobile.game.io', enableHttps: true, autoProvisionCert: true, redirectHttpToHttps: true } },
    // 1: WAF
    { iceType: 'Security.WAF', label: 'WAF', position: { x: 306, y: 86 }, data: {} },

    // ── Public Subnet (inside VPC) ────────────────────────────────────────
    // 2: Gateway
    { iceType: 'Network.Gateway', label: 'API Gateway', position: { x: 70, y: 408 }, data: { protocol: 'http' } },

    // ── Private Subnet (inside VPC) ───────────────────────────────────────
    // Row 0
    // 3: Game API
    {
      iceType: 'Compute.Container',
      label: 'Game API',
      position: { x: 380, y: 408 },
      data: { size: '1-2048', runtime: 'nodejs20', port: 8080 },
    },
    // 4: Player DB
    {
      iceType: 'Database.PostgreSQL',
      label: 'Player DB',
      position: { x: 636, y: 408 },
      data: { size: 'db.t3.small', storage: '50', version: '17' },
    },
    // Row 1
    // 5: Leaderboard Cache
    {
      iceType: 'Database.Redis',
      label: 'Leaderboard Cache',
      position: { x: 380, y: 584 },
      data: { size: 'cache.t3.small', port: 6379 },
    },
    // 6: Asset Storage
    {
      iceType: 'Storage.Bucket',
      label: 'Asset Storage',
      position: { x: 636, y: 584 },
      data: { storage_class: 'standard' },
    },

    // ── Monitoring (outside VPC) ──────────────────────────────────────────
    // 7: Game Logs
    { iceType: 'Monitoring.Log', label: 'Game Logs', position: { x: 50, y: 870 }, data: { keep_logs: '30 days' } },

    // ── Ungrouped (control plane) ─────────────────────────────────────────
    // 8: Auth
    { iceType: 'Security.Identity', label: 'Auth', position: { x: 50, y: 1080 }, data: {} },
    // 9: Secrets
    { iceType: 'Security.Secret', label: 'Secrets', position: { x: 306, y: 1080 }, data: {} },
    // 10: Push Queue
    { iceType: 'Messaging.SQS', label: 'Push Queue', position: { x: 562, y: 1080 }, data: { queue_type: 'standard' } },
    // 12: Repo
    {
      iceType: 'Source.Repository',
      label: 'GitHub Repo',
      position: { x: 306, y: 1256 },
      data: { repository: '', branch: 'main' },
    },
    // 13: Env
    { iceType: 'Config.Environment', label: 'Env Variables', position: { x: 562, y: 1256 }, data: {} },],

  connections: [
    // Internet → WAF → Gateway
    { fromBlock: 0, toBlock: 1, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    { fromBlock: 1, toBlock: 2, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    // Gateway → Game API (Gateway→Backend rule)
    { fromBlock: 2, toBlock: 3, relationship: 'connects_to', protocol: 'HTTP', port: 8080 },
    // Game API → data stores (Backend→Database, Backend→Cache, Backend→Storage rules)
    { fromBlock: 3, toBlock: 4, relationship: 'depends_on', protocol: 'TCP', port: 5432 },
    { fromBlock: 3, toBlock: 5, relationship: 'depends_on', protocol: 'TCP', port: 6379 },
    { fromBlock: 3, toBlock: 6, relationship: 'depends_on' },
    // Game API → Push Queue (Backend→Queue publish rule)
    { fromBlock: 3, toBlock: 10, relationship: 'connects_to' },
    // Game API → Auth (Backend→Auth rule)
    { fromBlock: 3, toBlock: 8, relationship: 'connects_to' },
    // Game API → Secrets (Service→Secrets config rule)
    { fromBlock: 3, toBlock: 9, relationship: 'depends_on' },
    // Game API → Game Logs (Service→Monitoring rule)
    { fromBlock: 3, toBlock: 7, relationship: 'connects_to' },
    // Domain → Gateway (Domain→Routable rule)
    { fromBlock: 0, toBlock: 2, relationship: 'connects_to' },
    // Repo → Game API (Repo→Service pipeline rule)
    { fromBlock: 11, toBlock: 3, relationship: 'connects_to' },
    // Game API → Env (Service→EnvConfig config rule)
    { fromBlock: 3, toBlock: 12, relationship: 'depends_on' },
  ],
};
