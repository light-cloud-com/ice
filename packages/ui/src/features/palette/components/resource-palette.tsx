/**
 * Resource Palette Component
 *
 * Categorized infrastructure components with collapsible sections,
 * tooltips, and prominent category headers.
 */

import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Globe,
  Database,
  Server,
  HardDrive,
  Activity,
  Search,
  Zap,
  Folder,
  GitBranch,
  Key,
  User,
  Users,
  FileText,
  List,
  Cog,
  Clock,
  X,
  FolderOpen,
  Bell,
  ChevronRight,
  Brain,
  BrainCircuit,
  Waypoints,
  BarChart3,
  Terminal,
  GripVertical,
} from 'lucide-react';
import { cn } from '../../../shared/utils/cn';
import { CLOUD_PROVIDERS } from '@ice/core/resources';
import { ENABLED_PROVIDER_IDS, ENABLED_PROVIDERS as ENABLED_CLOUD_PROVIDERS } from '../../../config/providers';
import { ProjectBrowser } from '../../project-browser';
import { useResolvePath } from '../../../shared/hooks/use-resolve-path';
import axiosInstance from '../../../shared/api/axios-instance';
import { OrgSwitcher } from '../../account/components';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '../../../shared/components/ui/tooltip';

// =============================================================================
// Provider brand colors for pills
// =============================================================================

const PROVIDER_COLORS: Record<string, string> = {
  aws: '#ff9900',
  gcp: '#4285f4',
  azure: '#0078d4',
};

// =============================================================================
// Category definitions with metadata
// =============================================================================

interface CategoryDef {
  id: string;
  label: string;
  icon: React.ElementType;
  color: string;
  tooltip: string;
}

const CATEGORY_DEFS: CategoryDef[] = [
  {
    id: 'Compute',
    label: 'Compute',
    icon: Server,
    color: '#22c55e',
    tooltip: 'Application servers, background workers, serverless functions, and PaaS platforms that run your code.',
  },
  {
    id: 'Scheduler',
    label: 'Scheduler',
    icon: Clock,
    color: '#eab308',
    tooltip: 'Time-based triggers — cron jobs, periodic tasks, and scheduled workflows.',
  },
  {
    id: 'Frontend',
    label: 'Frontend',
    icon: Globe,
    color: '#3b82f6',
    tooltip: 'Web frontends — static sites and server-rendered apps served to browsers.',
  },
  {
    id: 'Network',
    label: 'Network',
    icon: GitBranch,
    color: '#06b6d4',
    tooltip: 'Traffic entry points and API gateways that route requests to your services.',
  },
  {
    id: 'Database',
    label: 'Database',
    icon: Database,
    color: '#f59e0b',
    tooltip: 'Managed databases — relational, document, key-value, and wide-column stores across all providers.',
  },
  {
    id: 'Cache',
    label: 'Cache',
    icon: Zap,
    color: '#ef4444',
    tooltip: 'In-memory data stores for fast reads, sessions, and real-time leaderboards.',
  },
  {
    id: 'Messaging',
    label: 'Messaging',
    icon: List,
    color: '#8b5cf6',
    tooltip: 'Queues, pub/sub topics, and event streams for async communication between services.',
  },
  {
    id: 'Storage',
    label: 'Storage',
    icon: HardDrive,
    color: '#64748b',
    tooltip: 'Object storage for files, images, uploads, backups, and static assets. S3, GCS, Blob, OSS, OCI, Spaces.',
  },
  {
    id: 'Security',
    label: 'Security',
    icon: Key,
    color: '#ec4899',
    tooltip: 'Authentication, authorization, and secrets management for your infrastructure.',
  },
  {
    id: 'AI',
    label: 'AI',
    icon: Brain,
    color: '#a855f7',
    tooltip: 'AI/ML infrastructure — LLM gateways, vector databases, and model serving.',
  },
  {
    id: 'Analytics',
    label: 'Analytics',
    icon: BarChart3,
    color: '#14b8a6',
    tooltip: 'Data warehouses and search engines for analytics, reporting, and full-text search.',
  },
  {
    id: 'Monitoring',
    label: 'Monitoring',
    icon: FileText,
    color: '#f97316',
    tooltip: 'Logging, alerting, and performance monitoring across all your services.',
  },
  {
    id: 'Source',
    label: 'Source',
    icon: GitBranch,
    color: '#6366f1',
    tooltip: 'Source code repositories and CI/CD pipelines. Connect to services to deploy from.',
  },
  {
    id: 'Config',
    label: 'Config',
    icon: Cog,
    color: '#78716c',
    tooltip: 'Environment variables and configuration. Connect to services that consume them.',
  },
];

const CATEGORY_ORDER = CATEGORY_DEFS.map((c) => c.id);
const CATEGORY_MAP = new Map(CATEGORY_DEFS.map((c) => [c.id, c]));

// =============================================================================
// Component definitions
// =============================================================================

interface RuntimeOption {
  label: string;
  value: string;
  icon?: string;
}

interface ComponentDef {
  type: string;
  name: string;
  description: string;
  tooltip: string;
  icon: React.ElementType;
  providers: ('aws' | 'gcp' | 'azure' | 'kubernetes' | 'alibaba' | 'oci' | 'digitalocean')[];
  category: string;
  runtimes?: RuntimeOption[];
}

