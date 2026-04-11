/**
 * RAG Chatbot Template (~$200-400/mo)
 *
 * Full-stack retrieval-augmented generation system with a chat frontend,
 * ingestion pipeline, vector search, and LLM inference.
 *
 * Architecture (deployable to AWS / GCP / Azure):
 *
 *   ┌── Public Zone ──────────────────────────────────────────────┐
 *   │  Internet ──► WAF ──► Chat UI (SSR Next.js 14)              │
 *   └─────────────────────────────────────────────────────────────┘
 *   ┌── VPC ──────────────────────────────────────────────────────────────┐
 *   │  ┌─ Public Subnet ─┐  ┌── Private Subnet ──────────────────────┐  │
 *   │  │  Gateway         │  │  RAG Service   LLM Gateway   VectorDB  │  │
 *   │  │                  │  │  PostgreSQL    Redis         DocStorage │  │
 *   │  └──────────────────┘  └────────────────────────────────────────┘  │
 *   └─────────────────────────────────────────────────────────────────────┘
 *   ┌── Ingestion ────────────────────┐  ┌── Monitoring ──┐
 *   │  SQS ──► Worker                 │  │  Logs          │
 *   └─────────────────────────────────┘  └────────────────┘
 *   Secret   Domain   Repo   Env   (ungrouped control plane)
 *
 * Layout grid (CARD 240×160, PAD 20, HEADER 36, GAP 16):
 *   Row 0: Public Zone       (3c,1r → 792×236)    at (30,30)
 *   Row 1: VPC               (1142×488)            at (30,296)
 *          ├ Public Subnet   (1c,1r → 280×236)    at (50,352)  parent→VPC
 *          └ Private Subnet  (3c,2r → 792×412)    at (360,352) parent→VPC
 *   Row 2: Ingestion         (2c,1r → 536×236)    at (30,814)
 *          Monitoring        (1c,1r → 280×236)    at (596,814)
 *   Row 3: Ungrouped         y=1080, y=1256
 */

import type { ComposedTemplate } from './types';

