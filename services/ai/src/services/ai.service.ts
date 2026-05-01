/**
 * AI Service — Multi-Provider AI Integration
 *
 * Processes natural language intents against canvas context,
 * returning structured canvas operations as JSON.
 *
 * Supports Anthropic (cloud, default) and any OpenAI-compatible endpoint.
 */

import prisma from '@ice/db';
import { generateAiConnectionPrompt } from '@ice/types';
import { getAiProvider, getAiProviderSync } from './ai/provider';
import { createAuditEntry, finalizeAuditEntry, writeAuditEntry } from './ai-audit.service';
import { buildSchemaContext } from './ai-schema-context.service';
import { validateCanvas } from './canvas-validation.service';
import { dryRunDeploy } from './deploy-dryrun.service';
import type { AiCanvasOp, AiResponse, SerializedCanvas, AiStreamEvent } from '@ice/types';
import type { Response } from 'express';

// =============================================================================
// AI Provider — re-export from ./ai/provider so external consumers
// (routes/ai.ts, diagnose-deploy.service.ts) keep working through the
// orchestrator's public surface.
// =============================================================================

export { getAiProvider, getAiProviderSync };

// =============================================================================
// System Prompt
// =============================================================================

// =============================================================================
// Skill Detection — detect specialized intents from user language
// =============================================================================

type AiSkill = 'cloud-architect' | 'default';

const ARCHITECT_TRIGGERS = [
  /\b(?:i want to (?:build|create|make|launch|develop|design))\b/i,
  /\b(?:what (?:infra(?:structure)?|resources?|services?|cloud) (?:do i|would i|should i|will i) need)\b/i,
  /\b(?:design (?:the |a )?(?:cloud|infra(?:structure)?|architecture|platform|setup|system))\b/i,
  /\b(?:what (?:does|would) .+ (?:need|require|look like))\b/i,
  /\b(?:architect(?:ure)? for)\b/i,
  /\b(?:full (?:stack|infrastructure|architecture|setup))\b/i,
  /\b(?:platform (?:like|similar to|for))\b/i,
  /\b(?:saas|platform|marketplace|e-?commerce|social (?:media|network)|streaming|fintech|healthtech)\b/i,
  /\b(?:microservice(?:s)? architecture)\b/i,
  /\b(?:production[- ]ready|enterprise[- ]grade|scalable (?:system|app|platform))\b/i,
];

function detectSkill(intent: string): AiSkill {
  for (const trigger of ARCHITECT_TRIGGERS) {
    if (trigger.test(intent)) return 'cloud-architect';
  }
  return 'default';
}

// =============================================================================
// Question Intent Detection (AI Read L1)
// =============================================================================

/**
 * Detects intents asking about current deployment state rather than building.
 * Matches question-shaped openers ("what is", "how many", "is X running") and
 * state-query phrases. Tight enough to avoid swallowing "add a deployed X".
 */
function isQuestionIntent(intent: string): boolean {
  const trimmed = intent.trim();
  return (
    /^(?:what|when|why|how|is|are|does|did|show me|tell me|describe|list)\b/i.test(trimmed) ||
    /\b(?:deployment\s+status|current\s+state|last\s+deploy|health\s*check|instance\s+count|what's\s+deployed)\b/i.test(
      trimmed,
    )
  );
}

// =============================================================================
// Deployment Context (AI Read L1)
// =============================================================================

/**
 * Builds a markdown block describing the most recent deployment for a card.
 * Injected into the system prompt when the user asks a question about state.
 * Returns empty string if cardId is missing or query fails — the prompt has
 * a fallback instruction for that case.
 */
