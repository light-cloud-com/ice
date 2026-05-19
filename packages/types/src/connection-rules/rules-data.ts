/**
 * Declarative connection-rule data + AI-prompt generator.
 *
 * `CONNECTION_RULES` is the single source of truth used by `canConnect`,
 * `inferConnectionMeta`, `findConnectionRule`, `validateConnection`, and
 * `generateAiConnectionPrompt`. Each entry pairs a source/target predicate
 * with a category, line style, and (for traffic) sub-type. First-match-
 * wins ordering matters: more-specific reverse-flip rules sit below
 * their canonical-direction siblings so the canonical match wins for
 * symmetric source/target pairs.
 *
 * Extracted from `connection-rules.ts` in rf-conn-3. The data is
 * data-heavy by nature (~220 LOC of array literal); the file lives
 * here as documented size exception, mirroring the rf-data-1
 * (`scale-presets`) and rf-data-2 (`cloud-blocks`) precedents.
 */

import { type ConnectionCategory, DEFAULT_PORTS, DEFAULT_ENV_VARS } from '@ice/constants';
import type { ConnectionRule } from './types';
import {
  isAuth,
  isBackend,
  isCache,
  isContainer,
  isDatabase,
  isDataWarehouse,
  isDomain,
  isEnvConfig,
  isFrontend,
  isGateway,
  isLLM,
  isMonitoring,
  isQueue,
  isRepo,
  isRoutable,
  isSearch,
  isSecrets,
  isService,
  isStorage,
  isVectorDb,
} from './predicates';

// ─── Declarative Connection Rules ───────────────────────────────────────────
// Each rule defines: "blocks matching source() CAN connect to blocks matching
// target()". First matching rule wins. This array is the single source of
// truth for canConnect(), inferConnectionMeta(), and the AI prompt generator.