export const ragChatbotTemplate: ComposedTemplate = {
  id: 'rag-chatbot',
  name: 'RAG Chatbot',
  description:
    'Full-stack RAG chatbot with chat UI, retrieval API, LLM gateway, vector database, document ingestion pipeline, and conversation history.',
  icon: 'BrainCircuit',
  estimatedCost: '$200-400/mo',
  category: 'ai-ml',
  provider: 'gcp',
  providers: ['gcp', 'aws', 'azure'],
  tags: ['RAG', 'LLM', 'Vector DB', 'Next.js', 'Python', 'VPC', 'Subnet'],
  securityLevel: 'standard',
  difficulty: 'advanced',
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
    // [4] Ingestion — outside VPC
    {
      subtype: 'Messaging',
      label: 'Ingestion',
      position: { x: 30, y: 814 },
      width: 536,
      height: 236,
      blockIndices: [10, 11],
      color: '#8b5cf6',
    },
    // [5] Monitoring — outside VPC (managed service)
    {
      subtype: 'Monitoring',
      label: 'Monitoring',
      position: { x: 596, y: 814 },
      width: 280,
      height: 236,
      blockIndices: [12],
      color: '#f59e0b',
    },
  ],

  blocks: [
    // ── Public Zone (outside VPC) ─────────────────────────────────────────
    // 0: Internet
    { iceType: 'Network.PublicEndpoint', label: 'Public Traffic', position: { x: 50, y: 86 }, data: { domain: 'chat.acme.io', enableHttps: true, autoProvisionCert: true, redirectHttpToHttps: true } },
    // 1: WAF
    { iceType: 'Security.WAF', label: 'WAF', position: { x: 306, y: 86 }, data: {} },
    // 2: Chat UI
    {
      iceType: 'Compute.SSRSite',
      label: 'Chat UI',
      position: { x: 562, y: 86 },
      data: { framework: 'nextjs', domain: 'chat.acme.io' },
    },

    // ── Public Subnet (inside VPC) ────────────────────────────────────────
    // 3: Gateway
    { iceType: 'Network.Gateway', label: 'API Gateway', position: { x: 70, y: 408 }, data: { protocol: 'http' } },

    // ── Private Subnet (inside VPC) ───────────────────────────────────────
    // Row 0
    // 4: RAG Service
    {
      iceType: 'Compute.Container',
      label: 'RAG Service',
      position: { x: 380, y: 408 },
      data: { size: '2-4096', runtime: 'python3.12', domain: 'api.chat.acme.io', port: 8080 },
    },
    // 5: LLM Gateway
    { iceType: 'AI.LLMGateway', label: 'LLM Gateway', position: { x: 636, y: 408 }, data: {} },
    // 6: Vector DB
    { iceType: 'AI.VectorDB', label: 'Vector DB', position: { x: 892, y: 408 }, data: {} },
    // Row 1
    // 7: PostgreSQL
    {
      iceType: 'Database.PostgreSQL',
      label: 'Chat History DB',
      position: { x: 380, y: 584 },
      data: { size: 'db.t3.medium', storage: '50', version: '17' },
    },
    // 8: Redis Cache
    {
      iceType: 'Database.Redis',
      label: 'Response Cache',
      position: { x: 636, y: 584 },
      data: { size: 'cache.t3.medium', port: 6379 },
    },
    // 9: Doc Storage
    {
      iceType: 'Storage.Bucket',
      label: 'Doc Storage',
      position: { x: 892, y: 584 },
      data: { storage_class: 'standard' },
    },

    // ── Ingestion (outside VPC) ───────────────────────────────────────────
    // 10: Ingestion Queue
    {
      iceType: 'Messaging.SQS',
      label: 'Ingestion Queue',
      position: { x: 50, y: 870 },
      data: { queue_type: 'standard' },
    },
    // 11: Ingestion Worker
    {
      iceType: 'Compute.Worker',
      label: 'Ingestion Worker',
      position: { x: 306, y: 870 },
      data: { size: '1-2048', runtime: 'python3.12' },
    },

    // ── Monitoring (outside VPC) ──────────────────────────────────────────
    // 12: Logs
    { iceType: 'Monitoring.Log', label: 'Chat Logs', position: { x: 616, y: 870 }, data: { keep_logs: '30 days' } },

    // ── Ungrouped (control plane) ─────────────────────────────────────────
    // 13: Secret
    { iceType: 'Security.Secret', label: 'API Keys', position: { x: 50, y: 1080 }, data: {} },
    // 15: Repo
    {
      iceType: 'Source.Repository',
      label: 'GitHub Repo',
      position: { x: 562, y: 1080 },
      data: { repository: '', branch: 'main' },
    },
    // 16: Env
    { iceType: 'Config.Environment', label: 'Env Variables', position: { x: 50, y: 1256 }, data: {} },],

  connections: [
    // Internet → WAF → Gateway (Gateway→Gateway rule)
    { fromBlock: 0, toBlock: 1, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    { fromBlock: 1, toBlock: 3, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    // Internet → Chat UI (Gateway→Frontend rule)
    { fromBlock: 0, toBlock: 2, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    // Chat UI → Gateway (Frontend→Gateway rule)
    { fromBlock: 2, toBlock: 3, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    // Gateway → RAG Service (Gateway→Backend rule)
    { fromBlock: 3, toBlock: 4, relationship: 'connects_to', protocol: 'HTTP', port: 8080 },
    // RAG → AI layer (Backend→LLM, Backend→VectorDB rules)
    { fromBlock: 4, toBlock: 5, relationship: 'depends_on', protocol: 'HTTP', port: 4000 },
    { fromBlock: 4, toBlock: 6, relationship: 'depends_on', protocol: 'HTTPS', port: 443 },
    // RAG → data stores (Backend→Database, Backend→Cache rules)
    { fromBlock: 4, toBlock: 7, relationship: 'depends_on', protocol: 'TCP', port: 5432 },
    { fromBlock: 4, toBlock: 8, relationship: 'depends_on', protocol: 'TCP', port: 6379 },
    // RAG → Secrets (Service→Secrets config rule)
    { fromBlock: 4, toBlock: 13, relationship: 'depends_on' },
    // RAG → Ingestion Queue (Backend→Queue rule)
    { fromBlock: 4, toBlock: 10, relationship: 'connects_to' },
    // Ingestion pipeline (Queue→Backend rule)
    { fromBlock: 10, toBlock: 11, relationship: 'connects_to' },
    // Worker → VectorDB, DocStorage (Backend→VectorDB, Backend→Storage rules)
    { fromBlock: 11, toBlock: 6, relationship: 'depends_on', protocol: 'HTTPS', port: 443 },
    { fromBlock: 11, toBlock: 9, relationship: 'depends_on' },
    // Observability (Service→Monitoring rule)
    { fromBlock: 4, toBlock: 12, relationship: 'connects_to' },
    { fromBlock: 11, toBlock: 12, relationship: 'connects_to' },
    // Domain → Chat UI (Domain→Routable rule)
    // Repo → Service (Repo→Service pipeline rule)
    { fromBlock: 14, toBlock: 4, relationship: 'connects_to' },
    // Service → Env (Service→EnvConfig config rule)
    { fromBlock: 4, toBlock: 15, relationship: 'depends_on' },
  ],
};