const COMPONENTS: ComponentDef[] = [
  // ── Compute ──
  {
    type: 'scalable-backend',
    name: 'Scalable Backend',
    description: 'Containerized service. Auto-scales.',
    tooltip:
      'Auto-scaling containerized service supporting any runtime — Node.js, Python, Go, Java, .NET, Rust. Runs behind a load balancer with health checks, rolling deploys, and configurable min/max instances.',
    icon: Server,
    providers: ['aws', 'gcp', 'azure', 'kubernetes'],
    category: 'Compute',
    runtimes: [
      { label: 'Node.js', value: 'Node.js 20' },
      { label: 'Python', value: 'Python 3.12' },
      { label: 'Go', value: 'Go 1.22' },
      { label: 'Java', value: 'Java 21' },
      { label: 'Rust', value: 'Rust 1.77' },
      { label: '.NET', value: '.NET 8' },
    ],
  },
  {
    type: 'worker',
    name: 'Worker',
    description: 'Background jobs: image processing, emails.',
    tooltip:
      "Long-running background process that picks up jobs from a queue. Use for image/video processing, email sending, PDF generation, data imports, or any work that shouldn't block an API response.",
    icon: Cog,
    providers: ['aws', 'gcp', 'kubernetes'],
    category: 'Compute',
  },
  {
    type: 'serverless-function',
    name: 'Serverless Function',
    description: 'Event-driven. Scales to zero.',
    tooltip:
      'Serverless function (Lambda, Cloud Functions, Azure Functions) that runs your code in response to events. No servers to manage — scales automatically from zero to thousands of concurrent executions. Pay only for compute time used.',
    icon: Zap,
    providers: ['aws', 'gcp', 'azure'],
    category: 'Compute',
    runtimes: [
      { label: 'Node.js', value: 'Node.js 20' },
      { label: 'Python', value: 'Python 3.12' },
      { label: 'Go', value: 'Go 1.x' },
      { label: 'Java', value: 'Java 21' },
      { label: '.NET', value: '.NET 8' },
    ],
  },
  {
    type: 'function-compute',
    name: 'Function Compute',
    description: 'Alibaba Cloud serverless functions. Event-driven.',
    tooltip:
      'Alibaba Cloud Function Compute — serverless execution environment for event-driven code. Supports Node.js, Python, Java, and Go. Auto-scales from zero with pay-per-execution pricing.',
    icon: Zap,
    providers: ['alibaba'],
    category: 'Compute',
  },
  {
    type: 'oci-functions',
    name: 'OCI Functions',
    description: 'Oracle Cloud serverless. Fn-based.',
    tooltip:
      'Oracle Cloud Functions — serverless platform built on the open-source Fn Project. Supports multiple languages, runs in Docker containers, and integrates with OCI Events and API Gateway.',
    icon: Zap,
    providers: ['oci'],
    category: 'Compute',
  },
  {
    type: 'do-app-platform',
    name: 'App Platform',
    description: 'DigitalOcean PaaS. Git push to deploy.',
    tooltip:
      'DigitalOcean App Platform — fully managed PaaS. Connect your GitHub repo and deploy with git push. Supports static sites, web services, workers, and background jobs with automatic HTTPS.',
    icon: Server,
    providers: ['digitalocean'],
    category: 'Compute',
  },
  // ── Scheduler ──
  {
    type: 'scheduled-task',
    name: 'Cron Job',
    description: 'Runs on a schedule. Reports, cleanup, syncs.',
    tooltip:
      'Runs on a cron schedule. Use for nightly reports, database cleanup, cache warming, billing cycles, or periodic data syncs. Runs once and exits — not a long-lived process.',
    icon: Clock,
    providers: ['aws', 'gcp', 'azure'],
    category: 'Scheduler',
  },

  // ── Frontend ──
  {
    type: 'static-site',
    name: 'Static Site',
    description: 'React/Vue app. CDN included.',
    tooltip:
      'Pre-built HTML/CSS/JS served from a CDN. Ideal for React, Vue, or Angular SPAs. Blazing fast globally — files are cached at edge locations. No server needed.',
    icon: Globe,
    providers: ['aws', 'gcp', 'azure'],
    category: 'Frontend',
  },
  {
    type: 'ssr-site',
    name: 'SSR Site',
    description: 'Server-rendered (Next.js, Nuxt). CDN included.',
    tooltip:
      'Server-side rendered app (Next.js, Nuxt, Remix). Pages render on the server for fast first paint and SEO. Supports API routes, middleware, and dynamic content. CDN caches static assets.',
    icon: Globe,
    providers: ['aws', 'gcp', 'azure', 'kubernetes'],
    category: 'Frontend',
  },

  // ── Network ──
  {
    type: 'public-traffic',
    name: 'Public Traffic',
    description: 'Internet entry point. People reaching your app.',
    tooltip:
      'Represents users and external traffic coming from the public internet. Place this as the starting point of your architecture — everything flows from here into your services.',
    icon: Users,
    providers: ['aws', 'gcp', 'azure'],
    category: 'Network',
  },
  {
    type: 'gateway',
    name: 'Gateway',
    description: 'Routes traffic, auth + rate limiting.',
    tooltip:
      'API Gateway that sits between the internet and your backend services. Handles request routing, authentication, rate limiting, CORS, and request/response transformation. Includes WAF and TLS termination.',
    icon: GitBranch,
    providers: ['aws', 'gcp', 'azure'],
    category: 'Network',
  },

  // ── Database ──
  {
    type: 'postgresql',
    name: 'PostgreSQL',
    description: 'Relational. ACID-compliant.',
    tooltip:
      'Managed PostgreSQL database with automatic backups, replication, and failover. Best for structured data with complex queries, joins, and transactions. Supports JSON, full-text search, and extensions like PostGIS.',
    icon: Database,
    providers: ['aws', 'gcp', 'azure', 'digitalocean'],
    category: 'Database',
  },
  {
    type: 'mysql',
    name: 'MySQL',
    description: 'Relational. Web-scale classic.',
    tooltip:
      'Managed MySQL database — the most widely deployed open-source relational database. Optimized for read-heavy workloads, web applications, and e-commerce. Simple, reliable, and well-understood.',
    icon: Database,
    providers: ['aws', 'gcp', 'azure', 'digitalocean'],
    category: 'Database',
  },
  {
    type: 'mongodb',
    name: 'MongoDB',
    description: 'Document store. Schema-flexible.',
    tooltip:
      'Managed MongoDB document database. Stores data as flexible JSON-like documents — no fixed schema required. Great for content management, catalogs, user profiles, and rapidly evolving data models.',
    icon: Database,
    providers: ['aws', 'gcp', 'azure', 'digitalocean'],
    category: 'Database',
  },
  {
    type: 'dynamodb',
    name: 'DynamoDB',
    description: 'AWS NoSQL key-value. Single-digit ms.',
    tooltip:
      'AWS DynamoDB — fully managed NoSQL key-value and document database. Single-digit millisecond performance at any scale. Supports on-demand and provisioned capacity, global tables, and DynamoDB Streams for change data capture.',
    icon: Database,
    providers: ['aws'],
    category: 'Database',
  },
  {
    type: 'firestore',
    name: 'Firestore',
    description: 'Google Cloud document DB. Real-time sync.',
    tooltip:
      'Google Cloud Firestore — serverless document database with real-time sync and offline support. Data is organized into collections and documents. Ideal for mobile and web apps that need live data updates across clients.',
    icon: Database,
    providers: ['gcp'],
    category: 'Database',
  },
  {
    type: 'cosmosdb',
    name: 'Cosmos DB',
    description: 'Azure multi-model DB. Global distribution.',
    tooltip:
      'Azure Cosmos DB — globally distributed multi-model database. Supports NoSQL, MongoDB, Cassandra, Gremlin, and Table APIs. Guaranteed single-digit millisecond reads and writes with five consistency levels and turnkey global replication.',
    icon: Database,
    providers: ['azure'],
    category: 'Database',
  },
  {
    type: 'tablestore',
    name: 'Tablestore',
    description: 'Alibaba Cloud NoSQL wide-column. Serverless.',
    tooltip:
      'Alibaba Cloud Tablestore — serverless NoSQL wide-column store optimized for time-series, IoT, and metadata. Auto-scales with no capacity planning needed.',
    icon: Database,
    providers: ['alibaba'],
    category: 'Database',
  },
  {
    type: 'autonomous-db',
    name: 'Autonomous DB',
    description: 'Oracle Cloud self-managing database.',
    tooltip:
      'Oracle Cloud Autonomous Database — self-driving, self-securing, self-repairing. Automated tuning, patching, and scaling. Supports OLTP, data warehousing, JSON, and APEX workloads.',
    icon: Database,
    providers: ['oci'],
    category: 'Database',
  },
  {
    type: 'do-managed-db',
    name: 'Managed Database',
    description: 'DigitalOcean managed DB. Postgres/MySQL/Redis.',
    tooltip:
      'DigitalOcean Managed Database — simple, reliable managed databases. Supports PostgreSQL, MySQL, and Redis with automatic failover, backups, and end-to-end encryption.',
    icon: Database,
    providers: ['digitalocean'],
    category: 'Database',
  },

  // ── Cache ──
  {
    type: 'redis-cache',
    name: 'Redis',
    description: 'In-memory store. Sub-millisecond reads.',
    tooltip:
      'Managed Redis in-memory data store. Use for caching API responses, session storage, rate limiting counters, real-time leaderboards, and pub/sub messaging. Sub-millisecond latency.',
    icon: Zap,
    providers: ['aws', 'gcp', 'azure', 'digitalocean'],
    category: 'Cache',
  },

  // ── Messaging ──
  {
    type: 'sqs',
    name: 'SQS',
    description: 'AWS managed queue. Guaranteed delivery.',
    tooltip:
      'AWS Simple Queue Service — fully managed message queue. Messages are stored durably and delivered at-least-once. Supports FIFO ordering and dead-letter queues for failed messages. Scales automatically.',
    icon: List,
    providers: ['aws'],
    category: 'Messaging',
  },
  {
    type: 'sns',
    name: 'SNS',
    description: 'AWS pub/sub notifications.',
    tooltip:
      'AWS Simple Notification Service — fan-out pub/sub messaging. One message can trigger multiple subscribers (SQS queues, Lambda functions, HTTP endpoints, email, SMS). Great for event-driven architectures.',
    icon: Bell,
    providers: ['aws'],
    category: 'Messaging',
  },
  {
    type: 'rabbitmq',
    name: 'RabbitMQ',
    description: 'Open-source message broker.',
    tooltip:
      'Open-source message broker supporting AMQP, MQTT, and STOMP protocols. Flexible routing with exchanges, queues, and bindings. Runs anywhere — cloud or self-hosted on Kubernetes.',
    icon: List,
    providers: ['aws', 'gcp', 'azure', 'kubernetes'],
    category: 'Messaging',
  },
  {
    type: 'event-stream',
    name: 'Event Stream',
    description: 'Real-time events (Kafka, Kinesis).',
    tooltip:
      'High-throughput event streaming platform (Kafka, Kinesis). Ordered, durable log of events that multiple consumers can read independently. Use for real-time analytics, event sourcing, and data pipelines.',
    icon: Activity,
    providers: ['aws', 'gcp', 'azure'],
    category: 'Messaging',
  },
  {
    type: 'cloud-pubsub',
    name: 'Cloud Pub/Sub',
    description: 'Google Cloud managed pub/sub. Global.',
    tooltip:
      'Google Cloud Pub/Sub — fully managed real-time messaging service. Publish messages to topics and deliver to multiple subscribers globally. Supports push and pull delivery, dead-letter topics, and exactly-once processing.',
    icon: Bell,
    providers: ['gcp'],
    category: 'Messaging',
  },
  {
    type: 'service-bus',
    name: 'Service Bus',
    description: 'Azure enterprise messaging. Queues + topics.',
    tooltip:
      'Azure Service Bus — enterprise-grade message broker with queues and publish-subscribe topics. Supports sessions, transactions, dead-lettering, and scheduled delivery. Ideal for decoupling applications and building reliable distributed systems.',
    icon: List,
    providers: ['azure'],
    category: 'Messaging',
  },

  // ── Storage ──
  {
    type: 'storage',
    name: 'Storage',
    description: 'Files, images, uploads. S3/GCS/Blob.',
    tooltip:
      'Object storage (S3, GCS, Azure Blob, Alibaba OSS, OCI Object Storage, DO Spaces) for files, images, videos, backups, and static assets. Virtually unlimited capacity with high durability. Supports versioning, lifecycle policies, and pre-signed URLs.',
    icon: HardDrive,
    providers: ['aws', 'gcp', 'azure', 'alibaba', 'oci', 'digitalocean'],
    category: 'Storage',
  },
  {
    type: 'oss',
    name: 'OSS',
    description: 'Alibaba Cloud object storage. China-optimized CDN.',
    tooltip:
      'Alibaba Cloud Object Storage Service — massively scalable object storage with China-optimized CDN integration. Supports Standard, IA, Archive, and Cold Archive storage classes.',
    icon: HardDrive,
    providers: ['alibaba'],
    category: 'Storage',
  },
  {
    type: 'oci-object-storage',
    name: 'OCI Object Storage',
    description: 'Oracle Cloud enterprise object storage. Tiered.',
    tooltip:
      'Oracle Cloud Object Storage — enterprise-grade with automatic tiering between Standard and Archive tiers. High durability with built-in redundancy across fault domains.',
    icon: HardDrive,
    providers: ['oci'],
    category: 'Storage',
  },
  {
    type: 'do-spaces',
    name: 'Spaces',
    description: 'DigitalOcean S3-compatible object storage.',
    tooltip:
      'DigitalOcean Spaces — simple S3-compatible object storage with built-in CDN. Flat pricing, no egress surprises. Great for static assets, backups, and user uploads.',
    icon: HardDrive,
    providers: ['digitalocean'],
    category: 'Storage',
  },

  // ── Security ──
  {
    type: 'auth',
    name: 'Auth',
    description: 'Login, signup, permissions.',
    tooltip:
      'Managed identity and authentication service (Cognito, Firebase Auth, Entra ID). Handles user signup, login, MFA, social login (Google, GitHub), JWT tokens, and role-based access control.',
    icon: User,
    providers: ['aws', 'gcp', 'azure'],
    category: 'Security',
  },
  {
    type: 'secrets',
    name: 'Secrets',
    description: 'API keys, DB passwords, tokens.',
    tooltip:
      'Secrets manager for storing API keys, database passwords, OAuth tokens, and certificates. Encrypted at rest, accessed via API, with automatic rotation and audit logging.',
    icon: Key,
    providers: ['aws', 'gcp', 'azure'],
    category: 'Security',
  },

  // ── AI ──
  {
    type: 'llm-gateway',
    name: 'LLM Gateway',
    description: 'LLM API proxy. Rate limiting + fallback.',
    tooltip:
      'Proxy/router for LLM API calls (OpenAI, Anthropic, Cohere). Centralizes API key management, adds rate limiting, request caching, cost tracking, and automatic fallback between models.',
    icon: BrainCircuit,
    providers: ['aws', 'gcp', 'azure', 'kubernetes'],
    category: 'AI',
  },
  {
    type: 'vector-db',
    name: 'Vector DB',
    description: 'Embeddings + similarity search.',
    tooltip:
      'Vector database for storing and querying embeddings. Powers semantic search, RAG (retrieval-augmented generation), recommendation engines, and image similarity. Supports Pinecone, pgvector, Weaviate, and more.',
    icon: Waypoints,
    providers: ['aws', 'gcp', 'azure'],
    category: 'AI',
  },
  {
    type: 'ml-model',
    name: 'ML Model',
    description: 'Deploy + serve ML models.',
    tooltip:
      'Managed endpoint for serving ML models in production. Handles model versioning, A/B testing, auto-scaling, and GPU allocation. Supports PyTorch, TensorFlow, and custom containers.',
    icon: Brain,
    providers: ['aws', 'gcp', 'azure'],
    category: 'AI',
  },

  // ── Analytics ──
  {
    type: 'data-warehouse',
    name: 'Data Warehouse',
    description: 'Columnar analytics. SQL at scale.',
    tooltip:
      'Columnar data warehouse for analytical queries over terabytes of data. Run complex SQL aggregations, joins, and window functions in seconds. Supports BigQuery, Redshift, and Synapse.',
    icon: BarChart3,
    providers: ['aws', 'gcp', 'azure'],
    category: 'Analytics',
  },
  {
    type: 'search',
    name: 'Search',
    description: 'Full-text search. Elasticsearch/OpenSearch.',
    tooltip:
      'Full-text search and analytics engine. Index documents and query them with fuzzy matching, faceted search, autocomplete, and relevance scoring. Powers search bars, log analysis, and real-time dashboards.',
    icon: Search,
    providers: ['aws', 'gcp', 'azure', 'kubernetes'],
    category: 'Analytics',
  },

  // ── Monitoring ──
  {
    type: 'logs',
    name: 'Logs',
    description: 'Errors, performance, alerts.',
    tooltip:
      'Centralized logging and monitoring. Collects logs from all services, enables search and filtering, triggers alerts on errors or anomalies, and provides performance dashboards.',
    icon: FileText,
    providers: ['aws', 'gcp', 'azure', 'kubernetes'],
    category: 'Monitoring',
  },
  {
    type: 'log-terminal',
    name: 'Log Terminal',
    description: 'Live streaming log viewer.',
    tooltip:
      'Terminal-style log viewer with color-coded levels, auto-scroll, and click-to-copy. Streams live logs from connected services.',
    icon: Terminal,
    providers: ['aws', 'gcp', 'azure', 'kubernetes'],
    category: 'Monitoring',
  },

  // ── Source ──
  {
    type: 'github-repository',
    name: 'GitHub Repo',
    description: 'Source code. Connect to a service to deploy.',
    tooltip:
      'GitHub repository as a deployment source. Specify repo, branch, build command, and output directory. Connect to any service to define where its code comes from. Supports auto-deploy on push.',
    icon: GitBranch,
    providers: ['aws', 'gcp', 'azure', 'kubernetes', 'alibaba', 'oci', 'digitalocean'],
    category: 'Source',
  },

  // ── Config ──
  {
    type: 'env-config',
    name: 'Env Variables',
    description: 'Key-value environment variables.',
    tooltip:
      'Environment variables and configuration values. Define key-value pairs like DATABASE_URL, API keys, and feature flags. Connect to services that consume them.',
    icon: Cog,
    providers: ['aws', 'gcp', 'azure', 'kubernetes', 'alibaba', 'oci', 'digitalocean'],
    category: 'Config',
  },

  // ── Networking ── (domain is provider-agnostic)
  {
    type: 'domain',
    name: 'Domain',
    description: 'Custom domain and SSL routing.',
    tooltip:
      'Custom domain configuration with automatic SSL. Set a hostname like app.example.com and connect to a service to route traffic. Supports auto and manual SSL modes.',
    icon: Globe,
    providers: ['aws', 'gcp', 'azure', 'kubernetes', 'alibaba', 'oci', 'digitalocean'],
    category: 'Network',
  },
];

