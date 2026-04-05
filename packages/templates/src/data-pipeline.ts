/**
 * Data Pipeline Templates
 *
 * Batch ETL and real-time event streaming infrastructure.
 *
 * ============================================================================
 * ETL Pipeline (~$150-400/mo)
 * ============================================================================
 *
 * Architecture (deployable to AWS / GCP / Azure):
 *
 *   ┌── VPC ────────────────────────────────────────────────────────────┐
 *   │  ┌── Private Subnet ─────────────────────────────────────────┐   │
 *   │  │  Ingest Queue    Transform Worker   Staging DB             │   │
 *   │  │  Source Storage   Load Worker        Data Warehouse        │   │
 *   │  └───────────────────────────────────────────────────────────┘   │
 *   └───────────────────────────────────────────────────────────────────┘
 *   ┌── Monitoring ──┐
 *   │  Pipeline Logs  │
 *   └────────────────┘
 *   Secrets   Repo   Env   (ungrouped control plane)
 *
 * Layout grid (CARD 240x160, PAD 20, HEADER 36, GAP 16):
 *   Row 0: VPC               (832x488)            at (30,30)
 *          +- Private Subnet (3c,2r -> 792x412)   at (50,86)  parent->VPC
 *   Row 1: Monitoring        (1c,1r -> 280x236)   at (30,548)
 *   Row 2: Ungrouped         y=814
 *
 * ============================================================================
 * Event Streaming (~$200-500/mo)
 * ============================================================================
 *
 *   ┌── Public Zone ────────────────────────────────┐
 *   │  Internet ──► WAF                              │
 *   └────────────────────────────────────────────────┘
 *   ┌── VPC ──────────────────────────────────────────────────────────────┐
 *   │  ┌─ Public Subnet ─┐  ┌── Private Subnet ──────────────────────┐  │
 *   │  │  Gateway         │  │  Producer API   Event Stream   Proc    │  │
 *   │  │                  │  │  Analytics DB   Event Cache             │  │
 *   │  └──────────────────┘  └────────────────────────────────────────┘  │
 *   └─────────────────────────────────────────────────────────────────────┘
 *   ┌── Monitoring ──┐
 *   │  Stream Logs    │
 *   └────────────────┘
 *   Secrets   Domain   Repo   Env   (ungrouped control plane)
 *
 * Layout grid (CARD 240x160, PAD 20, HEADER 36, GAP 16):
 *   Row 0: Public Zone       (2c,1r -> 536x236)    at (30,30)
 *   Row 1: VPC               (1142x488)             at (30,296)
 *          |- Public Subnet  (1c,1r -> 280x236)    at (50,352)  parent->VPC
 *          +- Private Subnet (3c,2r -> 792x412)    at (360,352) parent->VPC
 *   Row 2: Monitoring        (1c,1r -> 280x236)    at (30,814)
 *   Row 3: Ungrouped         y=1080
 */

import type { ComposedTemplate } from './types';

// =============================================================================
// ETL Pipeline
// =============================================================================

