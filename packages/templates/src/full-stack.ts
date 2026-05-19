/**
 * Full-Stack Web App Template (~$60-120/mo)
 *
 * Architecture (deployable to AWS / GCP / Azure):
 *
 *   ┌── Public Zone ─────────────────────────────────────┐
 *   │  Internet ──► WAF ──► Static Site (CDN)            │
 *   └─────────────────────────────────────────────────────┘
 *   ┌── Private Network ─────────────────────────────────┐
 *   │  Gateway   API Server                              │
 *   │  PostgreSQL  Redis  Storage                        │
 *   └─────────────────────────────────────────────────────┘
 *   ┌── Monitoring ──┐
 *   │  Logs          │
 *   └────────────────┘
 *   Secrets   Repo   Env   (ungrouped control plane)
 *
 * Network design: services live inside a single `Network.PrivateNetwork`
 * block, which compiles to an auto-mode VPC on GCP (per-region /20
 * subnets created by the cloud automatically). Power users who need
 * custom CIDRs can drop down to `Network.VPC` + `Network.Subnet` on a
 * blank canvas — both still ship with their own deployers — but the
 * stock template uses the higher-level abstraction so users don't have
 * to think about subnet layout.
 */

import type { ComposedTemplate } from './types';

export const fullStackTemplate: ComposedTemplate = {
  id: 'fullstack-webapp',
  name: 'Full-Stack Web App',
  description:
    'Production-ready full-stack with CDN frontend, WAF, and a private network containing the API gateway, backend service, PostgreSQL, and Redis.',
  icon: 'Rocket',
  estimatedCost: '$60-120/mo',
  category: 'full-stack',
  provider: 'gcp',
  providers: ['gcp', 'aws', 'azure'],
  tags: ['React', 'Node.js', 'PostgreSQL', 'Redis', 'Private Network'],
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
    // [0] Public Zone — outside the private network
    {
      subtype: 'Frontend',
      label: 'Public Zone',
      position: { x: 30, y: 30 },
      width: 792,
      height: 236,
      blockIndices: [0, 1, 2],
      color: '#ef4444',
    },
    // [1] Private Network — single block; auto-mode VPC on GCP. Holds
    // all backend services (gateway, app servers, databases, storage).
    // Replaces the older VPC + Public Subnet + Private Subnet trio so
    // users don't have to think about subnet layout.
    {
      subtype: 'Custom',
      iceType: 'Network.PrivateNetwork',
      label: 'Private Network',
      position: { x: 30, y: 296 },
      width: 886,
      height: 488,
      blockIndices: [3, 4, 5, 6, 7],
      color: '#6366f1',
    },
    // [2] Monitoring — outside the private network (managed service)
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
    {
      iceType: 'Network.PublicEndpoint',
      label: 'Public Traffic',
      position: { x: 50, y: 86 },
      data: { domain: 'app.acme.io', enableHttps: true, autoProvisionCert: true, redirectHttpToHttps: true },
    },
    // 1: WAF
    { iceType: 'Security.WAF', label: 'WAF', position: { x: 306, y: 86 }, data: {} },
    // 2: Static Site (CDN)
    {
      iceType: 'Compute.StaticSite',
      label: 'Web App',
      position: { x: 562, y: 86 },
      data: { framework: 'react', domain: 'app.acme.io' },
    },

    // ── Private Network (auto-mode VPC) ───────────────────────────────────
    // 3: Gateway — protocol comes from the per-provider blueprint default
    { iceType: 'Network.Gateway', label: 'API Gateway', position: { x: 70, y: 408 }, data: {} },

    // 4: Node.js Service — size comes from the per-provider blueprint default
    {
      iceType: 'Compute.Container',
      label: 'API Server',
      position: { x: 380, y: 408 },
      data: { runtime: 'nodejs20', domain: 'api.acme.io', port: 8080 },
    },
    // 5: PostgreSQL — size comes from the per-provider blueprint default
    {
      iceType: 'Database.PostgreSQL',
      label: 'App Database',
      position: { x: 636, y: 408 },
      data: { storage: '50', version: '17' },
    },
    // 6: Redis — size comes from the per-provider blueprint default
    {
      iceType: 'Database.Redis',
      label: 'Session Cache',
      position: { x: 380, y: 584 },
      data: { port: 6379 },
    },
    // 7: Storage — storage_class comes from the per-provider blueprint default
    {
      iceType: 'Storage.Bucket',
      label: 'File Storage',
      position: { x: 636, y: 584 },
      data: {},
    },

    // ── Monitoring (outside the private network) ──────────────────────────
    // 8: Logs
    { iceType: 'Monitoring.Log', label: 'App Logs', position: { x: 50, y: 870 }, data: { keep_logs: '30 days' } },

    // ── Ungrouped (control plane) ─────────────────────────────────────────
    // 9: Secrets
    { iceType: 'Security.Secret', label: 'App Secrets', position: { x: 50, y: 1080 }, data: {} },
    // 10: Frontend repo — feeds Static Site. Default points at a minimal
    // HTML test repo; replace via the RepoSelector for your own.
    {
      iceType: 'Source.Repository',
      label: 'Frontend Repo',
      position: { x: 562, y: 1080 },
      data: { repository: 'light-cloud-com/ice-test-hello-static', branch: 'main' },
    },
    // 11: Env
    { iceType: 'Config.Environment', label: 'Env Variables', position: { x: 50, y: 1256 }, data: {} },
    // 12: Backend repo — feeds API Server. Default points at the existing
    // Node.js test repo in the light-cloud-com org; the API Server's
    // Cloud Build can't compile hello-static (HTML only), so backends
    // need their own Node.js source.
    {
      iceType: 'Source.Repository',
      label: 'Backend Repo',
      position: { x: 818, y: 1080 },
      data: { repository: 'light-cloud-com/ice-test-hello-api', branch: 'main' },
    },
  ],

  connections: [
    // Internet → WAF → Gateway (Gateway→Gateway rule)
    { fromBlock: 0, toBlock: 1, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    { fromBlock: 1, toBlock: 3, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    // Static Site is publicly reachable on its own — Firebase Hosting
    // (GCP), AWS Amplify, and Azure Static Web Apps all include HTTPS,
    // CDN, and custom domain. The `domain` field on the StaticSite
    // block does the wiring; no Public Endpoint edge needed.
    // Gateway → Service (Gateway→Backend rule)
    { fromBlock: 3, toBlock: 4, relationship: 'connects_to', protocol: 'HTTP', port: 8080 },
    // Service → Data (Backend→Database, Backend→Cache, Backend→Storage rules)
    { fromBlock: 4, toBlock: 5, relationship: 'depends_on', protocol: 'TCP', port: 5432 },
    { fromBlock: 4, toBlock: 6, relationship: 'depends_on', protocol: 'TCP', port: 6379 },
    { fromBlock: 4, toBlock: 7, relationship: 'depends_on' },
    // Service → Secrets (Service→Secrets config rule)
    { fromBlock: 4, toBlock: 9, relationship: 'depends_on' },
    // Service → Logs (Service→Monitoring rule)
    { fromBlock: 4, toBlock: 8, relationship: 'connects_to' },
    // Domain → Static Site (Domain→Routable rule)
    // Frontend Repo → Static Site (Repo→Service pipeline rule)
    { fromBlock: 10, toBlock: 2, relationship: 'connects_to' },
    // Backend Repo → API Server (Repo→Service pipeline rule). Separate
    // from frontend so Cloud Build compiles a Node.js project, not HTML.
    { fromBlock: 12, toBlock: 4, relationship: 'connects_to' },
    // Service → Env (Service→EnvConfig config rule)
    { fromBlock: 4, toBlock: 11, relationship: 'depends_on' },
  ],
};
