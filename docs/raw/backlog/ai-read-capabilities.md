# AI Read Capabilities — "What's the current state?"

## Problem

The AI assistant only sees the canvas design (what the user wants to build). It has zero access to what's actually running in the cloud. When users ask questions like "how many instances are running?" or "is my database healthy?", the AI can't answer — it only knows how to modify the canvas.

This makes the AI feel like a one-trick pony. Users expect a cloud assistant that understands their live infrastructure, not just a canvas editor.

## Current State

| Question | Can AI answer? | Why / Why not |
|----------|---------------|---------------|
| "What's on my canvas?" | Yes | Canvas state is serialized and sent as context |
| "Add a database" | Yes | AI generates canvas operations |
| "What did we deploy last?" | No | Deployment results exist in DB but are not passed to AI |
| "Is my backend running?" | No | No live cloud queries exist |
| "How many instances?" | No | Auto-scaling state is not tracked |
| "Show me recent errors" | No | No log integration |
| "Why is my API slow?" | No | No metrics integration |

## Solution: Three Levels

---

## Level 1: Deployment Context in AI Prompt — **DONE** (2026-04-19)

**Priority:** P1 | **Effort:** 2-3 days | **Dependencies:** None

**Shipped:** `isQuestionIntent()` + `buildDeploymentContext(cardId)` in `services/ai/src/services/ai.service.ts`. Question intent matches openers (`what/when/why/how/is/are/does/did/show me/tell me/describe/list`) plus state-query phrases; excludes build commands. Deployment context queries latest `CanvasDeployment` (`action_type: apply`, `status: success|partial|failed`), formats provider/region/environment + resource list + errors. Route threads `cardId` from request body to service functions.

**Goal:** When the user asks a question (not a build command), automatically fetch the last deployment results from the database and inject them into the AI's system prompt. The AI can then answer questions about what was deployed, when, and whether it succeeded.

### What data exists today (in `CanvasDeployment` table)

```
- status: 'success' | 'failed' | 'deploying'
- provider, region, environment
- results: [{ name, type, action, success, error, provider_id, outputs, duration_ms }]
- created_at (when it was deployed)
- plan: { creates, updates, deletes }
```

### What the AI would receive (new context block)

```
## Deployment Status

Last deployed: 2 hours ago (success)
Provider: GCP | Region: us-central1 | Environment: production

Deployed resources:
- "Backend API" (Cloud Run) — running — https://backend-abc123.run.app — 2 instances
- "Users Database" (Cloud SQL) — running — 10.0.0.5:5432 — PostgreSQL 16
- "Redis Cache" (Memorystore) — running — 10.0.0.10:6379 — 1GB

Drift status:
- Backend API: in_sync
- Users Database: drifted (storage_gb: canvas=20, deployed=50)
- Redis Cache: in_sync
```

### Implementation

#### Files to Modify

| File | Change |
|------|--------|
| `services/ai/src/services/ai.service.ts` | In `processCanvasIntent` and `streamCanvasIntent`, detect question intent. If question, fetch deployment context and append to system prompt. |
| `services/ai/src/services/ai.service.ts` | New function `buildDeploymentContext(cardId)` — queries last deployment + drift from DB, formats as text block. |
| `services/ai/src/routes/ai.ts` | Pass `cardId` to the AI service (already in request body). |

#### Question Detection

Add to `detectSkill()` or as a separate function:

```typescript
function isQuestionIntent(intent: string): boolean {
  return /\b(what|how many|is .+ running|status|current state|show me|tell me about|describe|deployed|health|instances?)\b/i.test(intent);
}
```

When detected, fetch and inject:
```typescript
if (isQuestionIntent(intent)) {
  const deployContext = await buildDeploymentContext(cardId);
  systemPrompt += deployContext;
}
```

#### Prompt Addition

```
## How to answer questions about deployment state

When the user asks about what's deployed, running, or the current state:
1. Use the "Deployment Status" section above — it shows what was last deployed and when
2. Be honest about staleness: "Based on the last deployment 2 hours ago..."
3. If no deployment exists, say: "This canvas hasn't been deployed yet"
4. If deployment failed, explain what went wrong
5. Suggest running a drift check if the user wants current cloud state
6. Do NOT generate operations for questions — return explanation only
```

### Verify