export const CONNECTION_RULES: ConnectionRule[] = [
  // ── TRAFFIC: request ────────────────────────────────────────────────────
  {
    label: 'Frontend → Backend',
    source: isFrontend,
    target: isBackend,
    category: 'traffic',
    trafficType: 'request',
    lineStyle: 'solid',
  },
  {
    label: 'Gateway → Gateway',
    source: isGateway,
    target: isGateway,
    category: 'traffic',
    trafficType: 'request',
    lineStyle: 'solid',
  },
  {
    label: 'Gateway → Backend',
    source: isGateway,
    target: isBackend,
    category: 'traffic',
    trafficType: 'request',
    lineStyle: 'solid',
  },
  {
    label: 'Gateway → Frontend',
    source: isGateway,
    target: isFrontend,
    category: 'traffic',
    trafficType: 'request',
    lineStyle: 'solid',
  },
  {
    label: 'Backend → Backend',
    source: isBackend,
    target: isBackend,
    category: 'traffic',
    trafficType: 'request',
    lineStyle: 'solid',
  },
  {
    label: 'Backend → Auth',
    source: isBackend,
    target: isAuth,
    category: 'traffic',
    trafficType: 'request',
    lineStyle: 'solid',
  },
  {
    label: 'Frontend → Auth',
    source: isFrontend,
    target: isAuth,
    category: 'traffic',
    trafficType: 'request',
    lineStyle: 'solid',
  },
  {
    label: 'Frontend → Gateway',
    source: isFrontend,
    target: isGateway,
    category: 'traffic',
    trafficType: 'request',
    lineStyle: 'solid',
  },

  // ── TRAFFIC: data ──────────────────────────────────────────────────────
  {
    label: 'Backend → Database',
    source: isBackend,
    target: isDatabase,
    category: 'traffic',
    trafficType: 'data',
    lineStyle: 'solid',
  },
  {
    label: 'Backend → Cache',
    source: isBackend,
    target: isCache,
    category: 'traffic',
    trafficType: 'data',
    lineStyle: 'solid',
  },
  {
    label: 'Backend → Storage',
    source: isBackend,
    target: isStorage,
    category: 'traffic',
    trafficType: 'data',
    lineStyle: 'solid',
  },
  {
    label: 'Backend → Search',
    source: isBackend,
    target: isSearch,
    category: 'traffic',
    trafficType: 'data',
    lineStyle: 'solid',
  },
  {
    label: 'Backend → VectorDB',
    source: isBackend,
    target: isVectorDb,
    category: 'traffic',
    trafficType: 'data',
    lineStyle: 'solid',
  },
  {
    label: 'Backend → LLM',
    source: isBackend,
    target: isLLM,
    category: 'traffic',
    trafficType: 'data',
    lineStyle: 'solid',
  },
  {
    label: 'Frontend → Storage',
    source: isFrontend,
    target: isStorage,
    category: 'traffic',
    trafficType: 'data',
    lineStyle: 'solid',
  },

  // ── TRAFFIC: data (reverse — drag from data store to service) ──────────
  {
    label: 'Database → Backend (flip)',
    source: isDatabase,
    target: isBackend,
    category: 'traffic',
    trafficType: 'data',
    lineStyle: 'solid',
    reverse: true,
  },
  {
    label: 'Cache → Backend (flip)',
    source: isCache,
    target: isBackend,
    category: 'traffic',
    trafficType: 'data',
    lineStyle: 'solid',
    reverse: true,
  },
  {
    label: 'Storage → Backend (flip)',
    source: isStorage,
    target: isBackend,
    category: 'traffic',
    trafficType: 'data',
    lineStyle: 'solid',
    reverse: true,
  },
  {
    label: 'Storage → Frontend (flip)',
    source: isStorage,
    target: isFrontend,
    category: 'traffic',
    trafficType: 'data',
    lineStyle: 'solid',
    reverse: true,
  },
  {
    label: 'Search → Backend (flip)',
    source: isSearch,
    target: isBackend,
    category: 'traffic',
    trafficType: 'data',
    lineStyle: 'solid',
    reverse: true,
  },
  {
    label: 'VectorDB → Backend (flip)',
    source: isVectorDb,
    target: isBackend,
    category: 'traffic',
    trafficType: 'data',
    lineStyle: 'solid',
    reverse: true,
  },
  {
    label: 'LLM → Backend (flip)',
    source: isLLM,
    target: isBackend,
    category: 'traffic',
    trafficType: 'data',
    lineStyle: 'solid',
    reverse: true,
  },
  {
    label: 'Auth → Backend (flip)',
    source: isAuth,
    target: isBackend,
    category: 'traffic',
    trafficType: 'data',
    lineStyle: 'solid',
    reverse: true,
  },
  {
    label: 'Auth → Frontend (flip)',
    source: isAuth,
    target: isFrontend,
    category: 'traffic',
    trafficType: 'data',
    lineStyle: 'solid',
    reverse: true,
  },

  // ── TRAFFIC: publish / subscribe ───────────────────────────────────────
  {
    label: 'Backend → Queue (publish)',
    source: isBackend,
    target: isQueue,
    category: 'traffic',
    trafficType: 'publish',
    lineStyle: 'dashed',
  },
  {
    label: 'Queue → Backend (subscribe)',
    source: isQueue,
    target: isBackend,
    category: 'traffic',
    trafficType: 'subscribe',
    lineStyle: 'dotted',
  },
  {
    label: 'Backend → Warehouse',
    source: isBackend,
    target: isDataWarehouse,
    category: 'traffic',
    trafficType: 'publish',
    lineStyle: 'dashed',
  },
  {
    label: 'Warehouse → Backend (flip)',
    source: isDataWarehouse,
    target: isBackend,
    category: 'traffic',
    trafficType: 'publish',
    lineStyle: 'dashed',
    reverse: true,
  },

  // ── TRAFFIC: stream ────────────────────────────────────────────────────
  {
    label: 'Service → Monitoring',
    source: (t) => !isMonitoring(t) && !isContainer(t),
    target: isMonitoring,
    category: 'traffic',
    trafficType: 'stream',
    lineStyle: 'thin',
  },

  // ── PIPELINE ───────────────────────────────────────────────────────────
  { label: 'Repo → Service', source: isRepo, target: isService, category: 'pipeline', lineStyle: 'dashed' },
  // Reverse: user drags service→repo, we flip it to repo→service
  {
    label: 'Service → Repo (flip)',
    source: isService,
    target: isRepo,
    category: 'pipeline',
    lineStyle: 'dashed',
    reverse: true,
  },

  // ── CONFIG ─────────────────────────────────────────────────────────────
  { label: 'Service → EnvVars', source: isService, target: isEnvConfig, category: 'config', lineStyle: 'dotted' },
  { label: 'Service → Secrets', source: isService, target: isSecrets, category: 'config', lineStyle: 'dotted' },
  // Reverse: user drags envvars/secrets→service, we flip
  {
    label: 'EnvVars → Service (flip)',
    source: isEnvConfig,
    target: isService,
    category: 'config',
    lineStyle: 'dotted',
    reverse: true,
  },
  {
    label: 'Secrets → Service (flip)',
    source: isSecrets,
    target: isService,
    category: 'config',
    lineStyle: 'dotted',
    reverse: true,
  },

  // ── DNS ────────────────────────────────────────────────────────────────
  { label: 'Domain → Routable', source: isDomain, target: isRoutable, category: 'dns', lineStyle: 'solid' },
  // Reverse: user drags service→domain, we flip
  {
    label: 'Routable → Domain (flip)',
    source: isRoutable,
    target: isDomain,
    category: 'dns',
    lineStyle: 'solid',
    reverse: true,
  },
];

