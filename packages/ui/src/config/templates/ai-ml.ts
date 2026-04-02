/**
 * AI/ML Workbench Template (~$200-500/mo)
 *
 * ML inference API with training pipeline, model storage, feature store,
 * pipeline queue, and monitoring.
 *
 * Architecture:
 *   Public Traffic → Gateway → Inference API → Storage (models), PostgreSQL (metadata), Cache (features)
 *   SQS → Training Worker → Storage (training data), Storage (models)
 *   All services → Logs
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
  tags: ['ML Pipeline', 'Python', 'Workers', 'Storage', 'SQS'],
  securityLevel: 'standard',
  environmentPresets: [
    { type: 'production', name: 'Production', region: 'us-east-1', securityLevel: 'standard' },
    { type: 'staging', name: 'Staging', region: 'us-east-1', securityLevel: 'basic' },
  ],

  groups: [
    {
      subtype: 'Services',
      label: 'Inference',
      position: { x: 30, y: 30 },
      width: 800,
      height: 170,
      blockIndices: [0, 1, 2],
      color: '#22c55e',
    },
    {
      subtype: 'Data',
      label: 'Data & Models',
      position: { x: 870, y: 30 },
      width: 300,
      height: 500,
      blockIndices: [4, 5, 6],
      color: '#f59e0b',
    },
    {
      subtype: 'Messaging',
      label: 'Training Pipeline',
      position: { x: 30, y: 230 },
      width: 800,
      height: 170,
      blockIndices: [7, 3],
      color: '#8b5cf6',
    },
    {
      subtype: 'Monitoring',
      label: 'Monitoring',
      position: { x: 30, y: 430 },
      width: 540,
      height: 170,
      blockIndices: [8, 9],
      color: '#ef4444',
    },
  ],

  blocks: [
    // 0-2: Inference API (with public traffic entry)
    { iceType: 'Network.Internet', label: 'Public Traffic', position: { x: 60, y: 60 } },
    { iceType: 'Network.Gateway', label: 'Gateway', position: { x: 310, y: 60 } },
    {
      iceType: 'Compute.Container',
      label: 'Inference Service',
      position: { x: 560, y: 60 },
      data: { runtime: 'Python 3.12', domain: 'ml-api.acme.io', port: 8080 },
    },

    // 3: Training worker
    {
      iceType: 'Compute.Worker',
      label: 'Training Worker',
      position: { x: 560, y: 260 },
      data: { runtime: 'Python 3.11' },
    },

    // 4-6: Data stores
    { iceType: 'Database.PostgreSQL', label: 'PostgreSQL', position: { x: 900, y: 60 } },
    { iceType: 'Storage.Bucket', label: 'Model Storage', position: { x: 900, y: 210 } },
    { iceType: 'Storage.Bucket', label: 'Training Data Storage', position: { x: 900, y: 360 } },

    // 7: Pipeline trigger
    { iceType: 'Messaging.SQS', label: 'SQS', position: { x: 60, y: 260 } },

    // 8-9: Cache + monitoring
    { iceType: 'Database.Redis', label: 'Cache', position: { x: 60, y: 460 } },
    { iceType: 'Monitoring.Log', label: 'Logs', position: { x: 310, y: 460 } },
  ],

  connections: [
    // Public Traffic → Gateway → ML API
    { fromBlock: 0, toBlock: 1, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    { fromBlock: 1, toBlock: 2, relationship: 'connects_to', protocol: 'HTTP', port: 8080 },
    // ML API → data stores
    { fromBlock: 2, toBlock: 4, relationship: 'depends_on', protocol: 'TCP', port: 5432 },
    { fromBlock: 2, toBlock: 5, relationship: 'depends_on' },
    // ML API → cache (feature store / inference cache)
    { fromBlock: 2, toBlock: 8, relationship: 'depends_on', protocol: 'TCP', port: 6379 },
    // SQS triggers training
    { fromBlock: 7, toBlock: 3, relationship: 'connects_to' },
    // Training worker → data
    { fromBlock: 3, toBlock: 5, relationship: 'depends_on' },
    { fromBlock: 3, toBlock: 6, relationship: 'depends_on' },
    // Observability
    { fromBlock: 2, toBlock: 9, relationship: 'connects_to' },
    { fromBlock: 3, toBlock: 9, relationship: 'connects_to' },
  ],
};
