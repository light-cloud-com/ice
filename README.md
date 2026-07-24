<h1 align="center">
  <img src="docs/assets/light-cloud-logo.png" alt="" height="50" align="absmiddle" />
  &nbsp;Integrated Cloud Environment
</h1>

<p align="center">Visual Studio for Cloud</p>

<p align="center">
  <a href="https://github.com/light-cloud-com/ice/actions/workflows/ci.yml"><img src="https://github.com/light-cloud-com/ice/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI" /></a>
  <a href="https://github.com/light-cloud-com/ice/releases/latest"><img src="https://img.shields.io/github/v/release/light-cloud-com/ice?include_prereleases&label=release" alt="Latest release" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-PolyForm%20Noncommercial-blue.svg" alt="License: PolyForm Noncommercial 1.0.0" /></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D22-brightgreen" alt="Node >= 22" /></a>
  <a href="package.json"><img src="https://img.shields.io/github/package-json/v/light-cloud-com/ice?label=version&color=5b21b6" alt="Version" /></a>
</p>

<p align="center">
  <img src="docs/assets/cloud-providers.svg" alt="Cloud provider support - AWS experimental, Azure experimental, GCP stable, DigitalOcean / Oracle / Kubernetes design-only, GitHub integration" />
</p>

<p align="center">
  <img src="docs/assets/screenshot.png" alt="ICE canvas: drag blocks, connect them, deploy" style="max-height: 720px; object-fit: cover; border-radius: 8px;" />
  <img src="docs/assets/main-features.svg" alt="ICE main features - nine capabilities bundled into one Integrated Cloud Environment" />
</p>

## Getting Started

```bash
# Node 22+, pnpm 10+
git clone https://github.com/light-cloud-com/ice.git && cd ice
pnpm install
pnpm schemas:build      # one-time, ~10-15 min, cached after
pnpm dev:all            # then open http://localhost:5173
pnpm dev:desktop        # or desktop app
```

Full guide: [docs/getting-started.md](docs/getting-started.md).

## Providers at a glance

🟢 stable · 🟡 experimental · 🟠 preview · ⚪ planned · Source of truth: [`PROVIDER_READINESS`](packages/constants/src/providers.ts) · Full matrix: [docs/provider-status.md](docs/provider-status.md) · Block coverage: [docs/blocks-reference.md](docs/blocks-reference.md)

The two numbers per row are the **SDK handler count** (cloud primitives wired through `HANDLER_REGISTRY`) and the **palette block coverage** (out of 25 user-facing palette blocks that drop on the canvas).

