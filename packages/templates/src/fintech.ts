/**
 * Fintech Templates
 *
 * Payment processing, trading platforms, and
 * financial compliance infrastructure.
 *
 * ============================================================================
 * Payment Processing (~$400-800/mo)
 * ============================================================================
 *
 * Architecture (deployable to AWS / GCP / Azure):
 *
 *   ┌── Public Zone ────────────────────────────────┐
 *   │  Internet ──► WAF                              │
 *   └────────────────────────────────────────────────┘
 *   ┌── VPC ──────────────────────────────────────────────────────────────┐
 *   │  ┌─ Public Subnet ─┐  ┌── Private Subnet ──────────────────────┐  │
 *   │  │  Gateway         │  │  Payment API   Transaction DB   Redis  │  │
 *   │  │                  │  │  Txn Queue     Fraud Detector          │  │
 *   │  └──────────────────┘  └────────────────────────────────────────┘  │
 *   └─────────────────────────────────────────────────────────────────────┘
 *   ┌── Security Controls ──────────────────────────────┐  ┌─ Monitoring ─┐
 *   │  Auth     Secrets     Certificate                  │  │  Audit Trail │
 *   └───────────────────────────────────────────────────┘  └──────────────┘
 *   Domain   Repo   Env   (ungrouped control plane)
 *
 * Layout grid (CARD 240x160, PAD 20, HEADER 36, GAP 16):
 *   Row 0: Public Zone           (2c,1r -> 536x236)    at (30,30)
 *   Row 1: VPC                   (1142x488)             at (30,296)
 *          |- Public Subnet      (1c,1r -> 280x236)    at (50,352)  parent->VPC
 *          +- Private Subnet     (3c,2r -> 792x412)    at (360,352) parent->VPC
 *   Row 2: Security Controls     (3c,1r -> 792x236)    at (30,814)
 *          Monitoring            (1c,1r -> 280x236)    at (852,814)
 *   Row 3: Ungrouped             y=1080
 *
 * ============================================================================
 * Trading Platform (~$500-1000/mo)
 * ============================================================================
 *
 *   ┌── Public Zone ──────────────────────────────────────┐
 *   │  Internet ──► WAF ──► Web Dashboard                  │
 *   └─────────────────────────────────────────────────────┘
 *   ┌── VPC ──────────────────────────────────────────────────────────────┐
 *   │  ┌─ Public Subnet ─┐  ┌── Private Subnet ──────────────────────┐  │
 *   │  │  Gateway         │  │  Trade API   Market Feed   Order DB    │  │
 *   │  │                  │  │  Price Cache   Warehouse               │  │
 *   │  └──────────────────┘  └────────────────────────────────────────┘  │
 *   └─────────────────────────────────────────────────────────────────────┘
 *   ┌─ Monitoring ─┐
 *   │  Audit Trail │
 *   └──────────────┘
 *   Auth   Secrets   Domain   Repo   Env   (ungrouped control plane)
 *
 * Layout grid (CARD 240x160, PAD 20, HEADER 36, GAP 16):
 *   Row 0: Public Zone           (3c,1r -> 792x236)    at (30,30)
 *   Row 1: VPC                   (1142x488)             at (30,296)
 *          |- Public Subnet      (1c,1r -> 280x236)    at (50,352)  parent->VPC
 *          +- Private Subnet     (3c,2r -> 792x412)    at (360,352) parent->VPC
 *   Row 2: Monitoring            (1c,1r -> 280x236)    at (30,814)
 *   Row 3: Ungrouped             y=1080
 */

import type { ComposedTemplate } from './types';

// =============================================================================
// Payment Processing
// =============================================================================

