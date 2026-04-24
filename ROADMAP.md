# ICE Roadmap

ICE is an open-source visual cloud infrastructure platform (Apache 2.0, v0.1.50). This document is a public view of what has recently landed, what is being worked on, and what is planned. It is maintained by hand, updated as work progresses, and intentionally short — it aims to convey direction, not track every task. If something here is wrong, outdated, or missing, open an issue or a pull request. See [CONTRIBUTING.md](CONTRIBUTING.md) for how to propose changes.

> ICE ships in tiers: **Community Edition** (this repo — self-hosted, single-user, Apache 2.0), a planned **Team Edition** (self-hosted, multi-user for dev teams), and **ICE Cloud** (fully managed, hosted by the maintainers). Team-level features — collaboration, RBAC surfaces, audit logs, SSO — are on the roadmap below and will land in Team Edition and Cloud; Community Edition stays single-user.

---

## Recently shipped

Highlights from the last few months of work, grouped thematically. This is a selection — most of the bugs, polish, and internal refactors that made this possible are not listed.

### AI

- **Bring-your-own-key.** The AI assistant is optional and gated on your own Anthropic API key (`ANTHROPIC_API_KEY`). Any OpenAI-compatible server (Ollama, LM Studio, vLLM) works too by setting `ICE_AI_URL`. Nothing leaves your machine without you enabling it.
- **Ghost Mode.** When you drop a block, up to three semi-transparent "ghost" blocks appear suggesting related resources (secrets, databases, queues). Accept with one click, dismiss with another, auto-fade after 10s. Rule-based — no API call per suggestion.
- **AI error diagnosis.** "Diagnose with AI" button on failed deploys. The AI reads the error, failed resources, and canvas topology and returns a plain-English explanation with suggested fixes.
- **Pre-deploy security warnings.** Six deterministic rules flag public databases, missing secrets, public storage, unauthenticated gateways, missing monitoring, and ungrouped services before Apply. Critical warnings require explicit acknowledgement.
- **AI reads your deployments.** When you ask a question like "what did we deploy last?", the AI now receives the latest deployment state (provider, region, resources, errors) as context instead of only seeing the canvas design.

### Deploy reliability

An 18-fix reliability sweep in April 2026. Highlights:

- Rollback now respects environment boundaries (no more production being rolled back to dev config).
- OAuth tokens refresh automatically mid-deploy, so long GCP deploys no longer fail at the 60-minute mark.
- Deploying an empty canvas reports an error instead of fake success.
- Cancel propagates through to Cloud Build subprocesses — clicking cancel actually stops remote work and billing.
- Build logs from push-to-deploy now stream into the unified deploy panel feed.
- Renamed blocks keep their deploy-status overlay instead of going silent.
- Drift results render per-property diffs in the properties panel.
- Deployed URLs appear in the log stream as soon as each resource goes live.
- Immutable fields on Firestore and Managed SSL certificates now refuse no-op updates with an explanatory error.
- Partial-success deploys no longer poison the next plan diff.
- Requirement timeouts are rendered as a distinct "timed out" state, not a generic failure.

### Blocks and concepts

- **Concepts palette.** The default palette moved from ~147 low-level provider-specific blocks to 26 curated "Concept" blocks (Scalable Backend, Postgres, Message Queue, Private Network, Custom Domain, LLM Gateway, etc.). Each block always displays both its concept identity and the target provider. Raw blocks remain available for advanced use.
- **Block fixes.** Event stream on GCP now correctly maps to Pub/Sub (was mislabeled as Dataflow). Search on GCP maps to Vertex AI Search (GCP has no managed Elasticsearch). Azure vector-db and Azure search are now distinct services. Azure Worker block added. Duplicate storage blueprints consolidated on Alibaba, OCI, and DigitalOcean.
- **Block defaults.** AWS Scalable Backend, AWS SSR Site, and GCP Static Site no longer deploy with placeholder values that fail at the cloud API.
- **Card translator correctness.** Missing property extractors now refuse to deploy rather than silently drop config.
- **Validated-as-is set.** GitHub Repository, Custom Domain, Static Site, Group, and Private Network are the visual reference — refactors preserve their behaviour.

### Frontend