```
🟢 Google Cloud .................................... stable · 38 handlers · 25/25 blocks · 45+ importers
   ├─ Compute        Cloud Run · Cloud Functions · GKE
   ├─ Database       Cloud SQL · Firestore · BigQuery · Memorystore
   ├─ Storage        Cloud Storage
   ├─ Messaging      Pub/Sub · Cloud Scheduler
   ├─ AI             Vertex AI · Discovery Engine
   ├─ Network        Load Balancer · API Gateway · Domain Mapping
   └─ Ops            Cloud Logging · Secret Manager · Identity Platform

🟡 AWS ............................................. experimental · 38 handlers · 25/25 blocks
   ├─ Compute        ECS · Lambda · EC2
   ├─ Database       RDS · DynamoDB · DocDB · Redshift · ElastiCache
   ├─ Storage        S3
   ├─ Messaging      SQS · SNS · EventBridge · Amazon MQ
   ├─ AI             Bedrock · SageMaker · OpenSearch · OpenSearch Serverless
   ├─ Network        VPC · Subnet · SG · VPC Endpoint · ELBv2 · ACM · Route53
   ├─ Frontend       CloudFront · Amplify Hosting
   ├─ Security       Secrets Manager · Cognito · WAFv2
   └─ Ops            CloudWatch Logs · CodeBuild

🟡 Azure ........................................... experimental · 38 handlers · 25/25 blocks
   ├─ Compute        VM · Web App · Functions · Container Apps · Static Web Apps · AKS · ACR
   ├─ Database       PostgreSQL Flex · MySQL Flex · Cosmos SQL/Mongo · Redis · SQL Server
   ├─ Storage        Blob
   ├─ Messaging      Service Bus · Event Hubs · Event Grid · Logic Apps
   ├─ AI             Cognitive Search · Azure OpenAI · Azure ML · Synapse · Data Explorer
   ├─ Network        VNet · Subnet · NSG · Private Endpoint · DNS · App Gateway · Front Door · APIM · WAF
   ├─ Security       Key Vault · Entra B2C
   └─ Ops            Log Analytics · App Insights

🟠 Alibaba Cloud ................................... preview · 34 handlers · 24/25 blocks (no Email)
   ├─ Compute        ECS · ACK · Function Compute · SAE · ECI
   ├─ Database       RDS · PolarDB · ApsaraDB Redis · MongoDB (DDS)
   ├─ Storage        OSS
   ├─ Messaging      MNS · RocketMQ · AMQP
   ├─ AI             PAI-EAS · PAI Workspace · OpenSearch (vector)
   ├─ Network        VPC · VSwitch · SG · NAT · SLB · CDN · API Gateway · AliDNS
   └─ Ops            SLS · Cloud Monitor · KMS · Secret Manager · RAM · ACR · CR Build

🟠 Oracle Cloud .................................... preview · 33 handlers · 22/25 blocks (no Email, VectorDB, Source)
   ├─ Compute        Compute · Container Instance · OKE · Functions · Resource Scheduler
   ├─ Database       Autonomous DB · MySQL HeatWave · PostgreSQL · NoSQL · Redis
   ├─ Storage        Object Storage · Block Volume · File Storage
   ├─ Messaging      Queue · Streaming · Notifications (ONS)
   ├─ AI             Generative AI · Data Science Model Deployment
   ├─ Network        VCN · Subnet · NSG · Load Balancer · DNS · API Gateway
   └─ Ops            Logging · Monitoring · Vault · Bastion · OCIR · WAF

🟠 Kubernetes ...................................... preview · 19 handlers · 20/25 blocks (no AI, Email, Source)
   ├─ Workloads      Deployment · StatefulSet · DaemonSet · Job · CronJob · Knative Service
   ├─ Networking     Service · Ingress · NetworkPolicy
   ├─ Config         ConfigMap · Secret · PersistentVolumeClaim
   ├─ Identity       Namespace · ServiceAccount · Role · RoleBinding
   └─ Scaling        HorizontalPodAutoscaler · PodDisruptionBudget · Prometheus Rule (CRD)

🟠 IBM Cloud ....................................... preview · 14 handlers · 18/25 blocks (no Frontend, Email, Gateway, CustomDomain, VectorDB, Source)
   ├─ Compute        VPC Instance · Code Engine (app/fn/job) · IKS · OpenShift
   ├─ Database       Cloudant · Db2 · Databases (Postgres/MySQL/Mongo/Redis)
   ├─ Storage        Cloud Object Storage
   ├─ Messaging      Event Streams (Kafka) · MQ · Event Notifications
   ├─ AI             watsonx
   ├─ Network        VPC · Subnet · Security Group · Load Balancer
   └─ Ops            Secrets Manager · Key Protect · Activity Tracker · Log Analysis · Monitoring

🟠 DigitalOcean .................................... preview · 19 handlers · 15/25 blocks (no Scheduler, Messaging, AI, Source, Gateway, Monitoring.Log)
   ├─ Compute        Droplets · DOKS · App Platform · Functions
   ├─ Database       Managed Postgres / MySQL / Redis / MongoDB
   ├─ Storage        Spaces · Volumes · Snapshots
   ├─ Network        VPC · Load Balancer · Floating IP · Firewall · DNS
   └─ Ops            App env vars · Monitoring alerts · DOCR

🟢 GitHub .......................................... integration
```

All eight providers ship a working deployer behind feature flags. Real-cloud round-trips have been observed for GCP, AWS, and Azure; the other five carry full handler + extractor + L4 SDK-input verification but stay gated until a developer runs the live test against their own account. Block coverage is computed from `data/components.ts` against the per-(category × provider) flag in [`packages/constants/src/feature-flags.ts`](packages/constants/src/feature-flags.ts); details + per-block mapping live in [docs/blocks-reference.md](docs/blocks-reference.md).

## Docs

- 📚 [Docs landing](docs/README.md) - audience-grouped index; start here if you're not sure where to look.
- 🚀 [Getting Started](docs/getting-started.md) - install, generate schemas (`ice-schemas.db`), first run, first deploy.
- 🏗 [Architecture](docs/architecture/README.md) - how the pieces fit. Deep-dive pages: [core engine](docs/architecture/core-engine.md), [frontend](docs/architecture/frontend.md), [services](docs/architecture/services.md), [database](docs/architecture/database.md), [desktop](docs/architecture/desktop.md), [AI assistant](docs/architecture/ai-assistant.md).
- 🔌 [Extending providers](docs/reference/extending-providers.md) - add a new cloud.
- 🧱 [Blocks](docs/reference/blocks.md) - concept palette + per-provider variants.
- 🧪 [Testing](docs/testing.md) - unit, integration, GCP scenario dashboard.
- 📖 [Glossary](docs/glossary.md) - block, blueprint, handler, importer, plan, apply.
- 🗺 [Roadmap](ROADMAP.md) - what's shipped, in progress, planned.

## Help

- 🐞 **Bug or feature** - [open an issue](https://github.com/light-cloud-com/ice/issues/new/choose).
- 💬 **Question** - [GitHub Discussions](https://github.com/light-cloud-com/ice/discussions).
- 🔐 **Security** - [SECURITY.md](SECURITY.md); please don't open a public issue.
- 🤝 **Contributing** - [CONTRIBUTING.md](CONTRIBUTING.md).
- 📜 **License** - [PolyForm Noncommercial 1.0.0](LICENSE) · [NOTICE](NOTICE). Free for noncommercial use; commercial use requires a separate license.
