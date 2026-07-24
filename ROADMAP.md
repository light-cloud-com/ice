# ICE Roadmap

Direction, not a ticket tracker. v0.1.50, PolyForm Noncommercial 1.0.0. Open an issue or PR to change anything. See [CONTRIBUTING.md](CONTRIBUTING.md).

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

All eight target providers now ship a deployer + extractors + L4 SDK command-input verification. The next milestone for each preview-tier provider is per-handler real-cloud deploy gates — see [`PROVIDER_READINESS`](packages/constants/src/providers.ts) and the rollout matrix at [docs/provider-status.md](docs/provider-status.md).

- **GCP** — stable. 38 handlers + 45+ importers.
- **AWS** — experimental, 38 handlers + extractors landed. Live deploy gates pending per category before the matching feature flag flips. See `packages/core/src/deploy/providers/aws/README.md`.
- **Azure** — experimental, 38 handlers + extractors landed (Compute, Database, Storage, Messaging, Network, Observability, Security, AI / Analytics) in the modular dispatcher under `packages/core/src/deploy/providers/azure/`. See `packages/core/src/deploy/providers/azure/README.md`.
- **Alibaba Cloud** — preview, 34 handlers across ECS, ACK, Function Compute, RDS / PolarDB / Redis / MongoDB, OSS, SLB, VPC + VSwitch + SecurityGroup, NAT, SLS, MNS / RocketMQ, CDN, ACR, Cloud Monitor, KMS, Secret Manager, RAM. Live tests + cleanup-orphans wired.
- **Oracle Cloud Infrastructure** — preview, 33 handlers across Compute, OKE, Functions, Autonomous DB, MySQL HeatWave, PostgreSQL, NoSQL, Object Storage, Block / File Storage, VCN + Subnet + Security List, LBaaS, DNS, Streaming, Notifications, Logging, Monitoring, Vault, Bastion, OCIR.
- **DigitalOcean** — preview, 19 handlers across Droplets, DOKS, App Platform, Functions, Managed DBs (Postgres / MySQL / Redis / MongoDB), Spaces, Volumes, VPC, Load Balancer, Floating IP, Firewall, DNS, DOCR, Monitoring, Project.
- **IBM Cloud** — preview, 14 handlers across VPC, Code Engine, IKS / OpenShift, Cloud Functions, Cloudant, Db2, COS, Event Streams (Kafka), Container Registry, Key Protect, Secrets Manager, Activity Tracker, Log Analysis, Monitoring.
- **Kubernetes** — preview, 19 handlers across Deployment, StatefulSet, DaemonSet, Job, CronJob, Service, Ingress, ConfigMap, Secret, PVC, Namespace, ServiceAccount, Role + RoleBinding, NetworkPolicy, HPA. In-cluster + kubeconfig auth supported.

All eight providers run through the same L1–L4 SDK verifier (`scripts/verify-sdk-coverage.mjs` + `scripts/verify-sdk-commands.mjs`) and ship developer-run live tests under `packages/core/src/deploy/providers/__tests__/live/`. Run `pnpm test:live:<provider> <service>` against your own account; the JSONL audit lands under `e2e/<provider>-deployment-tests/runs/`. Each ticked deploy gate is what unblocks the per-category feature flag.

**Next up for the preview tier:** per-handler deploy gates, then category-level feature flag flips, then importer parity (currently only GCP has a full importer).

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
