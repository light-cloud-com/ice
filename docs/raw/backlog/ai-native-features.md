# AI-Native Features

6 features to make ICE an AI-first cloud platform before open-source launch. Each feature is self-contained and implementable in a separate session.

Related: [FEAT-11](missing-features.md) (pre-deploy cost estimation) is superseded by Feature 3 below.

---

## Feature 0: Flash-MoE as Default AI Backend

**Priority:** P0 | **Effort:** 3-4 days | **Backend:** New package + service refactor | **Dependencies:** None (all other features build on this)

**Goal:** Integrate [flash-moe](../../experiment/flash-moe) as an isolated `@ice/ai` package and make it the default AI backend. ICE ships with local AI out of the box — no API key needed. Claude remains available as an optional cloud backend.

### Why

- **Zero-config AI**: Users get AI features immediately without an Anthropic API key (current blocker for community edition)
- **Privacy**: Infrastructure designs never leave the user's machine
- **Cost**: No per-token billing for AI features
- **Speed**: Local inference on Apple Silicon (4B model at 60 tok/s, 397B at 4.4 tok/s)
- **AI-first identity**: ICE ships with its own AI engine, not just a wrapper around a third-party API

### Architecture

```
┌──────────────────────────────────────────────────┐
│               service-ai                          │
│  (system prompt, canvas ops, skill detection)     │
│                                                    │
│  Uses @ice/ai provider interface                   │
└──────────┬───────────────────────┬────────────────┘
           │                       │
           ▼                       ▼
┌──────────────────┐    ┌──────────────────────────┐
│  FlashMoeProvider │    │  AnthropicProvider        │
│  (default)        │    │  (optional, BYOK)         │
│                   │    │                            │
│  localhost:8000   │    │  api.anthropic.com         │
│  OpenAI-compat    │    │  @anthropic-ai/sdk         │
│  SSE streaming    │    │  SSE streaming             │
└──────────────────┘    └──────────────────────────┘
```

Flash-MoE exposes an **OpenAI-compatible API** (`POST /v1/chat/completions` with SSE). This means ICE can talk to it the same way it would talk to any OpenAI-compatible endpoint.

### Package: `@ice/ai`

New isolated package at `packages/ai/` providing a unified AI provider interface.

### Files to Create

| File | Purpose |
|------|---------|
| `packages/ai/package.json` | Package config. Deps: `@anthropic-ai/sdk` (optional peer dep) |
| `packages/ai/tsconfig.json` | TypeScript config |
| `packages/ai/src/index.ts` | Public API: `createProvider`, `AiProvider`, types |
| `packages/ai/src/types.ts` | Provider interface, message types, streaming types |
| `packages/ai/src/providers/flash-moe.ts` | `FlashMoeProvider` — HTTP client to `localhost:{port}/v1/chat/completions`. SSE streaming. Health check via `GET /health`. |
| `packages/ai/src/providers/anthropic.ts` | `AnthropicProvider` — wraps existing `@anthropic-ai/sdk` calls. Extracted from current `ai.service.ts`. |
| `packages/ai/src/providers/openai-compat.ts` | `OpenAICompatProvider` — generic provider for any OpenAI-compatible endpoint (Ollama, LM Studio, vLLM, etc.). Flash-MoE provider extends this. |
| `packages/ai/src/create-provider.ts` | Factory: reads config/env vars, returns the right provider |
| `packages/ai/src/stream-parser.ts` | Shared SSE parser for OpenAI-format streams (`data: {...}\n\n` → token chunks) |

### Provider Interface

