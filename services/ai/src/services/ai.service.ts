/**
 * AI Service — Claude API Integration
 *
 * Processes natural language intents against canvas context,
 * returning structured canvas operations as JSON.
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  AiCanvasOp,
  AiResponse,
  SerializedCanvas,
  AiStreamEvent,
} from '@ice-saas/types';
import { generateAiConnectionPrompt } from '@ice-saas/types';
import type { Response } from 'express';
import { buildSchemaContext } from './ai-schema-context.service';
import {
  createAuditEntry,
  finalizeAuditEntry,
  writeAuditEntry,
} from './ai-audit.service';
import { validateCanvas } from './canvas-validation.service';
import { dryRunDeploy } from './deploy-dryrun.service';

// =============================================================================
// Claude Client
// =============================================================================

let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is required');
    }
    _client = new Anthropic({ apiKey });
  }
  return _client;
}

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
// Cloud Architect Skill Prompt
// =============================================================================

function buildCloudArchitectPrompt(dominantProvider: string, blockTypes: string[]): string {
  // Group available blocks by category for the architect
  const categories: Record<string, string[]> = {};
  for (const bt of blockTypes) {
    const prefix = bt.startsWith(dominantProvider + '-')
      ? bt.slice(dominantProvider.length + 1)
      : bt;
    // Derive category from block name
    if (prefix.includes('backend') || prefix.includes('worker') || prefix.includes('function') || prefix.includes('scheduled') || prefix.includes('ssr') || prefix.includes('static'))
      (categories['Compute'] ??= []).push(bt);
    else if (prefix.includes('postgres') || prefix.includes('mysql') || prefix.includes('mongo') || prefix.includes('redis') || prefix.includes('vector') || prefix.includes('warehouse') || prefix.includes('search'))
      (categories['Databases & Cache'] ??= []).push(bt);
    else if (prefix.includes('storage') || prefix.includes('cdn'))
      (categories['Storage'] ??= []).push(bt);
    else if (prefix.includes('gateway') || prefix.includes('loadbalancer') || prefix.includes('dns') || prefix.includes('cdn'))
      (categories['Networking'] ??= []).push(bt);
    else if (prefix.includes('auth') || prefix.includes('secret') || prefix.includes('firewall') || prefix.includes('waf'))
      (categories['Security'] ??= []).push(bt);
    else if (prefix.includes('log') || prefix.includes('monitor'))
      (categories['Observability'] ??= []).push(bt);
    else if (prefix.includes('queue') || prefix.includes('rabbit') || prefix.includes('event') || prefix.includes('kafka'))
      (categories['Messaging & Events'] ??= []).push(bt);
    else if (prefix.includes('llm') || prefix.includes('ml') || prefix.includes('ai'))
      (categories['AI/ML'] ??= []).push(bt);
    else
      (categories['Other'] ??= []).push(bt);
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
Always provide 3 actionable follow-up suggestions like:
- "Add CI/CD pipeline with GitHub repository"
- "Improve security with VPC and private subnets"
- "Add caching layer for better performance"
`;
}

// =============================================================================
// System Prompt Builder
// =============================================================================

async function buildSystemPrompt(canvas: SerializedCanvas, intent?: string): Promise<string> {
  const nodesSummary = canvas.nodes.length > 0
    ? canvas.nodes.map((n) => `  - ${n.id}: ${n.iceType} "${n.label}"${n.parentId ? ` (in ${n.parentId})` : ''}`).join('\n')
    : '  (empty canvas)';

  const edgesSummary = canvas.edges.length > 0
    ? canvas.edges.map((e) => `  - ${e.source} → ${e.target}${e.relationship ? ` (${e.relationship})` : ''}`).join('\n')
    : '  (no connections)';

  const selectedSummary = canvas.selectedNodeIds.length > 0
    ? `Selected nodes: ${canvas.selectedNodeIds.join(', ')}`
    : 'No nodes selected';

  // Detect the dominant provider from existing nodes (default: aws)
  const providerCounts: Record<string, number> = {};
  for (const n of canvas.nodes) {
    const p = n.provider || '';
    if (p) providerCounts[p] = (providerCounts[p] || 0) + 1;
  }
  const dominantProvider = Object.entries(providerCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'aws';

  // Build schema context from real resource definitions
  const existingIceTypes = canvas.nodes
    .map((n) => n.iceType)
    .filter((t): t is string => !!t);

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

**ASK via clarification** when the user asks a question, needs guidance, or the intent is genuinely ambiguous:
- "what provider should I use?" → answer helpfully, suggest based on their canvas or use case
- "how does this work?" → explain the concept simply
- "what's the difference between X and Y?" → compare them
- "which database is best for my app?" → recommend based on context
- "can you help me?" / "I'm not sure what to do" → guide them with suggestions
- "what should I add next?" → look at the canvas and suggest the logical next step

For questions/guidance, respond with:
{"explanation":"Your helpful answer here","operations":[],"suggestions":["actionable next step 1","actionable next step 2","actionable next step 3"]}

Use the "clarification" field ONLY when you truly cannot proceed without user input (e.g., user says "deploy it" but there are resources from 3 different providers and you don't know which):
{"explanation":"Quick context","operations":[],"clarification":{"question":"Which provider?","options":["AWS","GCP","Azure"]}}

## Operations — STRICT BLOCK REGISTRY

You MUST ONLY use blockTypes from the list below. These are the ONLY blocks that exist. If a blockType is not in this list, it DOES NOT EXIST and MUST NOT be used. Any operation with an unknown blockType will be rejected.

### Available blockTypes for "${dominantProvider}":
${canvas.availableBlockTypes.filter(t => t.startsWith(dominantProvider + '-') || !t.includes('-')).join(', ')}

### Provider-agnostic blocks (work with any provider):
github-repository, env-config

### Full registry (all providers):
${canvas.availableBlockTypes.join(', ')}

**Mapping from user intent to EXACT blockType (for provider "${dominantProvider}"):**
- "frontend" / "website" / "static site" → ${dominantProvider}-static-site
- "SSR" / "Next.js" / "server-rendered" → ${dominantProvider}-ssr-site
- "backend" / "service" / "API server" → ${dominantProvider}-scalable-backend
- "worker" / "background job" → ${dominantProvider}-worker
- "cron" / "scheduled task" → ${dominantProvider}-scheduled-task
- "function" / "lambda" / "serverless" → ${dominantProvider}-serverless-function
- "database" / "postgres" / "SQL" → ${dominantProvider}-postgresql
- "mysql" → ${dominantProvider}-mysql
- "mongodb" / "document db" → ${dominantProvider}-mongodb
- "cache" / "redis" → ${dominantProvider}-redis-cache
- "storage" / "bucket" / "S3" / "files" → ${dominantProvider}-storage
- "API gateway" / "gateway" → ${dominantProvider}-gateway
- "queue" / "rabbitmq" → ${dominantProvider}-rabbitmq
- "event stream" / "kafka" → ${dominantProvider}-event-stream
- "auth" / "login" / "users" → ${dominantProvider}-auth
- "secrets" / "keys" / "credentials" → ${dominantProvider}-secrets
- "logs" / "monitoring" → ${dominantProvider}-logs
- "LLM" / "AI gateway" → ${dominantProvider}-llm-gateway
- "vector db" / "embeddings" → ${dominantProvider}-vector-db
- "ML model" → ${dominantProvider}-ml-model
- "data warehouse" / "analytics" → ${dominantProvider}-data-warehouse
- "search" / "elasticsearch" → ${dominantProvider}-search
- "repo" / "github" / "source code" → github-repository
- "env vars" / "config" / "environment" → env-config

DO NOT invent blockTypes. DO NOT use blockTypes not listed above.

All operation formats:
- addBlueprint: {"op":"addBlueprint", "id":"ai-n-1", "blockType":"...", "label":"...", "parentId":"optional", "dataOverrides":{...properties...}}
- addEdge: {"op":"addEdge", "edge":{"id":"ai-e-1", "source":"...", "target":"...", "data":{"relationship":"connects_to|depends_on"}}}
- updateNodeData: {"op":"updateNodeData", "nodeId":"...", "data":{...}}
- deleteNode: {"op":"deleteNode", "nodeId":"..."}
- deleteEdge: {"op":"deleteEdge", "edgeId":"..."}
- addNode: {"op":"addNode", "node":{"id":"ai-n-1", "type":"resource|group", "position":{"x":0,"y":0}, "data":{"iceType":"...", "label":"..."}}}
- reparentNode: {"op":"reparentNode", "nodeId":"...", "parentId":"...|null"}
- autoOrganize: {"op":"autoOrganize"}

## PROPERTY PRE-FILL RULES — CRITICAL

When adding any resource via addBlueprint, you MUST populate dataOverrides with sensible property values that match the user's intent. NEVER leave dataOverrides empty — always fill in what a real deployment would need.

**Always set these when the resource schema has them:**
- Machine/instance type (e.g. "e2-medium", "t3.medium", "Standard_B2s") — pick based on workload size
- Min/max instances or replicas (e.g. min: 1, max: 3 for dev; min: 2, max: 10 for production)
- Storage size (e.g. 20 GB for dev databases, 100 GB for production)
- Engine version (e.g. "postgres16", "redis7", "mysql8")
- Region (match the dominant provider's default region)
- CPU/memory when applicable
- Port numbers (e.g. 5432 for postgres, 6379 for redis, 80/443 for web)
- High-availability / multi-AZ settings (off for dev, on for production)

**How to pick values based on intent:**
- "build me a small/simple/dev/test X" → smallest viable: 1 instance, small machine, 10-20 GB storage
- "build me X" (no size hint) → reasonable defaults: 1-2 instances, medium machine, 20-50 GB storage
- "build me a production/scalable/enterprise X" → production-grade: 2+ min instances, larger machines, 100+ GB, HA enabled
- "build me a high-performance/large X" → max tier: large machines, high storage, high replica counts

**Use the Available Resource Schemas section below to find the exact property names and allowed values for each resource type. Match property names exactly.**

## INFRASTRUCTURE OPTIMIZATION GUIDELINES

When the user asks to "improve", "optimize", "harden", or "upgrade" their architecture, analyze the EXISTING canvas and add/modify what's MISSING. Don't rebuild — improve what's there.

### "improve security" / "harden" / "make it secure"
Audit the existing canvas and apply ALL missing items:
1. **VPC + Subnets** — if databases/backends are NOT inside a VPC, wrap them:
   - Create VPC (addNode, type: "group", iceType: "Network.VPC")
   - Create Private Subnet inside VPC for backends + databases (exposed: false)
   - Create Public Subnet inside VPC for gateways only
   - Use reparentNode to MOVE existing nodes into subnets
2. **Secrets** — if services connect to databases but no secrets block exists, add one in the private subnet
3. **Auth** — if no auth block exists and there's a frontend/gateway, add auth
4. **Gateway** — if backend is publicly exposed without a gateway, add a gateway in front
5. **Properties** — update existing nodes: set high_availability: true, encryption: true, ssl: true
6. **Connections** — ensure backend → secrets (depends_on), gateway → backend (connects_to)

Key: databases and backends MUST end up inside a private subnet. If they're currently at root level, use reparentNode to move them into the new subnet.

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

### CRITICAL RULE FOR IMPROVEMENTS
When improving an existing canvas:
- Use **updateNodeData** to modify properties of existing nodes (don't recreate them)
- Use **reparentNode** to move existing nodes into new VPC/subnet containers
- Use **addBlueprint/addNode** only for genuinely new resources (VPC, subnet, cache, auth, secrets)
- Use **addEdge** to wire new resources to existing ones
- Reference existing node IDs from the canvas state — don't use "ai-" prefix for nodes that already exist

## Current Canvas

Nodes:
${nodesSummary}

Connections:
${edgesSummary}

${selectedSummary}
${schemaContext}

## Response Format

ALWAYS respond with this exact JSON shape:
{"explanation":"Short friendly summary of what you did","operations":[...],"suggestions":["next step 1","next step 2"]}

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
{"op":"addNode", "node":{"id":"ai-n-1", "type":"group", "position":{"x":100,"y":100}, "data":{"iceType":"Network.VPC", "label":"Production VPC", "provider":"aws", "cidr":"10.0.0.0/16"}}}
{"op":"addNode", "node":{"id":"ai-n-2", "type":"group", "parentId":"ai-n-1", "position":{"x":120,"y":160}, "data":{"iceType":"Network.Subnet", "label":"Public Subnet", "provider":"aws", "cidr":"10.0.0.0/24", "visibility":"public"}}}
{"op":"addNode", "node":{"id":"ai-n-3", "type":"group", "parentId":"ai-n-1", "position":{"x":500,"y":160}, "data":{"iceType":"Network.Subnet", "label":"Private Subnet", "provider":"aws", "cidr":"10.0.1.0/24", "visibility":"private", "exposed":false}}}

**Placing resources inside containers — use parentId:**
{"op":"addBlueprint", "id":"ai-n-4", "blockType":"aws-gateway", "label":"API Gateway", "parentId":"ai-n-2", "dataOverrides":{"domain":"api.example.com"}}
{"op":"addBlueprint", "id":"ai-n-5", "blockType":"aws-scalable-backend", "label":"Backend", "parentId":"ai-n-3", "dataOverrides":{"exposed":false}}

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

**NEVER use addBlueprint with blockType "public-traffic", "aws-public-traffic", "gcp-public-traffic", etc.** The canvas auto-detects exposed services and draws the user traffic icon for them.

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

**github-repository** — Represents a source code repository. Use when user mentions a GitHub repo, source code, or deploying from a repo.
- blockType: "github-repository" (no provider prefix)
- Key dataOverrides: repository (e.g. "myorg/my-app"), branch (default "main"), path (default "/"), buildCommand (e.g. "npm run build"), outputDirectory (e.g. "dist"), autoDeploy (boolean)
- Connect FROM repo TO the service it builds: repo → service (connects_to)

**env-config** — Represents environment variables and configuration. Use when user mentions env vars, config, credentials, or connection strings.
- blockType: "env-config" (no provider prefix)
- Key dataOverrides: environment ("development"|"staging"|"production"), variables (array of {name, value} objects)
- Connect FROM service TO env-config: service → env-config (depends_on)
- When a database exists, auto-populate DATABASE_URL in variables
- When a cache exists, auto-populate REDIS_URL in variables
- When secrets exist, reference them with secret_ref instead of value

Example — "deploy my GitHub repo myorg/api with database credentials":
1. addBlueprint: github-repository with repository="myorg/api", branch="main", buildCommand="npm run build"
2. addBlueprint: scalable-backend (Backend)
3. addBlueprint: postgresql (Database)
4. addBlueprint: env-config with variables=[{name:"DATABASE_URL", value:"postgres://db:5432/app"}, {name:"NODE_ENV", value:"production"}]
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
    const providerBlocks = canvas.availableBlockTypes.filter(
      t => t.startsWith(dominantProvider + '-') || !t.includes('-')
    );
    basePrompt += buildCloudArchitectPrompt(dominantProvider, providerBlocks);
    console.log('[AI] Cloud Architect skill activated for intent:', intent?.slice(0, 80));
  }

  return basePrompt;
}

// =============================================================================
// Non-Streaming Response
// =============================================================================

export async function processCanvasIntent(
  intent: string,
  canvas: SerializedCanvas,
): Promise<AiResponse> {
  const client = getClient();
  const audit = createAuditEntry(intent, canvas);
  const startTime = Date.now();

  try {
    const systemPrompt = await buildSystemPrompt(canvas, intent);
    const isArchitectMode = detectSkill(intent) === 'cloud-architect';

    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: isArchitectMode ? 8192 : 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: intent }],
    });

    const textContent = message.content.find((c) => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      finalizeAuditEntry(audit, {
        rawResponse: '',
        parseSuccess: false,
        durationMs: Date.now() - startTime,
        error: 'No text content in response',
      });
      writeAuditEntry(audit);
      return { explanation: 'No response generated', operations: [] };
    }

    const rawResponse = textContent.text;
    const allowedBlocks = new Set(canvas.availableBlockTypes);
    const parsed = parseAiResponse(rawResponse, allowedBlocks);

    console.log('[AI] Canvas intent processed:', {
      intent,
      operationCount: parsed.operations.length,
      explanation: parsed.explanation?.slice(0, 100),
      hasCloudOps: parsed.operations.some(op => op.op === 'addBlueprint' || op.op === 'addNode'),
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
): Promise<void> {
  const client = getClient();
  const audit = createAuditEntry(intent, canvas);
  const startTime = Date.now();
  const systemPrompt = await buildSystemPrompt(canvas, intent);

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
    status: isArchitectMode
      ? 'Designing your cloud architecture...'
      : 'Analyzing your canvas...',
  });

  try {
    const stream = client.messages.stream({
      model: 'claude-sonnet-4-20250514',
      max_tokens: isArchitectMode ? 8192 : 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: intent }],
    });

    let fullText = '';

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        fullText += event.delta.text;
      }
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
      schemaValidation: validation.status === 'fulfilled'
        ? { valid: validation.value.valid, errorCount: validation.value.errors.length, errors: validation.value.errors }
        : undefined,
      deployDryRun: dryRun.status === 'fulfilled'
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
  // Try to extract JSON from the response (may be wrapped in markdown code blocks)
  let jsonStr = text.trim();

  // Strip markdown code fences
  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    jsonStr = fenceMatch[1].trim();
  }

  try {
    const parsed = JSON.parse(jsonStr);
    const validOps = Array.isArray(parsed.operations) ? validateOperations(parsed.operations, allowedBlockTypes) : [];
    const rawOpsCount = Array.isArray(parsed.operations) ? parsed.operations.length : 0;

    if (rawOpsCount > 0 && validOps.length < rawOpsCount) {
      console.warn(`[AI] ${rawOpsCount - validOps.length}/${rawOpsCount} operations filtered by validation`);
    }

    return {
      explanation: parsed.explanation || '',
      operations: validOps,
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : undefined,
      clarification: parsed.clarification || undefined,
    };
  } catch (err) {
    // If JSON parsing fails, treat as explanation-only
    console.error('[AI] Failed to parse AI response as JSON:', (err as Error).message, '\nRaw text:', text.slice(0, 300));
    return {
      explanation: text.slice(0, 200),
      operations: [],
    };
  }
}

const VALID_OPS = new Set([
  'addNode', 'addEdge', 'updateNodeData', 'updateNodePosition',
  'resizeNode', 'reparentNode', 'deleteNode', 'deleteEdge',
  'updateEdgeData', 'autoOrganize', 'addBlueprint',
]);

// Valid addNode group iceTypes (containers, not resources)
const VALID_GROUP_TYPES = new Set([
  'Network.VPC', 'Network.Subnet',
  'Group.Frontend', 'Group.Services', 'Group.Data',
  'Group.Messaging', 'Group.Monitoring', 'Group.External', 'Group.Custom',
]);

function validateOperations(ops: unknown[], allowedBlockTypes?: Set<string>): AiCanvasOp[] {
  return ops.filter((op): op is AiCanvasOp => {
    if (!op || typeof op !== 'object') return false;
    const record = op as Record<string, unknown>;
    const opType = record.op;
    if (typeof opType !== 'string' || !VALID_OPS.has(opType)) return false;

    // Validate addBlueprint uses a real registered blockType
    if (opType === 'addBlueprint' && allowedBlockTypes) {
      const blockType = record.blockType as string;
      if (!blockType || !allowedBlockTypes.has(blockType)) {
        console.warn(`[AI] Rejected unknown blockType: "${blockType}"`);
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
