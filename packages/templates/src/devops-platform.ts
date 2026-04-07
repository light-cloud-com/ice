/**
 * DevOps Platform Templates
 *
 * Monitoring stacks, CI/CD pipelines, and platform tooling infrastructure.
 *
 * ============================================================================
 * Monitoring Stack (~$100-300/mo)
 * ============================================================================
 *
 * Architecture (deployable to AWS / GCP / Azure):
 *
 *   ┌── Public Zone ────────────────────────────────┐
 *   │  Internet ──► WAF                              │
 *   └────────────────────────────────────────────────┘
 *   ┌── VPC ───────────────────────────────────────────────────┐
 *   │  ┌─ Public Subnet ─┐  ┌── Private Subnet ──────────┐   │
 *   │  │  Gateway         │  │  Metrics API   Metrics DB   │   │
 *   │  │                  │  │  Alert Cache   Alert Queue  │   │
 *   │  └──────────────────┘  └────────────────────────────┘   │
 *   └──────────────────────────────────────────────────────────┘
 *   ┌── Monitoring ──┐
 *   │  Monitoring Logs│
 *   └────────────────┘
 *   Alert Worker   Secrets
 *   Domain   Repo   Env   (ungrouped control plane)
 *
 * Layout grid (CARD 240x160, PAD 20, HEADER 36, GAP 16):
 *   Row 0: Public Zone       (2c,1r -> 536x236)    at (30,30)
 *   Row 1: VPC               (886x488)              at (30,296)
 *          |- Public Subnet  (1c,1r -> 280x236)    at (50,352)  parent->VPC
 *          +- Private Subnet (2c,2r -> 536x412)    at (360,352) parent->VPC
 *   Row 2: Monitoring        (1c,1r -> 280x236)    at (30,814)
 *   Row 3: Ungrouped         y=1080, y=1256
 *
 * ============================================================================
 * CI/CD Platform (~$80-200/mo)
 * ============================================================================
 *
 *   ┌── VPC ────────────────────────────────────────────────────────────┐
 *   │  ┌── Private Subnet ─────────────────────────────────────────┐   │
 *   │  │  Build Queue   Build Worker   Pipeline DB                  │   │
 *   │  │  Artifact Storage                                          │   │
 *   │  └───────────────────────────────────────────────────────────┘   │
 *   └───────────────────────────────────────────────────────────────────┘
 *   ┌── Monitoring ──┐
 *   │  Build Logs     │
 *   └────────────────┘
 *   GitHub Repo   Secrets   Env   (ungrouped control plane)
 *
 * Layout grid (CARD 240x160, PAD 20, HEADER 36, GAP 16):
 *   Row 0: VPC               (832x488)            at (30,30)
 *          +- Private Subnet (3c,2r -> 792x412)   at (50,86)  parent->VPC
 *   Row 1: Monitoring        (1c,1r -> 280x236)   at (30,548)
 *   Row 2: Ungrouped         y=814
 */

import type { ComposedTemplate } from './types';

// =============================================================================
// Monitoring Stack
// =============================================================================

