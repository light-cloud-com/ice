# Plugin System

ICE uses a registry-based plugin architecture for blocks, templates, and cloud providers. Each has a `define*()` API that registers definitions at import time.

## Block Registry (`@ice/block-registry`) {#block-registry}

**Location:** `packages/block-registry/`

Provides the `defineBlock()` function and an in-memory registry for block definitions.

### API

```typescript
import { defineBlock, getBlock, getAllBlocks, getBlocksByProvider } from '@ice/block-registry'

const myBlock = defineBlock({
  id: 'gcp-cloud-run',
  name: 'Cloud Run',
  provider: 'gcp',
  category: 'compute',
  icon: 'cloud-run.svg',
  properties: [
    { name: 'cpu', type: 'select', options: ['1', '2', '4'], default: '1' },
    { name: 'memory', type: 'select', options: ['256Mi', '512Mi', '1Gi'], default: '512Mi' },
    // ...
  ],
  connections: {
    inputs: ['gcp-cloud-sql', 'gcp-redis', 'gcp-pubsub'],
    outputs: ['gcp-cloud-storage', 'gcp-pubsub'],
  },
  deploy: {
    handler: 'cloud-run',
    requiredProperties: ['cpu', 'memory'],
  },
})

// Query
const block = getBlock('gcp-cloud-run')
const gcpBlocks = getBlocksByProvider('gcp')
const allBlocks = getAllBlocks()
```

### BlockDefinition Interface

```typescript
interface BlockDefinition {
  id: string
  name: string
  provider: string
  category: string
  icon?: string
  properties: BlockProperty[]
  connections: BlockConnections
  deploy?: BlockDeployConfig
}
```

---

## Blocks (`@ice/blocks`) {#blocks}

**Location:** `packages/blocks/`

All block definitions across 7 cloud providers. Each block calls `defineBlock()` from the registry.

### Providers & Categories

| Provider | Categories |
|---|---|
| `gcp` | frontend, backend, compute, data, messaging, storage, networking, security, observability, ai, analytics |
| `aws` | frontend, backend, compute, data, messaging, storage, networking, security, observability, ai, analytics |
| `azure` | frontend, backend, compute, data, messaging, storage, networking, security, observability, ai, analytics |
| `digitalocean` | frontend, backend, compute, data, storage |
| `alibaba` | backend, compute, data, storage |
| `oci` | backend, compute, data, storage |
| `kubernetes` | backend, compute, data, messaging, storage |
| `common` | github-repository, env-config, domain |

### File Structure

```
packages/blocks/src/
├── gcp/
│   ├── frontend/      (static-site, ssr-site)
│   ├── backend/       (scalable-backend, worker, scheduled-task)
│   ├── compute/       (serverless-function)
│   ├── data/          (postgresql, mysql, redis-cache, firestore, ...)
│   ├── messaging/     (event-stream, pubsub)
│   ├── storage/       (storage)
│   └── ...
├── aws/               (same structure)
├── azure/             (same structure)
├── common/            (github-repository, env-config, domain)
└── index.ts           (imports and registers all blocks)
```

---

## Provider Registry (`@ice/provider-registry`) {#provider-registry}

**Location:** `packages/provider-registry/`

Registration API for cloud provider deployer plugins.

### API

```typescript
import { defineProvider, getProvider, getProviderRegistry } from '@ice/provider-registry'

defineProvider({
  id: 'gcp',
  name: 'Google Cloud Platform',
  regions: [
    { id: 'us-central1', name: 'Iowa', location: 'US' },
    // ...
  ],
  auth: { type: 'service-account', requiredFields: ['projectId', 'credentials'] },
  createDeployer: (config) => new GcpDeployer(config),
})

// Usage
const registry = getProviderRegistry()
const deployer = registry.createDeployer('gcp', config)
const result = await deployer.deploy(resources)
```

### ProviderDeployer Interface

```typescript
interface ProviderDeployer {
  plan(resources: Resource[]): Promise<DeployPlan>
  apply(plan: DeployPlan): Promise<DeployResult>
  destroy(resources: Resource[]): Promise<DeployResult>
}
```

---

## Provider Implementations {#providers}

**Location:** `packages/providers/`

| Package | Provider |
|---|---|
| `@ice/provider-gcp` | Google Cloud Platform |
| `@ice/provider-aws` | Amazon Web Services |
| `@ice/provider-azure` | Microsoft Azure |

Each implements the `ProviderDeployer` interface from the provider registry.

---

## Template Registry (`@ice/template-registry`) {#template-registry}

**Location:** `packages/template-registry/`

Registration API for infrastructure templates.

### API

```typescript
import { defineTemplate, getTemplate, getAllTemplates } from '@ice/template-registry'

defineTemplate({
  id: 'full-stack-web',
  name: 'Full-Stack Web Application',
  description: 'Complete web stack with frontend, backend, database, and CDN',
  provider: 'gcp',
  category: 'full-stack',
  nodes: [...],
  edges: [...],
  variables: [
    { name: 'projectName', label: 'Project Name', type: 'string' },
  ],
})
```

---

## Templates (`@ice/templates`) {#templates}

**Location:** `packages/templates/`

Pre-built infrastructure compositions using the `ComposedTemplate` format.

### Template Catalog

| Template | Category | Description |
|---|---|---|
| `full-stack` | full-stack | Complete web application stack |
| `ai-ml` | ai-ml | Machine learning workload |
| `rag-chatbot` | ai-ml | RAG chatbot |
| `eu-compliance` | compliance | GDPR-focused stack |
| `saas-starter` | full-stack | SaaS starter kit |
| Quick starts | quick-start | Minimal single-resource templates |

### ComposedTemplate Format

Templates reference blocks by type. At apply time, `expandComposedTemplate()` resolves blocks into canvas nodes and edges:

```typescript
const template: ComposedTemplate = {
  id: 'saas-starter',
  blocks: [
    { type: 'gcp-cloud-run', name: 'API Server', position: { x: 400, y: 200 } },
    { type: 'gcp-cloud-sql', name: 'Database', position: { x: 400, y: 400 } },
  ],
  connections: [
    { from: 'API Server', to: 'Database' },
  ],
}

// Expand to canvas state
const { nodes, edges } = expandComposedTemplate(template)
```

### Query API

```typescript
import { searchTemplates, getTemplatesByCategory, filterByProvider } from '@ice/templates'

const results = searchTemplates('chatbot')
const fullStack = getTemplatesByCategory('full-stack')
const gcpOnly = filterByProvider(getAllTemplates(), 'gcp')
```