export const etlPipelineTemplate: ComposedTemplate = {
  id: 'data-etl-pipeline',
  name: 'ETL Pipeline',
  description:
    'Batch ETL pipeline with staging, transformation workers, data warehouse, and VPC network isolation.',
  icon: 'Activity',
  estimatedCost: '$150-400/mo',
  category: 'data-pipeline',
  provider: 'gcp',
  providers: ['gcp', 'aws', 'azure'],
  tags: ['ETL', 'data-pipeline', 'warehouse', 'batch', 'VPC', 'Subnet'],
  securityLevel: 'standard',
  difficulty: 'intermediate',
  trust: 'official',
  author: { name: 'ICE Team' },
  environmentPresets: [
    { type: 'production', name: 'Production', region: 'us-central1', securityLevel: 'standard' },
  ],

  groups: [
    // [0] VPC — contains subnets, no direct blocks
    {
      subtype: 'Custom',
      iceType: 'Network.VPC',
      label: 'VPC',
      position: { x: 30, y: 30 },
      width: 832,
      height: 488,
      blockIndices: [],
      color: '#22c55e',
    },
    // [1] Private Subnet — inside VPC (no public subnet for internal pipeline)
    {
      subtype: 'Custom',
      iceType: 'Network.Subnet',
      label: 'Private Subnet',
      position: { x: 50, y: 86 },
      width: 792,
      height: 412,
      blockIndices: [0, 1, 2, 3, 4, 5],
      color: '#6366f1',
      parentGroupIndex: 0,
    },
    // [2] Monitoring — outside VPC
    {
      subtype: 'Monitoring',
      label: 'Monitoring',
      position: { x: 30, y: 548 },
      width: 280,
      height: 236,
      blockIndices: [6],
      color: '#f59e0b',
    },
  ],

  blocks: [
    // ── Private Subnet (inside VPC) ───────────────────────────────────────
    // Row 0
    // 0: Ingest Queue
    { iceType: 'Messaging.SQS', label: 'Ingest Queue', position: { x: 70, y: 142 }, data: { queue_type: 'standard' } },
    // 1: Transform Worker
    {
      iceType: 'Compute.Worker',
      label: 'Transform Worker',
      position: { x: 326, y: 142 },
      data: { size: '2-4096', runtime: 'python3.12' },
    },
    // 2: Staging DB
    {
      iceType: 'Database.PostgreSQL',
      label: 'Staging DB',
      position: { x: 582, y: 142 },
      data: { size: 'db.t3.medium', storage: '200', version: '17' },
    },
    // Row 1
    // 3: Source Storage
    { iceType: 'Storage.Bucket', label: 'Source Storage', position: { x: 70, y: 318 }, data: { storage_class: 'standard' } },
    // 4: Load Worker
    {
      iceType: 'Compute.Worker',
      label: 'Load Worker',
      position: { x: 326, y: 318 },
      data: { size: '2-4096', runtime: 'python3.12' },
    },
    // 5: Data Warehouse
    { iceType: 'Analytics.DataWarehouse', label: 'Data Warehouse', position: { x: 582, y: 318 }, data: {} },

    // ── Monitoring (outside VPC) ──────────────────────────────────────────
    // 6: Pipeline Logs
    { iceType: 'Monitoring.Log', label: 'Pipeline Logs', position: { x: 50, y: 604 }, data: { keep_logs: '30 days' } },

    // ── Ungrouped (control plane) ─────────────────────────────────────────
    // 7: Secrets
    { iceType: 'Security.Secret', label: 'Secrets', position: { x: 50, y: 814 }, data: {} },
    // 8: Repo
    { iceType: 'Source.Repository', label: 'GitHub Repo', position: { x: 306, y: 814 }, data: { repository: '', branch: 'main' } },
    // 9: Env
    { iceType: 'Config.Environment', label: 'Env Variables', position: { x: 562, y: 814 }, data: {} },
  ],

  connections: [
    // Queue → Transform Worker (Queue→Backend rule)
    { fromBlock: 0, toBlock: 1, relationship: 'connects_to' },
    // Transform Worker → Staging DB (Backend→Database rule)
    { fromBlock: 1, toBlock: 2, relationship: 'depends_on', protocol: 'TCP', port: 5432 },
    // Transform Worker → Source Storage (Backend→Storage rule)
    { fromBlock: 1, toBlock: 3, relationship: 'depends_on' },
    // Load Worker → Staging DB (Backend→Database rule)
    { fromBlock: 4, toBlock: 2, relationship: 'depends_on', protocol: 'TCP', port: 5432 },
    // Load Worker → Data Warehouse (Backend→Warehouse rule)
    { fromBlock: 4, toBlock: 5, relationship: 'depends_on' },
    // Transform Worker → Pipeline Logs (Service→Monitoring rule)
    { fromBlock: 1, toBlock: 6, relationship: 'connects_to' },
    // Load Worker → Pipeline Logs (Service→Monitoring rule)
    { fromBlock: 4, toBlock: 6, relationship: 'connects_to' },
    // Transform Worker → Secrets (Service→Secrets rule)
    { fromBlock: 1, toBlock: 7, relationship: 'depends_on' },
    // Load Worker → Secrets (Service→Secrets rule)
    { fromBlock: 4, toBlock: 7, relationship: 'depends_on' },
    // Repo → Transform Worker (Repo→Service rule)
    { fromBlock: 8, toBlock: 1, relationship: 'connects_to' },
    // Transform Worker → Env (Service→Env rule)
    { fromBlock: 1, toBlock: 9, relationship: 'depends_on' },
  ],
};

// =============================================================================
// Event Streaming
// =============================================================================

