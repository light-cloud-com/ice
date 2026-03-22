# Missing Templates Backlog

## Current Inventory

| ID | Name | Provider | Category |
|---|---|---|---|
| `qs-website-db` | Website + Database | gcp | quick-start |
| `qs-webapp-api` | Web App + API | gcp | quick-start |
| `qs-api-only` | API Only | gcp | quick-start |
| `qs-data-pipeline` | Data Pipeline | gcp | quick-start |
| `fullstack-webapp` | Full-Stack Web App | gcp | full-stack |
| `aiml-workbench` | AI/ML Workbench | gcp | ai-ml |
| `rag-chatbot` | RAG Chatbot | gcp | ai-ml |
| `eu-compliance` | EU Compliance Stack | gcp | compliance |
| `saas-platform` | SaaS Platform | gcp | full-stack |

**Total: 9 templates. All GCP-only. Two defined categories have zero templates.**

## Category Coverage

6 categories are defined in `TEMPLATE_CATEGORIES` (`packages/templates/src/types.ts:47`):

| Category | Label | Templates | Status |
|---|---|---|---|
| `quick-start` | Quick Starts | 4 | Covered |
| `full-stack` | Full Stack | 2 | Covered |
| `ai-ml` | AI & ML | 2 | Covered |
| `compliance` | Compliance | 1 | Thin — only EU/GDPR |
| `backend` | Backend & API | **0** | **Empty — hidden from picker** |
| `data-pipeline` | Data Pipelines | **0** | **Empty — hidden from picker** |

`getActiveCategories()` silently filters out empty categories, so users never see `backend` or `data-pipeline` in the template picker despite them being defined with labels, icons, and colors.

### Missing categories to consider adding

| Category | Description | Example Templates |
|---|---|---|
| `serverless` | Functions-first architectures | Serverless API, event-driven functions |
| `e-commerce` | Online store patterns | Cart + catalog + payments + CDN |
| `mobile` | Mobile backend patterns | Auth + API + push + storage |
| `devops` | CI/CD and infrastructure | Build pipeline + registry + deploy |

---

## Known Bug

### TMPL-1: AWS region strings in all GCP templates (P1)
**Files:** All template files in `packages/templates/src/`

Every template has `environmentPresets` with `region: 'us-east-1'` — an AWS region identifier. GCP uses `us-east1` (no hyphen). This will fail at deploy time.

**Fix:** Change all to valid GCP region identifiers (e.g., `us-central1`).

### TMPL-2: `expandComposedTemplate` group matching edge case (P3)
**File:** `packages/templates/src/expand-template.ts:148-153`

Group nodes matched by `iceType` AND `label`. If two groups share the same `subtype`, the wrong group could be selected. Not triggered by current templates but latent.

---

## Multi-Provider Variants (P1)

Every composed template is hardcoded to `provider: 'gcp'`. The blocks for AWS and Azure equivalents already exist. Users selecting AWS or Azure get `providerUnsupported: true` on some nodes.

| Template | AWS Variant | Azure Variant |
|---|---|---|
| Full-Stack Web App | `fullstack-webapp-aws` | `fullstack-webapp-azure` |
| SaaS Platform | `saas-platform-aws` | `saas-platform-azure` |
| RAG Chatbot | `rag-chatbot-aws` | `rag-chatbot-azure` |
| AI/ML Workbench | `aiml-workbench-aws` | `aiml-workbench-azure` |
| EU Compliance | `eu-compliance-aws` | `eu-compliance-azure` |

**Alternative:** Make templates provider-agnostic by using abstract block types (`scalable-backend` instead of `gcp-scalable-backend`) and resolve to provider-specific blocks at expansion time based on the user's selected provider. This would reduce template count from 27 to 9.

---

## Missing Architecture Patterns (P2)

### TMPL-3: Serverless API
No template using `serverless-function` blocks. The block exists on all providers but no template showcases it. Pattern: API Gateway → Lambda/Cloud Functions → DynamoDB/Firestore.

### TMPL-4: Static Site Only (Jamstack)
No dedicated "static site only" quick-start without a backend. Pattern: CDN → Static Site → (optional) Serverless Functions for API.

### TMPL-5: Microservices
`saas-platform` has three backends behind one gateway but doesn't show independent service discovery or mesh. Pattern: API Gateway → multiple independent services → each with own database → message queue for inter-service communication.

### TMPL-6: Event-Driven / Fan-Out
Only the data pipeline quick-start uses queues in a simple linear flow. No template shows pub/sub fan-out (SNS → multiple SQS) or competing consumers. Pattern: Event source → Topic → multiple subscribers → dead-letter queue.

### TMPL-7: Scheduled / Batch Processing
The `scheduled-task` block exists but no template uses it. Pattern: Scheduler → Worker → Database → Storage (results).

### TMPL-8: Analytics / Data Warehouse
`data-warehouse` and `search` blocks exist but no template uses them. Pattern: Event Stream → ETL Worker → Data Warehouse → Search/BI.

### TMPL-9: Backend API (no frontend)
The `backend` category is registered in `TEMPLATE_CATEGORIES` but has zero templates. Pattern: API Gateway → Backend Service → Database → Cache.

---

## Missing Quick-Starts (P2)

| Quick-Start | Pattern | Blocks |
|---|---|---|
| Single Function | Simplest possible deploy | serverless-function |
| Container + DB | Minimal full-stack | scalable-backend, postgresql |
| Worker + Queue | Background processing | worker, sqs/pubsub, storage |
| Static Site | Jamstack | static-site, domain |

---

## Missing Industry Templates (P3)

| Template | Category | Key Blocks |
|---|---|---|
| E-commerce | full-stack | CDN, frontend, API, product DB, payment service, search, storage |
| Mobile Backend | backend | Auth, API Gateway, push notifications, DB, storage, CDN |
| IoT Platform | data-pipeline | MQTT broker, event stream, time-series DB, dashboard |
| Media/Streaming | full-stack | CDN, transcoding workers, storage, metadata DB |
| Multi-tenant SaaS | full-stack | Shared API, per-tenant databases, auth, billing |

---

## Template Configuration Quality (P3)

### TMPL-10: No environment-specific overrides
Templates carry one set of resource configs. The `EnvironmentPreset` type supports `securityLevel` and `region` but no resource-size or replica-count overrides. Production should get `db.r6g.large`, staging should get `db.t3.micro`.

### TMPL-11: Placeholder domains in deployable fields
Templates use illustrative domains (`app.acme.io`, `chat.acme.io`) placed directly in block `data` fields. No validation warns users to replace these before deploying.

### TMPL-12: Static cost estimates
`estimatedCost` strings like `$60-120/mo` are hardcoded with no computation. Should at minimum link to a pricing calculator or be removed to avoid misleading users.
