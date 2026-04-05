/**
 * IoT Templates
 *
 * Device management, telemetry ingestion,
 * and smart home automation platforms.
 *
 * ============================================================================
 * IoT Device Management (~$150-400/mo)
 * ============================================================================
 *
 * Architecture (deployable to AWS / GCP / Azure):
 *
 *   ┌── Public Zone ────────────────────────────────┐
 *   │  Internet ──► WAF                              │
 *   └────────────────────────────────────────────────┘
 *   ┌── VPC ──────────────────────────────────────────────────────────────┐
 *   │  ┌─ Public Subnet ─┐  ┌── Private Subnet ──────────────────────┐  │
 *   │  │  Device Gateway  │  │  Device API   Registry DB   Alert Cache │  │
 *   │  │                  │  │  Telemetry Q  Telemetry Wkr  TSDB       │  │
 *   │  └──────────────────┘  └────────────────────────────────────────┘  │
 *   └─────────────────────────────────────────────────────────────────────┘
 *   ┌─ Monitoring ─┐
 *   │  Device Logs │
 *   └──────────────┘
 *   Secrets   Domain   Repo   (ungrouped control plane)
 *   Env
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
 * Smart Home Platform (~$50-120/mo)
 * ============================================================================
 *
 *   ┌── Public Zone ────────────────────────────────┐
 *   │  Internet ──► WAF                              │
 *   └────────────────────────────────────────────────┘
 *   ┌── VPC ────────────────────────────────────────────────────┐
 *   │  ┌─ Public Subnet ─┐  ┌── Private Subnet ────────────┐  │
 *   │  │  Gateway         │  │  Home API      Device DB      │  │
 *   │  │                  │  │  State Cache   Command Queue  │  │
 *   │  └──────────────────┘  └──────────────────────────────┘  │
 *   └───────────────────────────────────────────────────────────┘
 *   ┌─ Monitoring ─┐
 *   │  Home Logs   │
 *   └──────────────┘
 *   Auth   Secrets   Domain   (ungrouped control plane)
 *   Repo   Env
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
// IoT Device Management
// =============================================================================

export const iotDeviceManagementTemplate: ComposedTemplate = {
  id: 'iot-device-management',
  name: 'IoT Device Management',
  description:
    'Fleet-scale device registry with telemetry ingestion, dashboards, WAF, and VPC network isolation.',
  icon: 'Cpu',
  estimatedCost: '$150-400/mo',
  category: 'iot',
  provider: 'gcp',
  providers: ['gcp', 'aws', 'azure'],
  tags: ['IoT', 'devices', 'telemetry', 'sensors', 'VPC', 'Subnet'],
  securityLevel: 'standard',
  difficulty: 'intermediate',
  trust: 'official',
  author: { name: 'ICE Team' },
  environmentPresets: [
    { type: 'production', name: 'Production', region: 'us-central1', securityLevel: 'standard' },
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
    // [4] Monitoring — outside VPC
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
    // 2: Device Gateway
    { iceType: 'Network.Gateway', label: 'Device Gateway', position: { x: 70, y: 408 }, data: { protocol: 'http' } },

    // ── Private Subnet (inside VPC) ───────────────────────────────────────
    // Row 0
    // 3: Device API
    {
      iceType: 'Compute.Container',
      label: 'Device API',
      position: { x: 380, y: 408 },
      data: { size: '2-4096', runtime: 'nodejs20', port: 8080 },
    },
    // 4: Device Registry DB
    {
      iceType: 'Database.PostgreSQL',
      label: 'Device Registry DB',
      position: { x: 636, y: 408 },
      data: { size: 'db.t3.medium', storage: '100', version: '17' },
    },
    // 5: Alert Cache
    {
      iceType: 'Database.Redis',
      label: 'Alert Cache',
      position: { x: 892, y: 408 },
      data: { size: 'cache.t3.medium', port: 6379 },
    },
    // Row 1
    // 6: Telemetry Queue
    {
      iceType: 'Messaging.CloudPubSub',
      label: 'Telemetry Queue',
      position: { x: 380, y: 584 },
      data: { keep_messages: '7 days' },
    },
    // 7: Telemetry Worker
    {
      iceType: 'Compute.Worker',
      label: 'Telemetry Worker',
      position: { x: 636, y: 584 },
      data: { size: '1-2048', runtime: 'nodejs20' },
    },
    // 8: Time Series DB
    {
      iceType: 'Database.PostgreSQL',
      label: 'Time Series DB',
      position: { x: 892, y: 584 },
      data: { size: 'db.t3.medium', storage: '500', version: '17' },
    },

    // ── Monitoring (outside VPC) ──────────────────────────────────────────
    // 9: Device Logs
    { iceType: 'Monitoring.Log', label: 'Device Logs', position: { x: 50, y: 870 }, data: { keep_logs: '30 days' } },

    // ── Ungrouped (control plane) ─────────────────────────────────────────
    // 10: Secrets
    { iceType: 'Security.Secret', label: 'Secrets', position: { x: 50, y: 1080 }, data: {} },
    // 11: Domain
    { iceType: 'Network.Domain', label: 'Domain', position: { x: 306, y: 1080 }, data: { hostname: 'iot.devices.io' } },
    // 12: Repo
    { iceType: 'Source.Repository', label: 'GitHub Repo', position: { x: 562, y: 1080 }, data: { repository: '', branch: 'main' } },
    // 13: Env
    { iceType: 'Config.Environment', label: 'Env Variables', position: { x: 50, y: 1256 }, data: {} },
  ],

  connections: [
    // Internet → WAF → Gateway
    { fromBlock: 0, toBlock: 1, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    { fromBlock: 1, toBlock: 2, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    // Gateway → Device API (Gateway→Backend rule)
    { fromBlock: 2, toBlock: 3, relationship: 'connects_to', protocol: 'HTTP', port: 8080 },
    // Device API → data stores (Backend→Database, Backend→Cache rules)
    { fromBlock: 3, toBlock: 4, relationship: 'depends_on', protocol: 'TCP', port: 5432 },
    { fromBlock: 3, toBlock: 5, relationship: 'depends_on', protocol: 'TCP', port: 6379 },
    // Device API → Telemetry Queue (Backend→Queue publish rule)
    { fromBlock: 3, toBlock: 6, relationship: 'connects_to' },
    // Telemetry Queue → Telemetry Worker (Queue→Backend subscribe rule)
    { fromBlock: 6, toBlock: 7, relationship: 'connects_to' },
    // Telemetry Worker → Time Series DB (Worker→Database rule)
    { fromBlock: 7, toBlock: 8, relationship: 'depends_on', protocol: 'TCP', port: 5432 },
    // Device API → Secrets (Service→Secrets config rule)
    { fromBlock: 3, toBlock: 10, relationship: 'depends_on' },
    // Device API → Device Logs (Service→Monitoring rule)
    { fromBlock: 3, toBlock: 9, relationship: 'connects_to' },
    // Telemetry Worker → Device Logs (Service→Monitoring rule)
    { fromBlock: 7, toBlock: 9, relationship: 'connects_to' },
    // Domain → Device Gateway (Domain→Routable rule)
    { fromBlock: 11, toBlock: 2, relationship: 'connects_to' },
    // Repo → Device API (Repo→Service pipeline rule)
    { fromBlock: 12, toBlock: 3, relationship: 'connects_to' },
    // Device API → Env (Service→EnvConfig config rule)
    { fromBlock: 3, toBlock: 13, relationship: 'depends_on' },
  ],
};

// =============================================================================
// Smart Home Platform
// =============================================================================

export const iotSmartHomeTemplate: ComposedTemplate = {
  id: 'iot-smart-home',
  name: 'Smart Home Platform',
  description:
    'Home automation with device control, state caching, scheduled routines, and VPC network isolation.',
  icon: 'Home',
  estimatedCost: '$50-120/mo',
  category: 'iot',
  provider: 'gcp',
  providers: ['gcp', 'aws', 'azure'],
  tags: ['smart-home', 'automation', 'devices', 'VPC', 'Subnet'],
  securityLevel: 'standard',
  difficulty: 'starter',
  trust: 'official',
  author: { name: 'ICE Team' },
  environmentPresets: [
    { type: 'production', name: 'Production', region: 'us-central1', securityLevel: 'standard' },
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
    { iceType: 'Network.Internet', label: 'Public Traffic', position: { x: 50, y: 86 }, data: {} },
    // 1: WAF
    { iceType: 'Security.WAF', label: 'WAF', position: { x: 306, y: 86 }, data: {} },

    // ── Public Subnet (inside VPC) ────────────────────────────────────────
    // 2: Gateway
    { iceType: 'Network.Gateway', label: 'API Gateway', position: { x: 70, y: 408 }, data: { protocol: 'http' } },

    // ── Private Subnet (inside VPC) ───────────────────────────────────────
    // Row 0
    // 3: Home API
    {
      iceType: 'Compute.Container',
      label: 'Home API',
      position: { x: 380, y: 408 },
      data: { size: '1-2048', runtime: 'nodejs20', port: 8080 },
    },
    // 4: Device DB
    {
      iceType: 'Database.PostgreSQL',
      label: 'Device DB',
      position: { x: 636, y: 408 },
      data: { size: 'db.t3.small', storage: '20', version: '17' },
    },
    // Row 1
    // 5: State Cache
    {
      iceType: 'Database.Redis',
      label: 'State Cache',
      position: { x: 380, y: 584 },
      data: { size: 'cache.t3.small', port: 6379 },
    },
    // 6: Command Queue
    {
      iceType: 'Messaging.SQS',
      label: 'Command Queue',
      position: { x: 636, y: 584 },
      data: { queue_type: 'standard' },
    },

    // ── Monitoring (outside VPC) ──────────────────────────────────────────
    // 7: Home Logs
    { iceType: 'Monitoring.Log', label: 'Home Logs', position: { x: 50, y: 870 }, data: { keep_logs: '30 days' } },

    // ── Ungrouped (control plane) ─────────────────────────────────────────
    // 8: Auth
    { iceType: 'Security.Identity', label: 'Auth', position: { x: 50, y: 1080 }, data: {} },
    // 9: Secrets
    { iceType: 'Security.Secret', label: 'Secrets', position: { x: 306, y: 1080 }, data: {} },
    // 10: Domain
    { iceType: 'Network.Domain', label: 'Domain', position: { x: 562, y: 1080 }, data: { hostname: 'home.smart.io' } },
    // 11: Repo
    { iceType: 'Source.Repository', label: 'GitHub Repo', position: { x: 50, y: 1256 }, data: { repository: '', branch: 'main' } },
    // 12: Env
    { iceType: 'Config.Environment', label: 'Env Variables', position: { x: 306, y: 1256 }, data: {} },
  ],

  connections: [
    // Internet → WAF → Gateway
    { fromBlock: 0, toBlock: 1, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    { fromBlock: 1, toBlock: 2, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    // Gateway → Home API (Gateway→Backend rule)
    { fromBlock: 2, toBlock: 3, relationship: 'connects_to', protocol: 'HTTP', port: 8080 },
    // Home API → data stores (Backend→Database, Backend→Cache rules)
    { fromBlock: 3, toBlock: 4, relationship: 'depends_on', protocol: 'TCP', port: 5432 },
    { fromBlock: 3, toBlock: 5, relationship: 'depends_on', protocol: 'TCP', port: 6379 },
    // Home API → Command Queue (Backend→Queue rule)
    { fromBlock: 3, toBlock: 6, relationship: 'connects_to' },
    // Home API → Auth (Backend→Auth rule)
    { fromBlock: 3, toBlock: 8, relationship: 'connects_to' },
    // Home API → Secrets (Service→Secrets config rule)
    { fromBlock: 3, toBlock: 9, relationship: 'depends_on' },
    // Home API → Home Logs (Service→Monitoring rule)
    { fromBlock: 3, toBlock: 7, relationship: 'connects_to' },
    // Domain → Gateway (Domain→Routable rule)
    { fromBlock: 10, toBlock: 2, relationship: 'connects_to' },
    // Repo → Home API (Repo→Service pipeline rule)
    { fromBlock: 11, toBlock: 3, relationship: 'connects_to' },
    // Home API → Env (Service→EnvConfig config rule)
    { fromBlock: 3, toBlock: 12, relationship: 'depends_on' },
  ],
};
