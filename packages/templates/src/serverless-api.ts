/**
 * Serverless Templates
 *
 * Two templates: Serverless API (functions + DB) and Event-Driven Functions (pub/sub fan-out).
 *
 * ============================================================================
 * Serverless API (~$5-40/mo)
 * ============================================================================
 *
 * Architecture (deployable to AWS / GCP / Azure):
 *
 *   ┌── Public Zone ────────────────────────────────┐
 *   │  Internet ──► API Gateway                      │
 *   └────────────────────────────────────────────────┘
 *   ┌── VPC ──────────────────────────────────────────┐
 *   │  ┌── Private Subnet ───────────────────────┐   │
 *   │  │  CRUD Handler      Auth Handler          │   │
 *   │  │  PostgreSQL        Storage               │   │
 *   │  └──────────────────────────────────────────┘   │
 *   └─────────────────────────────────────────────────┘
 *   Secret   Domain   Env   (ungrouped control plane)
 *
 * Layout grid (CARD 240×160, PAD 20, HEADER 36, GAP 16):
 *   Row 0: Public Zone       (2c,1r → 536×236)   at (30,30)
 *   Row 1: VPC               (576×488)            at (30,296)
 *          └ Private Subnet  (2c,2r → 536×412)   at (50,352) parent→VPC
 *   Row 2: Ungrouped         y=814
 *
 * ============================================================================
 * Event-Driven Functions (~$10-60/mo)
 * ============================================================================
 *
 *   ┌── Public Zone ──┐
 *   │  Event Ingress   │
 *   └─────────────────┘
 *   ┌── VPC ─────────────────────────────────────────────────────────┐
 *   │  ┌── Private Subnet ──────────────────────────────────────┐   │
 *   │  │  Topic         Email Notifier   Analytics DB            │   │
 *   │  │  DLQ           Analytics Writer Archive                 │   │
 *   │  └────────────────────────────────────────────────────────┘   │
 *   └────────────────────────────────────────────────────────────────┘
 *
 * Layout grid:
 *   Row 0: Public Zone       (1c,1r → 280×236)   at (30,30)
 *   Row 1: VPC               (832×488)            at (30,296)
 *          └ Private Subnet  (3c,2r → 792×412)   at (50,352) parent→VPC
 */

import type { ComposedTemplate } from './types';