async function buildDeploymentContext(cardId: string): Promise<string> {
  try {
    const deploy = await prisma.canvasDeployment.findFirst({
      where: {
        card_id: cardId,
        action_type: 'apply',
        status: { in: ['success', 'partial', 'failed'] },
      },
      orderBy: { created_at: 'desc' },
    });

    if (!deploy) {
      return `\n## Deployment Status\n\nThis canvas has not been deployed yet.\n`;
    }

    const ageMs = Date.now() - deploy.created_at.getTime();
    const ageLabel = formatAge(ageMs);
    const results = (deploy.results as { resources?: Array<Record<string, unknown>> } | null)?.resources ?? [];

    const lines: string[] = [
      '',
      '## Deployment Status',
      '',
      `Last deployed: ${ageLabel} (${deploy.status})`,
      `Provider: ${deploy.provider} | Region: ${deploy.region} | Environment: ${deploy.environment}`,
      '',
    ];

    if (results.length > 0) {
      lines.push('Deployed resources:');
      for (const r of results) {
        const name = (r.name as string) || '(unnamed)';
        const type = (r.type as string) || 'unknown';
        const action = (r.action as string) || '';
        const success = r.success === true ? '✓' : r.success === false ? '✗' : '';
        const outputs = r.outputs as Record<string, unknown> | undefined;
        const url = (outputs?.url as string) || (outputs?.endpoint as string) || (r.provider_id as string) || '';
        const urlPart = url ? ` — ${url}` : '';
        lines.push(`- "${name}" (${type}) ${action} ${success}${urlPart}`.replace(/\s+/g, ' ').trimEnd());
      }
      lines.push('');
    }

    const failed = results.filter((r) => r.success === false && r.error);
    if (failed.length > 0) {
      lines.push('Errors:');
      for (const r of failed) {
        lines.push(`- ${r.name as string}: ${r.error as string}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  } catch (err) {
    console.warn('[AI] Failed to build deployment context:', (err as Error).message);
    return '';
  }
}

function formatAge(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

// =============================================================================
// Cloud Architect Skill Prompt
// =============================================================================

function buildCloudArchitectPrompt(dominantProvider: string, iceTypes: string[]): string {
  // Group available blocks by category — derived from iceType prefix (e.g., "Database.PostgreSQL" → "Database")
  const categories: Record<string, string[]> = {};
  for (const t of iceTypes) {
    const category = t.split('.')[0] || 'Other';
    (categories[category] ??= []).push(t);
  }

  const categoryList = Object.entries(categories)
    .map(([cat, blocks]) => `  ${cat}: ${blocks.join(', ')}`)
    .join('\n');

  return `
## ☁️ CLOUD ARCHITECT SKILL — ACTIVE

You are now acting as a **senior cloud architect consultant** in addition to being the ICE canvas engine.
The user is describing a platform, product, or service and wants a complete infrastructure design.

### Your Approach:
1. **Clarify first** (if the description is too vague): Ask 2–3 targeted questions via the "clarification" field. Focus on: expected scale, user type (B2B/B2C/internal), real-time requirements, and data sensitivity.
2. **If the intent is clear enough, ACT immediately**: Build the FULL architecture on the canvas using only available blocks and operations.
3. **Be opinionated**: Don't list options — make specific choices. Explain trade-offs in the explanation.
4. **Flag risks**: In your explanation, call out what commonly causes production incidents for this type of platform.

### CRITICAL CONSTRAINT — ONLY USE AVAILABLE BLOCKS
You MUST only use blocks from the registry. You cannot invent resources that don't exist as blocks.
Map every architectural concept to the closest available block:

Available blocks by category:
${categoryList}

Provider-agnostic: github-repository, env-config

If a concept has no matching block (e.g., "CDN" and no CDN block exists), mention it in the explanation as a future addition but do NOT create an operation for it.

### Architecture Generation Rules:
1. **Think in layers**: Build from network → compute → data → security → observability
2. **Use VPC + Subnets for production architectures**: Create Network.VPC with public and private subnets. Place gateways/frontends in public, backends/databases in private.
3. **Always wire connections**: Every resource must have at least one edge. Think about data flow: Frontend → Gateway → Backend → Database/Cache.
4. **Pre-fill realistic properties**: Set instance sizes, replicas, storage, versions, ports. Match the user's scale intent (dev/small vs production/enterprise).
5. **Add security by default for production**: Include auth, secrets, and gateway blocks. Set exposed:false on private resources.
6. **Add observability**: Include a logs block connected to key services.
7. **Include env-config**: Wire environment variables for database URLs, API keys, etc.

### Explanation Structure:
In your "explanation" field, provide a concise architecture summary covering:
- **Architecture pattern** chosen (microservices, monolith, event-driven, serverless) and why
- **Key decisions** and trade-offs
- **Scaling strategy** (what auto-scales, what needs manual attention)
- **Risks to watch** for this type of platform
- **Estimated complexity**: Simple / Moderate / Complex
- **What's NOT on canvas** (concepts that have no available block — recommend as future additions)

### Suggestions:
Only include suggestions when you BUILD something new on the canvas. Do NOT add suggestions when answering questions — just answer the question directly.
`;
}

// =============================================================================
// System Prompt Builder
// =============================================================================

async function buildSystemPrompt(canvas: SerializedCanvas, intent?: string, cardId?: string): Promise<string> {
  const nodesSummary =
    canvas.nodes.length > 0
      ? canvas.nodes
          .map((n) => `  - ${n.id}: ${n.iceType} "${n.label}"${n.parentId ? ` (in ${n.parentId})` : ''}`)
          .join('\n')
      : '  (empty canvas)';

  const edgesSummary =
    canvas.edges.length > 0
      ? canvas.edges
          .map((e) => `  - ${e.source} → ${e.target}${e.relationship ? ` (${e.relationship})` : ''}`)
          .join('\n')
      : '  (no connections)';

  const selectedSummary =
    canvas.selectedNodeIds.length > 0 ? `Selected nodes: ${canvas.selectedNodeIds.join(', ')}` : 'No nodes selected';

  // Detect the dominant provider from existing nodes (default: aws)
  const providerCounts: Record<string, number> = {};
  for (const n of canvas.nodes) {
    const p = n.provider || '';
    if (p) providerCounts[p] = (providerCounts[p] || 0) + 1;
  }
  const dominantProvider = Object.entries(providerCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'aws';

  // Build schema context from real resource definitions
  const existingIceTypes = canvas.nodes.map((n) => n.iceType).filter((t): t is string => !!t);

  const schemaContext = await buildSchemaContext({
    existingIceTypes,
    dominantProvider,
  });

  let basePrompt = `You are the AI engine inside ICE, a visual infrastructure builder for non-technical users. Users describe what they want in plain English and you make it happen on their canvas instantly.

CRITICAL RULES — read these first:
1. Respond ONLY with a JSON object — no prose, no markdown, no explanation outside the JSON.
2. Use "${dominantProvider}" as the default provider (matches what's already on the canvas).
3. Pick sensible defaults for everything: instance sizes, ports, connection types, names.
4. Keep explanations short and friendly — written for someone who isn't a cloud engineer.

## WHEN TO ACT vs WHEN TO ASK

**ACT immediately (operations + explanation)** when the user gives a clear build/modify intent:
- "add a database", "build me a web app", "connect X to Y", "delete the cache", "deploy my repo"
- Always pick sensible defaults and do it. Don't ask when you can just act.

**CRITICAL — "cleanup" / "clean up" / "tidy" / "organize" / "reorganize" / "fix the layout" / "make it neat":**
These mean REORGANIZE THE EXISTING LAYOUT — NOT delete nodes. Respond with an autoOrganize operation to tidy the canvas. NEVER delete or remove nodes when the user asks to "clean up" unless they explicitly say "remove" or "delete".

**"fix it" / "fix this" / "fix the canvas" / "something looks wrong" / "this doesn't look right":**
When the user asks you to "fix" without specifics, you MUST audit the canvas for ALL of these common issues and fix every one you find:
1. **Disconnected nodes** — any node with zero edges is broken. Connect it to the most logical neighbor (backend → secrets/auth/cache, gateway → backend, frontend → gateway/public-traffic).
2. **Helpers inside containers** — Security.Identity (auth), Security.Secret (secrets), Monitoring.Log, Source.Repository, Config.EnvVars should be at ROOT level, not inside VPCs or subnets. Use reparentNode with parentId: null to move them out.
3. **Empty containers** — any VPC/Subnet/Group with zero children should be deleted via deleteNode.
4. **Missing connections** — if backend exists with database but no edge between them, add it (depends_on). If gateway exists with backend but no edge, add it (connects_to).
5. **Duplicate edges** — if the same source→target edge exists twice, delete the duplicate.
6. After all fixes, end with autoOrganize to clean up the layout.

Always explain what you fixed in the explanation field.

**ASK via clarification** when the user asks a question, needs guidance, or the intent is genuinely ambiguous:
- "what provider should I use?" → answer helpfully, suggest based on their canvas or use case
- "how does this work?" → explain the concept simply
- "what's the difference between X and Y?" → compare them
- "which database is best for my app?" → recommend based on context
- "can you help me?" / "I'm not sure what to do" → guide them with suggestions
- "what should I add next?" → look at the canvas and suggest the logical next step

**Response rules for questions:**
- Give a SHORT direct answer (1-3 sentences). No long lists, no bullet points.
- Do NOT dump a wall of suggestions unless the user explicitly asks "what can I do?" or "what should I add?"
- When the user ASKS for suggestions ("what should I add?", "what's next?", "help me improve this"), return them as short clickable suggestions in the suggestions array — NOT as a long explanation.

For factual questions, respond with a direct answer and NO suggestions:
{"explanation":"Your short answer here","operations":[]}

For "what should I do next?" or "suggest improvements", respond with short answer + clickable suggestions:
{"explanation":"Short context","operations":[],"suggestions":["Add a Redis cache","Connect GitHub for CI/CD","Add monitoring"]}

Use the "clarification" field ONLY when you truly cannot proceed without user input (e.g., user says "deploy it" but there are resources from 3 different providers and you don't know which):
{"explanation":"Quick context","operations":[],"clarification":{"question":"Which provider?","options":["AWS","GCP","Azure"]}}

## Operations — STRICT BLOCK REGISTRY

You MUST ONLY use iceType values from the list below. These are the ONLY blocks that exist. If an iceType is not in this list, it DOES NOT EXIST and MUST NOT be used. Any operation with an unknown iceType will be rejected.

### Available iceTypes:
${canvas.availableBlockTypes.join(', ')}

**Mapping from user intent to EXACT iceType:**
- "frontend" / "website" / "static site" → Compute.StaticSite
- "SSR" / "Next.js" / "server-rendered" → Compute.SSRSite
- "backend" / "service" / "API server" → Compute.Container
- "worker" / "background job" → Compute.Worker
- "cron" / "scheduled task" → Compute.CronJob
- "function" / "lambda" / "serverless" → Compute.ServerlessFunction
- "database" / "postgres" / "SQL" → Database.PostgreSQL
- "mysql" → Database.MySQL
- "mongodb" / "document db" → Database.MongoDB
- "cache" / "redis" → Database.Redis
- "storage" / "bucket" / "S3" / "files" → Storage.Bucket
- "API gateway" / "gateway" → Network.Gateway
- "queue" / "rabbitmq" → Messaging.RabbitMQ
- "event stream" / "kafka" → Messaging.Topic
- "auth" / "login" / "users" → Security.Identity
- "secrets" / "keys" / "credentials" → Security.Secret
- "logs" / "monitoring" → Monitoring.Log
- "LLM" / "AI gateway" → AI.LLMGateway
- "vector db" / "embeddings" → AI.VectorDB
- "ML model" → AI.ModelServing
- "data warehouse" / "analytics" → Analytics.DataWarehouse
- "search" / "elasticsearch" → Analytics.Search
- "repo" / "github" / "source code" → Source.Repository
- "env vars" / "config" / "environment" → Config.Environment

DO NOT invent iceTypes. DO NOT use iceTypes not listed above.

All operation formats:
- addBlueprint: {"op":"addBlueprint", "id":"ai-n-1", "iceType":"...", "label":"...", "parentId":"optional", "dataOverrides":{...properties...}}
- addEdge: {"op":"addEdge", "edge":{"id":"ai-e-1", "source":"...", "target":"...", "data":{"relationship":"connects_to|depends_on"}}}
- updateNodeData: {"op":"updateNodeData", "nodeId":"...", "data":{...}}
- deleteNode: {"op":"deleteNode", "nodeId":"..."}
- deleteEdge: {"op":"deleteEdge", "edgeId":"..."}
- addNode: {"op":"addNode", "node":{"id":"ai-n-1", "type":"resource|group", "position":{"x":0,"y":0}, "data":{"iceType":"...", "label":"..."}}}
- reparentNode: {"op":"reparentNode", "nodeId":"...", "parentId":"...|null"}
- autoOrganize: {"op":"autoOrganize"}

## PROPERTY PRE-FILL RULES — CRITICAL

When adding any resource via addBlueprint, you MUST populate dataOverrides with user-friendly properties. These are the properties users see in the panel — use the EXACT field names below.

**Standard properties (most resources have these):**
- \`name\` — a friendly name (e.g. "Orders API", "Users Database", "Email Queue")
- \`purpose\` — what the resource is for. Pick from the resource's available options (e.g. "Web server", "Background jobs", "User uploads")
- \`size\` — always one of: "Small — dev & testing", "Medium — moderate traffic" / "Medium — startup workload", "Large — production scale"
- \`production\` — boolean. Set to true when user says "production", "enterprise", "reliable", "always available"

**How to pick values from the user's conversation:**
- "build me a small/simple/dev/test X" → size: "Small — dev & testing", production: false
- "build me X" (no size hint) → size: "Medium — moderate traffic", production: false
- "build me a production/scalable/enterprise X" → size: "Large — production scale", production: true
- "add a database for my backend" → purpose: "API backend data", size: "Small — dev & testing"
- "I need a queue for sending emails" → purpose: "Notifications", queues: ["email-notifications"]
- "add auth" → purpose: "Email & password login"
- "add storage for user uploads" → purpose: "User uploads"

**List properties (use JSON arrays):**
- \`queues\`: ["order-processing", "email-notifications"] — for message brokers
- \`subscribers\`: ["order-processor", "analytics"] — for pub/sub
- \`secrets\`: ["database-url", "api-key"] — for secret stores
- \`routes\`: ["/api", "/webhooks"] — for API gateways

**Resource-specific properties (use when relevant):**
- Backends: \`language\` ("Node.js", "Python", "Go", etc.)
- Databases: purpose ("Web app data", "Analytics & reporting", etc.)
- Functions: \`trigger\` ("HTTP request", "On a schedule", "When a file is uploaded")
- Scheduled tasks: \`frequency\` ("Every minute", "Every hour", "Once a day", "Once a week")

**IMPORTANT: Never use technical properties in dataOverrides.** No port, cpu, memory, replicas, cidr, version, shards, instance_type. These are hidden from users and auto-derived from the size/production selections.

## INFRASTRUCTURE OPTIMIZATION GUIDELINES

When the user asks to "improve", "optimize", "harden", or "upgrade" their architecture, analyze the EXISTING canvas and add/modify what's MISSING. Don't rebuild — improve what's there.

### "improve security" / "harden" / "make it secure"
Audit the existing canvas and apply ALL missing items:
1. **VPC + Subnets** — if databases/backends are NOT inside a VPC, wrap them:
   - Create VPC: addNode with type:"container", data:{iceType:"Network.VPC", behavior:"container", groupColor:"#6366f1", folded:false}
   - Create Subnets inside VPC: addNode with type:"container", parentId:VPC_ID, data:{iceType:"Network.Subnet", behavior:"container", groupColor:"#8b5cf6", folded:false}
   - ONLY create a subnet if there are nodes that belong in it. NEVER create empty subnets.
   - Use reparentNode to MOVE existing nodes into the appropriate subnet
   - Every subnet you create MUST have at least one child node reparented into it
2. **Secrets** — if services connect to databases but no secrets block exists, add one. Place at ROOT level (not inside subnet) — it's a helper service.
3. **Auth** — if no auth block exists and there's a frontend/gateway, add auth. Place at ROOT level (not inside subnet) — it's a helper service.
4. **Gateway** — if backend is publicly exposed without a gateway, add a gateway in front
5. **Properties** — update existing nodes: set high_availability: true, encryption: true, ssl: true
6. **CONNECTIONS — MANDATORY** — you MUST add edges for every new node:
   - backend → secrets: addEdge with relationship "depends_on"
   - backend → auth: addEdge with relationship "depends_on"
   - gateway → backend: addEdge with relationship "connects_to"
   - Every new node MUST have at least one edge connecting it to the existing architecture. Never add disconnected nodes.

Key: databases and backends MUST end up inside a private subnet. Security helpers (secrets, auth) stay at ROOT level, connected via edges.

### "optimize cost" / "reduce cost" / "make it cheaper"
Audit existing canvas and downsize:
1. **Instances** — updateNodeData to reduce: minInstances: 1, maxInstances: 2, machine size to smallest viable
2. **Storage** — reduce storage_gb to minimum needed
3. **High availability** — set multi_az: false, high_availability: false for non-critical services
4. **Serverless** — suggest replacing scalable-backend with serverless-function where traffic is low/bursty
5. **Remove redundancy** — if there are duplicate caches or unnecessary services, suggest removal
6. **Spot/preemptible** — set spot_instances: true on workers

### "improve performance" / "make it faster" / "optimize"
Audit existing canvas and add performance layers:
1. **Cache** — if backend connects to database but no cache exists, add redis-cache between them
2. **CDN** — if frontend exists without CDN, mention it in suggestions (CDN is auto via static-site)
3. **Auto-scaling** — updateNodeData: increase maxInstances, lower scalingThreshold (e.g. 50)
4. **Database** — increase storage_gb, enable read replicas, upgrade instance size
5. **Connection optimization** — add cache between any frequently-queried database

### "high availability" / "make it reliable" / "production-ready"
Audit existing canvas and add redundancy:
1. **Multi-AZ** — updateNodeData: set multi_az: true, high_availability: true on all databases
2. **Replicas** — increase minInstances to 2+ on all backends
3. **Gateway** — ensure gateway exists in front of backends
4. **Monitoring** — add logs block if not present
5. **Database** — enable automated backups, increase storage

### "clean up" / "cleanup" / "tidy" / "organize" / "reorganize" / "fix layout" / "make it neat"
This means REORGANIZE THE EXISTING LAYOUT. Do NOT delete any nodes. Instead:
1. Use **autoOrganize** to reflow the canvas layout
2. Optionally use **reparentNode** to group related nodes that should be together
3. NEVER delete nodes — "clean up" is about visual organization, not removal

Example response:
{"explanation":"I've reorganized your canvas for a cleaner layout.","operations":[{"op":"autoOrganize"}]}

### CRITICAL RULES
When improving an existing canvas:
- Use **updateNodeData** to modify properties of existing nodes (don't recreate them)
- Use **reparentNode** to move existing nodes into new VPC/subnet containers
- Use **addBlueprint/addNode** only for genuinely new resources (VPC, subnet, cache, auth, secrets)
- Use **addEdge** to wire new resources to existing ones
- Reference existing node IDs from the canvas state — don't use "ai-" prefix for nodes that already exist

**PARENT RULE — NEVER SET parentId TO A NON-CONTAINER NODE:**
- Only nodes with type "container" (VPCs, Subnets, Groups) can be parents.
- NEVER set parentId to a backend, database, cache, gateway, static site, or any resource node.
- New nodes like Redis Cache, Secrets, Auth are standalone — place them at root level (no parentId) unless they belong inside a VPC/Subnet.
- Use **addEdge** (not parentId) to express connections between resources (e.g. backend → cache, backend → database).

## Current Canvas

Nodes:
${nodesSummary}

Connections:
${edgesSummary}

${selectedSummary}
${schemaContext}

## Response Format

ALWAYS respond with this exact JSON shape:
{"explanation":"Short friendly summary","operations":[...]}

Rules for suggestions:
- After BUILDING something (operations not empty): include 2-3 short suggestions for next steps
- After answering a FACTUAL question: NO suggestions
- When user ASKS for suggestions ("what next?", "improve this", "help me"): include suggestions as short actionable phrases
- Suggestions must be SHORT (under 10 words each) — they render as clickable chips, not paragraphs
- Keep explanations to 1-3 sentences max. Never write bullet point lists in the explanation.

## Behavior Guidelines

- For clear build/modify intents, act immediately with best defaults — don't ask.
- "database" = postgresql, "cache" = redis, "queue" = rabbitmq, "backend" = scalable-backend, "frontend" = static-site, "api" = gateway, "storage" = storage, "logs" = logs, "auth" = auth, "secrets" = secrets, "repo"/"repository"/"github" = github-repository, "env"/"environment variables"/"config" = env-config.

## CANVAS VIEW LEVELS

The canvas has two view levels:

**Level 1 — Basic (Architecture view):** Shows the architecture — services, databases, gateways, auth, logs, connections. How things connect and flow. Suitable for developers and architects.

**Level 2 — Professional (Infrastructure view):** Shows everything from Basic PLUS VPCs, subnets, firewalls, DNS, IAM roles, security policies. The full infrastructure detail. Suitable for DevOps and SREs.

**What this means for you:**
- For simple requests ("build me a web app"), generate architecture-level resources — services, databases, gateways, connections. Don't add VPCs/subnets unless asked.
- When the user asks for "VPC", "subnet", "networking", "infrastructure", "firewall", or "IAM" — generate infrastructure-level resources.

## VPC & NETWORKING CONTAINERS

VPCs and Subnets are **pure containers** — they hold resources inside them via parentId. They are NOT connected with edges.

**CRITICAL: NEVER create edges (addEdge) to or from VPCs or Subnets.** They are containers, not services. Resources inside them connect to each other with edges. The VPC/Subnet just groups them visually.

**Creating containers:**
{"op":"addNode", "node":{"id":"ai-n-1", "type":"container", "position":{"x":0,"y":0}, "data":{"iceType":"Network.VPC", "label":"Production VPC", "behavior":"container", "groupColor":"#6366f1", "folded":false}}}
{"op":"addNode", "node":{"id":"ai-n-2", "type":"container", "parentId":"ai-n-1", "position":{"x":0,"y":0}, "data":{"iceType":"Network.Subnet", "label":"Private Subnet", "behavior":"container", "groupColor":"#8b5cf6", "folded":false, "visibility":"private"}}}
Note: use type "container" for VPC/Subnet (not "group"). Always include behavior:"container", groupColor, and folded:false.

**Placing resources inside containers — use parentId:**
{"op":"addBlueprint", "id":"ai-n-4", "iceType":"Network.Gateway", "label":"API Gateway", "parentId":"ai-n-2", "dataOverrides":{"domain":"api.example.com"}}
{"op":"addBlueprint", "id":"ai-n-5", "iceType":"Compute.Container", "label":"Backend", "parentId":"ai-n-3", "dataOverrides":{"exposed":false}}

**Edges connect resources to each other, NEVER to containers:**
{"op":"addEdge", "edge":{"id":"ai-e-1", "source":"ai-n-4", "target":"ai-n-5", "data":{"relationship":"connects_to"}}}

**Do NOT set width/height on containers** — the canvas auto-resizes them to fit their children.

**Containment rules:**
- VPC can contain: Subnets, Gateways, Firewalls
- Subnet can contain: Containers, Functions, VMs, Databases, Storage, Queues, Secrets, Auth
- Private subnet resources: set "exposed":false — public traffic won't connect to them
- ALL resources in a VPC architecture must be inside a subnet — never place resources directly in VPC or outside it
- Secrets, Auth, Storage — these belong inside the private subnet alongside the services that use them
- NEVER create an empty subnet — every subnet must contain at least one resource

## PUBLIC TRAFFIC (Automatic — DO NOT CREATE)

The canvas has a built-in "Public Traffic" user icon that AUTOMATICALLY appears and connects to all publicly exposed services. You do NOT need to add a public-traffic block — it is handled by the canvas UI.

**NEVER use addBlueprint with iceType "Network.PublicEndpoint".** The canvas auto-detects exposed services and draws the user traffic icon for them.

**How the canvas decides what's exposed:**
- Services with a domain, URL, or subdomain property are considered public entry points
- Entry-facing types (API Gateway, CDN, Load Balancer, WAF) are public entry points
- Services inside a VPC/private network with no public domain are internal

**What this means for you:**
- When setting up a frontend or gateway, set a domain property in dataOverrides (e.g. "domain": "myapp.com") — the canvas will automatically connect user traffic to it
- Do NOT manually create traffic entry point blocks
- Focus on building the service graph correctly: Frontend → API Gateway → Backend → Database — the public traffic icon handles the "users" part automatically

## SOURCE & CONFIG BLOCKS

Two special provider-agnostic blocks are available:

**Source.Repository** — Represents a source code repository. Use when user mentions a GitHub repo, source code, or deploying from a repo.
- iceType: "Source.Repository"
- Key dataOverrides: repository (e.g. "myorg/my-app"), branch (default "main"), path (default "/"), buildCommand (e.g. "npm run build"), outputDirectory (e.g. "dist"), autoDeploy (boolean)
- Connect FROM repo TO the service it builds: repo → service (connects_to)

**Config.Environment** — Represents environment variables and configuration. Use when user mentions env vars, config, credentials, or connection strings.
- iceType: "Config.Environment"
- Key dataOverrides: environment ("development"|"staging"|"production"), variables (array of {name, value} objects)
- Connect FROM service TO env-config: service → env-config (depends_on)
- When a database exists, auto-populate DATABASE_URL in variables
- When a cache exists, auto-populate REDIS_URL in variables
- When secrets exist, reference them with secret_ref instead of value

Example — "deploy my GitHub repo myorg/api with database credentials":
1. addBlueprint: Source.Repository with repository="myorg/api", branch="main", buildCommand="npm run build"
2. addBlueprint: Compute.Container (Backend)
3. addBlueprint: Database.PostgreSQL (Database)
4. addBlueprint: Config.Environment with variables=[{name:"DATABASE_URL", value:"postgres://db:5432/app"}, {name:"NODE_ENV", value:"production"}]
5. addEdge: repo → backend (connects_to)
6. addEdge: backend → database (depends_on)
7. addEdge: backend → env-config (depends_on)
- Generate sensible labels: "Redis Cache", "Users Database", "API Gateway" — not technical IDs.
- If the user references "this", "selected", or "it", operate on the selected nodes.
- Suggestions should be practical next steps a non-technical user would understand.
- Use existing node IDs from the canvas state when referencing them. For new IDs, use "ai-" prefix.

${generateAiConnectionPrompt()}

## WIRING RULES

EVERY time you add resources, you MUST also add edges to connect them. No resource should be left disconnected.

**When user says "build me X" or "create X" (multi-resource intent):**
Build a complete architecture. ALWAYS add addEdge operations. Think about the data flow:
- Frontend → API Gateway → Backend → Database is a typical chain
- Backend → Cache, Backend → Queue, Backend → Storage are common dependencies
- Auth, Secrets, Logs connect to the services that use them

**When user says "add X":** Auto-connect to the most logical existing node.
**When user says "add X in front of Y":** Place X and connect X → Y.
**When user says "add X to Y":** Connect Y → X (Y depends on X).

**ID conventions:**
- Every addBlueprint MUST include an "id" field (e.g. "ai-n-1", "ai-n-2")
- Every addEdge MUST reference these IDs as source/target
- Edge IDs use "ai-e-1", "ai-e-2", etc.`;

  // Detect and inject specialized skill prompt
  const skill = intent ? detectSkill(intent) : 'default';
  if (skill === 'cloud-architect') {
    const providerBlocks = canvas.availableBlockTypes;
    basePrompt += buildCloudArchitectPrompt(dominantProvider, providerBlocks);
    console.log('[AI] Cloud Architect skill activated for intent:', intent?.slice(0, 80));
  }

  // AI Read L1: inject deployment state when the intent is a question.
  // The instructions block is appended unconditionally so the model knows
  // how to behave when the context is present vs absent.
  if (intent && cardId && isQuestionIntent(intent)) {
    basePrompt += await buildDeploymentContext(cardId);
    basePrompt += `\n## How to answer questions about deployment state\n\nWhen the user asks about what's deployed, running, or the current state:\n1. Use the "Deployment Status" section above — it shows what was last deployed and when.\n2. Be honest about staleness: "Based on the last deployment ${'{time}'} ago..."\n3. If the section says "not been deployed yet", tell the user exactly that.\n4. If the last deployment failed, explain what went wrong from the Errors list.\n5. Suggest running a drift check if they want current cloud state.\n6. Do NOT generate canvas operations for pure questions — return an explanation with operations: [].\n`;
    console.log('[AI] Question intent — deployment context injected for card', cardId);
  }

  return basePrompt;
}

// =============================================================================
// Non-Streaming Response
// =============================================================================

export async function processCanvasIntent(
  intent: string,
  canvas: SerializedCanvas,
  cardId?: string,
): Promise<AiResponse> {
  const provider = await getAiProvider();
  const audit = createAuditEntry(intent, canvas);
  const startTime = Date.now();

  try {
    const systemPrompt = await buildSystemPrompt(canvas, intent, cardId);
    const isArchitectMode = detectSkill(intent) === 'cloud-architect';

    const response = await provider.chat({
      systemPrompt,
      messages: [{ role: 'user', content: intent }],
      maxTokens: isArchitectMode ? 8192 : 4096,
    });

    const rawResponse = response.content;
    if (!rawResponse) {
      finalizeAuditEntry(audit, {
        rawResponse: '',
        parseSuccess: false,
        durationMs: Date.now() - startTime,
        error: 'No text content in response',
      });
      writeAuditEntry(audit);
      return { explanation: 'No response generated', operations: [] };
    }
    const allowedBlocks = new Set(canvas.availableBlockTypes);
    const parsed = parseAiResponse(rawResponse, allowedBlocks);

    console.log('[AI] Canvas intent processed:', {
      intent,
      operationCount: parsed.operations.length,
      explanation: parsed.explanation?.slice(0, 100),
      hasCloudOps: parsed.operations.some((op) => op.op === 'addBlueprint' || op.op === 'addNode'),
      rawResponseLength: rawResponse.length,
    });

    // Run validation and dry-run in background (fire-and-forget audit enrichment)
    runPostProcessing(audit, parsed, canvas, rawResponse, startTime);

    return parsed;
  } catch (err: any) {
    finalizeAuditEntry(audit, {
      durationMs: Date.now() - startTime,
      error: err.message,
    });
    writeAuditEntry(audit);
    throw err;
  }
}

// =============================================================================
// Streaming Response (SSE)
// =============================================================================

export async function streamCanvasIntent(
  intent: string,
  canvas: SerializedCanvas,
  res: Response,
  cardId?: string,
): Promise<void> {
  const provider = await getAiProvider();
  const audit = createAuditEntry(intent, canvas);
  const startTime = Date.now();
  const systemPrompt = await buildSystemPrompt(canvas, intent, cardId);

  // Set up SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  const sendEvent = (event: AiStreamEvent) => {
    res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  };

  const isArchitectMode = detectSkill(intent) === 'cloud-architect';
  sendEvent({
    type: 'thinking',
    status: isArchitectMode ? 'Designing your cloud architecture...' : 'Analyzing your canvas...',
  });

  try {
    let fullText = '';

    for await (const chunk of provider.streamChat({
      systemPrompt,
      messages: [{ role: 'user', content: intent }],
      maxTokens: isArchitectMode ? 8192 : 4096,
    })) {
      fullText += chunk.content;
    }

    // Parse the complete response — validate against block registry
    const allowedBlocks = new Set(canvas.availableBlockTypes);
    const parsed = parseAiResponse(fullText, allowedBlocks);

    // Stream individual operations
    for (const op of parsed.operations) {
      sendEvent({ type: 'operation', operation: op });
    }

    if (parsed.explanation) {
      sendEvent({ type: 'explanation', text: parsed.explanation });
    }

    if (parsed.suggestions && parsed.suggestions.length > 0) {
      sendEvent({ type: 'suggestions', items: parsed.suggestions });
    }

    if (parsed.clarification) {
      sendEvent({ type: 'clarification', clarification: parsed.clarification });
    }

    sendEvent({ type: 'done' });

    // Run validation and dry-run in background (fire-and-forget audit enrichment)
    runPostProcessing(audit, parsed, canvas, fullText, startTime);
  } catch (err) {
    finalizeAuditEntry(audit, {
      durationMs: Date.now() - startTime,
      error: (err as Error).message,
    });
    writeAuditEntry(audit);
    sendEvent({ type: 'error', message: (err as Error).message });
  } finally {
    res.end();
  }
}

// =============================================================================
// Post-Processing (Audit Enrichment)
// =============================================================================

async function runPostProcessing(
  audit: ReturnType<typeof createAuditEntry>,
  parsed: AiResponse,
  canvas: SerializedCanvas,
  rawResponse: string,
  startTime: number,
): Promise<void> {
  try {
    // Run validation + dry-run concurrently
    const [validation, dryRun] = await Promise.allSettled([
      validateCanvas(canvas.nodes as any[], canvas.edges as any[]),
      dryRunDeploy(canvas.nodes as any[], canvas.edges as any[]),
    ]);

    finalizeAuditEntry(audit, {
      operations: parsed.operations,
      rawResponse,
      parseSuccess: parsed.operations.length > 0 || !!parsed.explanation,
      durationMs: Date.now() - startTime,
      schemaValidation:
        validation.status === 'fulfilled'
          ? {
              valid: validation.value.valid,
              errorCount: validation.value.errors.length,
              errors: validation.value.errors,
            }
          : undefined,
      deployDryRun:
        dryRun.status === 'fulfilled'
          ? { success: dryRun.value.success, deployableCount: dryRun.value.deployableCount, error: dryRun.value.error }
          : undefined,
    });
  } catch {
    finalizeAuditEntry(audit, {
      operations: parsed.operations,
      rawResponse,
      parseSuccess: parsed.operations.length > 0 || !!parsed.explanation,
      durationMs: Date.now() - startTime,
    });
  }

  writeAuditEntry(audit);
}

// =============================================================================
// Response Parsing
// =============================================================================

function parseAiResponse(text: string, allowedBlockTypes?: Set<string>): AiResponse {
  // Try to extract JSON from the response (may be wrapped in markdown, thinking tags, or preamble text)
  let jsonStr = text.trim();

  // Strip markdown code fences
  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    jsonStr = fenceMatch[1].trim();
  }

  // Strip <think>...</think> tags (local models with reasoning)
  jsonStr = jsonStr.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  // If text doesn't start with { or [, try to find JSON object within it
  if (!jsonStr.startsWith('{') && !jsonStr.startsWith('[')) {
    const jsonStart = jsonStr.indexOf('{"');
    if (jsonStart >= 0) {
      jsonStr = jsonStr.slice(jsonStart);
    }
  }

  // Try parsing, then repair if needed
  let parsed: Record<string, unknown> | null = null;

  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    // Attempt JSON repair for common local model issues
    const repaired = repairJson(jsonStr);
    if (repaired) {
      try {
        parsed = JSON.parse(repaired);
        console.log('[AI] JSON repaired successfully');
      } catch {
        // Still broken
      }
    }
  }

  if (parsed) {
    const validOps = Array.isArray(parsed.operations) ? validateOperations(parsed.operations, allowedBlockTypes) : [];
    const rawOpsCount = Array.isArray(parsed.operations) ? (parsed.operations as unknown[]).length : 0;

    if (rawOpsCount > 0 && validOps.length < rawOpsCount) {
      console.warn(`[AI] ${rawOpsCount - validOps.length}/${rawOpsCount} operations filtered by validation`);
    }

    return {
      explanation: (parsed.explanation as string) || '',
      operations: validOps,
      suggestions: Array.isArray(parsed.suggestions) ? (parsed.suggestions as string[]) : undefined,
      clarification: parsed.clarification as AiResponse['clarification'],
    };
  }

  // If JSON parsing fails completely, treat as explanation-only
  console.error('[AI] Failed to parse AI response as JSON.\nRaw text:', text.slice(0, 300));
  return {
    explanation: text.slice(0, 200),
    operations: [],
  };
}

/**
 * Attempt to fix common JSON issues from local models:
 * - Missing { before "op": in arrays → },{"op": instead of },"op":
 * - Trailing commas before ] or }
 * - Unclosed arrays/objects
 * - Truncated responses (close any open brackets)
 */
function repairJson(text: string): string | null {
  let s = text;

  // Fix missing { before "op" keys in arrays: },"op": → },{"op":
  s = s.replace(/\},\s*"op"\s*:/g, '},{"op":');

  // Fix missing { before other common keys after array comma
  s = s.replace(/\],\s*"op"\s*:/g, '],{"op":');

  // Remove trailing commas before } or ]
  s = s.replace(/,\s*([}\]])/g, '$1');

  // Count brackets and close unclosed ones
  let braces = 0;
  let brackets = 0;
  let inString = false;
  let escaped = false;

  for (const ch of s) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{') braces++;
    if (ch === '}') braces--;
    if (ch === '[') brackets++;
    if (ch === ']') brackets--;
  }

  // Close unclosed structures (truncated response)
  while (brackets > 0) {
    s += ']';
    brackets--;
  }
  while (braces > 0) {
    s += '}';
    braces--;
  }

  return s !== text ? s : null;
}