```typescript
interface AiProvider {
  readonly name: string;           // "flash-moe" | "anthropic" | "openai-compat"
  readonly isLocal: boolean;       // true for flash-moe, false for anthropic

  /** Check if the provider is available and ready */
  healthCheck(): Promise<{ ok: boolean; model?: string; error?: string }>;

  /** Generate a chat completion with streaming */
  streamChat(params: ChatParams): AsyncIterable<ChatChunk>;

  /** Generate a chat completion (non-streaming) */
  chat(params: ChatParams): Promise<ChatResponse>;
}

interface ChatParams {
  systemPrompt: string;
  messages: ChatMessage[];
  maxTokens: number;
  sessionId?: string;          // flash-moe session continuity
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
}

interface ChatChunk {
  content: string;             // token text
  finishReason?: 'stop' | null;
}

interface ChatResponse {
  content: string;             // full response text
  finishReason: 'stop';
}
```

### Provider Resolution

```typescript
// packages/ai/src/create-provider.ts

function createProvider(config?: ProviderConfig): AiProvider {
  // 1. Explicit config wins
  if (config?.provider === 'anthropic') return new AnthropicProvider(config);
  if (config?.provider === 'flash-moe') return new FlashMoeProvider(config);
  if (config?.provider === 'openai-compat') return new OpenAICompatProvider(config);

  // 2. Environment variables
  if (process.env.ICE_AI_PROVIDER === 'anthropic') return new AnthropicProvider();
  if (process.env.ICE_AI_PROVIDER === 'openai-compat') return new OpenAICompatProvider();

  // 3. Auto-detect: try flash-moe health check first (default)
  //    Falls back to Anthropic if ANTHROPIC_API_KEY is set
  //    Falls back to null provider (AI disabled) if neither available
}

interface ProviderConfig {
  provider: 'flash-moe' | 'anthropic' | 'openai-compat';
  // flash-moe
  flashMoeUrl?: string;        // default: "http://localhost:8000"
  flashMoeModel?: string;      // default: "qwen3.5-397b"
  // anthropic
  anthropicApiKey?: string;    // default: process.env.ANTHROPIC_API_KEY
  anthropicModel?: string;     // default: "claude-sonnet-4-20250514"
  // openai-compat
  baseUrl?: string;            // e.g. "http://localhost:11434/v1" (Ollama)
  model?: string;
  apiKey?: string;             // optional, some local servers don't need it
}
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ICE_AI_PROVIDER` | `auto` | `flash-moe`, `anthropic`, `openai-compat`, or `auto` |
| `ICE_AI_URL` | `http://localhost:8000` | Flash-MoE / OpenAI-compat server URL |
| `ICE_AI_MODEL` | (provider default) | Model name to use |
| `ANTHROPIC_API_KEY` | (none) | Required only if using Anthropic provider |

### Files to Modify

| File | Change |
|------|--------|
| `services/ai/src/services/ai.service.ts` | Replace direct `Anthropic` SDK usage with `@ice/ai` provider. Remove `getClient()`, replace `client.messages.create()` and `client.messages.stream()` with `provider.chat()` and `provider.streamChat()`. System prompt building stays here — only the LLM call goes through the provider. |
| `services/ai/src/routes/ai.ts` | Replace `ANTHROPIC_API_KEY` check with `provider.healthCheck()`. Change 503 message from "AI not configured" to provider-specific status. |
| `packages/ui/src/features/ai/hooks/use-ai-command.ts` | SSE parsing already works with `text/event-stream` — no change needed if backend streams in same format. |
| `packages/ui/src/features/ai/components/ai-chat-panel.tsx` | Show provider badge (local vs cloud) in chat header. Show model name. |
| `pnpm-workspace.yaml` | Add `packages/ai` |
| Root `package.json` or turbo config | Add `@ice/ai` to build pipeline |

### How service-ai Changes

**Before (current):**
```typescript
import Anthropic from '@anthropic-ai/sdk';
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const message = await client.messages.create({
  model: 'claude-sonnet-4-20250514',
  system: systemPrompt,
  messages: [{ role: 'user', content: intent }],
  max_tokens: 4096,
});
const text = message.content[0].type === 'text' ? message.content[0].text : '';
```

