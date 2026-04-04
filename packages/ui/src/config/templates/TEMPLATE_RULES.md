# Template Building Rules

Rules that MUST be followed when creating or editing templates.
Violations will cause visual bugs, broken connections, or undeployable architectures.

---

## 1. Only use blocks that have blueprints

Every `iceType` used in a template block MUST have a registered blueprint in `packages/blocks/src/index.ts`.

**How to verify:**
```bash
comm -23 \
  <(grep -h "iceType:" *.ts | grep "'.*\." | sed "s/.*iceType: '//;s/'.*//" | sort -u) \
  <(cd ../blocks/src && grep -rh "iceType:" aws/ gcp/ azure/ common/ kubernetes/ alibaba/ oci/ digitalocean/ | sed "s/.*iceType: '//;s/'.*//" | sort -u)
```
Output must be empty.

**Allowed iceTypes:**

| Category | Types |
|----------|-------|
| Network | Internet, Gateway, Domain, VPC, Subnet |
| Compute | Container, StaticSite, SSRSite, ServerlessFunction, Worker, CronJob |
| Database | PostgreSQL, MySQL, MongoDB, Redis, DynamoDB, Firestore, CosmosDB |
| Storage | Bucket |
| Messaging | SQS, SNS, CloudPubSub, RabbitMQ, ServiceBus, Topic |
| Security | Identity, Secret, WAF, Certificate |
| Monitoring | Log, Terminal |
| AI | LLMGateway, VectorDB, ModelServing |
| Analytics | DataWarehouse, Search |
| Source | Repository |
| Config | Environment |

---

## 2. Block positioning — use the grid math

All positions are absolute canvas coordinates.

| Constant | Value |
|----------|-------|
| HEADER_HEIGHT | 36 |
| CONTAINER_PADDING | 20 |
| CARD_WIDTH | 240 |
| CARD_HEIGHT | 160 |
| CHILD_GAP | 16 |
| GROUP_GAP | 30 |

**Group dimensions:**

| Rows | Cols | Width | Height |
|------|------|-------|--------|
| 1 | 1 | 280 | 236 |
| 1 | 2 | 536 | 236 |
| 1 | 3 | 792 | 236 |
| 1 | 4 | 1048 | 236 |
| 2 | 2 | 536 | 412 |
| 2 | 3 | 792 | 412 |
| 2 | 4 | 1048 | 412 |
| 3 | 3 | 792 | 588 |

Formula:
- Width = 20 + (cols × 240) + ((cols - 1) × 16) + 20
- Height = 36 + 20 + (rows × 160) + ((rows - 1) × 16) + 20

**Block positions within a group:**
- First block: (group.x + 20, group.y + 56)
- Next column: +256
- Next row: +176

**Verification:** Every block MUST fit within its group:
- block.x >= group.x + 20
- block.y >= group.y + 56
- block.x + 240 <= group.x + group.width - 20
- block.y + 160 <= group.y + group.height - 20

---

## 3. Ungrouped blocks go BELOW all groups

Blocks not assigned to any group (Secrets, Domain, Repo, Env) must be positioned
below ALL groups.

- `maxGroupBottom = max(group.y + group.height for all groups)`
- First ungrouped row: `maxGroupBottom + 30`
- Second ungrouped row: first row + 176

**Never place ungrouped blocks inside any group's bounding box.**

---

## 4. Connections are block-to-block only

Connections reference block array indices. They connect blocks to blocks — NEVER to containers.

**Never connect to:**
- VPC groups (`iceType: 'Network.VPC'`)
- Subnet groups (`iceType: 'Network.Subnet'`)
- Any Group.* container

**Every connection must match a rule in `connection-rules.ts`:**

