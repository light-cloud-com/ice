/**
 * Healthcare Templates
 *
 * HIPAA-compliant infrastructure for patient data,
 * clinical systems, and telemedicine platforms.
 *
 * ============================================================================
 * Patient Portal (~$200-400/mo)
 * ============================================================================
 *
 * Architecture (deployable to AWS / GCP / Azure):
 *
 *   ┌── Public Zone ────────────────────────────────┐
 *   │  Internet ──► WAF                              │
 *   └────────────────────────────────────────────────┘
 *   ┌── VPC ──────────────────────────────────────────────────────────────┐
 *   │  ┌─ Public Subnet ─┐  ┌── Private Subnet ──────────────────────┐  │
 *   │  │  Gateway         │  │  Patient API   Records DB   Redis      │  │
 *   │  │                  │  │  Doc Storage   Scheduler               │  │
 *   │  └──────────────────┘  └────────────────────────────────────────┘  │
 *   └─────────────────────────────────────────────────────────────────────┘
 *   ┌── Security Controls ──────────────────────────────┐  ┌─ Monitoring ─┐
 *   │  Auth     Secrets     Certificate                  │  │  Audit Log   │
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
 * Telemedicine Platform (~$300-600/mo)
 * ============================================================================
 *
 *   ┌── Public Zone ────────────────────────────────┐
 *   │  Internet ──► WAF                              │
 *   └────────────────────────────────────────────────┘
 *   ┌── VPC ──────────────────────────────────────────────────────────────┐
 *   │  ┌─ Public Subnet ─┐  ┌── Private Subnet ──────────────────────┐  │
 *   │  │  Gateway         │  │  Video Svc   Patient DB   Redis        │  │
 *   │  │                  │  │  Recordings  Notif Worker              │  │
 *   │  └──────────────────┘  └────────────────────────────────────────┘  │
 *   └─────────────────────────────────────────────────────────────────────┘
 *   ┌─ Monitoring ─┐
 *   │  Audit Log   │
 *   └──────────────┘
 *   Auth   Secrets   Domain   Repo   Env   (ungrouped control plane)
 *
 * Layout grid (CARD 240x160, PAD 20, HEADER 36, GAP 16):
 *   Row 0: Public Zone           (2c,1r -> 536x236)    at (30,30)
 *   Row 1: VPC                   (1142x488)             at (30,296)
 *          |- Public Subnet      (1c,1r -> 280x236)    at (50,352)  parent->VPC
 *          +- Private Subnet     (3c,2r -> 792x412)    at (360,352) parent->VPC
 *   Row 2: Monitoring            (1c,1r -> 280x236)    at (30,814)
 *   Row 3: Ungrouped             y=1080
 */

import type { ComposedTemplate } from './types';

// =============================================================================
// Patient Portal
// =============================================================================