**After:**
```typescript
import { createProvider } from '@ice/ai';
const provider = createProvider();
const response = await provider.chat({
  systemPrompt,
  messages: [{ role: 'user', content: intent }],
  maxTokens: 4096,
});
const text = response.content;
```

**Streaming before:**
```typescript
const stream = client.messages.stream({ model, system, messages, max_tokens });
for await (const event of stream) { /* Anthropic SDK events */ }
```

**Streaming after:**
```typescript
for await (const chunk of provider.streamChat({ systemPrompt, messages, maxTokens })) {
  res.write(`data: ${JSON.stringify(chunk)}\n\n`);
}
```

### Flash-MoE Model Selection for ICE

| Use Case | Recommended Model | Why |
|----------|-------------------|-----|
| Desktop (default) | `4b` (Qwen3.5-4B) | 2.5GB RAM, 60 tok/s. Fast enough for canvas ops. |
| Desktop (power user) | `35b` or `397b` | Better architecture reasoning, needs more resources |
| Server/SaaS | `anthropic` or `openai-compat` | Cloud-hosted, no local GPU needed |

The 4B model is the sensible default for the community/desktop edition — it runs on any Apple Silicon Mac and is fast enough for generating canvas operations (typically 500-2000 tokens).

### Status: IMPLEMENTED

All files created and refactored. See implementation details below.

### Files Created

| File | Purpose |
|------|---------|
| `packages/ai/package.json` | Package config |
| `packages/ai/tsconfig.json` | TypeScript config |
| `packages/ai/src/index.ts` | Public API exports |
| `packages/ai/src/types.ts` | `AiProvider` interface, `ChatParams`, `ChatChunk`, `ChatResponse`, `NullProvider` |
| `packages/ai/src/providers/openai-compat.ts` | Base provider for OpenAI-compatible servers (HTTP + SSE via Node.js native) |
| `packages/ai/src/providers/flash-moe.ts` | Extends OpenAICompat with flash-moe defaults + health check |
| `packages/ai/src/providers/anthropic.ts` | Wraps `@anthropic-ai/sdk` behind `AiProvider` interface |
| `packages/ai/src/stream-parser.ts` | Parses OpenAI SSE format into `ChatChunk` async iterables |
| `packages/ai/src/create-provider.ts` | Factory with auto-detection + auto-start: flash-moe → anthropic → null |
| `packages/ai/src/flash-moe-server.ts` | Process manager: spawns flash-moe server, health checks, graceful shutdown |

### Files Modified

| File | Change |
|------|--------|
| `services/ai/src/services/ai.service.ts` | Replaced `Anthropic` SDK with `@ice/ai` provider abstraction |
| `services/ai/src/routes/ai.ts` | Added `GET /api/ai/health`. Replaced API key check with provider health check. |
| `services/ai/package.json` | `@anthropic-ai/sdk` → `@ice/ai: workspace:*` |
| `apps/gateway/src/index.ts` | Auto-starts flash-moe on boot, stops on shutdown |
| `apps/gateway/package.json` | Added `@ice/ai` dependency |
| `packages/ui/src/features/ai/components/ai-chat-panel.tsx` | Provider badge (Local/Cloud), updated "not configured" message |
| `packages/ui/src/features/ai/hooks/use-ai-command.ts` | Updated 503 error message to be provider-agnostic |

### Auto-Start Behavior

Flash-MoE starts automatically when ICE boots (gateway startup):
1. Gateway calls `startFlashMoeServer()` alongside deploy worker and cron jobs
2. `createProviderAsync()` also auto-starts if flash-moe is not running during first AI request
3. Process manager finds flash-moe installation, spawns `mlx_lm.server` (4B default) or `infer --serve` (397B)
4. Health check polling waits up to 2 minutes for model to load
5. On gateway shutdown, `stopFlashMoeServer()` sends SIGTERM → SIGKILL after 5s

