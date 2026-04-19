# ICE Backlog — Structured Overview

## 1. Bugs & Tech Debt — 153/154 done (99%)

| ID | Item | Status |
|---|---|---|
| INFRA-11 | Deployment workflow (needs cloud provider config) | **OPEN** |

Everything else is fixed.

---

## 2. Context Menus — 15 fixed, 5 deferred, 8 won't fix

### Open / Deferred

| ID | Item | Type |
|---|---|---|
| CTX-7 | "Group Selected" action (multi-node → container) | Deferred |
| CTX-8 | "Ungroup" action for containers | Deferred |
| CTX-13 | "Move to Folder" submenu in project tree | Deferred |
| CTX-17 | "Duplicate" for projects | Deferred |
| ~~CTX-19~~ | ~~Protected environments have no context menu at all~~ | ~~Done~~ (Deploy-only menu renders for protected envs) |
| ~~CTX-20~~ | ~~"Rename" for environments~~ | ~~Done~~ (modal + thunk + context menu entry) |
| ~~CTX-21~~ | ~~"Deploy" in environment context menu~~ | ~~Done~~ |
| CTX-22 | "Duplicate" for environments | Open |
| CTX-23 | Awkward menu when only "Delete" remains | Open |
| CTX-24 | Migrate all menus to Radix UI primitives | Open |
| CTX-25 | Keyboard shortcut to open context menu (a11y) | Open |

---

## 3. AI-Native Features — 4/6 done

| # | Feature | Priority | Effort | Status |
|---|---|---|---|---|
| 0 | Flash-MoE as default AI backend (`@ice/ai` package) | P0 | 3-4d | **DONE** |
| 1 | Ghost Mode — AI suggestions on canvas (static rules) | P1 | 2-3d | **DONE** |
| 2 | AI error diagnosis on failed deploys | P1 | 2d | **DONE** |
| 3 | Pre-deploy security/cost warnings (deterministic) | P1 | 3-4d | **DONE** |
| 4 | Conversational architecture polish (prompts, animation, starters) | P2 | 2d | Open |
| 5 | Smart templates with AI interview | P2 | 3d | Open |

---

## 4. AI Read Capabilities — 1/3 done

| Level | Feature | Priority | Effort | Status |
|---|---|---|---|---|
| 1 | Deployment context in AI prompt (DB data) | P1 | 2-3d | **DONE** |
| 2 | Live cloud status queries (GCP APIs) | P2 | 5-7d | Open |
| 3 | Logs & metrics integration (Cloud Logging/Monitoring) | P3 | 7-10d | Open |

---

## 5. User-Friendly Properties — not started

~35 properties across ~40 blocks need rewriting from technical jargon to intent-based options. Key work:
- Add `tier` field to `HighLevelProperty` (essential / detailed / advanced)
- Add intent-to-config mapping layer (Small/Medium/Large → replicas, CPU, memory)
- Priority order: Databases → Compute → Messaging → Storage → Networking → Security → AI/ML

---

## 6. Missing Features — 4/27 done

### Canvas

| ID | Feature | Priority |
|---|---|---|
| FEAT-1 | Canvas search/filter | P2 |
| FEAT-2 | Export to image/PDF | P2 |
| ~~FEAT-3~~ | ~~Group selection~~ | ~~Done~~ |
| FEAT-4 | Zoom-to-fit uses hardcoded width | P3 |
| FEAT-5 | Copy/paste uses fragile setTimeout | P3 |

### Collaboration

| ID | Feature | Priority |
|---|---|---|
| FEAT-6 | Real-time multi-user collaboration | P2 |
| FEAT-7 | Comments/annotations on nodes | P3 |
| ~~FEAT-8~~ | ~~Activity feed~~ | ~~Done~~ |
| FEAT-9 | Per-project sharing links | P3 |

### Deploy

