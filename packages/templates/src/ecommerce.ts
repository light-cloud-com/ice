/**
 * E-Commerce Templates
 *
 * Two templates: Online Store (single-vendor) and Marketplace (multi-vendor).
 *
 * ============================================================================
 * Online Store (~$150-350/mo)
 * ============================================================================
 *
 * Architecture (deployable to AWS / GCP / Azure):
 *
 *   ┌── Public Zone ──────────────────────────────────────────────┐
 *   │  Internet ──► WAF ──► Storefront (SSR Next.js)              │
 *   └─────────────────────────────────────────────────────────────┘
 *   ┌── VPC ──────────────────────────────────────────────────────────────┐
 *   │  ┌─ Public Subnet ─┐  ┌── Private Subnet ──────────────────────┐  │
 *   │  │  Gateway         │  │  Store API    Product DB   Cart Cache   │  │
 *   │  │                  │  │  Product Imgs Order Queue  Order Worker │  │
 *   │  └──────────────────┘  └────────────────────────────────────────┘  │
 *   └─────────────────────────────────────────────────────────────────────┘
 *   ┌── Monitoring ──┐
 *   │  Store Logs    │
 *   └────────────────┘
 *   Auth   Secrets   Search   (ungrouped control plane)
 *   Domain   Repo   Env
 *
 * Layout grid (CARD 240×160, PAD 20, HEADER 36, GAP 16):
 *   Row 0: Public Zone       (3c,1r → 792×236)    at (30,30)
 *   Row 1: VPC               (1142×488)            at (30,296)
 *          ├ Public Subnet   (1c,1r → 280×236)    at (50,352)  parent→VPC
 *          └ Private Subnet  (3c,2r → 792×412)    at (360,352) parent→VPC
 *   Row 2: Monitoring        (1c,1r → 280×236)    at (30,814)
 *   Row 3: Ungrouped         y=1080, y=1256
 *
 * ============================================================================
 * Marketplace (~$300-600/mo)
 * ============================================================================
 *
 *   ┌── Public Zone ──────────────────────────────────────────────┐
 *   │  Internet ──► WAF ──► Marketplace App (SSR Next.js)         │
 *   └─────────────────────────────────────────────────────────────┘
 *   ┌── VPC ──────────────────────────────────────────────────────────────┐
 *   │  ┌─ Public Subnet ─┐  ┌── Private Subnet ──────────────────────┐  │
 *   │  │  Gateway         │  │  Seller API   Buyer API   Catalog DB    │  │
 *   │  │                  │  │  Session Cache  Media     Notify Queue  │  │
 *   │  └──────────────────┘  └────────────────────────────────────────┘  │
 *   └─────────────────────────────────────────────────────────────────────┘
 *   ┌── Monitoring ──┐
 *   │  Platform Logs │
 *   └────────────────┘
 *   Auth   Secrets   Search   (ungrouped control plane)
 *   Domain   Repo   Env
 *
 * Layout grid (CARD 240×160, PAD 20, HEADER 36, GAP 16):
 *   Row 0: Public Zone       (3c,1r → 792×236)    at (30,30)
 *   Row 1: VPC               (1142×488)            at (30,296)
 *          ├ Public Subnet   (1c,1r → 280×236)    at (50,352)  parent→VPC
 *          └ Private Subnet  (3c,2r → 792×412)    at (360,352) parent→VPC
 *   Row 2: Monitoring        (1c,1r → 280×236)    at (30,814)
 *   Row 3: Ungrouped         y=1080, y=1256
 */

import type { ComposedTemplate } from './types';