export const fintechPaymentGatewayTemplate: ComposedTemplate = {
  id: 'fintech-payment-gateway',
  name: 'Payment Processing',
  description:
    'PCI-DSS compliant payment gateway with fraud detection, WAF, VPC network isolation, encrypted database, and audit trails.',
  icon: 'CreditCard',
  estimatedCost: '$400-800/mo',
  category: 'fintech',
  provider: 'gcp',
  providers: ['gcp', 'aws', 'azure'],
  tags: ['payments', 'PCI-DSS', 'transactions', 'fraud', 'VPC', 'Subnet'],
  securityLevel: 'strict',
  difficulty: 'advanced',
  trust: 'official',
  compliance: ['pci-dss'],
  author: { name: 'ICE Team' },
  environmentPresets: [
    { type: 'production', name: 'Production', region: 'us-central1', securityLevel: 'strict' },
    { type: 'staging', name: 'Staging', region: 'us-central1', securityLevel: 'standard' },
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
    // [4] Security Controls — outside VPC
    {
      subtype: 'External',
      label: 'Security Controls',
      position: { x: 30, y: 814 },
      width: 792,
      height: 236,
      blockIndices: [8, 9, 10],
      color: '#8b5cf6',
    },
    // [5] Monitoring — outside VPC
    {
      subtype: 'Monitoring',
      label: 'Monitoring',
      position: { x: 852, y: 814 },
      width: 280,
      height: 236,
      blockIndices: [11],
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
    // 3: Payment API
    {
      iceType: 'Compute.Container',
      label: 'Payment API',
      position: { x: 380, y: 408 },
      data: { size: '2-4096', runtime: 'nodejs20', port: 8080 },
    },
    // 4: Transaction DB
    {
      iceType: 'Database.PostgreSQL',
      label: 'Transaction DB',
      position: { x: 636, y: 408 },
      data: { size: 'db.r6g.large', storage: '200', version: '17' },
    },
    // 5: Redis Cache
    {
      iceType: 'Database.Redis',
      label: 'Redis Cache',
      position: { x: 892, y: 408 },
      data: { size: 'cache.r6g.large', port: 6379 },
    },
    // Row 1
    // 6: Transaction Queue
    {
      iceType: 'Messaging.SQS',
      label: 'Transaction Queue',
      position: { x: 380, y: 584 },
      data: { queue_type: 'standard' },
    },
    // 7: Fraud Detector
    {
      iceType: 'Compute.Worker',
      label: 'Fraud Detector',
      position: { x: 636, y: 584 },
      data: { size: '1-2048', runtime: 'nodejs20' },
    },

    // ── Security Controls (outside VPC) ───────────────────────────────────
    // 8: Auth
    { iceType: 'Security.Identity', label: 'Auth', position: { x: 50, y: 870 }, data: {} },
    // 9: Secrets
    { iceType: 'Security.Secret', label: 'Secrets', position: { x: 306, y: 870 }, data: {} },
    // 10: Certificate
    { iceType: 'Security.Certificate', label: 'TLS Certificate', position: { x: 562, y: 870 }, data: {} },

    // ── Monitoring (outside VPC) ──────────────────────────────────────────
    // 11: Audit Trail
    { iceType: 'Monitoring.Log', label: 'Audit Trail', position: { x: 872, y: 870 }, data: { keep_logs: '90 days' } },

    // ── Ungrouped (control plane) ─────────────────────────────────────────
    // 12: Domain
    { iceType: 'Network.Domain', label: 'Domain', position: { x: 50, y: 1080 }, data: { hostname: 'pay.fintech.io' } },
    // 13: Repo
    { iceType: 'Source.Repository', label: 'GitHub Repo', position: { x: 306, y: 1080 }, data: { repository: '', branch: 'main' } },
    // 14: Env
    { iceType: 'Config.Environment', label: 'Env Variables', position: { x: 562, y: 1080 }, data: {} },
  ],

  connections: [
    // Internet → WAF → Gateway
    { fromBlock: 0, toBlock: 1, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    { fromBlock: 1, toBlock: 2, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    // Gateway → Payment API (Gateway→Backend rule)
    { fromBlock: 2, toBlock: 3, relationship: 'connects_to', protocol: 'HTTP', port: 8080 },
    // Payment API → data stores (Backend→Database, Backend→Cache rules)
    { fromBlock: 3, toBlock: 4, relationship: 'depends_on', protocol: 'TCP', port: 5432 },
    { fromBlock: 3, toBlock: 5, relationship: 'depends_on', protocol: 'TCP', port: 6379 },
    // Payment API → Queue (Backend→Queue publish rule)
    { fromBlock: 3, toBlock: 6, relationship: 'connects_to' },
    // Queue → Fraud Detector (Queue→Backend subscribe rule)
    { fromBlock: 6, toBlock: 7, relationship: 'connects_to' },
    // Payment API → security (Backend→Auth, Service→Secrets, Service→Certificate rules)
    { fromBlock: 3, toBlock: 8, relationship: 'connects_to' },
    { fromBlock: 3, toBlock: 9, relationship: 'depends_on' },
    { fromBlock: 3, toBlock: 10, relationship: 'depends_on' },
    // Payment API → Audit Trail (Service→Monitoring rule)
    { fromBlock: 3, toBlock: 11, relationship: 'connects_to' },
    // Fraud Detector → Audit Trail (Service→Monitoring rule)
    { fromBlock: 7, toBlock: 11, relationship: 'connects_to' },
    // Domain → Gateway (Domain→Routable rule)
    { fromBlock: 12, toBlock: 2, relationship: 'connects_to' },
    // Repo → Payment API (Repo→Service pipeline rule)
    { fromBlock: 13, toBlock: 3, relationship: 'connects_to' },
    // Payment API → Env (Service→EnvConfig config rule)
    { fromBlock: 3, toBlock: 14, relationship: 'depends_on' },
  ],
};

// =============================================================================
// Trading Platform
// =============================================================================

export const fintechTradingPlatformTemplate: ComposedTemplate = {
  id: 'fintech-trading-platform',
  name: 'Trading Platform',
  description:
    'Real-time market data feed, order execution, analytics dashboard with WAF, VPC isolation, and audit logging.',
  icon: 'TrendingUp',
  estimatedCost: '$500-1000/mo',
  category: 'fintech',
  provider: 'gcp',
  providers: ['gcp', 'aws', 'azure'],
  tags: ['trading', 'market-data', 'real-time', 'analytics', 'VPC', 'Subnet'],
  securityLevel: 'strict',
  difficulty: 'advanced',
  trust: 'official',
  author: { name: 'ICE Team' },
  environmentPresets: [
    { type: 'production', name: 'Production', region: 'us-central1', securityLevel: 'strict' },
  ],

  groups: [
    // [0] Public Zone — outside VPC (3c with Dashboard)
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
      blockIndices: [4, 5, 6, 7, 8],
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
    // 2: Web Dashboard
    {
      iceType: 'Compute.SSRSite',
      label: 'Web Dashboard',
      position: { x: 562, y: 86 },
      data: { framework: 'nextjs' },
    },

    // ── Public Subnet (inside VPC) ────────────────────────────────────────
    // 3: Gateway
    { iceType: 'Network.Gateway', label: 'API Gateway', position: { x: 70, y: 408 }, data: { protocol: 'http' } },

    // ── Private Subnet (inside VPC) ───────────────────────────────────────
    // Row 0
    // 4: Trade API
    {
      iceType: 'Compute.Container',
      label: 'Trade API',
      position: { x: 380, y: 408 },
      data: { size: '2-4096', runtime: 'nodejs20', port: 8080 },
    },
    // 5: Market Data Feed
    {
      iceType: 'Messaging.CloudPubSub',
      label: 'Market Data Feed',
      position: { x: 636, y: 408 },
      data: { keep_messages: '7 days' },
    },
    // 6: Order Book DB
    {
      iceType: 'Database.PostgreSQL',
      label: 'Order Book DB',
      position: { x: 892, y: 408 },
      data: { size: 'db.r6g.large', storage: '500', version: '17' },
    },
    // Row 1
    // 7: Price Cache
    {
      iceType: 'Database.Redis',
      label: 'Price Cache',
      position: { x: 380, y: 584 },
      data: { size: 'cache.r6g.large', port: 6379 },
    },
    // 8: Analytics Warehouse
    {
      iceType: 'Analytics.DataWarehouse',
      label: 'Analytics Warehouse',
      position: { x: 636, y: 584 },
      data: {},
    },

    // ── Monitoring (outside VPC) ──────────────────────────────────────────
    // 9: Audit Trail
    { iceType: 'Monitoring.Log', label: 'Audit Trail', position: { x: 50, y: 870 }, data: { keep_logs: '90 days' } },

    // ── Ungrouped (control plane) ─────────────────────────────────────────
    // 10: Auth
    { iceType: 'Security.Identity', label: 'Auth', position: { x: 50, y: 1080 }, data: {} },
    // 11: Secrets
    { iceType: 'Security.Secret', label: 'Secrets', position: { x: 306, y: 1080 }, data: {} },
    // 12: Domain
    { iceType: 'Network.Domain', label: 'Domain', position: { x: 562, y: 1080 }, data: { hostname: 'trade.fintech.io' } },
    // 13: Repo
    { iceType: 'Source.Repository', label: 'GitHub Repo', position: { x: 50, y: 1256 }, data: { repository: '', branch: 'main' } },
    // 14: Env
    { iceType: 'Config.Environment', label: 'Env Variables', position: { x: 306, y: 1256 }, data: {} },
  ],

  connections: [
    // Internet → WAF → Gateway
    { fromBlock: 0, toBlock: 1, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    { fromBlock: 1, toBlock: 3, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    // Internet → Dashboard (Gateway→Frontend rule)
    { fromBlock: 0, toBlock: 2, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    // Dashboard → Gateway (Frontend→Backend rule)
    { fromBlock: 2, toBlock: 3, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    // Gateway → Trade API (Gateway→Backend rule)
    { fromBlock: 3, toBlock: 4, relationship: 'connects_to', protocol: 'HTTP', port: 8080 },
    // Trade API → data stores (Backend→Queue, Backend→Database, Backend→Cache rules)
    { fromBlock: 4, toBlock: 5, relationship: 'connects_to' },
    { fromBlock: 4, toBlock: 6, relationship: 'depends_on', protocol: 'TCP', port: 5432 },
    { fromBlock: 4, toBlock: 7, relationship: 'depends_on', protocol: 'TCP', port: 6379 },
    // Trade API → Analytics (Backend→Warehouse rule)
    { fromBlock: 4, toBlock: 8, relationship: 'depends_on' },
    // Trade API → Audit Trail (Service→Monitoring rule)
    { fromBlock: 4, toBlock: 9, relationship: 'connects_to' },
    // Trade API → security (Backend→Auth, Service→Secrets rules)
    { fromBlock: 4, toBlock: 10, relationship: 'connects_to' },
    { fromBlock: 4, toBlock: 11, relationship: 'depends_on' },
    // Domain → Dashboard (Domain→Routable rule)
    { fromBlock: 12, toBlock: 2, relationship: 'connects_to' },
    // Repo → Trade API (Repo→Service pipeline rule)
    { fromBlock: 13, toBlock: 4, relationship: 'connects_to' },
    // Trade API → Env (Service→EnvConfig config rule)
    { fromBlock: 4, toBlock: 14, relationship: 'depends_on' },
  ],
};