| ID | Feature | Priority |
|---|---|---|
| ~~FEAT-10~~ | ~~Rollback~~ | ~~Done~~ |
| FEAT-11 | Pre-deploy cost estimation (superseded by AI-Native Feature 3) | P2 |
| ~~FEAT-12~~ | ~~Drift detection~~ | ~~Done~~ |

### Import

| ID | Feature | Priority |
|---|---|---|
| FEAT-13 | Import from existing cloud infra | P2 |
| FEAT-14 | Import from Terraform state | P2 |
| FEAT-15 | Import from Pulumi state | P3 |
| FEAT-16 | Import from Docker Compose | P3 |

### Export

| ID | Feature | Priority |
|---|---|---|
| FEAT-17 | Export to Terraform/Pulumi/CDK | P2 |
| FEAT-18 | Export as diagram-as-code (Mermaid, PlantUML) | P3 |

### Project Management

| ID | Feature | Priority |
|---|---|---|
| FEAT-19 | Project duplication/clone | P3 |
| FEAT-20 | Project archival | P3 |
| FEAT-21 | Project tagging/labeling | P3 |

### Monitoring & Observability

| ID | Feature | Priority |
|---|---|---|
| FEAT-22 | Cost tracking dashboard | P3 |
| FEAT-23 | Resource health monitoring | P3 |
| FEAT-24 | Alert configuration | P3 |

### In-App Help

| ID | Feature | Priority |
|---|---|---|
| FEAT-25 | Block property help text not rendered | P2 |
| FEAT-26 | Getting started guide / tutorial | P3 |
| FEAT-27 | Block documentation links | P3 |

---

## 7. Missing Blocks — 80+ items

### Structural / Bugs (P0) — 8/8 done

| ID | Issue | Status |
|---|---|---|
| ~~BLK-1~~ | ~~No `connections` field on BlockBlueprint (no edge validation)~~ | ~~Done~~ (edge validation in `packages/types/src/connection-rules.ts`) |
| ~~BLK-2~~ | ~~Sparse `nodeData` — most blocks show empty properties~~ | ~~Done~~ (block definitions now populate `nodeDataDefaults`) |
| ~~BLK-3~~ | ~~GCP event-stream mislabeled as Dataflow~~ | ~~Done~~ (now Pub/Sub) |
| ~~BLK-4~~ | ~~GCP search references non-existent "Google Elasticsearch"~~ | ~~Done~~ (now Vertex AI Search / Discovery Engine) |
| ~~BLK-5~~ | ~~Azure vector-db and search are the same service~~ | ~~Done~~ (vector-db → Cosmos DB; search stays Azure AI Search) |
| ~~BLK-6~~ | ~~AWS public-traffic uses CloudFront instead of ALB~~ | ~~Done~~ (rearchitected as canvas-only symbolic concept, no AWS mapping) |
| ~~BLK-7~~ | ~~Azure missing worker block~~ | ~~Done~~ (`packages/blocks/src/azure/backend/worker.ts`) |
| ~~BLK-8~~ | ~~Duplicate storage blocks on Alibaba, OCI, DigitalOcean~~ | ~~Done~~ (removed `oss.ts`, `oci-object-storage.ts`, `do-spaces.ts` + stale constants) |

### Missing blocks by provider (P1-P2 only)

| Provider | Count | Key gaps |
|---|---|---|
| GCP | ~20 | VPC, Firewall, Cloud Build, Artifact Registry, Cloud Tasks, Eventarc, Spanner, IAM |
| AWS | ~22 | VPC, Security Groups, ALB, EKS, ECR, Step Functions, EventBridge, Aurora |
| Azure | ~17 | VNet, NSG, AKS, Worker, ACR, Logic Apps, Azure SQL, App Gateway |
| Kubernetes | 9 | Secret, RBAC, ConfigMap, PostgreSQL, MySQL, HPA, Network Policy |
| Common | 8 | GitLab repo, Bitbucket repo, Container Registry, SSL cert, DNS |

### Missing from ALL providers

