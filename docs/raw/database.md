# Database Schema

ICE uses PostgreSQL via Prisma ORM. The schema is defined in `packages/db/prisma/schema.prisma`.

**Package:** `@ice/db`
**Location:** `packages/db/`
**ORM:** Prisma 6.17

## Usage

```typescript
import prisma from '@ice/db'

const user = await prisma.user.findUnique({ where: { id } })
```

## Models

### Identity & Access

#### User
Core user entity with onboarding state.

| Field | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `email` | String | Unique email |
| `password_hash` | String? | Null for OAuth-only users |
| `name` | String | Display name |
| `avatar_url` | String? | Profile picture |
| `default_provider` | String? | Preferred cloud provider |
| `default_region` | String? | Preferred region |
| `onboarding_completed` | Boolean | Onboarding wizard done |
| `onboarding_step` | Int | Current step (0-3) |

#### Organisation
Multi-tenant org.

| Field | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `name` | String | Org name |
| `slug` | String | URL-safe slug |

#### OrganisationMember
Role-based org membership.

| Field | Type | Description |
|---|---|---|
| `user_id` | UUID | FK → User |
| `org_id` | UUID | FK → Organisation |
| `role` | Enum | owner, admin, member, viewer |

#### Invitation
Token-based org invites with expiry.

| Field | Type | Description |
|---|---|---|
| `token` | String | Unique invite token |
| `email` | String | Invitee email |
| `org_id` | UUID | FK → Organisation |
| `role` | Enum | Assigned role |
| `expires_at` | DateTime | Expiry timestamp |

#### RefreshToken
JWT refresh token store.

---

### Canvas & Projects

#### CanvasProject
Project or folder, with hierarchical nesting.

| Field | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `name` | String | Project name |
| `slug` | String | URL slug |
| `type` | Enum | `project` or `folder` |
| `parent_id` | UUID? | FK → CanvasProject (folder nesting) |
| `org_id` | UUID | FK → Organisation |
| `owner_id` | UUID | FK → User |
| `default_provider` | String? | Default cloud provider |
| `default_region` | String? | Default region |

#### ProjectMember
Per-project role access.

| Field | Type | Description |
|---|---|---|
| `user_id` | UUID | FK → User |
| `project_id` | UUID | FK → CanvasProject |
| `role` | Enum | owner, editor, viewer |

#### CanvasCard
One canvas board per environment — stores nodes/edges as JSON.

| Field | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `project_id` | UUID | FK → CanvasProject |
| `name` | String | Card/tab name |
| `nodes` | JSON | Array of canvas nodes |
| `edges` | JSON | Array of canvas edges |
| `viewport` | JSON | Pan/zoom state |

#### Environment
Named environment (1:1 with CanvasCard).

| Field | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `project_id` | UUID | FK → CanvasProject |
| `card_id` | UUID | FK → CanvasCard (unique) |
| `name` | String | Environment name |
| `type` | Enum | production, staging, development, pr |
| `is_protected` | Boolean | Prevents deletion (production) |

---

### Credentials

#### ProviderCredential
Encrypted cloud provider credentials, scoped per org.

| Field | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `org_id` | UUID | FK → Organisation |
| `provider` | String | gcp, aws, azure |
| `credentials` | String | AES-256 encrypted JSON |
| `project_id_ref` | String? | Cloud project/account ID |

#### GitHubToken
Encrypted GitHub access tokens.

---

### Deployments

#### CanvasDeployment
Deploy history record.

| Field | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `card_id` | UUID | FK → CanvasCard |
| `status` | Enum | pending, running, completed, failed |
| `plan` | JSON | Deploy plan snapshot |
| `results` | JSON | Per-resource results |
| `started_at` | DateTime | Start time |
| `completed_at` | DateTime? | Completion time |

#### DeployJob
BullMQ job tracker.

| Field | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `deployment_id` | UUID | FK → CanvasDeployment |
| `status` | Enum | queued, processing, completed, failed |
| `bull_job_id` | String | BullMQ job reference |

---

### CI/CD Pipeline

#### DeploymentRule
Pipeline trigger rule: repo + branch pattern → deploy.

| Field | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `project_id` | UUID | FK → CanvasProject |
| `card_id` | UUID | FK → CanvasCard |
| `node_id` | String | Target canvas node |
| `repo_url` | String | GitHub repo URL |
| `branch_pattern` | String | Branch glob (e.g., `main`, `feature/*`) |
| `build_command` | String? | Build command |
| `install_command` | String? | Install command |
| `output_dir` | String? | Build output directory |

#### DeploymentEvent
Individual pipeline run.

| Field | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `rule_id` | UUID | FK → DeploymentRule |
| `status` | Enum | pending, building, deploying, completed, failed |
| `commit_sha` | String | Git commit hash |
| `commit_message` | String | Commit message |
| `branch` | String | Branch name |
| `logs` | JSON | Build/deploy logs |

#### WebhookDelivery
Idempotency table for GitHub webhook deliveries.

---

### AI

#### AiConversation
Chat session per project/card.

| Field | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `project_id` | UUID | FK → CanvasProject |
| `card_id` | UUID? | FK → CanvasCard |
| `title` | String | Conversation title |

#### AiMessage
Individual message with operations.

| Field | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `conversation_id` | UUID | FK → AiConversation |
| `role` | Enum | user, assistant |
| `content` | String | Message text |
| `operations` | JSON? | `AiCanvasOp[]` for assistant messages |
| `suggestions` | JSON? | Follow-up suggestions |

#### AiAuditLog
Debug log of every Claude API call.

| Field | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `card_id` | UUID | FK → CanvasCard |
| `canvas_before` | JSON | Canvas state before ops |
| `operations` | JSON | Parsed ops |
| `parse_success` | Boolean | Whether parsing succeeded |
| `dry_run_result` | JSON? | Validation result |
| `duration_ms` | Int | Call duration |

## Migrations

| Migration | Description |
|---|---|
| `20260316112037_init` | Initial schema |
| `20260316155559_add_project_provider_region` | Default provider/region on projects |
| `20260318092134_add_pipeline_models` | DeploymentRule, DeploymentEvent, WebhookDelivery |
| `20260318120720_add_environments` | Environment model |
| `20260319085706_add_ai_audit_log` | AI audit logging |
| `20260320000000_add_onboarding_fields` | User onboarding state |
| `20260320100000_add_ai_conversations` | AI conversation history |
| `20260320110000_add_org_members_and_invitations` | Multi-tenancy |
| `20260320120000_add_project_members` | Project-level access |

## Running Migrations

```bash
# Apply all pending migrations
pnpm --filter @ice/db prisma migrate deploy

# Create a new migration
pnpm --filter @ice/db prisma migrate dev --name description_here

# Reset database (destructive)
pnpm --filter @ice/db prisma migrate reset
```