| Connection | Rule | Category |
|---|---|---|
| Internet → WAF | Gateway → Gateway | traffic |
| WAF → Gateway | Gateway → Gateway | traffic |
| Internet → Frontend | Gateway → Frontend | traffic |
| Gateway → Backend | Gateway → Backend | traffic |
| Backend → Database | Backend → Database | traffic (auto-port) |
| Backend → Cache | Backend → Cache | traffic (auto-6379) |
| Backend → Storage | Backend → Storage | traffic |
| Backend → Queue | Backend → Queue | traffic (publish) |
| Queue → Backend | Queue → Backend | traffic (subscribe) |
| Backend → Auth | Backend → Auth | traffic |
| Backend → LLM/VectorDB | Backend → LLM/VectorDB | traffic |
| Service → Monitoring | Service → Monitoring | traffic (stream) |
| Service → Secrets/Certificate | Service → Secrets | config (depends_on) |
| Service → EnvConfig | Service → EnvConfig | config (depends_on) |
| Repo → Service | Repo → Service | pipeline |
| Domain → Frontend/Backend/Gateway | Domain → Routable | dns |

**Invalid connections (will be rejected by UI):**
- Anything → Container (VPC, Subnet, Group)
- Frontend → Database (security anti-pattern)
- Frontend → Queue directly

---

## 5. VPC and Subnet nesting

Every non-quickstart template MUST have VPC with nested Subnets.

**Group hierarchy:**
```
[Public Zone]  — Group.Frontend, outside VPC
[VPC]          — iceType: 'Network.VPC', blockIndices: [] (EMPTY)
  ├─ [Public Subnet]  — iceType: 'Network.Subnet', parentGroupIndex → VPC
  └─ [Private Subnet] — iceType: 'Network.Subnet', parentGroupIndex → VPC
[Monitoring]   — Group.Monitoring, outside VPC
```

**Rules:**
- VPC group MUST have `blockIndices: []` — it contains only child Subnet groups, never blocks directly
- Subnet groups MUST have `parentGroupIndex` pointing to the VPC group's index
- Parent groups MUST appear before children in the `groups` array
- Blocks are assigned to Subnets, NOT to the VPC
- Containment chain: VPC → Subnet → Block (three levels)

**VPC sizing formula:**
```
VPC.x = PublicSubnet.x - 20
VPC.y = PublicSubnet.y - 56
VPC.width = 20 + PublicSubnet.width + 30 + PrivateSubnet.width + 20
VPC.height = 56 + max(PublicSubnet.height, PrivateSubnet.height) + 20
```

**What goes where (real cloud architecture):**
- **Outside VPC** (Public Zone): Internet, WAF, CDN/Static Sites — edge/managed services
- **VPC → Public Subnet**: Gateway / Load Balancer — internet-facing
- **VPC → Private Subnet**: Services, Databases, Cache, Queues, Storage — isolated
- **Outside VPC** (Monitoring): Logs — managed observability service
- **Ungrouped**: Secrets, Domain, Repo, Env — control-plane services

**Serverless exception:** When API Gateway is a managed service (not inside VPC), only a Private Subnet is needed inside the VPC. The Gateway goes in Public Zone instead.

---

## 6. Block properties — use DB values, not display labels

Every block's `data` field must use the exact `value` strings from `optionDetails` in `packages/core/src/resources/high-level-resources.ts`. Never use display labels.

**Required properties per block type:**

| iceType | Required properties | Size depends on template purpose |
|---------|---------------------|----------------------------------|
| Compute.Container | `size`, `runtime`, `port` | `'0.5-1024'` (light) → `'2-4096'` (heavy) |
| Compute.Worker | `size`, `runtime` | `'0.5-1024'` (light) → `'2-4096'` (heavy) |
| Compute.ServerlessFunction | `memory`, `timeout`, `runtime` | `'128'`/`'10'` (budget) → `'512'`/`'60'` (processing) |
| Compute.StaticSite | `framework` | `'react'` |
| Compute.SSRSite | `framework` | `'nextjs'` |
| Database.PostgreSQL | `size`, `storage`, `version` | `'db.t3.micro'`/`'20'` (starter) → `'db.r6g.large'`/`'100'` (production) |
| Database.Redis | `size` | `'cache.t3.micro'` (dev) → `'cache.r6g.large'` (production) |
| Storage.Bucket | `storage_class` | `'standard'` |
| Network.Gateway | `protocol` | `'http'` |
| Messaging.SQS | `queue_type` | `'standard'` |
| Messaging.RabbitMQ | `size` | `'mq.m5.large'` |
| Messaging.CloudPubSub | `keep_messages` | `'7 days'` |
| Monitoring.Log | `keep_logs` | `'30 days'` |
| Network.Domain | `hostname` | per template |
| Source.Repository | `repository`, `branch` | `''`, `'main'` |

