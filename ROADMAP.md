# ICE Roadmap

Direction, not a ticket tracker. v0.1.50, Apache 2.0. Open an issue or PR to change anything. See [CONTRIBUTING.md](CONTRIBUTING.md).

> **Editions.** Community (this repo - single-user). Team (planned - self-hosted, multi-user). Cloud (planned - managed). Multi-user features ship in Team + Cloud.

---

## Next up

### AI

- Live telemetry context (AI Read L3) - logs + metrics in prompt
- Multi-step tool use (plan → read → propose → validate)
- Full mutation surface - delete, rename, modify, group
- Proactive suggestions - unused blocks, missing secrets, cost outliers
- Per-provider prompt profiles
- Validated OpenAI-compat backend matrix (Ollama, LM Studio, vLLM)

### Providers - `help-wanted`

- AWS + Azure to GCP parity _(top priority - see [`PROVIDER_READINESS`](packages/constants/src/providers.ts))_
  - **AWS**: 20+ handlers + extractors landed; live deploy gates pending per category before the matching feature flag flips. See `packages/core/src/deploy/providers/aws/README.md` for the rollout-state table.
  - **Azure**: 35+ handlers + extractors landed (Compute, Database, Storage, Messaging, Network, Observability, Security, AI / Analytics); rebuild migrated VM/Storage/Web into the modular dispatcher in `packages/core/src/deploy/providers/azure/`. See `packages/core/src/deploy/providers/azure/README.md`.
  - **Both providers** now ship developer-run live tests under `packages/core/src/deploy/providers/__tests__/live/` — `pnpm test:live:aws <service>` / `pnpm test:live:azure <service>` against your own account. Each ticked deploy gate is what unblocks the per-category feature flag.
- Alibaba Cloud - design-only → deployable
- Oracle Cloud Infrastructure
- DigitalOcean - Droplets, App Platform, Managed DBs, Spaces
- Tencent Cloud
- Kubernetes (any) - Helm + raw manifest outputs

Adding a provider is well-scoped contributor work - see the walkthrough in [docs/reference/extending-providers.md](docs/reference/extending-providers.md).

### Blocks - `help-wanted`

- Networking primitives - VPC, firewall, DNS, load balancer
- Managed K8s - GKE, EKS, AKS
- CI/CD - registries + build services
- Workflow orchestration - Step Functions, Cloud Workflows, Logic Apps
- More data - Aurora, Azure SQL, Spanner, time-series
- Auth + Analytics concepts
- Info panel - "compiles to" + code snippets in 6 languages

Each block is a self-contained PR - concept blueprint, info-panel content, per-provider handlers. Good first issues.

### Observability

- Live logs in-canvas (Cloud Logging / CloudWatch / Azure Monitor)
- Per-block metrics sparklines (rate / errors / latency)
- Cost dashboards - projected vs actual, drift alerts
- Alert configuration from the canvas
- Real-time resource health polling

### Security

- Secret rotation UI + expiring-cert warnings + audit log
- Pre-deploy: dep-vuln scan, IAM over-permission, region compliance (EU, HIPAA)
- Supply chain - SBOM, notarized macOS, EV-signed Windows, provenance
- Per-canvas secrets - reference without leaking plaintext
- Electron `safeStorage` for desktop credentials

### Import / Export / Migration

- UI flow for existing GCP / AWS / Azure / Terraform / Pulumi importers
- Docker Compose → canvas
- Provider-to-provider migration plans
- Export to Terraform HCL, Pulumi TS, AWS CDK, K8s manifests
- Version migration - no canvas loss between releases

### Collaboration & teams

- Real-time canvas editing - presence, cursors, locking (CRDT/OT)
- Comments + mentions
- RBAC UI - editor / viewer / owner, sharing links, audit log
- **Team Edition** - self-hosted multi-user, invites, OIDC SSO
- Shared team / org template libraries

### Templates - `help-wanted`

- Missing patterns - serverless API, Jamstack, microservices, event-driven, batch, analytics
- Quick-starts - single function, container+DB, worker+queue, static site
- Per-env overrides in one template
- Industry templates - e-commerce, mobile, IoT, media, multi-tenant SaaS

### Deploy

- CI/CD workflow templates (Cloud Run, Vercel)
- Full AWS + Azure Apply parity

### Frontend

- Design system refresh - unified tokens, proportional sans-serif
- Property help text rendering
- Radix context menus - keyboard + a11y
- Canvas search + export (SVG / PNG / PDF)

### Desktop

- Auto-update via `electron-updater`
- Signed + notarized builds (`.dmg`, `.exe/.msi`, `.AppImage/.deb`)
- IPC + credential-storage tests

---

## Long tail

- Marketplace - third-party blocks + templates
- Policy as code - OPA / Rego hard gates
- Project management - duplicate, archive, tags, filters
- In-app learning - tutorial, contextual help, per-concept videos

---

## Influence the roadmap

- **Issue or PR.** Fastest path on or off this list - see [CONTRIBUTING.md](CONTRIBUTING.md).
- **Flag team use cases.** Multi-user demand moves Team Edition / Cloud items up.
- **Hand-maintained.** Items shift as priorities change.
