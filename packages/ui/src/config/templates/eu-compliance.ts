/**
 * EU Compliance Stack Template (~$120-250/mo)
 *
 * GDPR-aware infrastructure: gateway, backend service,
 * encrypted database + storage, Redis for sessions, secrets,
 * auth, and audit logging. All resources EU-region pinned.
 *
 * Architecture:
 *   Public Traffic → Gateway → API Service → PostgreSQL, Storage, Cache
 *   API Service → Auth, Secrets
 *   API Service, PostgreSQL, Storage → Logs (audit trail)
 */

import type { ComposedTemplate } from './types';

export const euComplianceTemplate: ComposedTemplate = {
  id: 'eu-compliance',
  name: 'EU Compliance Stack',
  description:
    'GDPR-compliant infrastructure with gateway, encrypted database & storage, Redis sessions, secrets, auth, and audit logging. EU-region pinned.',
  icon: 'ShieldCheck',
  estimatedCost: '$120-250/mo',
  category: 'compliance',
  provider: 'gcp',
  tags: ['GDPR', 'Encryption', 'EU-only', 'Audit Logs'],
  securityLevel: 'compliance',
  environmentPresets: [
    { type: 'production', name: 'Production', region: 'eu-west-1', securityLevel: 'compliance' },
    { type: 'staging', name: 'Staging', region: 'eu-west-1', securityLevel: 'strict' },
  ],

  groups: [
    {
      subtype: 'Services',
      label: 'Application',
      position: { x: 30, y: 30 },
      width: 800,
      height: 170,
      blockIndices: [0, 1, 2],
      color: '#22c55e',
    },
    {
      subtype: 'Data',
      label: 'Encrypted Data (EU)',
      position: { x: 30, y: 230 },
      width: 540,
      height: 310,
      blockIndices: [3, 4, 5],
      color: '#f59e0b',
    },
    {
      subtype: 'External',
      label: 'Security & Compliance',
      position: { x: 610, y: 30 },
      width: 300,
      height: 510,
      blockIndices: [6, 7, 8],
      color: '#ef4444',
    },
  ],

  blocks: [
    // 0-2: Application layer (with public traffic entry)
    { iceType: 'Network.Internet', label: 'Public Traffic', position: { x: 60, y: 60 } },
    { iceType: 'Network.Gateway', label: 'Gateway', position: { x: 310, y: 60 } },
    {
      iceType: 'Compute.Container',
      label: 'Node.js Service',
      position: { x: 560, y: 60 },
      data: { domain: 'app.eu.acme.io', runtime: 'Node.js 20', port: 8080 },
    },

    // 3-5: Encrypted data (EU-pinned)
    {
      iceType: 'Database.PostgreSQL',
      label: 'PostgreSQL',
      position: { x: 60, y: 260 },
      data: { size: 'db.r6g.large', storage: '100 GB' },
    },
    { iceType: 'Storage.Bucket', label: 'Storage', position: { x: 310, y: 260 } },
    { iceType: 'Database.Redis', label: 'Cache', position: { x: 60, y: 400 } },

    // 6-8: Security & compliance
    { iceType: 'Security.Identity', label: 'Auth', position: { x: 640, y: 60 } },
    { iceType: 'Security.Secret', label: 'Secrets', position: { x: 640, y: 210 } },
    { iceType: 'Monitoring.Log', label: 'Logs', position: { x: 640, y: 370 } },
  ],

  connections: [
    // Public Traffic → Gateway → App
    { fromBlock: 0, toBlock: 1, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    { fromBlock: 1, toBlock: 2, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    // App → data stores
    { fromBlock: 2, toBlock: 3, relationship: 'depends_on', protocol: 'TCP', port: 5432 },
    { fromBlock: 2, toBlock: 4, relationship: 'depends_on' },
    // App → sessions
    { fromBlock: 2, toBlock: 5, relationship: 'depends_on', protocol: 'TCP', port: 6379 },
    // App → security services
    { fromBlock: 2, toBlock: 6, relationship: 'depends_on' },
    { fromBlock: 2, toBlock: 7, relationship: 'depends_on' },
    // Audit trail (app, DB, storage all log)
    { fromBlock: 2, toBlock: 8, relationship: 'connects_to' },
    { fromBlock: 3, toBlock: 8, relationship: 'connects_to' },
    { fromBlock: 4, toBlock: 8, relationship: 'connects_to' },
  ],
};