export const healthcarePatientPortalTemplate: ComposedTemplate = {
  id: 'healthcare-patient-portal',
  name: 'Patient Portal',
  description:
    'HIPAA-compliant patient records, scheduling, and document management with network isolation, WAF, and audit logging.',
  icon: 'Heart',
  estimatedCost: '$200-400/mo',
  category: 'healthcare',
  provider: 'gcp',
  providers: ['gcp', 'aws', 'azure'],
  tags: ['HIPAA', 'patient', 'EHR', 'healthcare', 'VPC', 'Subnet'],
  securityLevel: 'strict',
  difficulty: 'intermediate',
  trust: 'official',
  compliance: ['hipaa'],
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
    // 3: Patient API
    {
      iceType: 'Compute.Container',
      label: 'Patient API',
      position: { x: 380, y: 408 },
      data: { size: '2-4096', runtime: 'nodejs20', port: 8080 },
    },
    // 4: Patient Records DB
    {
      iceType: 'Database.PostgreSQL',
      label: 'Patient Records DB',
      position: { x: 636, y: 408 },
      data: { size: 'db.r6g.large', storage: '100', version: '17' },
    },
    // 5: Redis Sessions
    {
      iceType: 'Database.Redis',
      label: 'Redis Sessions',
      position: { x: 892, y: 408 },
      data: { size: 'cache.r6g.large', port: 6379 },
    },
    // Row 1
    // 6: Document Storage
    {
      iceType: 'Storage.Bucket',
      label: 'Document Storage',
      position: { x: 380, y: 584 },
      data: { storage_class: 'standard' },
    },
    // 7: Appointment Scheduler
    {
      iceType: 'Compute.CronJob',
      label: 'Appointment Scheduler',
      position: { x: 636, y: 584 },
      data: { size: '0.5-1024', runtime: 'nodejs20', frequency: 'Every day at midnight' },
    },

    // ── Security Controls (outside VPC) ───────────────────────────────────
    // 8: Auth
    { iceType: 'Security.Identity', label: 'Auth', position: { x: 50, y: 870 }, data: {} },
    // 9: Secrets
    { iceType: 'Security.Secret', label: 'Secrets', position: { x: 306, y: 870 }, data: {} },
    // 10: Certificate
    { iceType: 'Security.Certificate', label: 'TLS Certificate', position: { x: 562, y: 870 }, data: {} },

    // ── Monitoring (outside VPC) ──────────────────────────────────────────
    // 11: Audit Log
    { iceType: 'Monitoring.Log', label: 'Audit Log', position: { x: 872, y: 870 }, data: { keep_logs: '90 days' } },

    // ── Ungrouped (control plane) ─────────────────────────────────────────
    // 12: Domain
    {
      iceType: 'Network.Domain',
      label: 'Domain',
      position: { x: 50, y: 1080 },
      data: { hostname: 'portal.health.io' },
    },
    // 13: Repo
    {
      iceType: 'Source.Repository',
      label: 'GitHub Repo',
      position: { x: 306, y: 1080 },
      data: { repository: '', branch: 'main' },
    },
    // 14: Env
    { iceType: 'Config.Environment', label: 'Env Variables', position: { x: 562, y: 1080 }, data: {} },
  ],

  connections: [
    // Internet → WAF → Gateway
    { fromBlock: 0, toBlock: 1, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    { fromBlock: 1, toBlock: 2, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    // Gateway → Patient API (Gateway→Backend rule)
    { fromBlock: 2, toBlock: 3, relationship: 'connects_to', protocol: 'HTTP', port: 8080 },
    // Patient API → data stores (Backend→Database, Backend→Cache, Backend→Storage rules)
    { fromBlock: 3, toBlock: 4, relationship: 'depends_on', protocol: 'TCP', port: 5432 },
    { fromBlock: 3, toBlock: 5, relationship: 'depends_on', protocol: 'TCP', port: 6379 },
    { fromBlock: 3, toBlock: 6, relationship: 'depends_on' },
    // Patient API → security (Backend→Auth, Service→Secrets, Service→Certificate rules)
    { fromBlock: 3, toBlock: 8, relationship: 'connects_to' },
    { fromBlock: 3, toBlock: 9, relationship: 'depends_on' },
    { fromBlock: 3, toBlock: 10, relationship: 'depends_on' },
    // Patient API → Audit Log (Service→Monitoring rule)
    { fromBlock: 3, toBlock: 11, relationship: 'connects_to' },
    // Scheduler → Records DB (CronJob→Database rule)
    { fromBlock: 7, toBlock: 4, relationship: 'depends_on', protocol: 'TCP', port: 5432 },
    // Domain → Gateway (Domain→Routable rule)
    { fromBlock: 12, toBlock: 2, relationship: 'connects_to' },
    // Repo → Patient API (Repo→Service pipeline rule)
    { fromBlock: 13, toBlock: 3, relationship: 'connects_to' },
    // Patient API → Env (Service→EnvConfig config rule)
    { fromBlock: 3, toBlock: 14, relationship: 'depends_on' },
  ],
};

// =============================================================================
// Telemedicine Platform
// =============================================================================

export const healthcareTelemedicineTemplate: ComposedTemplate = {
  id: 'healthcare-telemedicine',
  name: 'Telemedicine Platform',
  description:
    'Real-time video consultations with session recording, patient management, WAF protection, and HIPAA-compliant network isolation.',
  icon: 'Video',
  estimatedCost: '$300-600/mo',
  category: 'healthcare',
  provider: 'gcp',
  providers: ['gcp', 'aws', 'azure'],
  tags: ['telemedicine', 'video', 'HIPAA', 'real-time', 'VPC', 'Subnet'],
  securityLevel: 'strict',
  difficulty: 'advanced',
  trust: 'official',
  compliance: ['hipaa'],
  author: { name: 'ICE Team' },
  environmentPresets: [{ type: 'production', name: 'Production', region: 'us-central1', securityLevel: 'strict' }],

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
    // [4] Monitoring — outside VPC
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
    { iceType: 'Network.Internet', label: 'Public Traffic', position: { x: 50, y: 86 }, data: {} },
    // 1: WAF
    { iceType: 'Security.WAF', label: 'WAF', position: { x: 306, y: 86 }, data: {} },

    // ── Public Subnet (inside VPC) ────────────────────────────────────────
    // 2: Gateway
    { iceType: 'Network.Gateway', label: 'API Gateway', position: { x: 70, y: 408 }, data: { protocol: 'http' } },

    // ── Private Subnet (inside VPC) ───────────────────────────────────────
    // Row 0
    // 3: Video Service
    {
      iceType: 'Compute.Container',
      label: 'Video Service',
      position: { x: 380, y: 408 },
      data: { size: '2-4096', runtime: 'nodejs20', port: 8080 },
    },
    // 4: Patient DB
    {
      iceType: 'Database.PostgreSQL',
      label: 'Patient DB',
      position: { x: 636, y: 408 },
      data: { size: 'db.r6g.large', storage: '100', version: '17' },
    },
    // 5: Redis Sessions
    {
      iceType: 'Database.Redis',
      label: 'Redis Sessions',
      position: { x: 892, y: 408 },
      data: { size: 'cache.r6g.large', port: 6379 },
    },
    // Row 1
    // 6: Recording Storage
    {
      iceType: 'Storage.Bucket',
      label: 'Recording Storage',
      position: { x: 380, y: 584 },
      data: { storage_class: 'standard' },
    },
    // 7: Notification Worker
    {
      iceType: 'Compute.Worker',
      label: 'Notification Worker',
      position: { x: 636, y: 584 },
      data: { size: '1-2048', runtime: 'nodejs20' },
    },

    // ── Monitoring (outside VPC) ──────────────────────────────────────────
    // 8: Audit Log
    { iceType: 'Monitoring.Log', label: 'Audit Log', position: { x: 50, y: 870 }, data: { keep_logs: '90 days' } },

    // ── Ungrouped (control plane) ─────────────────────────────────────────
    // 9: Auth
    { iceType: 'Security.Identity', label: 'Auth', position: { x: 50, y: 1080 }, data: {} },
    // 10: Secrets
    { iceType: 'Security.Secret', label: 'Secrets', position: { x: 306, y: 1080 }, data: {} },
    // 11: Domain
    {
      iceType: 'Network.Domain',
      label: 'Domain',
      position: { x: 562, y: 1080 },
      data: { hostname: 'telehealth.care.io' },
    },
    // 12: Repo
    {
      iceType: 'Source.Repository',
      label: 'GitHub Repo',
      position: { x: 50, y: 1256 },
      data: { repository: '', branch: 'main' },
    },
    // 13: Env
    { iceType: 'Config.Environment', label: 'Env Variables', position: { x: 306, y: 1256 }, data: {} },
  ],

  connections: [
    // Internet → WAF → Gateway
    { fromBlock: 0, toBlock: 1, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    { fromBlock: 1, toBlock: 2, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    // Gateway → Video Service (Gateway→Backend rule)
    { fromBlock: 2, toBlock: 3, relationship: 'connects_to', protocol: 'HTTP', port: 8080 },
    // Video Service → data stores (Backend→Database, Backend→Cache, Backend→Storage rules)
    { fromBlock: 3, toBlock: 4, relationship: 'depends_on', protocol: 'TCP', port: 5432 },
    { fromBlock: 3, toBlock: 5, relationship: 'depends_on', protocol: 'TCP', port: 6379 },
    { fromBlock: 3, toBlock: 6, relationship: 'depends_on' },
    // Video Service → security (Backend→Auth, Service→Secrets rules)
    { fromBlock: 3, toBlock: 9, relationship: 'connects_to' },
    { fromBlock: 3, toBlock: 10, relationship: 'depends_on' },
    // Video Service → Audit Log (Service→Monitoring rule)
    { fromBlock: 3, toBlock: 8, relationship: 'connects_to' },
    // Notification Worker → Patient DB (Worker→Database rule)
    { fromBlock: 7, toBlock: 4, relationship: 'depends_on', protocol: 'TCP', port: 5432 },
    // Domain → Gateway (Domain→Routable rule)
    { fromBlock: 11, toBlock: 2, relationship: 'connects_to' },
    // Repo → Video Service (Repo→Service pipeline rule)
    { fromBlock: 12, toBlock: 3, relationship: 'connects_to' },
    // Video Service → Env (Service→EnvConfig config rule)
    { fromBlock: 3, toBlock: 13, relationship: 'depends_on' },
  ],
};
