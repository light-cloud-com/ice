# Architecture Overview

ICE SaaS is structured as a pnpm monorepo with three distinct layers: **shared packages**, **backend services**, and **runnable apps**.

## System Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        Clients                              │
│  ┌──────────────┐                    ┌──────────────────┐   │
│  │  Web (SaaS)  │                    │ Desktop (Electron)│   │
│  │  @lightcloud/ │                    │ @ice-saas/desktop│   │
│  │  web          │                    │                  │   │
│  └──────┬───────┘                    └────────┬─────────┘   │
│         │ HTTP + Socket.IO                    │ IPC         │
└─────────┼─────────────────────────────────────┼─────────────┘
          │                                     │
          ▼                                     ▼
┌──────────────────┐              ┌──────────────────────────┐
│   API Gateway    │              │  Electron Main Process   │
│  apps/gateway    │              │  Embeds @ice-engine/core │
│  Port 5001       │              │  + provider plugins      │
│                  │              │  Deploys locally          │
│  Composes:       │              └──────────────────────────┘
│  ┌────────────┐  │
│  │ service-iam│  │
│  │ service-   │  │
│  │  canvas    │  │
│  │ service-   │  │
│  │  deploy    │  │
│  │ service-ai │  │
│  │ service-   │  │
│  │  engine    │  │
│  │ service-   │  │
│  │  creds     │  │
│  │ service-   │  │
│  │  billing   │  │
│  └────────────┘  │
└────────┬─────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌────────┐ ┌───────┐
│PostgreSQL│ │ Redis │
│  :5555  │ │ :6379 │
└─────────┘ └───────┘
```

## API Adapter Pattern

Both web and desktop apps share the same UI components (`@ice-saas/ui`). The key abstraction is the `IceAPI` interface:

```
┌──────────────────────────────────────┐
│          @ice-saas/ui                │
│  Canvas, Panels, AI Chat, etc.      │
│  Calls: api.canvas.save(...)        │
│         api.deploy.plan(...)        │
│         api.ai.intent(...)          │
└──────────────┬───────────────────────┘
               │ IceAPI interface
       ┌───────┴───────┐
       ▼               ▼
┌──────────────┐ ┌─────────────────┐
│ HTTP Adapter │ │   IPC Adapter   │
│ (Axios)      │ │ (Electron IPC)  │
│ Web SaaS     │ │ Desktop App     │
└──────────────┘ └─────────────────┘
```

- **Web:** `createHttpApiAdapter()` sends HTTP requests to the gateway via Axios
- **Desktop:** `createIpcAdapter()` sends IPC messages to Electron's main process, which runs the engine directly

## Dependency Graph

```
@ice-saas/types                    (no deps — pure interfaces)
       │
       ├──► @ice-saas/db           (Prisma ORM)
       ├──► @ice-saas/block-registry
       ├──► @ice-saas/provider-registry
       └──► @ice-saas/template-registry
                │
@ice-engine/core                   (standalone engine)
       │
       ├──► @ice-saas/blocks       (uses block-registry + core)
       │        │
       │        └──► @ice-saas/templates  (uses blocks + template-registry)
       │
@ice-saas/db ──► @ice-saas/shared  (auth, crypto, socket)
                      │
                      ├──► service-iam
                      ├──► service-canvas
                      ├──► service-deploy  (+bullmq, +ioredis)
                      ├──► service-ai      (+anthropic SDK)
                      ├──► service-credentials
                      ├──► service-billing (+stripe)
                      └──► service-engine  (+core)
                               │
                               └──► apps/gateway  (composes all)

@ice-saas/ui                       (React components)
       │
       ├──► @lightcloud/web        (web SaaS app)
       └──► @ice-saas/desktop      (Electron app)
```

## Data Flow: Canvas to Deploy

1. User drags blocks onto canvas, connects them
2. Redux `cards` slice updates nodes/edges in memory
3. Auto-save debounces (2s) → saves to localStorage + `POST /api/canvas/:id/card`
4. User clicks "Deploy" → `POST /api/canvas/deploy/plan` with card data
5. Deploy service runs `@ice-engine/core` plan engine → returns diff
6. User confirms → `POST /api/canvas/deploy/apply`
7. Deploy job queued in BullMQ → worker processes
8. Progress streamed via Socket.IO `deploy:{cardId}` room
9. Frontend `DeployPanel` displays real-time progress
10. Deployment record saved to `CanvasDeployment` table

## Data Flow: AI Intent

1. User types intent in `AiChatPanel`
2. Frontend serializes canvas state → `POST /api/ai/intent` (SSE)
3. AI service builds system prompt with schema context (available blocks, connection rules)
4. Claude API called with streaming
5. Response parsed into `AiCanvasOp[]` (addNode, addEdge, deleteNode, etc.)
6. Ops streamed back via SSE as `AiStreamEvent` messages
7. Frontend `operation-executor.ts` dispatches each op to Redux
8. Canvas updates in real-time as ops arrive
9. Conversation + ops saved to `AiConversation` / `AiMessage` tables
10. Audit log written to `AiAuditLog`

## Real-time Communication

Socket.IO manages four room types:

| Room | Pattern | Purpose |
|---|---|---|
| Deploy | `deploy:{cardId}` | Deploy progress events |
| Canvas | `canvas:{projectId}` | Canvas collaboration (future) |
| Pipeline | `pipeline:{nodeId}` | CI/CD logs for specific node |
| Card Pipeline | `card-pipeline:{cardId}` | Lightweight status badges on canvas |

## Multi-tenancy

- **Organisation** is the tenant boundary
- Users belong to orgs via `OrganisationMember` (roles: owner, admin, member, viewer)
- Projects belong to an org
- Provider credentials are scoped per org
- Project-level access adds finer-grained control via `ProjectMember`

## Environments

Each project can have multiple environments (production, staging, development, PR):

- Each `Environment` maps 1:1 to a `CanvasCard` (separate canvas per environment)
- Production environment is protected (cannot be deleted)
- PR environments are ephemeral — auto-created on GitHub `pull_request` webhook events
- Environment promotion copies canvas state between environments
