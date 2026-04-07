/**
 * Logistics Templates
 *
 * Fleet tracking, warehouse management, and
 * supply chain infrastructure.
 *
 * ============================================================================
 * Fleet Tracking (~$150-350/mo)
 * ============================================================================
 *
 * Architecture (deployable to AWS / GCP / Azure):
 *
 *   ┌── Public Zone ────────────────────────────────┐
 *   │  Internet ──► WAF                              │
 *   └────────────────────────────────────────────────┘
 *   ┌── VPC ──────────────────────────────────────────────────────────────┐
 *   │  ┌─ Public Subnet ─┐  ┌── Private Subnet ──────────────────────┐  │
 *   │  │  Gateway         │  │  Tracking API   Fleet DB   Location $  │  │
 *   │  │                  │  │  GPS Queue      Route Worker            │  │
 *   │  └──────────────────┘  └────────────────────────────────────────┘  │
 *   └─────────────────────────────────────────────────────────────────────┘
 *   ┌── Monitoring ──┐
 *   │  Fleet Logs    │
 *   └────────────────┘
 *   Secrets   Domain   Repo   Env   (ungrouped control plane)
 *
 * Layout grid (CARD 240x160, PAD 20, HEADER 36, GAP 16):
 *   Row 0: Public Zone           (2c,1r -> 536x236)    at (30,30)
 *   Row 1: VPC                   (1142x488)             at (30,296)
 *          |- Public Subnet      (1c,1r -> 280x236)    at (50,352)  parent->VPC
 *          +- Private Subnet     (3c,2r -> 792x412)    at (360,352) parent->VPC
 *   Row 2: Monitoring            (1c,1r -> 280x236)    at (30,814)
 *   Row 3: Ungrouped             y=1080
 *
 * ============================================================================
 * Warehouse Management (~$100-250/mo)
 * ============================================================================
 *
 *   ┌── Public Zone ────────────────────────────────┐
 *   │  Internet ──► WAF                              │
 *   └────────────────────────────────────────────────┘
 *   ┌── VPC ──────────────────────────────────────────────────────────────┐
 *   │  ┌─ Public Subnet ─┐  ┌── Private Subnet ──────────────────────┐  │
 *   │  │  Gateway         │  │  Warehouse API  Inventory DB  Barcode $│  │
 *   │  │                  │  │  Order Queue    Fulfill Worker  Docs   │  │
 *   │  └──────────────────┘  └────────────────────────────────────────┘  │
 *   └─────────────────────────────────────────────────────────────────────┘
 *   ┌── Monitoring ──────┐
 *   │  Warehouse Logs    │
 *   └────────────────────┘
 *   Secrets   Domain   Repo   Env   (ungrouped control plane)
 *
 * Layout grid (CARD 240x160, PAD 20, HEADER 36, GAP 16):
 *   Row 0: Public Zone           (2c,1r -> 536x236)    at (30,30)
 *   Row 1: VPC                   (1142x488)             at (30,296)
 *          |- Public Subnet      (1c,1r -> 280x236)    at (50,352)  parent->VPC
 *          +- Private Subnet     (3c,2r -> 792x412)    at (360,352) parent->VPC
 *   Row 2: Monitoring            (1c,1r -> 280x236)    at (30,814)
 *   Row 3: Ungrouped             y=1080
 */

import type { ComposedTemplate } from './types';

// =============================================================================
// Fleet Tracking
// =============================================================================

