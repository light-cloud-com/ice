# Shared Packages

Detailed documentation for the shared library packages in `packages/`.

## Types (`@ice/types`) {#types}

**Location:** `packages/types/`

Shared TypeScript interfaces — the single source of truth for all API contracts and event shapes. No runtime code, pure types.

### Modules

| File | Key Exports |
|---|---|
| `auth.ts` | `LoginRequest`, `LoginResponse`, `RegisterRequest`, `TokenPayload`, `UserProfile`, `OrganisationMembership` |
| `canvas.ts` | `CanvasProject`, `CanvasCard`, `CardNode`, `CardEdge`, `CardViewport` |
| `deploy.ts` | `DeployPlanRequest/Response`, `DeployApplyRequest`, `DeployProgress`, `DeployResult`, `DeploymentRecord` |
| `events.ts` | `DeployProgressEvent`, `CanvasUpdateEvent` (Socket.IO shapes) |
| `provider.ts` | `CloudProvider`, `ProviderCredentials`, `ProviderStatus`, `ProviderConnectRequest/Response` |
| `ai.ts` | `AiCanvasOp` (11-type union), `AiResponse`, `AiStreamEvent`, `SerializedCanvas` |
| `connection-rules.ts` | Canvas connection rule types |
| `github.ts` | GitHub integration types |

---

## Database (`@ice/db`) {#db}

**Location:** `packages/db/`

Prisma ORM client singleton and database schema.

```typescript
import prisma from '@ice/db'
import { PrismaClient, Prisma } from '@ice/db'
```

See [Database Schema](raw/database.md) for full model documentation.

---

## Shared (`@ice/shared`) {#shared}

**Location:** `packages/shared/`

Cross-cutting server-side utilities used by all services.

### Sub-path Exports

#### `@ice/shared/auth`

JWT-based auth middleware and token generation.

```typescript
import { requireAuth, requireProjectAccess, generateToken } from '@ice/shared/auth'

// Validate JWT Bearer token
router.use(requireAuth)

// Check project-level role (checks org admin first, then project membership)
router.get('/project/:id', requireAuth, requireProjectAccess('editor'), handler)
```

- `requireAuth(req, res, next)` — validates JWT, attaches `req.user`
- `requireProjectAccess(minRole)` — role-based access: owner > admin > editor > viewer
- `generateToken(payload)` — signs JWT access token
- `generateRefreshToken()` — creates refresh token
- `AuthRequest` — Express Request type with `.user` attached

#### `@ice/shared/crypto`

AES-256 encryption for credentials at rest.

```typescript
import { encryptCredentials, decryptCredentials } from '@ice/shared/crypto'

const encrypted = encryptCredentials({ projectId: '...', key: '...' })
const decrypted = decryptCredentials(encrypted)
```

Uses `crypto-js` with key from `CREDENTIAL_ENCRYPTION_KEY` env var.

#### `@ice/shared/socket`

Socket.IO room management and emit helpers.

```typescript
import { setupSocketService, emitDeployProgress, emitCanvasUpdate } from '@ice/shared/socket'

setupSocketService(io)  // Initialize all rooms

emitDeployProgress(cardId, progressData)
emitCanvasUpdate(projectId, updateData)
emitPipelineUpdate(nodeId, pipelineData)
emitCardPipelineUpdate(cardId, statusData)
```

See [Real-time & Sockets](raw/realtime.md) for room types and event shapes.
