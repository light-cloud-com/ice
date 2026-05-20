/**
 * AI/ML Workbench Template (~$200-500/mo)
 *
 * ML inference API with training pipeline, model storage, feature store,
 * pipeline queue, and monitoring.
 *
 * Architecture (deployable to AWS / GCP / Azure):
 *
 *   ┌── Public Zone ────────────────────────────────┐
 *   │  Internet ──► WAF                              │
 *   └────────────────────────────────────────────────┘
 *   ┌── VPC ──────────────────────────────────────────────────────────────────────────┐
 *   │  ┌─ Public Subnet ─┐  ┌── Private Subnet ──────────────────────────────────┐  │
 *   │  │  Gateway         │  │  Inference   SQS          Worker       PostgreSQL   │  │
 *   │  │                  │  │  Model Store Training Data Redis                    │  │
 *   │  └──────────────────┘  └────────────────────────────────────────────────────┘  │
 *   └─────────────────────────────────────────────────────────────────────────────────┘
 *   ┌── Monitoring ──┐
 *   │  Logs          │
 *   └────────────────┘
 *   Secret   (ungrouped control plane)
 *
 * Layout grid (CARD 240×160, PAD 20, HEADER 36, GAP 16):
 *   Row 0: Public Zone       (2c,1r → 536×236)    at (30,30)
 *   Row 1: VPC               (1398×488)            at (30,296)
 *          ├ Public Subnet   (1c,1r → 280×236)    at (50,352)  parent→VPC
 *          └ Private Subnet  (4c,2r → 1048×412)   at (360,352) parent→VPC
 *   Row 2: Monitoring        (1c,1r → 280×236)    at (30,814)
 *   Row 3: Ungrouped         y=1080
 */

import type { ComposedTemplate } from './types';

export const aiMlTemplate: ComposedTemplate = {
  id: 'aiml-workbench',
  name: 'AI/ML Workbench',
  description:
    'ML workbench with inference API, training worker, model & training data storage, Redis feature cache, pipeline queue, and monitoring.',
  icon: 'Brain',
  estimatedCost: '$200-500/mo',
  category: 'ai-ml',
  provider: 'gcp',
  providers: ['gcp', 'aws', 'azure'],
  tags: ['ML Pipeline', 'Python', 'Workers', 'Storage', 'SQS', 'VPC', 'Subnet'],
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
      width: 1398,
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
      width: 1048,
      height: 412,
      blockIndices: [3, 4, 5, 6, 7, 8, 9],
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
    { iceType: 'Network.PublicEndpoint', label: 'Public Traffic', position: { x: 50, y: 86 }, data: {} },
    // 1: WAF
    { iceType: 'Security.WAF', label: 'WAF', position: { x: 306, y: 86 }, data: {} },

    // ── Public Subnet (inside VPC) ────────────────────────────────────────
    // 2: Gateway
    { iceType: 'Network.Gateway', label: 'API Gateway', position: { x: 70, y: 408 }, data: { protocol: 'http' } },

    // ── Private Subnet (inside VPC) ───────────────────────────────────────
    // Row 0
    // 3: Inference Service
    {
      iceType: 'Compute.Container',
      label: 'Inference Service',
      position: { x: 380, y: 408 },
      data: { size: '2-4096', runtime: 'python3.12', domain: 'ml-api.acme.io', port: 8080 },
    },
    // 4: SQS
    {
      iceType: 'Messaging.SQS',
      label: 'Pipeline Queue',
      position: { x: 636, y: 408 },
      data: { queue_type: 'standard' },
    },
    // 5: Training Worker
    {
      iceType: 'Compute.Worker',
      label: 'Training Worker',
      position: { x: 892, y: 408 },
      data: { size: '2-4096', runtime: 'python3.12' },
    },
    // 6: PostgreSQL
    {
      iceType: 'Database.PostgreSQL',
      label: 'ML Metadata DB',
      position: { x: 1148, y: 408 },
      data: { size: 'db.t3.medium', storage: '100', version: '17' },
    },
    // Row 1
    // 7: Model Storage
    {
      iceType: 'Storage.Bucket',
      label: 'Model Storage',
      position: { x: 380, y: 584 },
      data: { storage_class: 'standard' },
    },
    // 8: Training Data
    {
      iceType: 'Storage.Bucket',
      label: 'Training Data',
      position: { x: 636, y: 584 },
      data: { storage_class: 'standard' },
    },
    // 9: Redis Cache
    {
      iceType: 'Database.Redis',
      label: 'Inference Cache',
      position: { x: 892, y: 584 },
      data: { size: 'cache.t3.medium', port: 6379 },
    },

    // ── Monitoring (outside VPC) ──────────────────────────────────────────
    // 10: Logs
    { iceType: 'Monitoring.Log', label: 'ML Logs', position: { x: 50, y: 870 }, data: { keep_logs: '30 days' } },

    // ── Ungrouped (control plane) ─────────────────────────────────────────
    // 11: Secret
    { iceType: 'Security.Secret', label: 'ML Secrets', position: { x: 50, y: 1080 }, data: {} },
  ],

  connections: [
    // Internet → WAF → Gateway (Gateway→Gateway rule)
    { fromBlock: 0, toBlock: 1, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    { fromBlock: 1, toBlock: 2, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    // Gateway → Inference (Gateway→Backend rule)
    { fromBlock: 2, toBlock: 3, relationship: 'connects_to', protocol: 'HTTP', port: 8080 },
    // Inference → data (Backend→Database, Backend→Storage, Backend→Cache rules)
    { fromBlock: 3, toBlock: 6, relationship: 'depends_on', protocol: 'TCP', port: 5432 },
    { fromBlock: 3, toBlock: 7, relationship: 'depends_on' },
    { fromBlock: 3, toBlock: 9, relationship: 'depends_on', protocol: 'TCP', port: 6379 },
    // SQS → Training Worker (Queue→Backend rule)
    { fromBlock: 4, toBlock: 5, relationship: 'connects_to' },
    // Worker → storage (Backend→Storage rule)
    { fromBlock: 5, toBlock: 7, relationship: 'depends_on' },
    { fromBlock: 5, toBlock: 8, relationship: 'depends_on' },
    // Secrets (Service→Secrets config rule)
    { fromBlock: 3, toBlock: 11, relationship: 'depends_on' },
    { fromBlock: 5, toBlock: 11, relationship: 'depends_on' },
    // Observability (Service→Monitoring rule)
    { fromBlock: 3, toBlock: 10, relationship: 'connects_to' },
    { fromBlock: 5, toBlock: 10, relationship: 'connects_to' },
  ],
};
