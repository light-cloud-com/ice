/**
 * RAG Chatbot Template (~$200-400/mo)
 *
 * Full-stack retrieval-augmented generation system with a chat frontend,
 * ingestion pipeline, vector search, and LLM inference.
 *
 * Architecture:
 *   Public Traffic → SSR Site (chat UI)
 *   Public Traffic → Gateway → RAG API Service
 *   RAG API → LLM Gateway (completions), Vector DB (retrieval), PostgreSQL (conversations), Cache (sessions)
 *   SQS → Ingestion Worker → Vector DB, Storage (documents)
 *   All services → Logs
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
  tags: ['RAG', 'LLM', 'Vector DB', 'Next.js', 'Python'],
  securityLevel: 'standard',
  environmentPresets: [
    { type: 'production', name: 'Production', region: 'us-east-1', securityLevel: 'standard' },
    { type: 'staging', name: 'Staging', region: 'us-east-1', securityLevel: 'basic' },
  ],

  groups: [
    {
      subtype: 'Frontend',
      label: 'Chat Frontend',
      position: { x: 30, y: 30 },
      width: 540,
      height: 170,
      blockIndices: [0, 1],
      color: '#3b82f6',
    },
    {
      subtype: 'Services',
      label: 'RAG API',
      position: { x: 30, y: 230 },
      width: 540,
      height: 170,
      blockIndices: [2, 3],
      color: '#22c55e',
    },
    {
      subtype: 'AI',
      label: 'AI Layer',
      position: { x: 610, y: 30 },
      width: 300,
      height: 370,
      blockIndices: [4, 5],
      color: '#a855f7',
    },
    {
      subtype: 'Data',
      label: 'Data',
      position: { x: 950, y: 30 },
      width: 300,
      height: 370,
      blockIndices: [6, 7, 8],
      color: '#f59e0b',
    },
    {
      subtype: 'Messaging',
      label: 'Document Ingestion',
      position: { x: 30, y: 430 },
      width: 540,
      height: 170,
      blockIndices: [9, 10],
      color: '#8b5cf6',
    },
    {
      subtype: 'Monitoring',
      label: 'Monitoring',
      position: { x: 610, y: 430 },
      width: 300,
      height: 170,
      blockIndices: [11],
      color: '#ef4444',
    },
  ],

  blocks: [
    // 0-1: Chat frontend
    { blockType: 'public-traffic', label: 'Public Traffic', position: { x: 60, y: 60 } },
    {
      blockType: 'ssr-site',
      label: 'Chat UI',
      position: { x: 310, y: 60 },
      data: { domain: 'chat.acme.io', runtime: 'Next.js 14' },
    },

    // 2-3: RAG API
    { blockType: 'gateway', label: 'Gateway', position: { x: 60, y: 260 } },
    {
      blockType: 'scalable-backend',
      label: 'RAG Service',
      position: { x: 310, y: 260 },
      data: { runtime: 'Python 3.12', domain: 'api.chat.acme.io', port: 8080 },
    },

    // 4-5: AI layer
    { blockType: 'llm-gateway', label: 'LLM Gateway', position: { x: 640, y: 60 } },
    { blockType: 'vector-db', label: 'Vector DB', position: { x: 640, y: 220 } },

    // 6-8: Data stores
    {
      blockType: 'postgresql',
      label: 'PostgreSQL',
      position: { x: 980, y: 60 },
      data: { size: 'db.t3.medium', storage: '50 GB' },
    },
    { blockType: 'redis-cache', label: 'Cache', position: { x: 980, y: 220 } },
    { blockType: 'storage', label: 'Document Storage', position: { x: 980, y: 300 } },

    // 9-10: Ingestion pipeline
    { blockType: 'sqs', label: 'Ingestion Queue', position: { x: 60, y: 460 } },
    {
      blockType: 'worker',
      label: 'Ingestion Worker',
      position: { x: 310, y: 460 },
      data: { runtime: 'Python 3.11' },
    },

    // 11: Monitoring
    { blockType: 'logs', label: 'Logs', position: { x: 640, y: 460 } },
  ],

  connections: [
    // Public Traffic → Chat UI + Gateway
    { fromBlock: 0, toBlock: 1, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    { fromBlock: 0, toBlock: 2, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },

    // Gateway → RAG API
    { fromBlock: 2, toBlock: 3, relationship: 'connects_to', protocol: 'HTTP', port: 8080 },

    // Chat UI calls RAG API via Gateway
    { fromBlock: 1, toBlock: 2, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },

    // RAG API → AI layer
    { fromBlock: 3, toBlock: 4, relationship: 'depends_on', protocol: 'HTTP', port: 4000 },
    { fromBlock: 3, toBlock: 5, relationship: 'depends_on', protocol: 'HTTPS', port: 443 },

    // RAG API → data stores
    { fromBlock: 3, toBlock: 6, relationship: 'depends_on', protocol: 'TCP', port: 5432 },
    { fromBlock: 3, toBlock: 7, relationship: 'depends_on', protocol: 'TCP', port: 6379 },

    // RAG API pushes document upload jobs to ingestion queue
    { fromBlock: 3, toBlock: 9, relationship: 'connects_to' },
    // Ingestion pipeline: SQS → Worker → Vector DB + Storage
    { fromBlock: 9, toBlock: 10, relationship: 'connects_to' },
    { fromBlock: 10, toBlock: 5, relationship: 'depends_on', protocol: 'HTTPS', port: 443 },
    { fromBlock: 10, toBlock: 8, relationship: 'depends_on' },

    // Observability
    { fromBlock: 3, toBlock: 11, relationship: 'connects_to' },
    { fromBlock: 10, toBlock: 11, relationship: 'connects_to' },
  ],
};