// ─── AI Prompt Generator ─────────────────────────────────────────────────────
// Generates the connection rules section for the AI system prompt
// from the same rules used by the UI. Single source of truth.

export function generateAiConnectionPrompt(): string {
  // Group rules by category for readable output
  const grouped: Record<ConnectionCategory, ConnectionRule[]> = {
    traffic: [],
    pipeline: [],
    config: [],
    dns: [],
  };
  for (const rule of CONNECTION_RULES) {
    if (!rule.reverse) grouped[rule.category].push(rule);
  }

  return `## CONNECTION CATEGORIES

Every connection falls into one of 4 categories. The category is auto-determined from block types — set the correct "relationship" value in addEdge.

### TRAFFIC (green) — runtime network flow between services
relationship: "connects_to"
Valid connections:
${grouped.traffic.map((r) => `- ${r.label} (${r.trafficType || 'request'}, ${r.lineStyle} line)`).join('\n')}

### PIPELINE (purple) — code deployment
relationship: "connects_to"
${grouped.pipeline.map((r) => `- ${r.label}`).join('\n')}
Direction: ALWAYS repo → service (never service → repo)

### CONFIG (amber) — deploy-time configuration
relationship: "depends_on"
${grouped.config.map((r) => `- ${r.label}`).join('\n')}
Direction: ALWAYS service → config block (never config → service)

### DNS (cyan) — domain routing
relationship: "connects_to"
${grouped.dns.map((r) => `- ${r.label}`).join('\n')}
Direction: ALWAYS domain → service (never service → domain)

### CONTAINERS CANNOT HAVE EDGES
VPC, Subnet, and Group nodes are CONTAINERS. They hold resources via parentId.
NEVER create addEdge with source or target pointing to a VPC, Subnet, or Group.

### Auto-generated env vars
When a service connects to a data store, an env var is auto-injected:
${Object.entries(DEFAULT_ENV_VARS)
  .map(([k, v]) => `- ${k} → ${v}`)
  .join('\n')}

### Auto-detected ports
${Object.entries(DEFAULT_PORTS)
  .map(([k, v]) => `- ${k} → ${v}`)
  .join('\n')}

### Direction normalization
The arrow shows "who initiates." Auto-flip ensures:
- Repo is always SOURCE (repo → service)
- EnvVars/Secrets is always TARGET (service → config)
- Domain is always SOURCE (domain → service)
- Monitoring is always TARGET (service → logs)`;
}