**Override behavior** with environment variables:
- `ICE_AI_PROVIDER=anthropic` — skip flash-moe entirely, use Claude
- `ICE_AI_PROVIDER=openai-compat` — use a custom endpoint
- `FLASH_MOE_PATH=/path/to/flash-moe` — explicit installation path
- `ICE_AI_PORT=8099` — change the inference server port
- `ICE_AI_MODEL=35b` — use a larger local model

### Prompt Considerations

Flash-MoE runs Qwen models, not Claude. The system prompt in `ai.service.ts` may need tuning:
- Qwen models follow the same JSON output format when instructed clearly
- Tool calling works via `<tool_call>` markers — but ICE uses structured JSON output, not tool calling, so this is not an issue
- The prompt should include explicit JSON schema examples (already present)
- May need to reduce prompt size for 4B model (shorter schema context, fewer examples)
- Add a `promptProfile` concept: `full` (8K+ context, for 35B/397B/Claude) vs `compact` (2K context, for 4B/9B)

---

## Feature 1: Ghost Mode / AI Suggestions on Canvas — **DONE** (2026-04-19)

**Priority:** P1 | **Effort:** 2-3 days | **Backend:** None | **Dependencies:** None

**Shipped:** `packages/ui/src/store/slices/ghost-slice.ts`, `packages/ui/src/features/canvas/utils/ghost-suggestions.ts`, `packages/ui/src/features/canvas/components/ghost/{svg-ghost-node,svg-ghost-edge}.tsx`. Rule table uses real project iceTypes (e.g. `Compute.Container`, not spec's `Application.Container`). Max 3 suggestions per drop, 10s auto-dismiss, filters duplicates against existing canvas types.

**Goal:** When user drops a block, ghost (semi-transparent) blocks appear suggesting related resources. Accept with click, dismiss with X. Static rules only, no Claude API call.

### Files to Create

| File | Purpose |
|------|---------|
| `packages/ui/src/store/slices/ghost-slice.ts` | Redux slice: `ghostNodes: GhostNode[]`, actions: `setGhostNodes`, `acceptGhost`, `dismissGhost`, `clearGhosts` |
| `packages/ui/src/features/canvas/utils/ghost-suggestions.ts` | `generateGhostSuggestions(droppedNode, existingNodes, existingEdges) → GhostNode[]`. Static rule table mapping iceType to suggested blockTypes. Max 3 suggestions. Filters duplicates. Positions ghosts offset right+below from dropped node. |
| `packages/ui/src/features/canvas/components/ghost/svg-ghost-node.tsx` | SVG component: 35% opacity, dashed border (`strokeDasharray="6 3"`), accept (checkmark) + dismiss (X) buttons. Renders icon + label from blueprint. |
| `packages/ui/src/features/canvas/components/ghost/svg-ghost-edge.tsx` | Dashed semi-transparent bezier edge between source node and ghost. Reuses curve logic from `SvgConnectionPath`. |

### Files to Modify

| File | Change |
|------|--------|
| `packages/ui/src/store/index.ts` | Register ghost slice |
| `packages/ui/src/features/canvas/components/svg-canvas.tsx` | Render ghost layer after real nodes. Trigger `generateGhostSuggestions` after `expandBlueprintToCard`/`addNodeToCard`. Wire accept handler (expand blueprint + add node + add edge). Auto-dismiss after 10s. Clear on canvas click. |

### Types

```typescript
interface GhostNode {
  id: string;               // "ghost-{blockType}-{timestamp}"
  blockType: string;        // blueprint blockType
  label: string;
  position: { x: number; y: number };
  sourceNodeId: string;     // which real node triggered this
  edgeRelationship: string; // e.g. "connects_to"
  edgeDirection: 'from' | 'to';
  createdAt: number;
}
```

### Suggestion Rule Table

| Dropped iceType | Suggest |
|-----------------|---------|
| `Application.Container` | `Database.PostgreSQL`, `Security.SecretManager`, `Messaging.Queue` |
| `Application.Function` | `Storage.ObjectStorage`, `Messaging.PubSub`, `Security.SecretManager` |
| `Database.PostgreSQL` | `Security.SecretManager`, `Application.Container` |
| `Gateway.ApiGateway` | `Application.Container`, `Security.Auth` |
| `AI.LLMEndpoint` | `AI.VectorSearch`, `Storage.ObjectStorage` |

### Steps

1. Create `ghost-suggestions.ts` with rule table
2. Create `ghost-slice.ts`
3. Register in store
4. Create `SvgGhostNode` component
5. Create `SvgGhostEdge` component
6. Modify `svg-canvas.tsx`: render ghosts, wire drop handler, accept/dismiss/auto-clear

### Verify

- Drop a Cloud Run block → 2-3 ghosts appear at 35% opacity
- Click accept → ghost becomes real node with edge
- Click dismiss → ghost disappears
- Wait 10s → remaining ghosts auto-dismiss
- Click empty canvas → ghosts clear

---

## Feature 2: AI Error Diagnosis on Failed Deploys — **DONE** (2026-04-19)

**Priority:** P1 | **Effort:** 2 days | **Backend:** New endpoint | **Dependencies:** None

**Shipped:** `services/ai/src/services/diagnose-deploy.service.ts` + `POST /ai/diagnose-deploy` route. `DeployDiagnosis` component rendered under `ApiErrorBanner`; diagnosis state lives in `deploy-slice.ts` (`startDiagnosis`/`setDiagnosis`/`diagnosisError`/`clearDiagnosis`). Diagnostic prompt includes error, failed resources, canvas topology. Returns `{ diagnosis, suggestedFixes[], operations? }`.

**Goal:** "Diagnose with AI" button in deploy error banner. AI reads error + canvas context, returns plain-English diagnosis with fix steps.

### Files to Create

| File | Purpose |
|------|---------|
| `services/ai/src/services/diagnose-deploy.service.ts` | `diagnoseDeploy(req) → DiagnoseDeployResponse`. Focused diagnostic prompt with error text, failed resources, canvas topology. Calls Claude. Reuses existing `getClient()` and audit logging. |
| `packages/ui/src/features/deploy/components/deploy-diagnosis.tsx` | Inline component below error banner. States: idle/loading/loaded/error. Shows diagnosis + bulleted fixes. Optional "Apply suggested fix" button if canvas operations returned. |

### Files to Modify

| File | Change |
|------|--------|
| `packages/types/src/ai.ts` | Add `DiagnoseDeployRequest`, `DiagnoseDeployResponse` types |
| `services/ai/src/routes/ai.ts` | Add `POST /diagnose-deploy` route with existing `requireAuth` + `aiLimiter` |
| `packages/ui/src/store/slices/deploy-slice.ts` | Add `diagnosis: { status, result, error }` state + reducers |
| `packages/ui/src/features/deploy/components/deploy-panel.tsx` | Add "Diagnose with AI" button (Sparkles icon) in `ApiErrorBanner`. Render `<DeployDiagnosis>` below banner. |

### Types

```typescript
interface DiagnoseDeployRequest {
  error: string;
  resourceResults: Array<{ name: string; type: string; error?: string; action: string }>;
  canvasContext: SerializedCanvas;
  provider: string;
  region: string;
}

interface DiagnoseDeployResponse {
  diagnosis: string;           // plain English explanation
  suggestedFixes: string[];    // bullet points
  operations?: AiCanvasOp[];   // optional canvas operations to fix
}
```

### Diagnostic Prompt Structure

```
You are a GCP deployment expert. A deployment just failed.

## Error
{raw error message}

## Failed Resources
{name, type, action, error for each failed resource}

## Canvas Architecture
{simplified node list with iceType + key config fields}
{edge list}

## Instructions
1. Explain what went wrong in plain English (no jargon)
2. List specific steps to fix it
3. If fixable via canvas changes, return operations[]
```

### Steps

1. Add types to `packages/types/src/ai.ts`
2. Create `diagnose-deploy.service.ts`
3. Add route in `services/ai/src/routes/ai.ts`
4. Add diagnosis state to `deploy-slice.ts`
5. Create `DeployDiagnosis` component
6. Add button + render in `deploy-panel.tsx`

### Verify

- Trigger deploy failure (e.g., missing API enablement)
- Click "Diagnose with AI" → loading spinner
- Diagnosis shows plain-English explanation + fix steps
- If operations suggested, "Apply fix" button works

---

## Feature 3: Pre-Deploy Security/Cost Warnings — **DONE** (2026-04-19)

**Priority:** P1 | **Effort:** 3-4 days | **Backend:** None | **Dependencies:** None

**Shipped:** `packages/ui/src/features/deploy/utils/{security-rules,cost-estimator,predeploy-analysis}.ts` + `predeploy-warnings.tsx`. 6 security rules (public DB, missing secrets, public storage, no auth on gateway, missing monitoring, no VPC). GCP-priced cost estimator scales with replicas/size/storage. Apply button gated on `criticalAcknowledged` when any `critical` warning present. `dismissedWarnings` + `criticalAcknowledged` live in `deploy-slice.ts`, reset on each `startPlanning`.

**Goal:** Between plan and apply, show deterministic warnings about security issues and estimated monthly costs. No AI needed. Supersedes [FEAT-11](missing-features.md).

### Files to Create

| File | Purpose |
|------|---------|
| `packages/ui/src/features/deploy/utils/security-rules.ts` | `analyzeSecurityWarnings(nodes, edges) → PreDeployWarning[]`. Deterministic rules. |
| `packages/ui/src/features/deploy/utils/cost-estimator.ts` | `estimateCosts(nodes) → { estimates: CostEstimate[], total: number }`. Static GCP price table. |
| `packages/ui/src/features/deploy/utils/predeploy-analysis.ts` | `analyzePreDeploy(nodes, edges) → PreDeployAnalysis`. Combines security + cost. |
| `packages/ui/src/features/deploy/components/predeploy-warnings.tsx` | Warning list component. Color-coded severity. Dismiss buttons. Critical = checkbox acknowledgment. Cost table at bottom. |

### Security Rules

| Rule | Severity | Condition |
|------|----------|-----------|
| Public database | critical | Database node without VPC parent or `privateIp` config |
| Missing secrets | warning | Service with env vars but no SecretManager connection |
| No IAM binding | warning | Cloud Run → Cloud SQL edge but no IAM binding node |
| Public storage | warning | Storage bucket with `public: true` or `allUsers` |
| No auth on gateway | warning | API Gateway with no auth/identity block connected |
| Missing monitoring | info | No observability/logging blocks on canvas |
| No VPC | info | Multiple services without VPC grouping |

### Cost Table (GCP)

| Resource | Estimate Logic |
|----------|---------------|
| Cloud Run | $0.00002400/vCPU-s * replicas * 730h/mo |
| Cloud SQL (db-f1-micro) | ~$7/mo |
| Cloud SQL (db-n1-standard-1) | ~$52/mo |
| Cloud Functions | $0.40/million invocations |
| Cloud Storage | $0.020/GB/mo |
| Memorystore Redis (1GB) | ~$35/mo |
| Pub/Sub | $40/TB |
| Secret Manager | ~$0.06/secret/mo |
| Load Balancer | ~$18/mo + $0.008/GB |
| Cloud CDN | ~$0.02-0.08/GB |

### Types

```typescript
type WarningSeverity = 'info' | 'warning' | 'critical';

interface PreDeployWarning {
  id: string;
  severity: WarningSeverity;
  category: 'security' | 'cost' | 'best-practice';
  title: string;
  description: string;
  nodeId?: string;
  dismissible: boolean;
}

interface CostEstimate {
  resourceName: string;
  nodeId: string;
  resourceType: string;
  monthlyEstimate: number;  // USD
  notes?: string;
}

interface PreDeployAnalysis {
  warnings: PreDeployWarning[];
  costEstimates: CostEstimate[];
  totalMonthlyCost: number;
  hasCritical: boolean;
}
```

### Files to Modify

| File | Change |
|------|--------|
| `packages/ui/src/store/slices/deploy-slice.ts` | Add `preDeployAnalysis`, `dismissedWarnings: string[]`, `criticalAcknowledged: boolean` |
| `packages/ui/src/features/deploy/components/deploy-panel.tsx` | After plan result, run `analyzePreDeploy()`. Render `<PreDeployWarnings>` between plan preview and Apply button. Disable Apply if critical not acknowledged. |

### Steps

1. Create `security-rules.ts`
2. Create `cost-estimator.ts` with price table
3. Create `predeploy-analysis.ts`
4. Create `PreDeployWarnings` component
5. Add state to `deploy-slice.ts`
6. Wire into `deploy-panel.tsx` after plan phase

### Verify

- Canvas with public database (no VPC) → "Public database" critical warning
- Canvas with Cloud Run + Cloud SQL → cost estimate shown
- Critical warning requires checkbox before Apply is enabled
- Info/warning can be dismissed

---

## Feature 4: Conversational Architecture Generation (Polish)

**Priority:** P2 | **Effort:** 2 days | **Backend:** Prompt changes | **Dependencies:** None

**Goal:** Polish existing cloud-architect flow. Better prompts, staggered animation, better suggestion chips.

### Files to Create

| File | Purpose |
|------|---------|
| `packages/ui/src/features/ai/utils/conversation-starters.ts` | `getConversationStarters(nodes, edges) → string[]`. Context-aware. Empty canvas: "Build me a SaaS platform", "Set up a data pipeline", etc. With nodes: follow-ups based on what exists. Returns 3-5 strings. |

### Files to Modify

| File | Change |
|------|--------|
| `services/ai/src/services/ai.service.ts` | In `buildCloudArchitectPrompt()`: add multi-step reasoning instruction, production-ready defaults, cost awareness in explanation |
| `packages/ui/src/features/ai/hooks/use-ai-command.ts` | Increase `STAGGER_MS` from 120 to 200 in `computeAnimationOrder` |
| `packages/ui/src/features/ai/components/ai-chat-panel.tsx` | Replace `suggestPatterns` with `getConversationStarters`. Style chips as rounded pills with hover animation. |

### Prompt Additions

Append to the cloud-architect section in `buildCloudArchitectPrompt()`:

```
## Design Process
1. First explain what you'll build and why each component is needed
2. Include rough monthly cost estimate in your explanation
3. Emit operations in logical order: networking → data → compute → security → connections
4. For production intents, always include: Secret Manager, monitoring, and VPC unless user says "simple" or "dev"
```

### Steps

1. Create `conversation-starters.ts`
2. Update `buildCloudArchitectPrompt()` with new instructions
3. Increase `STAGGER_MS` to 200
4. Update `ai-chat-panel.tsx` with new starters + pill styling

### Verify

- Empty canvas → conversational starters ("Build me a SaaS platform")
- Type "Build a production Next.js app" → architecture builds with visible stagger
- AI explanation includes cost estimate
- Production intents include Secret Manager + monitoring

---

## Feature 5: Smart Templates with AI Interview

**Priority:** P2 | **Effort:** 3 days | **Backend:** None | **Dependencies:** Benefits from Feature 4's improved prompt

**Goal:** Template selection shows 3-5 quick questions as chips, then generates customized architecture (quick mode or AI mode).

### Files to Create

| File | Purpose |
|------|---------|
| `packages/ui/src/features/templates/utils/template-questions.ts` | `getQuestionsForTemplate(template) → TemplateQuestion[]`. Category-based questions. |
| `packages/ui/src/features/templates/utils/parameterized-expand.ts` | `expandWithAnswers(template, answers) → { nodes, edges }`. Quick mode: adjusts template based on answers (swap DB, add/remove auth, adjust replicas). Wraps `expandComposedTemplate`. |
| `packages/ui/src/features/templates/components/smart-template-dialog.tsx` | Modal dialog. Shows questions as chip buttons. Two bottom actions: "Quick Generate" + "Customize with AI". Quick mode calls `expandWithAnswers`. AI mode calls `sendIntent` with formatted answers. |
| `packages/ui/src/store/slices/template-slice.ts` | Redux slice: `{ isOpen, selectedTemplate, answers, step: 'select'\|'interview'\|'generating' }` |

### Types

```typescript
interface TemplateQuestion {
  id: string;
  question: string;
  options: Array<{ label: string; value: string }>;
  multiSelect?: boolean;
}

interface InterviewAnswers {
  [questionId: string]: string | string[];
}
```

### Question Sets

| Category | Questions |
|----------|-----------|
| full-stack | Framework (Next.js/Nuxt/SvelteKit), Database (PostgreSQL/Firestore), Auth (Yes/No), CDN (Yes/No) |
| ai-ml | Workload (RAG chatbot/ML pipeline/LLM gateway), Vector DB (Yes/No), Data volume (Small/Medium/Large) |
| data-pipeline | Source (API/Database/File uploads), Processing (Real-time/Batch), Storage (BigQuery/Cloud Storage) |
| backend | Language (Node.js/Python/Go), Database (PostgreSQL/Redis/Both), Queue (Yes/No) |
| quick-start | Skip interview, expand directly |

### Files to Modify

| File | Change |
|------|--------|
| `packages/ui/src/store/index.ts` | Register template slice |
| `packages/ui/src/features/templates/components/template-picker.tsx` | `handleSelect` → dispatch `openSmartTemplate(template)` instead of direct expand. Skip for quick-start category. Render `<SmartTemplateDialog>`. |

### Steps

1. Create `template-questions.ts`
2. Create `parameterized-expand.ts`
3. Create `template-slice.ts`, register in store
4. Create `SmartTemplateDialog` component
5. Modify `template-picker.tsx` to route through dialog

### Verify

- Click "Full Stack" template → dialog opens with 4 questions
- Answer all → click "Quick Generate" → customized architecture appears
- Same flow → click "Customize with AI" → Claude generates architecture based on answers
- "Quick Start" templates skip dialog entirely

---

## Implementation Order

```
Session 1: Feature 0 (Flash-MoE Package)     — foundational, all AI features depend on this
Session 2: Feature 1 (Ghost Mode)             — pure frontend, standalone
Session 3: Feature 4 (Conversational Polish)  — prompt + animation, standalone
Session 4: Feature 2 (Error Diagnosis)        — new endpoint + UI, standalone
Session 5: Feature 3 (Security/Cost)          — new analysis utils + UI, standalone
Session 6: Feature 5 (Smart Templates)        — builds on Feature 4's improved prompt
```

Feature 0 must be done first — it refactors `ai.service.ts` which Features 2 and 4 modify. Features 1-4 have zero dependencies on each other after Feature 0 is done. Feature 5 benefits from Feature 4 but works without it.

## Shared File Awareness

These files are modified by multiple features — implement in order to avoid conflicts:

- `services/ai/src/services/ai.service.ts` — Feature 0 (major refactor), Features 2, 4 (extend)
- `services/ai/src/routes/ai.ts` — Feature 0 (health check), Feature 2 (new endpoint)
- `packages/ui/src/store/index.ts` — Features 1, 5 (add slices)
- `packages/ui/src/features/deploy/components/deploy-panel.tsx` — Features 2, 3
- `packages/ui/src/features/ai/hooks/use-ai-command.ts` — Features 4, 5
- `packages/ui/src/features/ai/components/ai-chat-panel.tsx` — Feature 0 (provider badge), Feature 4 (starters)