export const logisticsFleetTrackingTemplate: ComposedTemplate = {
  id: 'logistics-fleet-tracking',
  name: 'Fleet Tracking',
  description: 'GPS-based fleet management with real-time dashboards, route optimization, and VPC network isolation.',
  icon: 'Truck',
  estimatedCost: '$150-350/mo',
  category: 'logistics',
  provider: 'gcp',
  providers: ['gcp', 'aws', 'azure'],
  tags: ['fleet', 'GPS', 'tracking', 'routing', 'VPC', 'Subnet'],
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
    { iceType: 'Network.Internet', label: 'Public Traffic', position: { x: 50, y: 86 }, data: {} },
    // 1: WAF
    { iceType: 'Security.WAF', label: 'WAF', position: { x: 306, y: 86 }, data: {} },

    // ── Public Subnet (inside VPC) ────────────────────────────────────────
    // 2: Gateway
    { iceType: 'Network.Gateway', label: 'API Gateway', position: { x: 70, y: 408 }, data: { protocol: 'http' } },

    // ── Private Subnet (inside VPC) ───────────────────────────────────────
    // Row 0
    // 3: Tracking API
    {
      iceType: 'Compute.Container',
      label: 'Tracking API',
      position: { x: 380, y: 408 },
      data: { size: '2-4096', runtime: 'nodejs20', port: 8080 },
    },
    // 4: Fleet DB
    {
      iceType: 'Database.PostgreSQL',
      label: 'Fleet DB',
      position: { x: 636, y: 408 },
      data: { size: 'db.t3.medium', storage: '200', version: '17' },
    },
    // 5: Location Cache
    {
      iceType: 'Database.Redis',
      label: 'Location Cache',
      position: { x: 892, y: 408 },
      data: { size: 'cache.t3.medium', port: 6379 },
    },
    // Row 1
    // 6: GPS Queue
    {
      iceType: 'Messaging.CloudPubSub',
      label: 'GPS Queue',
      position: { x: 380, y: 584 },
      data: { keep_messages: '7 days' },
    },
    // 7: Route Worker
    {
      iceType: 'Compute.Worker',
      label: 'Route Worker',
      position: { x: 636, y: 584 },
      data: { size: '1-2048', runtime: 'nodejs20' },
    },

    // ── Monitoring (outside VPC) ──────────────────────────────────────────
    // 8: Fleet Logs
    { iceType: 'Monitoring.Log', label: 'Fleet Logs', position: { x: 50, y: 870 }, data: { keep_logs: '30 days' } },

    // ── Ungrouped (control plane) ─────────────────────────────────────────
    // 9: Secrets
    { iceType: 'Security.Secret', label: 'Secrets', position: { x: 50, y: 1080 }, data: {} },
    // 10: Domain
    {
      iceType: 'Network.Domain',
      label: 'Domain',
      position: { x: 306, y: 1080 },
      data: { hostname: 'fleet.logistics.io' },
    },
    // 11: Repo
    {
      iceType: 'Source.Repository',
      label: 'GitHub Repo',
      position: { x: 562, y: 1080 },
      data: { repository: '', branch: 'main' },
    },
    // 12: Env
    { iceType: 'Config.Environment', label: 'Env Variables', position: { x: 818, y: 1080 }, data: {} },
  ],

  connections: [
    // Internet → WAF (Internet→WAF rule)
    { fromBlock: 0, toBlock: 1, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    // WAF → Gateway (WAF→Gateway rule)
    { fromBlock: 1, toBlock: 2, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    // Gateway → Tracking API (Gateway→Backend rule)
    { fromBlock: 2, toBlock: 3, relationship: 'connects_to', protocol: 'HTTP', port: 8080 },
    // Tracking API → Fleet DB (Backend→Database rule)
    { fromBlock: 3, toBlock: 4, relationship: 'depends_on', protocol: 'TCP', port: 5432 },
    // Tracking API → Location Cache (Backend→Cache rule)
    { fromBlock: 3, toBlock: 5, relationship: 'depends_on', protocol: 'TCP', port: 6379 },
    // Tracking API → GPS Queue (Backend→Queue rule)
    { fromBlock: 3, toBlock: 6, relationship: 'connects_to' },
    // GPS Queue → Route Worker (Queue→Backend rule)
    { fromBlock: 6, toBlock: 7, relationship: 'connects_to' },
    // Route Worker → Fleet DB (Worker→Database rule)
    { fromBlock: 7, toBlock: 4, relationship: 'depends_on', protocol: 'TCP', port: 5432 },
    // Tracking API → Secrets (Service→Secrets rule)
    { fromBlock: 3, toBlock: 9, relationship: 'depends_on' },
    // Tracking API → Fleet Logs (Service→Monitoring rule)
    { fromBlock: 3, toBlock: 8, relationship: 'connects_to' },
    // Route Worker → Fleet Logs (Service→Monitoring rule)
    { fromBlock: 7, toBlock: 8, relationship: 'connects_to' },
    // Domain → Gateway (Domain→Routable rule)
    { fromBlock: 10, toBlock: 2, relationship: 'connects_to' },
    // Repo → Tracking API (Repo→Service pipeline rule)
    { fromBlock: 11, toBlock: 3, relationship: 'connects_to' },
    // Tracking API → Env (Service→EnvConfig config rule)
    { fromBlock: 3, toBlock: 12, relationship: 'depends_on' },
  ],
};

// =============================================================================
// Warehouse Management
// =============================================================================

export const logisticsWarehouseTemplate: ComposedTemplate = {
  id: 'logistics-warehouse',
  name: 'Warehouse Management',
  description: 'Inventory tracking with barcode scanning, order queues, fulfillment, and VPC network isolation.',
  icon: 'Warehouse',
  estimatedCost: '$100-250/mo',
  category: 'logistics',
  provider: 'gcp',
  providers: ['gcp', 'aws', 'azure'],
  tags: ['warehouse', 'inventory', 'WMS', 'fulfillment', 'VPC', 'Subnet'],
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
    // 2: Gateway
    { iceType: 'Network.Gateway', label: 'API Gateway', position: { x: 70, y: 408 }, data: { protocol: 'http' } },

    // ── Private Subnet (inside VPC) ───────────────────────────────────────
    // Row 0
    // 3: Warehouse API
    {
      iceType: 'Compute.Container',
      label: 'Warehouse API',
      position: { x: 380, y: 408 },
      data: { size: '1-2048', runtime: 'nodejs20', port: 8080 },
    },
    // 4: Inventory DB
    {
      iceType: 'Database.PostgreSQL',
      label: 'Inventory DB',
      position: { x: 636, y: 408 },
      data: { size: 'db.t3.small', storage: '100', version: '17' },
    },
    // 5: Barcode Cache
    {
      iceType: 'Database.Redis',
      label: 'Barcode Cache',
      position: { x: 892, y: 408 },
      data: { size: 'cache.t3.small', port: 6379 },
    },
    // Row 1
    // 6: Order Queue
    {
      iceType: 'Messaging.SQS',
      label: 'Order Queue',
      position: { x: 380, y: 584 },
      data: { queue_type: 'standard' },
    },
    // 7: Fulfillment Worker
    {
      iceType: 'Compute.Worker',
      label: 'Fulfillment Worker',
      position: { x: 636, y: 584 },
      data: { size: '1-2048', runtime: 'nodejs20' },
    },
    // 8: Document Storage
    {
      iceType: 'Storage.Bucket',
      label: 'Document Storage',
      position: { x: 892, y: 584 },
      data: { storage_class: 'standard' },
    },

    // ── Monitoring (outside VPC) ──────────────────────────────────────────
    // 9: Warehouse Logs
    { iceType: 'Monitoring.Log', label: 'Warehouse Logs', position: { x: 50, y: 870 }, data: { keep_logs: '30 days' } },

    // ── Ungrouped (control plane) ─────────────────────────────────────────
    // 10: Secrets
    { iceType: 'Security.Secret', label: 'Secrets', position: { x: 50, y: 1080 }, data: {} },
    // 11: Domain
    {
      iceType: 'Network.Domain',
      label: 'Domain',
      position: { x: 306, y: 1080 },
      data: { hostname: 'wms.logistics.io' },
    },
    // 12: Repo
    {
      iceType: 'Source.Repository',
      label: 'GitHub Repo',
      position: { x: 562, y: 1080 },
      data: { repository: '', branch: 'main' },
    },
    // 13: Env
    { iceType: 'Config.Environment', label: 'Env Variables', position: { x: 818, y: 1080 }, data: {} },
  ],

  connections: [
    // Internet → WAF (Internet→WAF rule)
    { fromBlock: 0, toBlock: 1, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    // WAF → Gateway (WAF→Gateway rule)
    { fromBlock: 1, toBlock: 2, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    // Gateway → Warehouse API (Gateway→Backend rule)
    { fromBlock: 2, toBlock: 3, relationship: 'connects_to', protocol: 'HTTP', port: 8080 },
    // Warehouse API → Inventory DB (Backend→Database rule)
    { fromBlock: 3, toBlock: 4, relationship: 'depends_on', protocol: 'TCP', port: 5432 },
    // Warehouse API → Barcode Cache (Backend→Cache rule)
    { fromBlock: 3, toBlock: 5, relationship: 'depends_on', protocol: 'TCP', port: 6379 },
    // Warehouse API → Order Queue (Backend→Queue rule)
    { fromBlock: 3, toBlock: 6, relationship: 'connects_to' },
    // Order Queue → Fulfillment Worker (Queue→Backend rule)
    { fromBlock: 6, toBlock: 7, relationship: 'connects_to' },
    // Fulfillment Worker → Inventory DB (Worker→Database rule)
    { fromBlock: 7, toBlock: 4, relationship: 'depends_on', protocol: 'TCP', port: 5432 },
    // Fulfillment Worker → Document Storage (Backend→Storage rule)
    { fromBlock: 7, toBlock: 8, relationship: 'depends_on' },
    // Warehouse API → Secrets (Service→Secrets rule)
    { fromBlock: 3, toBlock: 10, relationship: 'depends_on' },
    // Warehouse API → Warehouse Logs (Service→Monitoring rule)
    { fromBlock: 3, toBlock: 9, relationship: 'connects_to' },
    // Fulfillment Worker → Warehouse Logs (Service→Monitoring rule)
    { fromBlock: 7, toBlock: 9, relationship: 'connects_to' },
    // Domain → Gateway (Domain→Routable rule)
    { fromBlock: 11, toBlock: 2, relationship: 'connects_to' },
    // Repo → Warehouse API (Repo→Service pipeline rule)
    { fromBlock: 12, toBlock: 3, relationship: 'connects_to' },
    // Warehouse API → Env (Service→EnvConfig config rule)
    { fromBlock: 3, toBlock: 13, relationship: 'depends_on' },
  ],
};