export const devopsMonitoringTemplate: ComposedTemplate = {
  id: 'devops-monitoring',
  name: 'Monitoring Stack',
  description: 'Metrics collection with alerting pipeline, observability dashboard, and VPC network isolation.',
  icon: 'Activity',
  estimatedCost: '$100-300/mo',
  category: 'devops',
  provider: 'gcp',
  providers: ['gcp', 'aws', 'azure'],
  tags: ['monitoring', 'metrics', 'alerting', 'observability', 'VPC', 'Subnet'],
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
    { iceType: 'Network.Internet', label: 'Public Traffic', position: { x: 50, y: 86 }, data: {} },
    // 1: WAF
    { iceType: 'Security.WAF', label: 'WAF', position: { x: 306, y: 86 }, data: {} },

    // ── Public Subnet (inside VPC) ────────────────────────────────────────
    // 2: Gateway
    { iceType: 'Network.Gateway', label: 'API Gateway', position: { x: 70, y: 408 }, data: { protocol: 'http' } },

    // ── Private Subnet (inside VPC) ───────────────────────────────────────
    // Row 0
    // 3: Metrics API
    {
      iceType: 'Compute.Container',
      label: 'Metrics API',
      position: { x: 380, y: 408 },
      data: { size: '1-2048', runtime: 'nodejs20', port: 8080 },
    },
    // 4: Metrics DB
    {
      iceType: 'Database.PostgreSQL',
      label: 'Metrics DB',
      position: { x: 636, y: 408 },
      data: { size: 'db.t3.small', storage: '200', version: '17' },
    },
    // Row 1
    // 5: Alert Cache
    {
      iceType: 'Database.Redis',
      label: 'Alert Cache',
      position: { x: 380, y: 584 },
      data: { size: 'cache.t3.small', port: 6379 },
    },
    // 6: Alert Queue
    { iceType: 'Messaging.SQS', label: 'Alert Queue', position: { x: 636, y: 584 }, data: { queue_type: 'standard' } },

    // ── Monitoring (outside VPC) ──────────────────────────────────────────
    // 7: Monitoring Logs
    {
      iceType: 'Monitoring.Log',
      label: 'Monitoring Logs',
      position: { x: 50, y: 870 },
      data: { keep_logs: '30 days' },
    },

    // ── Ungrouped (control plane) ─────────────────────────────────────────
    // 8: Alert Worker
    {
      iceType: 'Compute.Worker',
      label: 'Alert Worker',
      position: { x: 50, y: 1080 },
      data: { size: '1-2048', runtime: 'nodejs20' },
    },
    // 9: Secrets
    { iceType: 'Security.Secret', label: 'Secrets', position: { x: 306, y: 1080 }, data: {} },
    // 10: Domain
    {
      iceType: 'Network.Domain',
      label: 'Domain',
      position: { x: 50, y: 1256 },
      data: { hostname: 'metrics.myapp.com' },
    },
    // 11: Repo
    {
      iceType: 'Source.Repository',
      label: 'GitHub Repo',
      position: { x: 306, y: 1256 },
      data: { repository: '', branch: 'main' },
    },
    // 12: Env
    { iceType: 'Config.Environment', label: 'Env Variables', position: { x: 562, y: 1256 }, data: {} },
  ],

  connections: [
    // Internet → WAF → Gateway
    { fromBlock: 0, toBlock: 1, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    { fromBlock: 1, toBlock: 2, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    // Gateway → Metrics API (Gateway→Backend rule)
    { fromBlock: 2, toBlock: 3, relationship: 'connects_to', protocol: 'HTTP', port: 8080 },
    // Metrics API → Metrics DB (Backend→Database rule)
    { fromBlock: 3, toBlock: 4, relationship: 'depends_on', protocol: 'TCP', port: 5432 },
    // Metrics API → Alert Cache (Backend→Cache rule)
    { fromBlock: 3, toBlock: 5, relationship: 'depends_on', protocol: 'TCP', port: 6379 },
    // Metrics API → Alert Queue (Backend→Queue rule)
    { fromBlock: 3, toBlock: 6, relationship: 'connects_to' },
    // Alert Queue → Alert Worker (Queue→Backend rule)
    { fromBlock: 6, toBlock: 8, relationship: 'connects_to' },
    // Metrics API → Secrets (Service→Secrets rule)
    { fromBlock: 3, toBlock: 9, relationship: 'depends_on' },
    // Metrics API → Monitoring Logs (Service→Monitoring rule)
    { fromBlock: 3, toBlock: 7, relationship: 'connects_to' },
    // Domain → Gateway (Domain→Routable rule)
    { fromBlock: 10, toBlock: 2, relationship: 'connects_to' },
    // Repo → Metrics API (Repo→Service rule)
    { fromBlock: 11, toBlock: 3, relationship: 'connects_to' },
    // Metrics API → Env (Service→Env rule)
    { fromBlock: 3, toBlock: 12, relationship: 'depends_on' },
  ],
};

// =============================================================================
// CI/CD Platform
// =============================================================================

export const devopsCiCdTemplate: ComposedTemplate = {
  id: 'devops-cicd',
  name: 'CI/CD Platform',
  description: 'Build pipelines with artifact storage, dashboards, deployment logs, and VPC network isolation.',
  icon: 'GitBranch',
  estimatedCost: '$80-200/mo',
  category: 'devops',
  provider: 'gcp',
  providers: ['gcp', 'aws', 'azure'],
  tags: ['CI/CD', 'builds', 'artifacts', 'deployment', 'VPC', 'Subnet'],
  securityLevel: 'standard',
  difficulty: 'advanced',
  trust: 'official',
  author: { name: 'ICE Team' },
  environmentPresets: [{ type: 'production', name: 'Production', region: 'us-central1', securityLevel: 'standard' }],

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
    // [1] Private Subnet — inside VPC (no public subnet for internal CI/CD)
    {
      subtype: 'Custom',
      iceType: 'Network.Subnet',
      label: 'Private Subnet',
      position: { x: 50, y: 86 },
      width: 792,
      height: 412,
      blockIndices: [0, 1, 2, 3],
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
      blockIndices: [4],
      color: '#f59e0b',
    },
  ],

  blocks: [
    // ── Private Subnet (inside VPC) ───────────────────────────────────────
    // Row 0
    // 0: Build Queue
    { iceType: 'Messaging.SQS', label: 'Build Queue', position: { x: 70, y: 142 }, data: { queue_type: 'standard' } },
    // 1: Build Worker
    {
      iceType: 'Compute.Worker',
      label: 'Build Worker',
      position: { x: 326, y: 142 },
      data: { size: '2-4096', runtime: 'nodejs20' },
    },
    // 2: Pipeline DB
    {
      iceType: 'Database.PostgreSQL',
      label: 'Pipeline DB',
      position: { x: 582, y: 142 },
      data: { size: 'db.t3.small', storage: '50', version: '17' },
    },
    // Row 1
    // 3: Artifact Storage
    {
      iceType: 'Storage.Bucket',
      label: 'Artifact Storage',
      position: { x: 70, y: 318 },
      data: { storage_class: 'standard' },
    },

    // ── Monitoring (outside VPC) ──────────────────────────────────────────
    // 4: Build Logs
    { iceType: 'Monitoring.Log', label: 'Build Logs', position: { x: 50, y: 604 }, data: { keep_logs: '30 days' } },

    // ── Ungrouped (control plane) ─────────────────────────────────────────
    // 5: GitHub Repo
    {
      iceType: 'Source.Repository',
      label: 'GitHub Repo',
      position: { x: 50, y: 814 },
      data: { repository: '', branch: 'main' },
    },
    // 6: Secrets
    { iceType: 'Security.Secret', label: 'Secrets', position: { x: 306, y: 814 }, data: {} },
    // 7: Env
    { iceType: 'Config.Environment', label: 'Env Variables', position: { x: 562, y: 814 }, data: {} },
  ],

  connections: [
    // Build Queue → Build Worker (Queue→Backend rule)
    { fromBlock: 0, toBlock: 1, relationship: 'connects_to' },
    // Build Worker → Pipeline DB (Backend→Database rule)
    { fromBlock: 1, toBlock: 2, relationship: 'depends_on', protocol: 'TCP', port: 5432 },
    // Build Worker → Artifact Storage (Backend→Storage rule)
    { fromBlock: 1, toBlock: 3, relationship: 'depends_on' },
    // Build Worker → Build Logs (Service→Monitoring rule)
    { fromBlock: 1, toBlock: 4, relationship: 'connects_to' },
    // GitHub Repo → Build Worker (Repo→Service rule)
    { fromBlock: 5, toBlock: 1, relationship: 'connects_to' },
    // Build Worker → Secrets (Service→Secrets rule)
    { fromBlock: 1, toBlock: 6, relationship: 'depends_on' },
    // Build Worker → Env (Service→Env rule)
    { fromBlock: 1, toBlock: 7, relationship: 'depends_on' },
  ],
};