- Ask "what's currently deployed?" → AI describes deployed resources from last deployment
- Ask "is my database running?" → AI answers based on last deployment status
- Ask "when was this last deployed?" → AI gives timestamp
- Ask "did the last deploy succeed?" → AI explains result
- Ask "add a database" → still generates operations (not a question)

---

## Level 2: Live Cloud Status Queries

**Priority:** P2 | **Effort:** 5-7 days | **Dependencies:** Level 1

**Goal:** Query actual cloud provider APIs to get real-time resource status. When the user asks "how many instances are running?", ICE calls the Cloud Run API and returns the actual count — not just what was deployed.

### Architecture

```
User: "How many instances are running?"
  ↓
AI detects question intent + needs live data
  ↓
AI service calls new CloudStatusService
  ↓
CloudStatusService uses stored provider_id from last deployment
  ↓
Calls GCP API: GET /v2/projects/{}/locations/{}/services/{}
  ↓
Returns: { instances: 3, url: "https://...", status: "ACTIVE", traffic: "120 req/s" }
  ↓
AI formats answer: "Your backend has 3 instances running, serving 120 req/s"
```

### New Service: `CloudStatusService`

| File | Purpose |
|------|---------|
| `services/deploy/src/services/cloud-status.service.ts` | Queries live cloud state for deployed resources |

#### Methods per resource type

| Resource | GCP API | Data returned |
|----------|---------|---------------|
| Cloud Run | `GET /v2/.../services/{}` | instance count, URL, status, last deployed revision, traffic |
| Cloud SQL | `GET /sql/v1beta4/.../instances/{}` | state (RUNNABLE/STOPPED), IP, storage used, connections |
| Cloud Storage | `GET /storage/v1/b/{}` | size, object count, public access |
| Memorystore | `GET /v1/.../instances/{}` | state, memory used, connections, version |
| Cloud Functions | `GET /v2/.../functions/{}` | state, last invocation, execution count |
| Pub/Sub | `GET /v1/.../topics/{}/subscriptions` | subscription count, message backlog |
| Secret Manager | `GET /v1/.../secrets/{}` | version count, last accessed |
| Load Balancer | `GET /v1/.../forwardingRules/{}` | IP, status, backend health |

#### Interface

```typescript
interface ResourceStatus {
  resourceId: string;        // Canvas node ID
  cloudId: string;           // GCP resource path
  name: string;
  type: string;
  status: 'running' | 'stopped' | 'error' | 'unknown';
  details: Record<string, unknown>;  // Resource-specific (instances, connections, etc.)
  lastChecked: string;       // ISO timestamp
}

interface CloudStatusService {
  getResourceStatus(providerCredentials, deployedResources): Promise<ResourceStatus[]>;
  getResourceDetail(providerCredentials, cloudId, type): Promise<ResourceStatus>;
}
```

### New API Endpoint

```
GET /api/canvas/deploy/live-status/:cardId
→ Returns ResourceStatus[] for all deployed resources
→ Uses stored credentials + provider_ids from last deployment
→ Caches results for 30 seconds (avoid rate limiting)
```

### AI Integration

When user asks a live-data question and Level 1 data is stale (>5 min), the AI service calls the live status endpoint and includes fresh data in the prompt.

### Files to Create

| File | Purpose |
|------|---------|
| `services/deploy/src/services/cloud-status.service.ts` | Live cloud API queries per resource type |
| `packages/core/src/deploy/providers/gcp-status.ts` | GCP-specific status query implementations |

### Files to Modify

| File | Change |
|------|--------|
| `services/deploy/src/routes/canvas-deploy.ts` | Add `GET /live-status/:cardId` endpoint |
| `services/ai/src/services/ai.service.ts` | Call live status when deployment context is stale |

### Verify

- Ask "how many instances are running?" → AI queries Cloud Run, returns actual count
- Ask "is my database healthy?" → AI queries Cloud SQL, returns RUNNABLE status + connections
- Ask "how much storage am I using?" → AI queries GCS, returns actual size
- Stale cache (>30s) → re-queries cloud API
- No credentials → AI says "Connect your cloud provider to see live status"

---

## Level 3: Logs & Metrics Integration

**Priority:** P3 | **Effort:** 7-10 days | **Dependencies:** Level 2

**Goal:** Connect to Cloud Logging and Cloud Monitoring. AI can answer questions about errors, latency, throughput, and performance trends.

### Architecture