// =============================================================================
// Group Color Presets
// =============================================================================

const GROUP_COLOR_PRESETS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#64748b'];

let groupColorIndex = 0;
function nextGroupColor(): string {
  const color = GROUP_COLOR_PRESETS[groupColorIndex % GROUP_COLOR_PRESETS.length];
  groupColorIndex++;
  return color;
}

// =============================================================================
// Provider filter
// =============================================================================

type Provider = 'aws' | 'gcp' | 'azure';

const PROVIDERS: { id: string; label: string; color?: string }[] = [
  { id: 'all', label: 'All' },
  ...ENABLED_CLOUD_PROVIDERS.map((p) => ({ id: p.id, label: p.shortName, color: p.color })),
];

// =============================================================================
// Collapsed state helpers
// =============================================================================

const STORAGE_KEY = 'ice-palette-collapsed';

function loadCollapsed(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return new Set(JSON.parse(raw));
  } catch {
    /* ignore */
  }
  return new Set();
}

function saveCollapsed(collapsed: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...collapsed]));
  } catch {
    /* ignore */
  }
}

// =============================================================================
// CSS keyframes (injected once)
// =============================================================================

const PALETTE_STYLES = `
  @keyframes palette-item-in {
    from { opacity: 0; transform: translateX(-6px); }
    to   { opacity: 1; transform: translateX(0); }
  }
  @keyframes palette-fade-in {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  @keyframes palette-pulse-glow {
    0%, 100% { opacity: 0.5; }
    50% { opacity: 1; }
  }
  .palette-item-enter {
    animation: palette-item-in 0.25s ease-out both;
  }
  .palette-fade-enter {
    animation: palette-fade-in 0.2s ease-out both;
  }
`;

