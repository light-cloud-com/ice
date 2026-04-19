# User-Friendly Block Properties

## Problem

ICE is for non-technical users building cloud from simple blocks. But block properties use cloud engineering jargon: "Runtime", "Replicas", "CIDR", "Instance Size", "Retention (days)", "Ack Deadline", "Multi-AZ". Users don't know what these mean.

**Scope:** ~140 properties across ~40 resources. ~35 properties use technical labels/options.

## Design Principles

1. **Ask "what" not "how"** — "What is this for?" not "Exchange Type"
2. **Use intent-based options** — "Small / Medium / Large" not "mq.t3.micro / mq.m5.xlarge"
3. **Plain English descriptions** — "Keep messages if queue restarts?" not "Durable"
4. **Hide infrastructure** — Port numbers, CIDR ranges, protocol versions should be auto-configured
5. **Map intent to config** — User picks "Production" → we set replicas=3, HA=true, size=large

## Pattern: Property Tiers

Every property should be classified into one of three tiers:

### Tier 1: Always Show (user-facing)
- Name / label
- Purpose / "What is this for?"
- Size (Small / Medium / Large)
- Production-ready? (yes/no toggle)

### Tier 2: Show on Expand (power user)
- Specific queue names, topic names
- Who listens / who connects
- Keep messages for how long

### Tier 3: Hidden (auto-configured)
- Port numbers → derived from block type
- Runtime versions → use latest stable
- CIDR ranges → auto-assigned
- Replicas / CPU / Memory → derived from Size selection
- Protocol, engine version, throughput → best defaults

## Universal Properties (apply to most blocks)

| Property | Label | Type | Options |
|----------|-------|------|---------|
| `name` | Name | string | — |
| `purpose` | What is this for? | select | (context-specific options) |
| `size` | Size | select | Small (dev), Medium (startup), Large (production) |
| `production` | Production-ready? | boolean | Toggles HA, backups, encryption, multi-AZ |

When `production = true`, auto-set:
- `highAvailability: true`
- `replicas: 2+`
- `encryption: true`
- `backups: true`
- `size: Medium` (minimum)

When `size` changes, auto-set:
- Small: 1 replica, min resources, single zone
- Medium: 2 replicas, moderate resources
- Large: 3+ replicas, max resources, multi-zone

## Block-Specific Examples

### Database (PostgreSQL, MySQL)
| Show | Property | Options |
|------|----------|---------|
| Always | Name | text |
| Always | Size | Small (shared, 1GB) / Medium (dedicated, 10GB) / Large (high-perf, 100GB+) |
| Always | Production-ready? | boolean → sets backups, HA, encryption |
| Expand | Initial data size | Small (<1GB) / Medium (1-50GB) / Large (50GB+) |

**Hidden:** instance type, storage_gb, engine version, port, CIDR, IOPS, multi_az, cpu, memory

### Backend Service (Cloud Run, ECS)
| Show | Property | Options |
|------|----------|---------|
| Always | Name | text |
| Always | What does this run? | Web server / API / Worker / Cron job |
| Always | Size | Small (1 instance) / Medium (auto-scales to 5) / Large (auto-scales to 20) |
| Expand | Language | Node.js / Python / Go / Java / .NET / Other |

**Hidden:** port, cpu, memory, min/max instances, scaling metric, runtime version

### Message Queue (RabbitMQ, Pub/Sub, SQS)
| Show | Property | Options |
|------|----------|---------|
| Always | Name | text |
| Always | What is this for? | Background jobs / Notifications / Event streaming / Task distribution |
| Always | Queue names | text (comma-separated) |
| Always | Production-ready? | boolean |

**Hidden:** exchange type, port, instance size, ack deadline, retention, durable, protocol

### Storage (S3, GCS)
| Show | Property | Options |
|------|----------|---------|
| Always | Name | text |
| Always | What are you storing? | User uploads / App data / Backups / Static website |
| Always | Size | Small (<10GB) / Medium (<100GB) / Large (100GB+) |

**Hidden:** bucket policy, CORS, versioning, lifecycle rules, storage class

## Implementation Approach

### Option A: Property Tiers in Schema (recommended)
Add a `tier` field to `HighLevelProperty`:

```typescript
interface HighLevelProperty {
  name: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'select';
  tier: 'essential' | 'detailed' | 'advanced';  // NEW
  required: boolean;
  description: string;
  options?: string[];
  default?: any;
  derivesFrom?: string;  // NEW — auto-set when another field changes
}
```

Properties panel shows `essential` by default, `detailed` behind an "More options" expand, `advanced` only in a developer mode toggle.

### Option B: Intent-to-Config Mapping Layer
Create a mapping layer that translates user intents to technical config:

```typescript
const SIZE_MAP = {
  'Small — dev / testing': { replicas: 1, cpu: 256, memory: 512, instanceType: 'micro' },
  'Medium — startup': { replicas: 2, cpu: 1024, memory: 2048, instanceType: 'small' },
  'Large — production': { replicas: 3, cpu: 2048, memory: 4096, instanceType: 'medium' },
};
```

This lives in `@ice/core` and is applied at deploy time (card-translator.ts).

### Recommendation
Do both. Option A controls what users see. Option B translates what they chose into real cloud config at deploy time. The properties panel stays simple, the deploy engine handles the complexity.

## Affected Resources (audit needed)

All ~40 resources in `high-level-resources.ts` need review. Priority:
1. **Databases** — PostgreSQL, MySQL, MongoDB, Redis (most complex properties)
2. **Compute** — Cloud Run, Functions, Workers (runtime/scaling confusion)
3. **Messaging** — RabbitMQ, Pub/Sub, SQS, Kafka (done for RabbitMQ + Pub/Sub)
4. **Storage** — S3, GCS, CDN
5. **Networking** — VPC, Subnet, Load Balancer, API Gateway
6. **Security** — Auth, Secrets, Firewall
7. **AI/ML** — LLM endpoints, Vector DB