- CI/CD (build pipelines, container registries, deploy pipelines)
- Advanced networking (VPC, firewall, security groups, DNS)
- Workflow/orchestration (Step Functions, Cloud Workflows, Logic Apps)

---

## 8. Missing Templates — 12 items

### Bugs

| ID | Issue | Priority |
|---|---|---|
| TMPL-1 | AWS region strings in GCP templates (`us-east-1` → `us-central1`) | P1 |
| TMPL-2 | Group matching edge case in `expandComposedTemplate` | P3 |

### Multi-provider variants needed (P1)

All 9 templates are GCP-only. Need AWS + Azure variants for: Full-Stack, SaaS, RAG Chatbot, AI/ML Workbench, EU Compliance.

### Missing architecture patterns (P2)

| ID | Pattern |
|---|---|
| TMPL-3 | Serverless API |
| TMPL-4 | Static site / Jamstack |
| TMPL-5 | Microservices |
| TMPL-6 | Event-driven / fan-out |
| TMPL-7 | Scheduled / batch processing |
| TMPL-8 | Analytics / data warehouse |
| TMPL-9 | Backend API (no frontend) |

### Config quality (P3)

| ID | Issue |
|---|---|
| TMPL-10 | No environment-specific size overrides |
| TMPL-11 | Placeholder domains in deployable fields |
| TMPL-12 | Static cost estimates (hardcoded strings) |

---

## 9. Frontend Polish — 0/43 done

> Full spec: [`frontend-polish.md`](frontend-polish.md)

User feedback: canvas not smooth, sidebars hard to resize, elements cluttered/small, UI not clean.

| Epic | Items | Critical/High items |
|---|---|---|
| Containment & Boundaries | 12 | BND-1,2,5,6 (drag clamping, SVG clipping) |
| Canvas Performance | 7 | CVS-1,2 (React.memo, viewport culling) |
| Panel Resize/Show/Hide | 6 | PNL-1,2,3 (unify resize, persist state, wider handles) |
| Visual Clutter & Spacing | 7 | CLT-1,2,3 (spacing rhythm, color tokens) |
| Element Sizing | 7 | SIZ-1,2 (font swap, unified text scale) |
| Overall Polish | 4 | POL-1,2 (Radix menus, property help text) |

---

## Summary by Priority

| Priority | Items | Areas |
|---|---|---|
| **P0** | 0 | All block structural issues resolved (BLK-1…BLK-8 done) |
| **P1** | ~18 remaining | INFRA-11 (needs cloud target), AI features 4-5, AI read L2, template multi-provider shipped, key missing blocks, **frontend containment fixes shipped** |
| **P2** | ~60 | Missing features, AI features 4-5, AI read L2, user-friendly properties, remaining blocks, **canvas perf, panel UX, design system** |
| **P3** | ~90+ | Polish, minor provider blocks, industry templates, collab, project mgmt, AI read L3 |

---

## Recent progress — 2026-04-19 session

**P0 block fixes** (BLK-3/4/5/7/8) completed. BLK-1/2/6 verified already resolved in earlier commits.

**P1 AI features** (4 of 7 shipped):
- AI-Native #1 Ghost Mode — static rule-based suggestions after drop (`ghost-slice.ts`, `svg-ghost-node.tsx`)
- AI-Native #2 Error Diagnosis — "Diagnose with AI" button in failed-deploy banner, new `/ai/diagnose-deploy` endpoint
- AI-Native #3 Pre-deploy Warnings — deterministic security rules + static cost estimator render between plan and apply, gates Apply on critical acknowledge
- AI Read L1 — deployment context injected into AI system prompt for question intents (`isQuestionIntent`, `buildDeploymentContext`)

**CTX fixes** (CTX-19/20/21): environment context menu gained "Rename" action with modal; protected envs get a Deploy-only menu; Deploy already wired up from earlier work.

**Deferred**: INFRA-11 (deploy workflow), AI-Native #4/#5 (polish + smart templates), Concepts Palette Auth/Data Warehouse/Search blocks.
