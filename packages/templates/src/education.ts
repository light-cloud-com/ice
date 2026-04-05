/**
 * Education Templates
 *
 * Learning management systems, course delivery,
 * and assessment platforms.
 *
 * ============================================================================
 * Learning Management System (~$100-250/mo)
 * ============================================================================
 *
 * Architecture (deployable to AWS / GCP / Azure):
 *
 *   ┌── Public Zone ──────────────────────────────────────────────┐
 *   │  Internet ──► WAF ──► Student Portal (SSR Next.js)          │
 *   └─────────────────────────────────────────────────────────────┘
 *   ┌── VPC ──────────────────────────────────────────────────────────────┐
 *   │  ┌─ Public Subnet ─┐  ┌── Private Subnet ──────────────────────┐  │
 *   │  │  Gateway         │  │  Course API   Course DB   Session $    │  │
 *   │  │                  │  │  Course Store Notif Worker              │  │
 *   │  └──────────────────┘  └────────────────────────────────────────┘  │
 *   └─────────────────────────────────────────────────────────────────────┘
 *   ┌── Monitoring ──┐
 *   │  LMS Logs      │
 *   └────────────────┘
 *   Auth   Secrets   Search   (ungrouped control plane)
 *   Domain   Repo   Env
 *
 * Layout grid (CARD 240x160, PAD 20, HEADER 36, GAP 16):
 *   Row 0: Public Zone           (3c,1r -> 792x236)    at (30,30)
 *   Row 1: VPC                   (1142x488)             at (30,296)
 *          |- Public Subnet      (1c,1r -> 280x236)    at (50,352)  parent->VPC
 *          +- Private Subnet     (3c,2r -> 792x412)    at (360,352) parent->VPC
 *   Row 2: Monitoring            (1c,1r -> 280x236)    at (30,814)
 *   Row 3: Ungrouped             y=1080, y=1256
 *
 * ============================================================================
 * Exam Platform (~$80-200/mo)
 * ============================================================================
 *
 *   ┌── Public Zone ──────────────────────────────────────────────┐
 *   │  Internet ──► WAF ──► Exam App (SSR Next.js)                │
 *   └─────────────────────────────────────────────────────────────┘
 *   ┌── VPC ────────────────────────────────────────────────────┐
 *   │  ┌─ Public Subnet ─┐  ┌── Private Subnet ─────────────┐  │
 *   │  │  Gateway         │  │  Exam API      Question DB     │  │
 *   │  │                  │  │  Answer Cache   Grade Queue     │  │
 *   │  └──────────────────┘  └────────────────────────────────┘  │
 *   └───────────────────────────────────────────────────────────┘
 *   ┌── Monitoring ──┐
 *   │  Exam Logs     │
 *   └────────────────┘
 *   Auth   Secrets   Grade Worker   (ungrouped control plane)
 *   Domain   Repo   Env
 *
 * Layout grid (CARD 240x160, PAD 20, HEADER 36, GAP 16):
 *   Row 0: Public Zone           (3c,1r -> 792x236)    at (30,30)
 *   Row 1: VPC                   (886x488)              at (30,296)
 *          |- Public Subnet      (1c,1r -> 280x236)    at (50,352)  parent->VPC
 *          +- Private Subnet     (2c,2r -> 536x412)    at (360,352) parent->VPC
 *   Row 2: Monitoring            (1c,1r -> 280x236)    at (30,814)
 *   Row 3: Ungrouped             y=1080, y=1256
 */

import type { ComposedTemplate } from './types';

// =============================================================================
// Learning Management System
// =============================================================================