- **Containment.** Groups now properly clip child nodes via SVG clipPath. Drag clamping and reducer-level validation keep children inside their parents during drag and snap-to-grid.
- **Activity feed.** A unified `/activity` timeline merging AI, infrastructure, and CI/CD events, with filter tabs, relative timestamps, and expandable metadata.
- **Drift detection.** A "Check for Drift" button compares canvas properties against the last deployment. Drifted nodes show an animated status on the canvas and per-property diffs in the panel.
- **Rollback UI.** One-click rollback from deploy history with two-step confirmation.
- **Group selection.** Ctrl/Cmd+G wraps selected nodes in a container. Nested groups, shift-drag reparenting, fold/unfold, and auto-organize all handle expansion correctly.
- **Group management.** Color picker, inline rename, multi-select drag, auto-expand on drag-to-edge.
- **ESLint cleanup.** 379 errors to 0 across ~95 files — lint is now a credible signal.

### Infrastructure and security

- **Security audit.** 19 findings closed: JWT secret fallback removed, Stripe and GitHub webhooks verify signatures correctly, command injection in the build service closed, crypto-js replaced with Node AES-256-GCM, OAuth flow hardened.
- **Organisation isolation.** 13 cross-org leaks closed across backend and frontend. Org-switch now re-issues JWTs instead of being cosmetic.
- **Role enforcement.** Every deploy, pipeline, billing, credential, AI, and member route now carries `requireProjectAccess` or `requireOrgRole`. (These stay in the codebase for ICE Cloud; Community Edition is single-user and doesn't enforce them at the UI level.)
- **CI.** Typecheck, unit tests, Vite build check, and `pnpm audit` run on every PR. Root tsconfig with project references. Corepack-pinned pnpm version.
- **Docker and local dev.** Gateway Dockerfile added, dev secrets removed from docker-compose, `.env.example` published, `.nvmrc` set to Node 22.

### Templates

- **Multi-provider variants.** Full-Stack, SaaS Platform, RAG Chatbot, AI/ML Workbench, and EU Compliance now have AWS and Azure variants alongside GCP — no more `providerUnsupported: true` on half the nodes.
- **GCP region fix.** All templates now use valid GCP region identifiers (was silently using `us-east-1`, which is an AWS region).

### Desktop

- Architecture redesigned so the Electron app embeds the full gateway and services instead of duplicating code through IPC handlers. Same UI as web, different data transport. Missing dependencies, HTML entry points, Redux store wiring, Tailwind, and electron-builder packaging config all landed.

---

## In progress

Items currently being worked on. This list is short on purpose.

- **Conversational architecture polish.** Better prompt defaults (production-ready by default, cost-aware explanations, multi-step reasoning), staggered animation, context-aware conversation starters.
- **Smart templates with AI interview.** Template picker opens a short interview (3-5 chip questions) and offers both a deterministic "Quick Generate" and an AI-customized generation path.
- **Live cloud status queries (AI Read Level 2).** Let the AI answer "how many instances are running?" by querying the cloud provider API, not just the last deployment record.
- **User-friendly block properties.** Replace cloud-engineering jargon ("replicas", "CIDR", "ack deadline") with intent-based options ("Small / Medium / Large", "Production-ready?") across ~40 block types. Property tier system drives what's visible by default.
- **Cost engine on live pricing.** The cost panel already reads live resource definitions; next step is backing it with provider pricing APIs and multi-region awareness rather than a static table.
- **Frontend polish phase 1-2.** Canvas viewport culling, React.memo on hot components, RAF-throttled mouse move, unified panel resize system, persisted panel visibility, wider resize hit area.
- **Desktop security.** Swap the hardcoded credential encryption key for Electron `safeStorage`, re-enable the renderer sandbox, add runtime validation of the IPC surface.
- **Import wiring.** GCP, AWS, Azure, Terraform, and Pulumi importers exist in the codebase but are not yet wired to a UI flow.

---

## Next up (post-launch)

Larger themes planned for the near-to-medium term, grouped by area. Ordering inside each group is not a priority — this is a thematic map, not a sprint plan.

### AI

- **Logs and metrics integration (AI Read Level 3).** Hook Cloud Logging and Cloud Monitoring into the AI context so it can answer "why is my API slow?" or "show me recent errors" with real data and suggest fixes grounded in live telemetry.
- **Multi-step tool use.** Let the assistant chain tool calls within a single turn (plan → read → propose → validate) instead of one-prompt-one-response today.
- **Additional canvas mutations.** Expand tool-use beyond `add_block` / `connect_blocks` to delete, rename, modify-property, and group — so the assistant can refactor, not just add.
- **Proactive suggestions.** Surface the AI's observations on a canvas (unused blocks, missing secrets, cost outliers) without the user having to ask.
- **Prompt profile system.** Adapt system-prompt verbosity to the active provider/model — compact prompts for smaller self-hosted endpoints, full prompts for Claude.
- **More OpenAI-compatible backends validated.** Today Ollama, LM Studio, and vLLM are supported via the generic OpenAI adapter; pin the tested matrix and document model recommendations per adapter.

### Blocks and concepts

- **Networking primitives.** VPC, firewall / security group, DNS, and load-balancer blocks across AWS, GCP, and Azure. Today these are implied by higher-level concepts; explicit blocks let users model dedicated network topology.
- **Distinct managed-Kubernetes blocks.** GKE, EKS, and AKS as first-class blocks separate from the generic Kubernetes provider.
- **CI/CD blocks.** Container registries (ECR, Artifact Registry, ACR) and build services (Cloud Build, CodeBuild, Azure Pipelines). No provider has these today.
- **Workflow / orchestration.** Step Functions, Cloud Workflows / Tasks / Eventarc, Logic Apps, Event Grid.
- **Additional data services.** AWS Aurora, Azure SQL, GCP Spanner, time-series databases for richer data-tier modelling.
- **Auth and identity concepts.** First-class blocks for Auth / Identity and managed Analytics (Data Warehouse, Search) — deferred from the original 23-block concepts palette.
- **Info panel and code snippets.** Each concept block gets an "(i)" panel that shows its "compiles to" breakdown per provider plus TS / Python / Go / Java / C# / Rust snippets pulled from a typed registry.

### Templates

- **Missing architecture patterns.** Serverless API, Jamstack / static-site-only, microservices with service discovery, event-driven fan-out, scheduled batch processing, analytics / data warehouse pipelines, backend-only API.
- **Missing quick-starts.** Single function, container + database, worker + queue, static site — all as one-click deploys.
- **Environment-specific overrides.** Let a template specify different resource sizes, replica counts, and reliability settings per environment (dev / staging / production).
- **Industry templates.** E-commerce, mobile backend, IoT platform, media streaming, multi-tenant SaaS. Deferred until core patterns above are solid.

### Deploy

- **Deployment workflow templates.** Ship opinionated CI/CD workflows for gateway and frontend (Cloud Run, Vercel, etc.) — today only the CI half is wired.
- **Full provider parity for Apply.** AWS and Azure deployers have type maps and three handlers each today; fill in the remaining handlers so Apply works end-to-end for every block the palette offers.

### Providers

Expanding the supported cloud surface, roughly in order of user demand.

- **AWS and Azure to production parity.** Fill in the remaining Apply handlers so every concept that works on GCP today also works on AWS and Azure.
- **Alibaba Cloud.** Design-only today; promote to deployable — starting with compute, storage, and networking primitives.
- **Oracle Cloud Infrastructure (OCI).** Same trajectory as Alibaba. Common ask from enterprise users.
- **DigitalOcean.** Lightweight alternative for hobbyist / indie use — Droplets, App Platform, Managed Databases, Spaces.
- **Tencent Cloud.** The APAC counterpart to Alibaba; shipped after Alibaba stabilises.
- **Kubernetes (any).** First-class deployable target independent of the hyperscaler the cluster runs on — Helm chart and raw manifest outputs.

### Observability and monitoring

- **Live logs in-canvas.** Stream Cloud Logging / CloudWatch / Azure Monitor tails into a block-aware log panel so you can watch a specific service's output without leaving the canvas.
- **Per-block metrics.** Request rate, error rate, latency, saturation on each deployed block, drawn on the canvas as sparklines.
- **Cost dashboards.** Projected vs. actual spend per environment / per block, with drift alerts. Next step after the static cost engine lands its live-pricing upgrade.
- **Alert configuration.** Define alert policies from the canvas; ICE provisions them in Cloud Monitoring / CloudWatch / Azure Monitor with notification channels.
- **Resource health.** Poll provider status APIs to flag degraded or offline resources on the canvas in real time.

### Security

- **Secret lifecycle.** Rotation UI for the `CREDENTIAL_ENCRYPTION_KEY` and for stored provider credentials; expiring-cert warnings; per-secret access audit log.
- **Stronger pre-deploy gating.** Extend the six deterministic warning rules with dependency-vulnerability checks, IAM over-permission detection, and region-compliance rules (EU-only, HIPAA-only).
- **Supply-chain surface.** SBOM generation per release (CycloneDX), signed desktop binaries (macOS notarization + Windows EV), provenance attestations.
- **Per-canvas secrets.** Let users reference a Secret Store block in any property without leaking the plaintext into the canvas JSON.
- **Private desktop credentials.** Swap the hardcoded credential-encryption key for Electron `safeStorage`, backed by the OS keychain / Credential Manager / libsecret.

### Import / Export / Migration

- **Import from existing infrastructure.** GCP / AWS / Azure scans, Terraform state, Pulumi state — all behind a "Discover my resources" flow in the UI. The importers exist in the codebase; wiring the UI is what's left.
- **Docker Compose import.** Parse a Compose file into a canvas as a starting point for migrating a local project to the cloud.
- **Provider-to-provider migration.** Take a canvas applied on one provider and generate a migration plan to another (GCP → AWS, etc.), with per-resource guidance on lossy mappings.
- **Export to IaC.** Generate Terraform HCL, Pulumi TypeScript, AWS CDK, or raw Kubernetes manifests from a canvas. Today canvases only expand into other canvases.
- **Version migration.** Schema and template migrations between ICE versions without losing user-authored canvases.

### Collaboration and teams

Multi-user features that graduate ICE beyond the single-user Community Edition baseline.

- **Real-time canvas collaboration.** Multiple editors on the same canvas with presence indicators, cursor sharing, and node-level locking. The `canvas:{projectId}` Socket.IO room is already defined but unused; CRDT / OT layer is the missing piece.
- **Comments and mentions.** Leave comments on blocks and edges; @-mention teammates.
- **Role-based access.** Editor / viewer / owner roles, per-project sharing links, audit log UI. The server-side RBAC middleware is already in place from the organisation-isolation work — what's missing is the user-facing surface.
- **Team Edition.** A self-hostable variant of ICE intended for development teams: shared workspaces, user invites, SSO-light (OIDC), without the full ICE Cloud managed stack. Positioned between Community (single-user) and ICE Cloud (managed multi-tenant).
- **Shared templates library.** Team-level and org-level template sharing alongside the built-in gallery.

### Frontend

- **Design system refresh.** Unify the two parallel colour token systems, eliminate hardcoded Tailwind colours, standardize spacing rhythm, border-radius, elevation, and icon sizes. Adopt a proportional sans-serif for UI text while keeping the monospace for code and canvas labels.
- **Property help text.** The `description` field on properties is fetched but not rendered — add tooltips and inline descriptions once the text is review-ready.
- **Radix context menus.** Migrate custom HTML context menus to the Radix primitives already sitting in the codebase for proper keyboard navigation and accessibility.
- **Canvas search and export.** Search nodes on the canvas (not just in the palette). Export to SVG / PNG / PDF for sharing outside the app.

### Desktop

- **Auto-update in production.** `electron-updater` is wired; needs signed binaries to activate.
- **Signed + notarized distribution.** Packaged `.dmg` (signed + notarized), `.exe / .msi` (EV-signed), and `.AppImage / .deb` artifacts released alongside each web version.
- **Desktop tests.** Unit tests for IPC handlers, deploy handler, credential storage, and GitHub service.

---

## Long tail

Larger themes that are on the radar but not scheduled. Listed for context; each may take a few releases' worth of work when picked up.

**Industry-specific templates and patterns.** E-commerce with payments and search, mobile backends, IoT with time-series telemetry, media / streaming with transcoding pipelines, multi-tenant SaaS with per-tenant databases. These belong on the roadmap once the generic patterns above are in place.

**Project management surface.** Duplicate / clone projects, archival (instead of hard delete only), tags and labels, filter by tag. Low priority but frequently requested in similar tools.

**In-app learning.** Interactive first-canvas tutorial, block documentation links, contextual help in the properties panel, short embedded videos per concept.

**Marketplace for community blocks and templates.** Once the concept schema is stable, let third parties publish blocks and templates that install into a running ICE instance.

**Policy as code.** OPA / Rego or equivalent rule integration so teams can enforce "no public storage in prod", "all databases must have encryption enabled", etc., as hard gates.

---

## How to influence this roadmap

- **Open an issue.** The fastest way to get something on (or off) this list is a GitHub issue. Use the feature-request template for new ideas and the bug template for regressions.
- **Pull requests welcome.** Smaller items in "Next up" and "Long tail" are generally good candidates for a first contribution. See [CONTRIBUTING.md](CONTRIBUTING.md) for project setup, branch conventions, and review flow.
- **Community Edition is single-user today.** Multi-user features (collaboration, RBAC surfaces, audit logs, SSO) land in the planned Team Edition and in ICE Cloud rather than Community Edition. Please flag these explicitly if you need them; hearing from users is what moves them up.
- **The maintainers update this file by hand.** It is not a ticket tracker. Expect items to shift between sections as priorities change.
