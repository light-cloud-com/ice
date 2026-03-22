# Backend Services

All backend functionality is split into 7 domain services, each exporting an Express Router factory. The gateway composes them into a single API.

## Gateway (`apps/gateway`)

**Entry:** `apps/gateway/src/index.ts`
**Port:** 5001 (configurable via `PORT`)
**Dev:** `pnpm dev:gateway` (tsx watch)

### Middleware Stack

1. `helmet` (CSP disabled for dev)
2. `cors` (origin from `FRONTEND_URL`)
3. `cookie-parser`
4. `express.json` (10MB limit)
5. `express-rate-limit` (200 req/min per IP)
6. `passport.initialize()` (OAuth strategies)

### Router Composition

```typescript
app.use('/api', createIamRouter())
app.use('/api', createCanvasRouter())
app.use('/api', createDeployRouter(io))
app.use('/api', createAiRouter())
app.use('/api', createEngineRouter())
app.use('/api', createCredentialsRouter())
app.use('/api', createBillingRouter())
```

### Background Processes

Started at boot:
- `startDeployWorker()` — BullMQ worker for deploy jobs
- `startCronJobs()` — scheduled cleanup, PR environment expiry

---

## IAM Service (`services/iam`) {#iam}

Authentication, authorization, user management, and multi-tenancy.

### Routes

| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/register` | Email/password registration |
| POST | `/api/auth/login` | Login → JWT + refresh token |
| POST | `/api/auth/refresh` | Refresh access token |
| POST | `/api/auth/logout` | Invalidate refresh token |
| GET | `/api/auth/github` | GitHub OAuth redirect |
| GET | `/api/auth/github/callback` | GitHub OAuth callback |
| GET | `/api/auth/google` | Google OAuth redirect |
| GET | `/api/auth/google/callback` | Google OAuth callback |
| GET | `/api/profile` | Get current user profile |
| PUT | `/api/profile` | Update profile |
| GET/POST | `/api/organisations` | Org CRUD |
| POST | `/api/organisations/:id/invite` | Invite member |
| POST | `/api/invite/:token/accept` | Accept invitation |
| GET/PUT | `/api/onboarding` | Onboarding state machine |

### Key Services

- **`auth.service.ts`** — bcrypt password hashing, JWT issuance, refresh token management
- **`passportOAuth.ts`** — GitHub OAuth2 + Google OAuth20 Passport strategies
- **`project-access.service.ts`** — role-based project access resolution

---

## Canvas Service (`services/canvas`) {#canvas}

Canvas CRUD, environment management, and project membership.

### Routes

| Method | Path | Description |
|---|---|---|
| GET | `/api/canvas` | List projects (with folder hierarchy) |
| POST | `/api/canvas` | Create project or folder |
| GET | `/api/canvas/:id` | Get project details |
| PUT | `/api/canvas/:id` | Update project |
| DELETE | `/api/canvas/:id` | Delete project |
| GET | `/api/canvas/:id/card` | Load canvas card |
| PUT | `/api/canvas/:id/card` | Save canvas card (nodes, edges, viewport) |
| GET | `/api/environments/:projectId` | List environments |
| POST | `/api/environments/:projectId` | Create environment |
| DELETE | `/api/environments/:id` | Delete environment |
| POST | `/api/environments/:id/promote` | Promote environment |
| GET/POST/DELETE | `/api/project-members/:projectId` | Manage project members |

### Key Services

- **`canvas.service.ts`** — project/card operations, slug generation
- **`environment.service.ts`** — environment lifecycle, PR environment auto-creation

---

## Deploy Service (`services/deploy`) {#deploy}

Infrastructure deployment, CI/CD pipeline, and GitHub webhook processing.

### Routes

| Method | Path | Description |
|---|---|---|
| POST | `/api/canvas/deploy/plan` | Generate deploy plan (dry-run) |
| POST | `/api/canvas/deploy/apply` | Execute deploy plan |
| GET | `/api/canvas/deploy/:id` | Get deployment status |
| GET | `/api/pipeline/rules/:projectId` | List pipeline rules |
| POST | `/api/pipeline/rules` | Create pipeline rule |
| DELETE | `/api/pipeline/rules/:id` | Delete pipeline rule |
| GET | `/api/pipeline/events/:projectId` | List deployment events |
| POST | `/api/webhooks/github` | GitHub webhook receiver |

### Key Services

- **`deploy.service.ts`** — `planDeployment()` and `applyDeployment()`, delegates to `@ice-engine/core`
- **`queue.service.ts`** — BullMQ `deploy` queue (Redis-backed), `startDeployWorker()`, `queueDeployment()`
- **`build.service.ts`** — source code build steps for CI/CD pipeline
- **`pipeline.service.ts`** — `DeploymentEvent` lifecycle, emits Socket.IO updates
- **`cron.service.ts`** — scheduled cleanup and PR environment expiry

### Deploy Progress

Progress is streamed via Socket.IO to `deploy:{cardId}` rooms. The frontend `DeployPanel` subscribes and displays real-time status per resource.

### CI/CD Pipeline

1. User configures a `DeploymentRule` (repo + branch pattern + build config)
2. GitHub push webhook triggers → matched against rules
3. Build job queued → source fetched, built, uploaded
4. Deploy job queued → infrastructure updated
5. Progress streamed via Socket.IO `pipeline:{nodeId}` rooms

---

## AI Service (`services/ai`) {#ai}

Claude-powered AI assistant for canvas manipulation.

### Routes

| Method | Path | Description |
|---|---|---|
| POST | `/api/ai/intent` | Process intent → SSE stream of canvas ops |
| GET | `/api/ai/conversations/:projectId` | List conversations |
| POST | `/api/ai/conversations` | Create conversation |
| GET | `/api/ai/conversations/:id/messages` | Get messages |
| POST | `/api/ai/conversations/:id/messages` | Append message |

### Key Services

- **`ai.service.ts`** — Claude client, system prompt with schema context, streaming response parsing into `AiCanvasOp[]`
- **`ai-schema-context.service.ts`** — builds available block types + connection rules for Claude's context
- **`ai-audit.service.ts`** — logs every Claude call (canvas before, ops, parse result, duration)

See [AI System](ai-system.md) for detailed documentation.

---

## Engine Service (`services/engine`) {#engine}

Serves schema and resource metadata from `@ice-engine/core` to the frontend.

### Routes

| Method | Path | Description |
|---|---|---|
| GET | `/api/schemas` | Query block schemas |
| GET | `/api/schemas/connection-rules` | Get connection rules |
| GET | `/api/resources` | List resource types |
| GET | `/api/resources/:type` | Get resource metadata |

---

## Credentials Service (`services/credentials`) {#credentials}

Encrypted storage for cloud provider credentials and GitHub tokens.

### Routes

| Method | Path | Description |
|---|---|---|
| POST | `/api/providers/connect` | Connect cloud provider (GCP/AWS/Azure) |
| DELETE | `/api/providers/:id` | Disconnect provider |
| GET | `/api/providers` | List connected providers |
| POST | `/api/providers/test` | Test provider connectivity |
| POST | `/api/github/token` | Store GitHub token |
| GET | `/api/github/token` | Get GitHub token status |
| GET | `/api/github/repos` | List GitHub repos |

All credentials are AES-256 encrypted at rest via `@ice-saas/shared/crypto`.

---

## Billing Service (`services/billing`) {#billing}

Stripe subscription management.

### Routes

| Method | Path | Description |
|---|---|---|
| GET | `/api/billing/current` | Current billing status |
| GET | `/api/billing/invoices` | Invoice list |
| PUT | `/api/billing/payment-method` | Update payment method |
| PUT | `/api/billing/details` | Update billing details |
| GET | `/api/billing/usage` | Resource usage |
| GET | `/api/billing/estimate` | Cost estimate |
| POST | `/api/billing/webhook` | Stripe webhook handler |

### Key Services

- **`stripe.service.ts`** — Stripe API wrapper
- **`billing.service.ts`** — usage tracking, plan enforcement
- **`light-cloud-pricing.ts`** — pricing constants