const VALID_OPS = new Set([
  'addNode',
  'addEdge',
  'updateNodeData',
  'updateNodePosition',
  'resizeNode',
  'reparentNode',
  'deleteNode',
  'deleteEdge',
  'updateEdgeData',
  'autoOrganize',
  'addBlueprint',
]);

// Valid addNode group iceTypes (containers, not resources)
const VALID_GROUP_TYPES = new Set([
  'Network.VPC',
  'Network.Subnet',
  'Group.Frontend',
  'Group.Services',
  'Group.Data',
  'Group.Messaging',
  'Group.Monitoring',
  'Group.External',
  'Group.Custom',
]);

function validateOperations(ops: unknown[], allowedBlockTypes?: Set<string>): AiCanvasOp[] {
  return ops.filter((op): op is AiCanvasOp => {
    if (!op || typeof op !== 'object') return false;
    const record = op as Record<string, unknown>;
    const opType = record.op;
    if (typeof opType !== 'string' || !VALID_OPS.has(opType)) return false;

    // Validate addBlueprint uses a real registered iceType
    if (opType === 'addBlueprint' && allowedBlockTypes) {
      const iceType = record.iceType as string;
      if (!iceType || !allowedBlockTypes.has(iceType)) {
        console.warn(`[AI] Rejected unknown iceType: "${iceType}"`);
        return false;
      }
    }

    // Validate addNode group types
    if (opType === 'addNode') {
      const node = record.node as Record<string, unknown> | undefined;
      if (node?.type === 'group') {
        const iceType = (node.data as Record<string, unknown>)?.iceType as string;
        if (iceType && !VALID_GROUP_TYPES.has(iceType)) {
          console.warn(`[AI] Rejected unknown group iceType: "${iceType}"`);
          return false;
        }
      }
    }

    return true;
  });
}