```
User: "Why is my API slow?"
  ↓
AI detects performance question
  ↓
Queries Cloud Monitoring for latency metrics (last 1h)
  ↓
Queries Cloud Logging for recent errors
  ↓
AI analyzes: "Latency spiked to 2s at 3:15 PM. Logs show 47 timeout errors
from the database connection pool. Your Cloud SQL instance is at 95% CPU.
Consider upgrading the database size or adding a Redis cache."
```

### New Services

| File | Purpose |
|------|---------|
| `services/deploy/src/services/cloud-logs.service.ts` | Query Cloud Logging API |
| `services/deploy/src/services/cloud-metrics.service.ts` | Query Cloud Monitoring API |

### Cloud Logging Integration

```typescript
interface LogQuery {
  resourceId: string;       // Cloud resource path
  filter?: string;          // e.g. "severity>=ERROR"
  timeRange: '5m' | '1h' | '24h';
  limit: number;            // Max entries (default: 50)
}

interface LogEntry {
  timestamp: string;
  severity: 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
  message: string;
  resource: string;
}
```

### Cloud Monitoring Integration

```typescript
interface MetricQuery {
  resourceId: string;
  metric: 'cpu' | 'memory' | 'latency' | 'request_count' | 'error_rate' | 'connections';
  timeRange: '5m' | '1h' | '24h' | '7d';
  aggregation: 'avg' | 'max' | 'sum' | 'p99';
}

interface MetricResult {
  metric: string;
  timeRange: string;
  dataPoints: Array<{ timestamp: string; value: number }>;
  summary: { min: number; max: number; avg: number; current: number };
}
```

### API Endpoints

```
GET /api/canvas/deploy/logs/:cardId?resource=node-id&severity=ERROR&range=1h
GET /api/canvas/deploy/metrics/:cardId?resource=node-id&metric=cpu&range=1h
```

### AI Integration

When user asks about errors, performance, or "why is X slow/broken", the AI service:
1. Identifies which resource(s) the question is about
2. Fetches relevant logs (last 1h, severity >= WARNING)
3. Fetches relevant metrics (CPU, memory, latency)
4. Injects a "Live Diagnostics" section into the prompt
5. AI analyzes and suggests fixes

### Prompt Addition

```
## Live Diagnostics (queried just now)

### Backend API — Cloud Run
CPU: 45% avg (last 1h), peaked at 92% at 15:15
Latency: 180ms avg, p99: 1.2s
Requests: 3,200/min
Errors: 47 in last hour (all 504 Gateway Timeout)

### Recent Error Logs (last 1h, severity >= ERROR)
[15:15:02] Connection pool exhausted — max connections (5) reached
[15:15:03] Query timeout after 30s on users table
[15:17:45] Connection pool exhausted — max connections (5) reached
...

### Users Database — Cloud SQL
CPU: 95% avg (last 1h) ← HIGH
Storage: 18.5 GB / 20 GB (92%) ← NEAR FULL
Connections: 5/5 (100%) ← MAXED OUT
```

### Files to Create

| File | Purpose |
|------|---------|
| `services/deploy/src/services/cloud-logs.service.ts` | GCP Cloud Logging API integration |
| `services/deploy/src/services/cloud-metrics.service.ts` | GCP Cloud Monitoring API integration |

### Files to Modify

| File | Change |
|------|--------|
| `services/deploy/src/routes/canvas-deploy.ts` | Add logs + metrics endpoints |
| `services/ai/src/services/ai.service.ts` | Fetch diagnostics for performance/error questions |

### Verify

- Ask "show me recent errors" → AI lists errors from Cloud Logging
- Ask "why is my API slow?" → AI analyzes latency metrics + error logs, suggests fix
- Ask "is my database running out of space?" → AI checks storage metrics
- No logs available → AI says "No errors in the last hour" or "Enable Cloud Logging to see errors"

---

## Implementation Order

```
Level 1: Deployment Context (2-3 days)    — quick win, no new cloud APIs
Level 2: Live Status Queries (5-7 days)   — real-time cloud state
Level 3: Logs & Metrics (7-10 days)       — full observability in AI
```

Each level builds on the previous. Level 1 can ship immediately as part of the open-source launch. Levels 2 and 3 are post-launch enhancements.

## Shared File Awareness

- `services/ai/src/services/ai.service.ts` — all three levels modify the prompt and add context fetching
- `services/deploy/src/routes/canvas-deploy.ts` — Levels 2 and 3 add new endpoints
- `services/deploy/src/services/deploy.service.ts` — Level 1 reads from existing deployment data
