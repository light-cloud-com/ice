<h1 align="center">
  <img src="docs/assets/light-cloud-logo.png" alt="" height="50" align="absmiddle" />
  &nbsp;Integrated Cloud Environment
</h1>

<p align="center">Visual Studio for Cloud</p>

<p align="center">
  <a href="https://github.com/light-cloud-com/ice/actions/workflows/ci.yml"><img src="https://github.com/light-cloud-com/ice/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI" /></a>
  <a href="https://github.com/light-cloud-com/ice/releases/latest"><img src="https://img.shields.io/github/v/release/light-cloud-com/ice?include_prereleases&label=release" alt="Latest release" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-Apache%202.0-blue.svg" alt="License: Apache 2.0" /></a>
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

All eight providers ship a working deployer behind feature flags. Real-cloud round-trips have been observed for GCP, AWS, and Azure; the other five carry full handler + extractor + L4 SDK-input verification but are gated on a developer-run live test against their own account before flipping each category to "deployable".

- 🟢 **Google Cloud — stable(ish).** 38 service handlers, 45+ importers, full create / update / destroy.
- 🟡 **AWS — experimental.** 38 service handlers + extractors covering Compute (ECS, Lambda, EC2), Database (RDS / DynamoDB / DocDB / Redshift / ElastiCache), Network (VPC / Subnet / SG / VPC Endpoint / ELBv2 / CloudFront / ACM / Route53), Storage (S3), Messaging (SQS / SNS / EventBridge / Amazon MQ), Security (Secrets Manager / Cognito / WAFv2), AI/Analytics (Bedrock / SageMaker / OpenSearch / OpenSearch Serverless / Redshift), Frontend (CloudFront / Amplify Hosting), Monitoring (CloudWatch Logs), Source (CodeBuild). See [`packages/core/src/deploy/providers/aws/README.md`](packages/core/src/deploy/providers/aws/README.md).
- 🟡 **Azure — experimental.** 38 service handlers + extractors covering Compute (VM, Web App, Functions, Container Apps, Static Web Apps, AKS, ACR), Database (PostgreSQL Flex, MySQL Flex, Cosmos SQL+Mongo, Redis Cache, SQL Server), Storage (Blob), Messaging (Service Bus + AMQP/RabbitMQ branch, Event Hubs, Event Grid, Logic Apps), Network (VNet, Subnet, NSG, Private Endpoint, DNS Zone, App Gateway, Front Door, APIM, WAF), Observability (Log Analytics, App Insights), Security (Key Vault, Entra B2C), AI/Analytics (Cognitive Search, Azure OpenAI, Azure ML, Synapse, Data Explorer). See [`packages/core/src/deploy/providers/azure/README.md`](packages/core/src/deploy/providers/azure/README.md).
- 🟠 **Alibaba Cloud — preview.** 34 service handlers covering ECS, Container Service (ACK), Function Compute, RDS (MySQL / PostgreSQL), PolarDB, ApsaraDB for Redis, MongoDB, OSS, SLB, VPC + VSwitch + SecurityGroup, NAT Gateway, Log Service (SLS), Message Service / RocketMQ, CDN, Container Registry, Cloud Monitor, KMS, Secret Manager, RAM. Live tests wired; cardinal-rule deploy gate pending per-handler verification.
- 🟠 **Oracle Cloud Infrastructure — preview.** 33 service handlers covering Compute, OKE, Functions, Autonomous DB, MySQL HeatWave, PostgreSQL, NoSQL, Object Storage, Block Volume, File Storage, VCN + Subnet + Security List, Load Balancer, DNS, Streaming, Notifications, Logging, Monitoring, Vault, Bastion, Container Registry. L4 SDK-input verifier extended.
- 🟠 **DigitalOcean — preview.** 19 service handlers covering Droplets, Kubernetes (DOKS), App Platform, Functions, Managed Databases (Postgres / MySQL / Redis / MongoDB), Spaces, Volumes, VPC, Load Balancer, Floating IP, Firewall, DNS, Container Registry, Monitoring, Project.
- 🟠 **IBM Cloud — preview.** 14 service handlers covering VPC, Code Engine, IKS / OpenShift, Cloud Functions, Cloudant, Db2, Cloud Object Storage, Event Streams (Kafka), Container Registry, Key Protect, Secrets Manager, Activity Tracker, Log Analysis, Monitoring.
- 🟠 **Kubernetes — preview.** 19 service handlers covering Deployment, StatefulSet, DaemonSet, Job, CronJob, Service, Ingress, ConfigMap, Secret, PersistentVolumeClaim, Namespace, ServiceAccount, Role + RoleBinding, NetworkPolicy, HorizontalPodAutoscaler. In-cluster + kubeconfig auth supported.

- 🟢 **GitHub — integration.**

Status legend: 🟢 stable · 🟡 experimental (deploys observed) · 🟠 preview (deployer wired, awaiting deploy gate) · ⚪ planned. The source of truth lives in `PROVIDER_READINESS` in [`packages/constants/src/providers.ts`](packages/constants/src/providers.ts) and the matrix at [docs/provider-status.md](docs/provider-status.md).

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
- 📜 **License** - [Apache 2.0](LICENSE) · [NOTICE](NOTICE).