export const eventStreamingTemplate: ComposedTemplate = {
  id: 'data-event-streaming',
  name: 'Event Streaming',
  description:
    'Real-time event streaming with stream processing, analytics dashboard, and VPC network isolation.',
  icon: 'Radio',
  estimatedCost: '$200-500/mo',
  category: 'data-pipeline',
  provider: 'gcp',
  providers: ['gcp', 'aws', 'azure'],
  tags: ['events', 'streaming', 'Kafka', 'real-time', 'VPC', 'Subnet'],
  securityLevel: 'standard',
  difficulty: 'advanced',
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
    // 3: Producer API
    {
      iceType: 'Compute.Container',
      label: 'Producer API',
      position: { x: 380, y: 408 },
      data: { size: '2-4096', runtime: 'nodejs20', port: 8080 },
    },
    // 4: Event Stream
    { iceType: 'Messaging.CloudPubSub', label: 'Event Stream', position: { x: 636, y: 408 }, data: { keep_messages: '7 days' } },
    // 5: Stream Processor
    {
      iceType: 'Compute.Worker',
      label: 'Stream Processor',
      position: { x: 892, y: 408 },
      data: { size: '2-4096', runtime: 'nodejs20' },
    },
    // Row 1
    // 6: Analytics DB
    {
      iceType: 'Database.PostgreSQL',
      label: 'Analytics DB',
      position: { x: 380, y: 584 },
      data: { size: 'db.t3.medium', storage: '100', version: '17' },
    },
    // 7: Event Cache
    {
      iceType: 'Database.Redis',
      label: 'Event Cache',
      position: { x: 636, y: 584 },
      data: { size: 'cache.t3.medium', port: 6379 },
    },

    // ── Monitoring (outside VPC) ──────────────────────────────────────────
    // 8: Stream Logs
    { iceType: 'Monitoring.Log', label: 'Stream Logs', position: { x: 50, y: 870 }, data: { keep_logs: '30 days' } },

    // ── Ungrouped (control plane) ─────────────────────────────────────────
    // 9: Secrets
    { iceType: 'Security.Secret', label: 'Secrets', position: { x: 50, y: 1080 }, data: {} },
    // 10: Domain
    { iceType: 'Network.Domain', label: 'Domain', position: { x: 306, y: 1080 }, data: { hostname: 'events.myapp.com' } },
    // 11: Repo
    { iceType: 'Source.Repository', label: 'GitHub Repo', position: { x: 562, y: 1080 }, data: { repository: '', branch: 'main' } },
    // 12: Env
    { iceType: 'Config.Environment', label: 'Env Variables', position: { x: 50, y: 1256 }, data: {} },
  ],

  connections: [
    // Internet → WAF → Gateway
    { fromBlock: 0, toBlock: 1, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    { fromBlock: 1, toBlock: 2, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    // Gateway → Producer API (Gateway→Backend rule)
    { fromBlock: 2, toBlock: 3, relationship: 'connects_to', protocol: 'HTTP', port: 8080 },
    // Producer API → Event Stream (Backend→Queue rule)
    { fromBlock: 3, toBlock: 4, relationship: 'connects_to' },
    // Event Stream → Stream Processor (Queue→Backend rule)
    { fromBlock: 4, toBlock: 5, relationship: 'connects_to' },
    // Stream Processor → Analytics DB (Backend→Database rule)
    { fromBlock: 5, toBlock: 6, relationship: 'depends_on', protocol: 'TCP', port: 5432 },
    // Stream Processor → Event Cache (Backend→Cache rule)
    { fromBlock: 5, toBlock: 7, relationship: 'depends_on', protocol: 'TCP', port: 6379 },
    // Producer API → Secrets (Service→Secrets rule)
    { fromBlock: 3, toBlock: 9, relationship: 'depends_on' },
    // Producer API → Stream Logs (Service→Monitoring rule)
    { fromBlock: 3, toBlock: 8, relationship: 'connects_to' },
    // Stream Processor → Stream Logs (Service→Monitoring rule)
    { fromBlock: 5, toBlock: 8, relationship: 'connects_to' },
    // Domain → Gateway (Domain→Routable rule)
    { fromBlock: 10, toBlock: 2, relationship: 'connects_to' },
    // Repo → Producer API (Repo→Service rule)
    { fromBlock: 11, toBlock: 3, relationship: 'connects_to' },
    // Producer API → Env (Service→Env rule)
    { fromBlock: 3, toBlock: 12, relationship: 'depends_on' },
  ],
};