// =============================================================================
// Main Component
// =============================================================================

export const ResourcePalette: React.FC = () => {
  const { pathname } = useLocation();
  // Show blocks only on canvas/table views (not settings/deployments)
  const isCanvasView = !pathname.endsWith('/settings') && !pathname.endsWith('/deployments');

  // Get the current project's locked provider (if set)
  const segments = pathname.split('/').filter(Boolean);
  const resolved = useResolvePath(segments);
  const [projectProvider, setProjectProvider] = useState<string | null>(null);

  useEffect(() => {
    if (resolved.type === 'project' && resolved.id) {
      axiosInstance
        .post('/canvas/projects/get', { projectId: resolved.id })
        .then((res) => setProjectProvider(res.data.provider || null))
        .catch(() => setProjectProvider(null));
    } else {
      setProjectProvider(null);
    }
  }, [resolved.type, resolved.id]);

  const [localSearch, setLocalSearch] = useState('');
  const [selectedProvider, setSelectedProvider] = useState('all');

  // Lock provider filter to project's provider when set
  useEffect(() => {
    if (projectProvider) {
      setSelectedProvider(projectProvider);
    }
  }, [projectProvider]);
  const [showProjects, setShowProjects] = useState(true);
  const [showBlocks, setShowBlocks] = useState(true);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(loadCollapsed);
  const [mounted, setMounted] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const clearSearch = () => {
    setLocalSearch('');
    searchInputRef.current?.focus();
  };

  const toggleCategory = useCallback((categoryId: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      saveCollapsed(next);
      return next;
    });
  }, []);

  // Filter components by search + provider
  const filteredComponents = useMemo(
    () =>
      COMPONENTS.filter((c) => {
        // Only show components that have at least one enabled provider
        const hasEnabledProvider = c.providers.some((p: string) => ENABLED_PROVIDER_IDS.has(p));
        if (!hasEnabledProvider) return false;

        const matchesSearch =
          !localSearch.trim() ||
          c.name.toLowerCase().includes(localSearch.toLowerCase()) ||
          c.description.toLowerCase().includes(localSearch.toLowerCase());
        const matchesProvider = selectedProvider === 'all' || c.providers.includes(selectedProvider as Provider);
        return matchesSearch && matchesProvider;
      }),
    [localSearch, selectedProvider],
  );

  // Group filtered items by category, preserving order
  const categorizedItems = useMemo(() => {
    const groups: { category: CategoryDef; items: ComponentDef[] }[] = [];
    for (const catId of CATEGORY_ORDER) {
      const items = filteredComponents.filter((c) => c.category === catId);
      if (items.length > 0) {
        const catDef = CATEGORY_MAP.get(catId)!;
        groups.push({ category: catDef, items });
      }
    }
    return groups;
  }, [filteredComponents]);

  const isSearching = localSearch.trim().length > 0;
  const showGroup = !localSearch.trim() || 'group organize'.includes(localSearch.toLowerCase());

  // Running stagger index for mount animation
  let staggerIdx = 0;

  return (
    <TooltipProvider delayDuration={400}>
      {/* Inject keyframes */}
      <style>{PALETTE_STYLES}</style>

      <div
        className="h-full flex flex-col select-none relative"
        id="ice-palette-panel"
        data-testid="resource-palette"
        style={{
          fontFamily: "'JetBrains Mono Variable', monospace",
          background: 'var(--ice-bg-surface)',
        }}
      >
        {/* Content */}
        <div className="h-full flex flex-col">
          {/* ── Projects (collapsible) ── */}
          <div className={cn('shrink-0', showProjects && 'max-h-[40%]')}>
            <button
              onClick={() => setShowProjects(!showProjects)}
              className="w-full flex items-center gap-1.5 px-3 py-1.5 hover:bg-ice-hover transition-colors"
            >
              <ChevronRight
                className={cn(
                  'w-3 h-3 text-ice-text-3 transition-transform duration-150 shrink-0',
                  showProjects && 'rotate-90',
                )}
              />
              <span className="text-ice-sm font-semibold text-ice-text-2 uppercase tracking-wider">Projects</span>
            </button>
            {showProjects && (
              <div className="overflow-y-auto custom-scrollbar" style={{ maxHeight: 'calc(100% - 28px)' }}>
                <ProjectBrowser />
              </div>
            )}
          </div>

          {isCanvasView && <div className="mx-3 h-px bg-ice-border" />}

          {/* ── Blocks (only on canvas/table views) ── */}
          {isCanvasView && (
            <>
              <button
                onClick={() => setShowBlocks(!showBlocks)}
                className="w-full flex items-center gap-1.5 px-3 py-1.5 hover:bg-ice-hover transition-colors shrink-0"
              >
                <ChevronRight
                  className={cn(
                    'w-3 h-3 text-ice-text-3 transition-transform duration-150 shrink-0',
                    showBlocks && 'rotate-90',
                  )}
                />
                <span className="text-ice-sm font-semibold text-ice-text-2 uppercase tracking-wider">Blocks</span>
                <span className="text-ice-xs text-ice-text-3 ml-auto tabular-nums">{filteredComponents.length}</span>
              </button>

              {showBlocks && (
                <div className="px-2 pb-1 shrink-0">
                  <div className="relative mb-1">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-ice-text-3" />
                    <input
                      id="ice-palette-search-input"
                      ref={searchInputRef}
                      type="text"
                      placeholder="Search blocks..."
                      value={localSearch}
                      onChange={(e) => setLocalSearch(e.target.value)}
                      onFocus={() => setIsSearchFocused(true)}
                      onBlur={() => setIsSearchFocused(false)}
                      className="w-full pl-6 pr-7 py-1 text-ice-base rounded bg-ice-hover border border-ice-border text-ice-text-1 placeholder:text-ice-text-3 focus:outline-none focus:border-ice-border-strong transition-colors"
                    />
                    {localSearch && (
                      <button
                        onClick={clearSearch}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-ice-active"
                      >
                        <X className="w-3 h-3 text-ice-text-3" />
                      </button>
                    )}
                  </div>
                  <div className="flex gap-0.5">
                    {PROVIDERS.map((provider) => {
                      const isActive = selectedProvider === provider.id;
                      const isLocked = !!projectProvider && provider.id !== 'all' && provider.id !== projectProvider;
                      return (
                        <button
                          key={provider.id}
                          id={`ice-palette-filter-${provider.id}`}
                          onClick={() => !isLocked && setSelectedProvider(provider.id)}
                          disabled={isLocked}
                          className={cn(
                            'px-1.5 py-0.5 text-ice-xs font-medium rounded transition-[color,background-color]',
                            isLocked
                              ? 'text-ice-text-3 opacity-30 cursor-not-allowed'
                              : isActive
                                ? 'bg-ice-active text-ice-text-1'
                                : 'text-ice-text-3 hover:text-ice-text-2 hover:bg-ice-hover',
                          )}
                        >
                          {provider.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── Scrollable blocks content ── */}
              {showBlocks && (
                <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar">
                  <div className="px-2 py-2">
                    {categorizedItems.map(({ category, items }) => {
                      const isCollapsed = !isSearching && collapsedCategories.has(category.id);
                      const CatIcon = category.icon;

                      return (
                        <div key={category.id} className="mb-px">
                          {/* Category header — minimal */}
                          {!isSearching && (
                            <button
                              onClick={() => toggleCategory(category.id)}
                              className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded hover:bg-ice-hover transition-colors"
                            >
                              <ChevronRight
                                className={cn(
                                  'w-3 h-3 text-ice-text-3 transition-transform duration-150 shrink-0',
                                  !isCollapsed && 'rotate-90',
                                )}
                              />
                              <div
                                className="w-2 h-2 rounded-full shrink-0"
                                style={{ backgroundColor: category.color, opacity: isCollapsed ? 0.4 : 0.8 }}
                              />
                              <span className="text-ice-sm font-semibold text-ice-text-2 uppercase tracking-wider">
                                {category.label}
                              </span>
                              <span className="text-ice-xs text-ice-text-3 ml-auto tabular-nums">{items.length}</span>
                            </button>
                          )}

                          {/* Items */}
                          {!isCollapsed && (
                            <div className={cn(!isSearching && 'ml-7 border-l border-ice-border pl-2')}>
                              {items.map((component) => {
                                const idx = staggerIdx++;
                                return (
                                  <ComponentItem
                                    key={component.type}
                                    component={component}
                                    selectedProvider={selectedProvider}
                                    categoryColor={category.color}
                                    staggerIndex={mounted ? 0 : idx}
                                  />
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {filteredComponents.length === 0 && !showGroup && (
                      <div className="text-center py-16 palette-fade-enter">
                        <Search className="w-5 h-5 text-ice-text-3 mx-auto mb-3" />
                        <p className="text-ice-base text-ice-text-3 font-medium">No blocks found</p>
                        <p className="text-ice-xs text-ice-text-3 mt-1">Try a different search or provider</p>
                      </div>
                    )}

                    {/* Separator before Group */}
                    {showGroup && filteredComponents.length > 0 && (
                      <div className="h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent my-2 mx-2" />
                    )}

                    {/* Group — always at bottom */}
                    {showGroup && <DraggableGroupItem />}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
};

// =============================================================================
// Component Item — micro-card with accent edge + optional runtime selector
// =============================================================================

interface ComponentItemProps {
  component: ComponentDef;
  selectedProvider: string;
  categoryColor: string;
  staggerIndex: number;
}

const ComponentItem: React.FC<ComponentItemProps> = ({ component, selectedProvider, categoryColor, staggerIndex }) => {
  const Icon = component.icon;
  const [isDragging, setIsDragging] = useState(false);
  const [selectedRuntime, setSelectedRuntime] = useState<string | null>(component.runtimes?.[0]?.value ?? null);

  const handleDragStart = (e: React.DragEvent) => {
    setIsDragging(true);
    e.dataTransfer.setData('application/ice-block', component.type);
    e.dataTransfer.setData('application/ice-block-name', component.name);
    e.dataTransfer.setData('application/ice-block-provider', selectedProvider);

    // Include selected runtime in drag data overrides
    const dataOverrides: Record<string, unknown> = {
      description: component.description,
    };
    if (selectedRuntime) {
      dataOverrides.runtime = selectedRuntime;
    }
    e.dataTransfer.setData('application/ice-block-data', JSON.stringify(dataOverrides));
    e.dataTransfer.effectAllowed = 'move';

    const runtimeLabel = selectedRuntime ? ` (${selectedRuntime})` : '';
    const dragImage = document.createElement('div');
    dragImage.innerHTML = `
      <div style="
        display: flex;
        align-items: center;
        gap: 8px;
        background: rgba(15, 23, 35, 0.95);
        color: #fff;
        border-radius: 10px;
        padding: 8px 16px;
        font-size: 12px;
        font-weight: 600;
        box-shadow: 0 12px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.1);
        font-family: 'JetBrains Mono Variable', monospace;
        backdrop-filter: blur(20px);
        border-left: 3px solid ${categoryColor};
        letter-spacing: 0.02em;
      ">
        ${component.name}<span style="color: rgba(255,255,255,0.5); font-weight: 400; margin-left: 4px;">${runtimeLabel}</span>
      </div>
    `;
    dragImage.style.position = 'absolute';
    dragImage.style.top = '-1000px';
    document.body.appendChild(dragImage);
    e.dataTransfer.setDragImage(dragImage, 0, 0);
    setTimeout(() => document.body.removeChild(dragImage), 0);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  const hasRuntimes = component.runtimes && component.runtimes.length > 0;

  return (
    <div className="palette-item-enter" style={{ animationDelay: staggerIndex > 0 ? `${staggerIndex * 15}ms` : '0ms' }}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            draggable
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            className={cn(
              'group flex items-center gap-2 h-8 px-2 rounded-md cursor-grab',
              'hover:bg-ice-hover',
              'active:cursor-grabbing active:scale-[0.98]',
              'transition-all duration-100',
              isDragging && 'opacity-40',
            )}
            data-block-type={component.type}
            data-testid={`block-item-${component.type}`}
          >
            <div
              className="w-6 h-6 rounded flex items-center justify-center shrink-0 transition-colors"
              style={{ backgroundColor: `${categoryColor}12`, color: `${categoryColor}90` }}
            >
              <Icon className="w-3.5 h-3.5" />
            </div>
            <span className="text-ice-base text-ice-text-2 group-hover:text-ice-text-1 truncate transition-colors flex-1">
              {component.name}
            </span>
            {component.providers.length === 1 && (
              <span className="text-ice-2xs text-ice-text-3 uppercase tracking-wide shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                {component.providers[0]}
              </span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent
          side="right"
          sideOffset={8}
          className="max-w-[240px] bg-ice-overlay border border-ice-border text-ice-sm leading-relaxed px-3 py-2 rounded-md shadow-lg"
        >
          <p className="font-medium text-ice-text-1 text-ice-base mb-1">{component.name}</p>
          <p className="text-ice-text-2">{component.description}</p>
          <div className="flex gap-1 mt-1.5">
            {component.providers.map((p) => (
              <span key={p} className="text-ice-2xs font-medium text-ice-text-3 uppercase">
                {p}
              </span>
            ))}
          </div>
        </TooltipContent>
      </Tooltip>

      {/* Runtime chips — shown below the drag row */}
      {hasRuntimes && (
        <div className="flex flex-wrap gap-[4px] ml-[26px] mr-1 mb-1.5 mt-0.5 pl-2.5">
          {component.runtimes!.map((rt) => {
            const isSelected = selectedRuntime === rt.value;
            return (
              <button
                key={rt.value}
                onClick={() => setSelectedRuntime(rt.value)}
                draggable
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                className={cn(
                  'px-[6px] py-[2px] rounded text-ice-xs font-medium transition-all duration-150 cursor-grab',
                  'active:cursor-grabbing active:scale-95',
                  'border',
                  isSelected ? 'border-current' : 'border-transparent hover:bg-ice-hover',
                )}
                style={
                  isSelected
                    ? {
                        color: categoryColor,
                        backgroundColor: `${categoryColor}12`,
                        borderColor: `${categoryColor}30`,
                      }
                    : {
                        color: 'var(--ice-text-tertiary)',
                      }
                }
              >
                {rt.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

// =============================================================================
// Draggable Group Item
// =============================================================================

const DraggableGroupItem: React.FC = () => {
  const handleDragStart = (e: React.DragEvent) => {
    const color = nextGroupColor();
    e.dataTransfer.setData('application/ice-group', 'Custom');
    e.dataTransfer.setData('application/ice-group-name', 'New Group');
    e.dataTransfer.setData('application/ice-group-color', color);
    e.dataTransfer.effectAllowed = 'move';

    const dragImage = document.createElement('div');
    dragImage.innerHTML = `
      <div style="
        display: flex;
        align-items: center;
        gap: 8px;
        background: rgba(15, 23, 35, 0.95);
        color: ${color};
        border-radius: 10px;
        padding: 8px 16px;
        font-size: 12px;
        font-weight: 600;
        box-shadow: 0 12px 40px rgba(0,0,0,0.5), 0 0 0 1px ${color}30;
        font-family: 'JetBrains Mono Variable', monospace;
        border: 1px dashed ${color}50;
        letter-spacing: 0.02em;
      ">
        New Group
      </div>
    `;
    dragImage.style.position = 'absolute';
    dragImage.style.top = '-1000px';
    document.body.appendChild(dragImage);
    e.dataTransfer.setDragImage(dragImage, 0, 0);
    setTimeout(() => document.body.removeChild(dragImage), 0);
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      className={cn(
        'group flex items-center gap-2.5 py-2.5 px-3 mx-1 rounded-lg cursor-grab',
        'border border-dashed border-ice-border hover:border-amber-500/25',
        'hover:bg-amber-500/[0.03]',
        'active:cursor-grabbing active:scale-[0.97]',
        'transition-all duration-200',
      )}
    >
      <Folder className="w-3.5 h-3.5 text-ice-text-3 group-hover:text-amber-400/70 transition-colors shrink-0" />
      <span className="text-ice-base text-ice-text-2 group-hover:text-ice-text-1 transition-colors">Group</span>
    </div>
  );
};
