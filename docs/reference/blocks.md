# Blocks Reference

ICE's canvas is built from **concept blocks** - provider-neutral building blocks like _Static Site_, _Scalable Backend_, _Postgres_, _Message Queue_. Each concept resolves, at deploy time, to a specific cloud primitive depending on the selected provider (Cloud Run on GCP, ECS on AWS, App Service on Azure).

This page enumerates the concept palette and points at where each concept is defined, validated, and implemented.

## Where things live

```
packages/blocks/src/
├── common/concepts/       The 28-concept palette (provider-neutral)
│   ├── api-gateway/
│   ├── custom-domain/
│   ├── email-service/
│   ├── env-config/
│   ├── event-stream/
│   ├── github-repo/
│   ├── llm-gateway/
│   ├── message-queue/
│   ├── mongodb/
│   ├── mysql/
│   ├── object-storage/
│   ├── observability/
│   ├── postgres/
│   ├── private-ai-service/
│   ├── private-network/
│   ├── public-traffic/
│   ├── redis-cache/
│   ├── scalable-backend/
│   ├── scheduled-task/
│   ├── secret-store/
│   ├── serverless-function/
│   ├── ssr-site/
│   ├── static-site/
│   ├── vector-db/
│   ├── worker/
│   └── … and a couple more
├── aws/                   Provider-specific variants (when a concept maps differently per AWS service)
├── azure/                 Same for Azure
├── gcp/                   Same for GCP
└── requirements/          What a concept requires from connected blocks
```

Each concept folder contains:

- `index.ts` - the concept's definition (id, label, category, default properties, edges it legally accepts).
- `blueprint.ts` - a template "blueprint" shown when the concept is first dropped on a canvas.
- `info.ts` - long-form description (what it is, why you'd use it, what it maps to per provider).

## The canvas palette

The palette (left sidebar in the UI) groups concepts by category:

| Category      | Example concepts                                                     |
| ------------- | -------------------------------------------------------------------- |
| Compute       | Scalable Backend, Worker, Serverless Function, SSR Site, Static Site |
| Data          | Postgres, MySQL, MongoDB, Redis Cache, Object Storage, Vector DB     |
| Messaging     | Message Queue, Event Stream                                          |
| AI            | LLM Gateway, Private AI Service, Vector DB                           |
| Networking    | Public Traffic, Private Network, API Gateway, Custom Domain          |
| Observability | Observability                                                        |
| Security      | Secret Store, Env Config                                             |
| Integration   | GitHub Repo, Email Service, Scheduled Task                           |

Some concepts planned for the palette are deferred (authentication, analytics data warehouse, search). See [ROADMAP.md](../../ROADMAP.md) for status.

## Concept → cloud mapping

Each concept has one mapped primitive per provider. The mapping lives in `packages/core/src/resources/` and the per-provider handlers in `packages/providers/<cloud>/src/handlers/`. Examples:

| Concept             | GCP                     | AWS             | Azure                        |
| ------------------- | ----------------------- | --------------- | ---------------------------- |
| Static Site         | Cloud Storage + CDN     | S3 + CloudFront | Storage Account + CDN        |
| Scalable Backend    | Cloud Run               | ECS Fargate     | App Service / Container Apps |
| Serverless Function | Cloud Functions         | Lambda          | Functions                    |
| Postgres            | Cloud SQL (Postgres)    | RDS (Postgres)  | Database for PostgreSQL      |
| Object Storage      | Cloud Storage           | S3              | Blob Storage                 |
| Message Queue       | Pub/Sub                 | SQS             | Service Bus                  |
| Vector DB           | Vertex AI Vector Search | OpenSearch      | AI Search                    |
| LLM Gateway         | Vertex AI endpoints     | Bedrock         | Azure OpenAI                 |
| Observability       | Cloud Logging           | CloudWatch      | Monitor                      |

GCP is the most complete provider today; AWS and Azure are intentionally partial. Provider parity is tracked on the roadmap.

## Requirements and validation

Concepts advertise _requirements_ - "to be useful, a Scalable Backend needs either a GitHub Repo or an Object Storage for code, plus a Public Traffic upstream." Requirements live in `packages/blocks/src/requirements/` and are enforced by the canvas validator (`packages/core/src/validation/`).

When a requirement is unmet, the block shows a badge; hovering the badge explains what's missing. The validator prevents deploys on unmet hard requirements and warns on soft ones.

## Adding a new concept

The typical shape of a new concept PR:

1. `packages/blocks/src/common/concepts/<name>/index.ts` - define id, label, default properties, category.
2. `packages/blocks/src/common/concepts/<name>/blueprint.ts` - the drop-to-canvas initial state.
3. `packages/blocks/src/common/concepts/<name>/info.ts` - description.
4. `packages/core/src/resources/high-level-resources.ts` - register the high-level resource and its mapping.
5. `packages/providers/<cloud>/src/handlers/<resource>.ts` - per-provider deploy/update/delete handler.
6. `packages/ui/src/features/canvas/components/nodes/<name>/` - custom node rendering (if needed).
7. Tests - usually a card-translator test + a handler test.

See `packages/blocks/src/common/concepts/static-site/` as a reference implementation - it covers every piece.

## Templates vs. blocks

A **template** is a pre-built composition of concepts with edges and default properties. Templates live in `packages/templates/` and are shown in the template gallery.

Current templates:

| Template                 | What it builds                                      |
| ------------------------ | --------------------------------------------------- |
| SaaS Starter             | Static site, backend, Postgres, auth, custom domain |
| Full-Stack               | SSR site + backend + Postgres + object storage      |
| RAG Chatbot              | Static site + LLM gateway + vector DB + backend     |
| Budget Web App           | Minimal budget-friendly web stack                   |
| Backend API              | Scalable backend + Postgres + observability         |
| Microservices            | Multiple backends + event stream + shared DB        |
| Serverless API           | API gateway + serverless functions + DB             |
| Event-Driven Serverless  | Event stream + multiple serverless functions        |
| Secure API               | Backend with locked-down networking and secrets     |
| AI/ML                    | LLM + vector DB + model endpoints                   |
| EU Compliance            | Same as SaaS Starter but region-locked              |
| SaaS Multi-Tenant        | Tenant-isolated SaaS shape                          |
| SaaS Analytics Dashboard | Dashboard + data pipeline                           |

Templates are just compositions - every block they produce is one you could drop individually. Nothing magic.

## Entry points worth reading

- [`packages/blocks/src/common/concepts/static-site/index.ts`](../../packages/blocks/src/common/concepts/static-site/index.ts) - simplest concept.
- [`packages/blocks/src/common/concepts/scalable-backend/index.ts`](../../packages/blocks/src/common/concepts/scalable-backend/index.ts) - a more complex one.
- [`packages/core/src/resources/high-level-resources.ts`](../../packages/core/src/resources/high-level-resources.ts) - concept-to-cloud mapping.
- [`packages/core/src/validation/`](../../packages/core/src/validation) - canvas-level validation rules.
- [`packages/templates/src/`](../../packages/templates/src) - template compositions.

## See also

- [core-engine](../architecture/core-engine.md) - the graph model concepts translate into.
- [frontend](../architecture/frontend.md) - how concepts are rendered on the canvas.
