# Architecture Overview

ICE is structured as a pnpm monorepo with three distinct layers: **shared packages**, **backend services**, and **runnable apps**.

## System Diagram

```mermaid
graph TD
    subgraph Clients
        Web["Web SaaS<br/>@ice/web"]
        Desktop["Desktop Electron<br/>@ice/desktop"]
    end

    Web -->|"HTTP + Socket.IO"| Gateway
    Desktop -->|"Embedded HTTP"| Gateway2["Embedded Gateway<br/>(same code)"]

    subgraph Gateway["API Gateway — apps/gateway"]
        IAM[service-iam]
        Canvas[service-canvas]
        Deploy[service-deploy]
        AI[service-ai]
        Engine[service-engine]
        Creds[service-credentials]
        Billing[service-billing]
    end

    subgraph Gateway2["Embedded Gateway — desktop"]
        IAM2[service-iam]
        Canvas2[service-canvas]
        Deploy2[service-deploy]
        Engine2[service-engine]
        Creds2[service-credentials]
    end

    Gateway --> PostgreSQL["PostgreSQL"]
    Gateway --> Redis["Redis"]
    Gateway2 --> SQLite["SQLite<br/>(local file)"]
    Gateway2 --> MemQueue["In-Memory Queue"]
```

## Desktop = Embedded Web App

The desktop app runs the **exact same code** as the web app — zero duplication:

```mermaid
graph TB
    subgraph Electron["Electron App"]
        subgraph Renderer["Renderer — Chromium"]
            UI["@ice/ui — same components as web"]
            HTTP["HTTP Adapter — axios to localhost"]
        end
        subgraph Main["Main Process"]
            GW["@ice/gateway — Express server"]
            Services["All backend services"]
            DB["SQLite via Prisma"]
            Queue["In-memory queue"]
            Win["Window management + menus"]
        end
        Renderer -->|"HTTP localhost:15173"| Main
    end
```

## Shared UI Architecture

Both apps share `@ice/ui`. The web and desktop apps are thin shells:

```mermaid
graph TD
    UI["@ice/ui<br/>Features, Store, Shared Components,<br/>Hooks, Utils, Config, Assets"]

    UI --> Web["@ice/web<br/>thin shell: routing + pages + styles"]
    UI --> Desktop["@ice/desktop<br/>thin shell: Electron window + embedded gateway"]

    Web -->|"Vite @ alias → ui/src"| UI
    Desktop -->|"loads web from localhost"| UI
```

## Dependency Graph

```mermaid
graph TD
    types["@ice/types"]
    types --> db["@ice/db — Prisma"]
    types --> blockreg["@ice/block-registry"]
    types --> provreg["@ice/provider-registry"]
    types --> tmplreg["@ice/template-registry"]

    core["@ice/core — engine"]
    core --> blocks["@ice/blocks"]
    blockreg --> blocks
    blocks --> templates["@ice/templates"]
    tmplreg --> templates

    db --> shared["@ice/shared — auth, crypto, socket"]
    shared --> iam[service-iam]
    shared --> canvas[service-canvas]
    shared --> deploy[service-deploy]
    shared --> ai[service-ai]
    shared --> creds[service-credentials]
    shared --> billing[service-billing]
    shared --> engine[service-engine]
    engine --> gateway["@ice/gateway"]

    ui["@ice/ui — all React code"]
    ui --> web["@ice/web"]
    gateway --> desktop["@ice/desktop"]
    ui --> desktop
```

## Data Flow: Canvas to Deploy

```mermaid
sequenceDiagram
    participant User
    participant Canvas as Canvas UI
    participant Redux
    participant API as Gateway API
    participant Deploy as Deploy Service
    participant Cloud as Cloud Provider

    User->>Canvas: Drag blocks, connect edges
    Canvas->>Redux: Update nodes/edges
    Redux-->>API: Auto-save (debounced 2s)
    User->>Canvas: Click Deploy
    Canvas->>API: POST /deploy/plan
    API->>Deploy: translate_card_to_graph()
    Deploy-->>Canvas: Plan diff (create/update/delete)
    User->>Canvas: Confirm
    Canvas->>API: POST /deploy/apply
    API->>Deploy: Queue job
    Deploy->>Cloud: Provision resources
    Deploy-->>Canvas: Progress via Socket.IO
    Deploy-->>API: Save to CanvasDeployment
```

## Data Flow: AI Intent

```mermaid
sequenceDiagram
    participant User
    participant Chat as AI Chat Panel
    participant API as Gateway API
    participant Claude as Claude API
    participant Canvas as Canvas Redux

    User->>Chat: Type intent
    Chat->>API: POST /ai/intent (SSE)
    API->>Claude: Stream with schema context
    Claude-->>API: AiCanvasOp[] chunks
    API-->>Chat: SSE events
    Chat->>Canvas: Execute ops (addNode, addEdge...)
    Canvas-->>User: Canvas updates in real-time
    API-->>API: Save to AiConversation + AiAuditLog
```

## Real-time Communication

Socket.IO manages four room types (authenticated via JWT in handshake):

| Room | Pattern | Purpose |
|---|---|---|
| Deploy | `deploy:{cardId}` | Deploy progress events |
| Canvas | `canvas:{projectId}` | Canvas collaboration (future) |
| Pipeline | `pipeline:{nodeId}` | CI/CD logs for specific node |
| Card Pipeline | `card-pipeline:{cardId}` | Lightweight status badges on canvas |

## Multi-tenancy

- **Organisation** is the tenant boundary
- Users belong to orgs via `OrganisationMember` (roles: owner, admin, member, viewer)
- Projects belong to an org; provider credentials are scoped per org
- Project-level access via `ProjectMember`
- **Desktop mode:** single local user, auth bypassed (`ICE_DESKTOP=true`)

## Environments

Each project can have multiple environments (production, staging, development, PR):

- Each `Environment` maps 1:1 to a `CanvasCard` (separate canvas per environment)
- Production is protected (cannot be deleted)
- PR environments are ephemeral — auto-created on GitHub webhook
- Environment promotion copies canvas state between environments

## Database Strategy

```mermaid
graph LR
    subgraph Web["Web — Production"]
        PG["PostgreSQL"]
        RD["Redis + BullMQ"]
    end
    subgraph Desktop["Desktop — Local"]
        SQ["SQLite file"]
        MQ["In-Memory Queue"]
    end
    Prisma["Prisma ORM<br/>same schema, two providers"] --> PG
    Prisma --> SQ
```

- **Same Prisma schema** — `schema.prisma` (PostgreSQL) and `schema.sqlite.prisma` (SQLite)
- Zero raw SQL — all queries through Prisma, portable across providers
- Desktop data: `~/Library/Application Support/@ice/desktop/ice-desktop.db`