export const serverlessApiTemplate: ComposedTemplate = {
  id: 'serverless-api',
  name: 'Serverless API',
  description:
    'Functions-first API with gateway, serverless functions, managed database, and storage. Pay only for what you use.',
  icon: 'Zap',
  estimatedCost: '$5-40/mo',
  category: 'serverless',
  provider: 'gcp',
  providers: ['gcp', 'aws', 'azure'],
  tags: ['Serverless', 'Lambda', 'Functions', 'PostgreSQL', 'VPC', 'Subnet'],
  securityLevel: 'basic',
  difficulty: 'starter',
  trust: 'official',
  featured: true,
  author: { name: 'ICE Team' },
  environmentPresets: [
    { type: 'production', name: 'Production', region: 'us-central1', securityLevel: 'basic' },
    { type: 'staging', name: 'Staging', region: 'us-central1', securityLevel: 'basic' },
  ],

  groups: [
    // [0] Public Zone — outside VPC (managed API Gateway)
    {
      subtype: 'Frontend',
      label: 'Public Zone',
      position: { x: 30, y: 30 },
      width: 536,
      height: 236,
      blockIndices: [0, 1],
      color: '#3b82f6',
    },
    // [1] VPC — contains subnets, no direct blocks
    {
      subtype: 'Custom',
      iceType: 'Network.VPC',
      label: 'VPC',
      position: { x: 30, y: 296 },
      width: 576,
      height: 488,
      blockIndices: [],
      color: '#22c55e',
    },
    // [2] Private Subnet — inside VPC (no public subnet for serverless)
    {
      subtype: 'Custom',
      iceType: 'Network.Subnet',
      label: 'Private Subnet',
      position: { x: 50, y: 352 },
      width: 536,
      height: 412,
      blockIndices: [2, 3, 4, 5],
      color: '#6366f1',
      parentGroupIndex: 1,
    },
  ],

  blocks: [
    // ── Public Zone (outside VPC) ─────────────────────────────────────────
    // 0: Internet
    { iceType: 'Network.Internet', label: 'Public Traffic', position: { x: 50, y: 86 } },
    // 1: API Gateway
    { iceType: 'Network.Gateway', label: 'API Gateway', position: { x: 306, y: 86 }, data: { protocol: 'http' } },

    // ── Private Subnet (inside VPC) ───────────────────────────────────────
    // Row 0
    // 2: CRUD Handler
    {
      iceType: 'Compute.ServerlessFunction',
      label: 'CRUD Handler',
      position: { x: 70, y: 408 },
      data: { memory: '256', timeout: '30', runtime: 'nodejs22.x' },
    },
    // 3: Auth Handler
    {
      iceType: 'Compute.ServerlessFunction',
      label: 'Auth Handler',
      position: { x: 326, y: 408 },
      data: { memory: '256', timeout: '30', runtime: 'nodejs22.x' },
    },
    // Row 1
    // 4: PostgreSQL
    { iceType: 'Database.PostgreSQL', label: 'API Database', position: { x: 70, y: 584 }, data: { storage: '20', version: '17' } },
    // 5: Storage
    { iceType: 'Storage.Bucket', label: 'File Storage', position: { x: 326, y: 584 } },

    // ── Ungrouped (control plane) ─────────────────────────────────────────
    // 6: Secret
    { iceType: 'Security.Secret', label: 'API Secrets', position: { x: 50, y: 814 } },
    // 7: Domain
    { iceType: 'Network.Domain', label: 'Domain', position: { x: 306, y: 814 }, data: { hostname: 'api.myapp.com' } },
    // 8: Env
    { iceType: 'Config.Environment', label: 'Env Variables', position: { x: 562, y: 814 } },
  ],

  connections: [
    // Internet → Gateway (Gateway→Gateway rule)
    { fromBlock: 0, toBlock: 1, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    // Gateway → Functions (Gateway→Backend rule)
    { fromBlock: 1, toBlock: 2, relationship: 'connects_to', protocol: 'HTTP' },
    { fromBlock: 1, toBlock: 3, relationship: 'connects_to', protocol: 'HTTP' },
    // Functions → data (Backend→Database, Backend→Storage rules)
    { fromBlock: 2, toBlock: 4, relationship: 'depends_on', protocol: 'TCP', port: 5432 },
    { fromBlock: 2, toBlock: 5, relationship: 'depends_on' },
    { fromBlock: 3, toBlock: 4, relationship: 'depends_on', protocol: 'TCP', port: 5432 },
    // Functions → Secrets (Service→Secrets config rule)
    { fromBlock: 2, toBlock: 6, relationship: 'depends_on' },
    { fromBlock: 3, toBlock: 6, relationship: 'depends_on' },
    // Domain → Gateway (Domain→Routable rule)
    { fromBlock: 7, toBlock: 1, relationship: 'connects_to' },
    // Function → Env (Service→EnvConfig config rule)
    { fromBlock: 2, toBlock: 8, relationship: 'depends_on' },
  ],
};

/**
 * Event-Driven Serverless (~$10-60/mo)
 *
 * Pub/sub fan-out: events published to a topic trigger multiple
 * subscriber functions for independent processing.
 */
export const eventDrivenServerlessTemplate: ComposedTemplate = {
  id: 'serverless-event-driven',
  name: 'Event-Driven Functions',
  description:
    'Pub/sub fan-out pattern: events trigger multiple subscriber functions for parallel processing with dead-letter queue.',
  icon: 'Activity',
  estimatedCost: '$10-60/mo',
  category: 'serverless',
  provider: 'gcp',
  providers: ['gcp', 'aws', 'azure'],
  tags: ['Serverless', 'Pub/Sub', 'Fan-out', 'DLQ', 'VPC', 'Subnet'],
  securityLevel: 'basic',
  difficulty: 'intermediate',
  trust: 'official',
  author: { name: 'ICE Team' },
  environmentPresets: [
    { type: 'production', name: 'Production', region: 'us-central1', securityLevel: 'basic' },
  ],

  groups: [
    // [0] Public Zone — outside VPC
    {
      subtype: 'Frontend',
      label: 'Public Zone',
      position: { x: 30, y: 30 },
      width: 280,
      height: 236,
      blockIndices: [0],
      color: '#3b82f6',
    },
    // [1] VPC — contains subnets, no direct blocks
    {
      subtype: 'Custom',
      iceType: 'Network.VPC',
      label: 'VPC',
      position: { x: 30, y: 296 },
      width: 832,
      height: 488,
      blockIndices: [],
      color: '#22c55e',
    },
    // [2] Private Subnet — inside VPC
    {
      subtype: 'Custom',
      iceType: 'Network.Subnet',
      label: 'Private Subnet',
      position: { x: 50, y: 352 },
      width: 792,
      height: 412,
      blockIndices: [1, 2, 3, 4, 5, 6],
      color: '#6366f1',
      parentGroupIndex: 1,
    },
  ],

  blocks: [
    // ── Public Zone (outside VPC) ─────────────────────────────────────────
    // 0: Ingress Gateway
    { iceType: 'Network.Gateway', label: 'Ingress Gateway', position: { x: 50, y: 86 }, data: { protocol: 'http' } },

    // ── Private Subnet (inside VPC) ───────────────────────────────────────
    // Row 0
    // 1: Event Topic
    { iceType: 'Messaging.CloudPubSub', label: 'Event Topic', position: { x: 70, y: 408 }, data: { keep_messages: '7 days' } },
    // 2: Email Notifier
    {
      iceType: 'Compute.ServerlessFunction',
      label: 'Email Notifier',
      position: { x: 326, y: 408 },
      data: { memory: '256', timeout: '10', runtime: 'nodejs22.x' },
    },
    // 3: Analytics DB
    { iceType: 'Database.PostgreSQL', label: 'Analytics DB', position: { x: 582, y: 408 }, data: { storage: '50', version: '17' } },
    // Row 1
    // 4: Dead Letter Queue
    { iceType: 'Messaging.SQS', label: 'Dead Letter Queue', position: { x: 70, y: 584 }, data: { queue_type: 'standard' } },
    // 5: Analytics Writer
    {
      iceType: 'Compute.ServerlessFunction',
      label: 'Analytics Writer',
      position: { x: 326, y: 584 },
      data: { memory: '512', timeout: '60', runtime: 'nodejs22.x' },
    },
    // 6: Archive
    { iceType: 'Storage.Bucket', label: 'Archive', position: { x: 582, y: 584 } },
  ],

  connections: [
    // Ingress → Topic (Gateway→Backend rule — Gateway to messaging)
    { fromBlock: 0, toBlock: 1, relationship: 'connects_to' },
    // Topic → subscribers (Queue→Backend rule)
    { fromBlock: 1, toBlock: 2, relationship: 'connects_to' },
    { fromBlock: 1, toBlock: 5, relationship: 'connects_to' },
    // Topic → DLQ (Backend→Queue rule)
    { fromBlock: 1, toBlock: 4, relationship: 'connects_to' },
    // Analytics Writer → data (Backend→Database, Backend→Storage rules)
    { fromBlock: 5, toBlock: 3, relationship: 'depends_on', protocol: 'TCP', port: 5432 },
    { fromBlock: 5, toBlock: 6, relationship: 'depends_on' },
  ],
};
