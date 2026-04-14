# Concepts Palette Redesign

Move the default block palette from ~147 low-level provider-specific blocks to a curated set of ~23 high-level, provider-agnostic **Concept** blocks. Low-level blocks remain available behind a "Raw Infrastructure" toggle (Level 2 in `visualization-config.ts`) — this also becomes the natural Free/Pro split.

## Default palette: 23 Concept blocks

| # | Block | Replaces (low-level) |
|---|---|---|
| 1 | Static Site | aws/gcp/azure static-site + cdn |
| 2 | SSR Site | aws/gcp/azure ssr-site + cdn |
| 3 | Scalable Backend | scalable-backend + container-service + LB + logs |
| 4 | Serverless Function | aws/gcp/azure/alibaba/oci serverless-function |
| 5 | Worker | aws/gcp/azure worker |
| 6 | Scheduled Task | aws/gcp/azure scheduled-task |
| 7 | Postgres | rds-pg, cloud-sql-pg, azure-pg |
| 8 | MySQL | rds-mysql, cloud-sql-mysql, azure-mysql |
| 9 | MongoDB | documentdb, firestore-mongo, cosmos-mongo |
| 10 | Redis Cache | elasticache, memorystore, azure-cache |
| 11 | Object Storage | s3, gcs, blob, oss, spaces |
| 12 | Vector DB | pinecone, vertex-vector, cosmos-vector |
| 13 | Message Queue | sqs, pubsub, service-bus |
| 14 | Event Stream | kinesis, pubsub-stream, event-hub |
| 15 | Email Service | ses, sendgrid, azure-comms |
| 16 | Custom Domain | cert-manager + route53 + cloudfront cert |
| 17 | API Gateway | api-gw, apigee, apim |
| 18 | Private Network | vpc + subnets + route tables + nat |
| 19 | LLM Gateway | bedrock, vertex-ai, azure-openai |
| 20 | Private AI Service | self-hosted LLM preset |
| 21 | Observability | cloudwatch, cloud-logging, app-insights |
| 22 | Secret Store | secrets-manager, secret-manager, key-vault |
| 23 | GitHub Repo | already in common/ |

## Explicitly dropped (absorbed or not a concept)

- **Container Service** — same as Scalable Backend under the hood
- **Public Endpoint** — covered by `Private Network` + `Custom Domain` + LB built into Scalable Backend; WAF becomes a property toggle, not a block
- **CDN** — built into Static Site / SSR Site
- **Env Config** — property on blocks that need env vars, not a standalone block

## Compiler requirement

When a **Scalable Backend** is placed inside a **Private Network**, the compiler must emit the internal-only variant (e.g. Cloud Run with `ingress = internal-and-cloud-load-balancing`) plus an external LB. Otherwise Private Network is decorative and the "secure backend" story breaks.

## Visual distinction

Current `BlockNode` renders everything as the same card with different icon + accent color. For Concepts to feel distinct, introduce ~6 visual families on `BlockNode` keyed off `iceType` family:

1. **Frontend** (Static/SSR) — browser-chrome silhouette, domain prominent
2. **Compute** (Backend/Function/Worker) — runtime badge + scaling indicator
3. **Data** (DB/Cache/Storage) — cylinder silhouette, engine/size
4. **Messaging** (Queue/Stream) — pipe silhouette, throughput
5. **Edge** (Domain/Gateway/Network) — shield/globe silhouette
6. **AI** (LLM/Vector/Model) — distinct accent + model badge

Not 23 bespoke components — variants on one component.

---

## Deferred / Future TODOs

### Auth / Identity

Explored as a self-hosted preset that would `expand_to`:

```
Scalable Backend (Authentik / Zitadel image)
  ├── Postgres (auth DB)
  ├── Redis Cache (sessions)
  ├── Custom Domain
  └── Secret Store (signing keys)
```

**Dropped for now.** Most modern apps use either:
- **SaaS auth** (Clerk, Auth0, Supabase Auth) — just an API key, goes in Secret Store
- **Library auth** (NextAuth, Lucia, better-auth) — code + existing Postgres

Neither is real infrastructure, so a block adds no value. **Revisit if users explicitly ask for self-hosted Keycloak/Authentik/Zitadel, or when building a Pro-tier "Managed Auth" (Cognito/Identity Platform) block.**

### Analytics

Two blocks considered and dropped:

- **Data Warehouse** (BigQuery / Redshift / Synapse) — niche; "we have traction, now we need analytics" territory. Users who need it usually pair with BI tools (Looker, Metabase) that aren't in ICE.
- **Search** (OpenSearch / Elastic / Algolia) — more mainstream than Data Warehouse (e-commerce, docs sites) but still shipped-without by most apps.

**Dropped for now.** Keep the default palette lean; promote to the palette once usage data shows demand, or introduce as Pro-tier blocks.

### Potential further merges (open questions)

- **Worker + Serverless Function** → one "Background Job" block with a trigger dropdown (event / queue / schedule). Currently kept separate because scale-to-zero vs steady-replicas is a meaningful user-facing difference.
- **Message Queue + Event Stream** — keep separate; users who need streams know they need streams.
- **LLM Gateway + Private AI Service** — keep separate; managed vs self-hosted is the whole point.