**Sizing guide by template tier:**

| Tier | Container | PostgreSQL | Redis | Function |
|------|-----------|-----------|-------|----------|
| Budget/Starter | `'0.5-1024'` | `db.t3.micro` / `'20'` | — | `'128'` / `'10'` |
| Standard | `'1-2048'` | `db.t3.small` / `'50'` | `cache.t3.small` | `'256'` / `'30'` |
| Production | `'2-4096'` | `db.t3.medium` / `'100'` | `cache.t3.medium` | `'512'` / `'60'` |
| Enterprise | `'2-4096'` | `db.r6g.large` / `'100'` | `cache.r6g.large` | — |

**Common mistakes:**
- `runtime: 'Node.js 20'` — WRONG, use `'nodejs20'`
- `runtime: 'Python 3.12'` — WRONG, use `'python3.12'`
- `runtime: 'Next.js 14'` — WRONG, use `framework: 'nextjs'` (it's a framework not runtime)
- `storage: '100 GB'` — WRONG, use `'100'` (just the number)

Production-grade databases should use larger sizes:
- `size: 'db.r6g.large'`, `storage: '100'` for compliance/security templates

---

## 7. Group colors

Consistent color coding across all templates:

| Group | Color | Hex |
|-------|-------|-----|
| Public Zone | Red | #ef4444 |
| VPC | Green | #22c55e |
| Public Subnet | Blue | #3b82f6 |
| Private Subnet | Indigo | #6366f1 |
| Monitoring | Amber | #f59e0b |
| Async / Messaging | Purple | #8b5cf6 |
| Security Controls | Purple | #8b5cf6 |
| Platform Services | Slate | #64748b |

---

## 8. Naming conventions

- Group labels: "Public Zone", "VPC", "Public Subnet", "Private Subnet", "Monitoring", "Security Controls"
- Block labels: descriptive function, not cloud-provider names ("API Gateway" not "AWS API Gateway v2")
- `estimatedCost`: format as `"$X-Y/mo"` range

---

## 9. Provider compatibility

- Default provider: `provider: 'gcp'`
- Supported: `providers: ['gcp', 'aws', 'azure']`
- Every block iceType must have blueprints registered for ALL listed providers
- Property values should work across providers (the `optionDetails` in core include provider-specific options)

---

## 10. Template metadata checklist

Every template must have:
- [ ] `id` — unique kebab-case identifier
- [ ] `name` — human-readable display name
- [ ] `description` — one-line summary
- [ ] `icon` — valid Lucide icon name
- [ ] `estimatedCost` — `"$X-Y/mo"` range
- [ ] `category` — quick-start / full-stack / backend / serverless / ai-ml / compliance / devops / e-commerce / mobile / data-pipeline
- [ ] `provider` / `providers`
- [ ] `tags` — include 'VPC', 'Subnet' for VPC templates
- [ ] `securityLevel` — basic / standard / strict / compliance
- [ ] `difficulty` — starter / intermediate / advanced / expert
- [ ] `trust` — official / verified / community
- [ ] `author` — `{ name: string }`
- [ ] `environmentPresets` — at least production

---

## 11. Testing a template

Before merging, verify:
1. All iceTypes have blueprints (rule 1)
2. All blocks fit within their groups (rule 2)
3. No ungrouped blocks overlap with groups (rule 3)
4. All connection indices are valid and match connection-rules.ts (rule 4)
5. VPC contains Subnets via parentGroupIndex (rule 5)
6. All block `data` fields use DB property values (rule 6)
7. Template expands without errors: `expandComposedTemplate(template, 'gcp')`
8. Template expands for all listed providers without `providerUnsupported` flags