export const ecommerceStoreTemplate: ComposedTemplate = {
  id: 'ecommerce-store',
  name: 'Online Store',
  description:
    'Full e-commerce stack with product catalog, cart, checkout, search, WAF protection, and VPC network isolation.',
  icon: 'ShoppingCart',
  estimatedCost: '$150-350/mo',
  category: 'e-commerce',
  provider: 'gcp',
  providers: ['gcp', 'aws', 'azure'],
  tags: ['store', 'products', 'cart', 'checkout', 'payments', 'VPC', 'Subnet'],
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
      blockIndices: [4, 5, 6, 7, 8, 9],
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
    { iceType: 'Network.Internet', label: 'Public Traffic', position: { x: 50, y: 86 }, data: {} },
    // 1: WAF
    { iceType: 'Security.WAF', label: 'WAF', position: { x: 306, y: 86 }, data: {} },
    // 2: Storefront (SSR)
    {
      iceType: 'Compute.SSRSite',
      label: 'Storefront',
      position: { x: 562, y: 86 },
      data: { framework: 'nextjs', domain: 'shop.acme.io' },
    },

    // ── Public Subnet (inside VPC) ────────────────────────────────────────
    // 3: Gateway
    { iceType: 'Network.Gateway', label: 'API Gateway', position: { x: 70, y: 408 }, data: { protocol: 'http' } },

    // ── Private Subnet (inside VPC) ───────────────────────────────────────
    // Row 0
    // 4: Store API
    {
      iceType: 'Compute.Container',
      label: 'Store API',
      position: { x: 380, y: 408 },
      data: { size: '1-2048', runtime: 'nodejs20', port: 8080 },
    },
    // 5: Product DB
    {
      iceType: 'Database.PostgreSQL',
      label: 'Product DB',
      position: { x: 636, y: 408 },
      data: { size: 'db.t3.small', storage: '100', version: '17' },
    },
    // 6: Cart Cache
    {
      iceType: 'Database.Redis',
      label: 'Cart Cache',
      position: { x: 892, y: 408 },
      data: { size: 'cache.t3.small', port: 6379 },
    },
    // Row 1
    // 7: Product Images
    {
      iceType: 'Storage.Bucket',
      label: 'Product Images',
      position: { x: 380, y: 584 },
      data: { storage_class: 'standard' },
    },
    // 8: Order Queue
    { iceType: 'Messaging.SQS', label: 'Order Queue', position: { x: 636, y: 584 }, data: { queue_type: 'standard' } },
    // 9: Order Worker
    {
      iceType: 'Compute.Worker',
      label: 'Order Worker',
      position: { x: 892, y: 584 },
      data: { size: '1-2048', runtime: 'nodejs20' },
    },

    // ── Monitoring (outside VPC) ──────────────────────────────────────────
    // 10: Store Logs
    { iceType: 'Monitoring.Log', label: 'Store Logs', position: { x: 50, y: 870 }, data: { keep_logs: '30 days' } },

    // ── Ungrouped (control plane) ─────────────────────────────────────────
    // 11: Auth
    { iceType: 'Security.Identity', label: 'Auth', position: { x: 50, y: 1080 }, data: {} },
    // 12: Secrets
    { iceType: 'Security.Secret', label: 'App Secrets', position: { x: 306, y: 1080 }, data: {} },
    // 13: Search
    { iceType: 'Analytics.Search', label: 'Product Search', position: { x: 562, y: 1080 }, data: {} },
    // 14: Domain
    { iceType: 'Network.Domain', label: 'Domain', position: { x: 50, y: 1256 }, data: { hostname: 'shop.acme.io' } },
    // 15: Repo
    {
      iceType: 'Source.Repository',
      label: 'GitHub Repo',
      position: { x: 306, y: 1256 },
      data: { repository: '', branch: 'main' },
    },
    // 16: Env
    { iceType: 'Config.Environment', label: 'Env Variables', position: { x: 562, y: 1256 }, data: {} },
  ],

  connections: [
    // Internet → WAF → Gateway (Internet→WAF, WAF→Gateway rules)
    { fromBlock: 0, toBlock: 1, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    { fromBlock: 1, toBlock: 3, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    // Internet → Storefront (Internet→Frontend rule)
    { fromBlock: 0, toBlock: 2, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    // Gateway → Store API (Gateway→Backend rule)
    { fromBlock: 3, toBlock: 4, relationship: 'connects_to', protocol: 'HTTP', port: 8080 },
    // Store API → Data (Backend→Database, Backend→Cache, Backend→Storage rules)
    { fromBlock: 4, toBlock: 5, relationship: 'depends_on', protocol: 'TCP', port: 5432 },
    { fromBlock: 4, toBlock: 6, relationship: 'depends_on', protocol: 'TCP', port: 6379 },
    { fromBlock: 4, toBlock: 7, relationship: 'depends_on' },
    // Store API → Order Queue (Backend→Queue rule)
    { fromBlock: 4, toBlock: 8, relationship: 'connects_to' },
    // Order Queue → Order Worker (Queue→Backend rule)
    { fromBlock: 8, toBlock: 9, relationship: 'connects_to' },
    // Order Worker → Product Images (Backend→Storage rule)
    { fromBlock: 9, toBlock: 7, relationship: 'depends_on' },
    // Store API → Search (Backend→Search rule)
    { fromBlock: 4, toBlock: 13, relationship: 'depends_on' },
    // Store API → Auth (Backend→Auth rule)
    { fromBlock: 4, toBlock: 11, relationship: 'connects_to' },
    // Store API → Secrets (Service→Secrets config rule)
    { fromBlock: 4, toBlock: 12, relationship: 'depends_on' },
    // Store API → Logs (Service→Monitoring rule)
    { fromBlock: 4, toBlock: 10, relationship: 'connects_to' },
    // Domain → Storefront (Domain→Routable rule)
    { fromBlock: 14, toBlock: 2, relationship: 'connects_to' },
    // Repo → Store API (Repo→Service pipeline rule)
    { fromBlock: 15, toBlock: 4, relationship: 'connects_to' },
    // Store API → Env (Service→EnvConfig config rule)
    { fromBlock: 4, toBlock: 16, relationship: 'depends_on' },
  ],
};

export const ecommerceMarketplaceTemplate: ComposedTemplate = {
  id: 'ecommerce-marketplace',
  name: 'Marketplace',
  description: 'Multi-vendor marketplace with buyer and seller APIs, search, WAF, and VPC isolation.',
  icon: 'Store',
  estimatedCost: '$300-600/mo',
  category: 'e-commerce',
  provider: 'gcp',
  providers: ['gcp', 'aws', 'azure'],
  tags: ['marketplace', 'vendors', 'buyers', 'sellers', 'VPC', 'Subnet'],
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
      blockIndices: [4, 5, 6, 7, 8, 9],
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
    { iceType: 'Network.Internet', label: 'Public Traffic', position: { x: 50, y: 86 }, data: {} },
    // 1: WAF
    { iceType: 'Security.WAF', label: 'WAF', position: { x: 306, y: 86 }, data: {} },
    // 2: Marketplace App (SSR)
    {
      iceType: 'Compute.SSRSite',
      label: 'Marketplace App',
      position: { x: 562, y: 86 },
      data: { framework: 'nextjs', domain: 'market.acme.io' },
    },

    // ── Public Subnet (inside VPC) ────────────────────────────────────────
    // 3: Gateway
    { iceType: 'Network.Gateway', label: 'API Gateway', position: { x: 70, y: 408 }, data: { protocol: 'http' } },

    // ── Private Subnet (inside VPC) ───────────────────────────────────────
    // Row 0
    // 4: Seller API
    {
      iceType: 'Compute.Container',
      label: 'Seller API',
      position: { x: 380, y: 408 },
      data: { size: '2-4096', runtime: 'nodejs20', port: 8080 },
    },
    // 5: Buyer API
    {
      iceType: 'Compute.Container',
      label: 'Buyer API',
      position: { x: 636, y: 408 },
      data: { size: '2-4096', runtime: 'nodejs20', port: 8081 },
    },
    // 6: Catalog DB
    {
      iceType: 'Database.PostgreSQL',
      label: 'Catalog DB',
      position: { x: 892, y: 408 },
      data: { size: 'db.t3.medium', storage: '200', version: '17' },
    },
    // Row 1
    // 7: Session Cache
    {
      iceType: 'Database.Redis',
      label: 'Session Cache',
      position: { x: 380, y: 584 },
      data: { size: 'cache.t3.medium', port: 6379 },
    },
    // 8: Media Storage
    {
      iceType: 'Storage.Bucket',
      label: 'Media Storage',
      position: { x: 636, y: 584 },
      data: { storage_class: 'standard' },
    },
    // 9: Notification Queue
    {
      iceType: 'Messaging.SQS',
      label: 'Notification Queue',
      position: { x: 892, y: 584 },
      data: { queue_type: 'standard' },
    },

    // ── Monitoring (outside VPC) ──────────────────────────────────────────
    // 10: Platform Logs
    { iceType: 'Monitoring.Log', label: 'Platform Logs', position: { x: 50, y: 870 }, data: { keep_logs: '30 days' } },

    // ── Ungrouped (control plane) ─────────────────────────────────────────
    // 11: Auth
    { iceType: 'Security.Identity', label: 'Auth', position: { x: 50, y: 1080 }, data: {} },
    // 12: Secrets
    { iceType: 'Security.Secret', label: 'App Secrets', position: { x: 306, y: 1080 }, data: {} },
    // 13: Search
    { iceType: 'Analytics.Search', label: 'Catalog Search', position: { x: 562, y: 1080 }, data: {} },
    // 14: Domain
    { iceType: 'Network.Domain', label: 'Domain', position: { x: 50, y: 1256 }, data: { hostname: 'market.acme.io' } },
    // 15: Repo
    {
      iceType: 'Source.Repository',
      label: 'GitHub Repo',
      position: { x: 306, y: 1256 },
      data: { repository: '', branch: 'main' },
    },
    // 16: Env
    { iceType: 'Config.Environment', label: 'Env Variables', position: { x: 562, y: 1256 }, data: {} },
  ],

  connections: [
    // Internet → WAF → Gateway (Internet→WAF, WAF→Gateway rules)
    { fromBlock: 0, toBlock: 1, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    { fromBlock: 1, toBlock: 3, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    // Internet → Marketplace App (Internet→Frontend rule)
    { fromBlock: 0, toBlock: 2, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    // Marketplace App → Gateway (Frontend→Gateway rule)
    { fromBlock: 2, toBlock: 3, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    // Gateway → Seller API (Gateway→Backend rule)
    { fromBlock: 3, toBlock: 4, relationship: 'connects_to', protocol: 'HTTP', port: 8080 },
    // Gateway → Buyer API (Gateway→Backend rule)
    { fromBlock: 3, toBlock: 5, relationship: 'connects_to', protocol: 'HTTP', port: 8081 },
    // Seller API → Catalog DB (Backend→Database rule)
    { fromBlock: 4, toBlock: 6, relationship: 'depends_on', protocol: 'TCP', port: 5432 },
    // Buyer API → Catalog DB (Backend→Database rule)
    { fromBlock: 5, toBlock: 6, relationship: 'depends_on', protocol: 'TCP', port: 5432 },
    // Seller API → Session Cache (Backend→Cache rule)
    { fromBlock: 4, toBlock: 7, relationship: 'depends_on', protocol: 'TCP', port: 6379 },
    // Buyer API → Session Cache (Backend→Cache rule)
    { fromBlock: 5, toBlock: 7, relationship: 'depends_on', protocol: 'TCP', port: 6379 },
    // Seller API → Media Storage (Backend→Storage rule)
    { fromBlock: 4, toBlock: 8, relationship: 'depends_on' },
    // Seller API → Notification Queue (Backend→Queue rule)
    { fromBlock: 4, toBlock: 9, relationship: 'connects_to' },
    // Seller API → Auth (Backend→Auth rule)
    { fromBlock: 4, toBlock: 11, relationship: 'connects_to' },
    // Buyer API → Auth (Backend→Auth rule)
    { fromBlock: 5, toBlock: 11, relationship: 'connects_to' },
    // Seller API → Secrets (Service→Secrets config rule)
    { fromBlock: 4, toBlock: 12, relationship: 'depends_on' },
    // Buyer API → Secrets (Service→Secrets config rule)
    { fromBlock: 5, toBlock: 12, relationship: 'depends_on' },
    // Buyer API → Search (Backend→Search rule)
    { fromBlock: 5, toBlock: 13, relationship: 'depends_on' },
    // Seller API → Logs (Service→Monitoring rule)
    { fromBlock: 4, toBlock: 10, relationship: 'connects_to' },
    // Buyer API → Logs (Service→Monitoring rule)
    { fromBlock: 5, toBlock: 10, relationship: 'connects_to' },
    // Domain → Marketplace App (Domain→Routable rule)
    { fromBlock: 14, toBlock: 2, relationship: 'connects_to' },
    // Repo → Seller API (Repo→Service pipeline rule)
    { fromBlock: 15, toBlock: 4, relationship: 'connects_to' },
    // Seller API → Env (Service→EnvConfig config rule)
    { fromBlock: 4, toBlock: 16, relationship: 'depends_on' },
  ],
};