export const educationLmsTemplate: ComposedTemplate = {
  id: 'education-lms',
  name: 'Learning Management System',
  description:
    'Course delivery platform with student portal, content search, notifications, and VPC network isolation.',
  icon: 'GraduationCap',
  estimatedCost: '$100-250/mo',
  category: 'education',
  provider: 'gcp',
  providers: ['gcp', 'aws', 'azure'],
  tags: ['LMS', 'courses', 'students', 'e-learning', 'VPC', 'Subnet'],
  securityLevel: 'standard',
  difficulty: 'intermediate',
  trust: 'official',
  author: { name: 'ICE Team' },
  environmentPresets: [
    { type: 'production', name: 'Production', region: 'us-central1', securityLevel: 'standard' },
    { type: 'staging', name: 'Staging', region: 'us-central1', securityLevel: 'basic' },
  ],

  groups: [
    // [0] Public Zone — outside VPC (3c with Student Portal)
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
    // 2: Student Portal (SSR)
    {
      iceType: 'Compute.SSRSite',
      label: 'Student Portal',
      position: { x: 562, y: 86 },
      data: { framework: 'nextjs', domain: 'learn.acme.io' },
    },

    // ── Public Subnet (inside VPC) ────────────────────────────────────────
    // 3: Gateway
    { iceType: 'Network.Gateway', label: 'API Gateway', position: { x: 70, y: 408 }, data: { protocol: 'http' } },

    // ── Private Subnet (inside VPC) ───────────────────────────────────────
    // Row 0
    // 4: Course API
    {
      iceType: 'Compute.Container',
      label: 'Course API',
      position: { x: 380, y: 408 },
      data: { size: '1-2048', runtime: 'nodejs20', port: 8080 },
    },
    // 5: Course DB
    {
      iceType: 'Database.PostgreSQL',
      label: 'Course DB',
      position: { x: 636, y: 408 },
      data: { size: 'db.t3.small', storage: '50', version: '17' },
    },
    // 6: Session Cache
    {
      iceType: 'Database.Redis',
      label: 'Session Cache',
      position: { x: 892, y: 408 },
      data: { size: 'cache.t3.small', port: 6379 },
    },
    // Row 1
    // 7: Course Storage
    {
      iceType: 'Storage.Bucket',
      label: 'Course Storage',
      position: { x: 380, y: 584 },
      data: { storage_class: 'standard' },
    },
    // 8: Notification Worker
    {
      iceType: 'Compute.Worker',
      label: 'Notification Worker',
      position: { x: 636, y: 584 },
      data: { size: '1-2048', runtime: 'nodejs20' },
    },

    // ── Monitoring (outside VPC) ──────────────────────────────────────────
    // 9: LMS Logs
    { iceType: 'Monitoring.Log', label: 'LMS Logs', position: { x: 50, y: 870 }, data: { keep_logs: '30 days' } },

    // ── Ungrouped (control plane) ─────────────────────────────────────────
    // 10: Auth
    { iceType: 'Security.Identity', label: 'Auth', position: { x: 50, y: 1080 }, data: {} },
    // 11: Secrets
    { iceType: 'Security.Secret', label: 'Secrets', position: { x: 306, y: 1080 }, data: {} },
    // 12: Search
    { iceType: 'Analytics.Search', label: 'Course Search', position: { x: 562, y: 1080 }, data: {} },
    // 13: Domain
    { iceType: 'Network.Domain', label: 'Domain', position: { x: 50, y: 1256 }, data: { hostname: 'learn.acme.io' } },
    // 14: Repo
    { iceType: 'Source.Repository', label: 'GitHub Repo', position: { x: 306, y: 1256 }, data: { repository: '', branch: 'main' } },
    // 15: Env
    { iceType: 'Config.Environment', label: 'Env Variables', position: { x: 562, y: 1256 }, data: {} },
  ],

  connections: [
    // Internet → WAF (Internet→WAF rule)
    { fromBlock: 0, toBlock: 1, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    // WAF → Gateway (WAF→Gateway rule)
    { fromBlock: 1, toBlock: 3, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    // Internet → Student Portal (Internet→Frontend rule)
    { fromBlock: 0, toBlock: 2, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    // Student Portal → Gateway (Frontend→Gateway rule)
    { fromBlock: 2, toBlock: 3, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    // Gateway → Course API (Gateway→Backend rule)
    { fromBlock: 3, toBlock: 4, relationship: 'connects_to', protocol: 'HTTP', port: 8080 },
    // Course API → Course DB (Backend→Database rule)
    { fromBlock: 4, toBlock: 5, relationship: 'depends_on', protocol: 'TCP', port: 5432 },
    // Course API → Session Cache (Backend→Cache rule)
    { fromBlock: 4, toBlock: 6, relationship: 'depends_on', protocol: 'TCP', port: 6379 },
    // Course API → Course Storage (Backend→Storage rule)
    { fromBlock: 4, toBlock: 7, relationship: 'depends_on' },
    // Course API → Search (Backend→Search rule)
    { fromBlock: 4, toBlock: 12, relationship: 'depends_on' },
    // Course API → Auth (Backend→Auth rule)
    { fromBlock: 4, toBlock: 10, relationship: 'connects_to' },
    // Course API → Secrets (Service→Secrets rule)
    { fromBlock: 4, toBlock: 11, relationship: 'depends_on' },
    // Course API → LMS Logs (Service→Monitoring rule)
    { fromBlock: 4, toBlock: 9, relationship: 'connects_to' },
    // Notification Worker → LMS Logs (Service→Monitoring rule)
    { fromBlock: 8, toBlock: 9, relationship: 'connects_to' },
    // Notification Worker → Course DB (Worker→Database rule)
    { fromBlock: 8, toBlock: 5, relationship: 'depends_on', protocol: 'TCP', port: 5432 },
    // Domain → Student Portal (Domain→Routable rule)
    { fromBlock: 13, toBlock: 2, relationship: 'connects_to' },
    // Repo → Course API (Repo→Service pipeline rule)
    { fromBlock: 14, toBlock: 4, relationship: 'connects_to' },
    // Course API → Env (Service→EnvConfig config rule)
    { fromBlock: 4, toBlock: 15, relationship: 'depends_on' },
  ],
};

// =============================================================================
// Exam Platform
// =============================================================================

export const educationExamPlatformTemplate: ComposedTemplate = {
  id: 'education-exam-platform',
  name: 'Exam Platform',
  description:
    'Online assessment platform with question banks, automated grading, proctoring, and VPC network isolation.',
  icon: 'ClipboardCheck',
  estimatedCost: '$80-200/mo',
  category: 'education',
  provider: 'gcp',
  providers: ['gcp', 'aws', 'azure'],
  tags: ['exams', 'assessment', 'grading', 'proctoring', 'VPC', 'Subnet'],
  securityLevel: 'standard',
  difficulty: 'intermediate',
  trust: 'official',
  author: { name: 'ICE Team' },
  environmentPresets: [
    { type: 'production', name: 'Production', region: 'us-central1', securityLevel: 'standard' },
  ],

  groups: [
    // [0] Public Zone — outside VPC (3c with Exam App)
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
      width: 536,
      height: 412,
      blockIndices: [4, 5, 6, 7],
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
    // 2: Exam App (SSR)
    {
      iceType: 'Compute.SSRSite',
      label: 'Exam App',
      position: { x: 562, y: 86 },
      data: { framework: 'nextjs', domain: 'exam.acme.io' },
    },

    // ── Public Subnet (inside VPC) ────────────────────────────────────────
    // 3: Gateway
    { iceType: 'Network.Gateway', label: 'API Gateway', position: { x: 70, y: 408 }, data: { protocol: 'http' } },

    // ── Private Subnet (inside VPC) ───────────────────────────────────────
    // Row 0
    // 4: Exam API
    {
      iceType: 'Compute.Container',
      label: 'Exam API',
      position: { x: 380, y: 408 },
      data: { size: '1-2048', runtime: 'nodejs20', port: 8080 },
    },
    // 5: Question DB
    {
      iceType: 'Database.PostgreSQL',
      label: 'Question DB',
      position: { x: 636, y: 408 },
      data: { size: 'db.t3.small', storage: '50', version: '17' },
    },
    // Row 1
    // 6: Answer Cache
    {
      iceType: 'Database.Redis',
      label: 'Answer Cache',
      position: { x: 380, y: 584 },
      data: { size: 'cache.t3.small', port: 6379 },
    },
    // 7: Grade Queue
    {
      iceType: 'Messaging.SQS',
      label: 'Grade Queue',
      position: { x: 636, y: 584 },
      data: { queue_type: 'standard' },
    },

    // ── Monitoring (outside VPC) ──────────────────────────────────────────
    // 8: Exam Logs
    { iceType: 'Monitoring.Log', label: 'Exam Logs', position: { x: 50, y: 870 }, data: { keep_logs: '30 days' } },

    // ── Ungrouped (control plane) ─────────────────────────────────────────
    // 9: Auth
    { iceType: 'Security.Identity', label: 'Auth', position: { x: 50, y: 1080 }, data: {} },
    // 10: Secrets
    { iceType: 'Security.Secret', label: 'Secrets', position: { x: 306, y: 1080 }, data: {} },
    // 11: Grade Worker
    {
      iceType: 'Compute.Worker',
      label: 'Grade Worker',
      position: { x: 562, y: 1080 },
      data: { size: '1-2048', runtime: 'nodejs20' },
    },
    // 12: Domain
    { iceType: 'Network.Domain', label: 'Domain', position: { x: 50, y: 1256 }, data: { hostname: 'exam.acme.io' } },
    // 13: Repo
    { iceType: 'Source.Repository', label: 'GitHub Repo', position: { x: 306, y: 1256 }, data: { repository: '', branch: 'main' } },
    // 14: Env
    { iceType: 'Config.Environment', label: 'Env Variables', position: { x: 562, y: 1256 }, data: {} },
  ],

  connections: [
    // Internet → WAF (Internet→WAF rule)
    { fromBlock: 0, toBlock: 1, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    // WAF → Gateway (WAF→Gateway rule)
    { fromBlock: 1, toBlock: 3, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    // Internet → Exam App (Internet→Frontend rule)
    { fromBlock: 0, toBlock: 2, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    // Exam App → Gateway (Frontend→Gateway rule)
    { fromBlock: 2, toBlock: 3, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    // Gateway → Exam API (Gateway→Backend rule)
    { fromBlock: 3, toBlock: 4, relationship: 'connects_to', protocol: 'HTTP', port: 8080 },
    // Exam API → Question DB (Backend→Database rule)
    { fromBlock: 4, toBlock: 5, relationship: 'depends_on', protocol: 'TCP', port: 5432 },
    // Exam API → Answer Cache (Backend→Cache rule)
    { fromBlock: 4, toBlock: 6, relationship: 'depends_on', protocol: 'TCP', port: 6379 },
    // Exam API → Grade Queue (Backend→Queue rule)
    { fromBlock: 4, toBlock: 7, relationship: 'connects_to' },
    // Grade Queue → Grade Worker (Queue→Backend rule)
    { fromBlock: 7, toBlock: 11, relationship: 'connects_to' },
    // Grade Worker → Question DB (Worker→Database rule)
    { fromBlock: 11, toBlock: 5, relationship: 'depends_on', protocol: 'TCP', port: 5432 },
    // Exam API → Auth (Backend→Auth rule)
    { fromBlock: 4, toBlock: 9, relationship: 'connects_to' },
    // Exam API → Secrets (Service→Secrets rule)
    { fromBlock: 4, toBlock: 10, relationship: 'depends_on' },
    // Exam API → Exam Logs (Service→Monitoring rule)
    { fromBlock: 4, toBlock: 8, relationship: 'connects_to' },
    // Domain → Exam App (Domain→Routable rule)
    { fromBlock: 12, toBlock: 2, relationship: 'connects_to' },
    // Repo → Exam API (Repo→Service pipeline rule)
    { fromBlock: 13, toBlock: 4, relationship: 'connects_to' },
    // Exam API → Env (Service→EnvConfig config rule)
    { fromBlock: 4, toBlock: 14, relationship: 'depends_on' },
  ],
};
