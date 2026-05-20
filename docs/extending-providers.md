# Extending Providers

A walkthrough for adding a new cloud provider (or expanding an existing experimental one) to ICE. Designed to be self-contained - clone, follow the steps, get a green deploy.

If you're new to the codebase, skim [architecture.md](architecture.md) first so the terms below land.

## What "adding a provider" means

A provider in ICE is the combination of:

1. A `Provider` identifier and metadata in `packages/constants/src/providers.ts`.
2. A **deployer** class implementing `ProviderDeployer` in `packages/core/src/deploy/providers/`.
3. (Optional) An **importer** that walks the cloud and produces a canvas.
4. An **auth adapter** that turns user-supplied credentials into an SDK client.
5. Per-resource **handlers** for the resource types you want to support.
6. **Provider-readiness** entry in `PROVIDER_READINESS` (`stable` / `experimental` / `design-only`).

For the deploy path to light up end-to-end, you need #1, #2, #4, and the handlers in #5 for at least one resource type.

## Step 1 - Register the provider

Edit `packages/constants/src/providers.ts`:

```ts
export type Provider = 'aws' | 'gcp' | 'azure' | 'kubernetes' | 'alibaba' | 'oci' | 'digitalocean' | 'your-cloud';

export const PROVIDER_READINESS: Record<Provider, ProviderReadiness> = {
  // …
  'your-cloud': 'experimental', // start here; bump to 'stable' once you've earned it
};

export const CLOUD_PROVIDERS: CloudProviderMeta[] = [
  // …
  {
    id: 'your-cloud',
    name: 'Your Cloud',
    shortName: 'YC',
    description: 'Short pitch.',
    icon: 'your-cloud',
    color: '#xxxxxx',
    readiness: PROVIDER_READINESS['your-cloud'],
  },
];
```

Also update the `.d.ts` and `.js` siblings (these are hand-kept in sync - see `providers.ts` for the layout).

## Step 2 - Add a deployer

Create `packages/core/src/deploy/providers/your-cloud-deployer.ts`. Implement the `ProviderDeployer` interface from `packages/core/src/deploy/providers/types.ts`. The shape:

```ts
import type { DeployOptions, ResourceDeployResult, ProviderDeployer } from '../types.js';

export class YourCloudDeployer implements ProviderDeployer {
  provider = 'your-cloud';

  async initialize(options: DeployOptions): Promise<void> {
    // Spin up SDK clients from options.auth_credentials.
  }

  async cleanup(): Promise<void> {
    // Destroy clients, close pools.
  }

  async create(
    type: string,
    name: string,
    properties: Record<string, unknown>,
    _options: Record<string, unknown>,
  ): Promise<ResourceDeployResult> {
    // Dispatch on `type.startsWith('your-cloud.x.y')`.
    // Each branch calls a private `create_x_y` helper that returns provider_id.
  }

  async update(/* same shape */): Promise<ResourceDeployResult> {
    /* … */
  }
  async destroy(/* same shape */): Promise<ResourceDeployResult> {
    /* … */
  }
}

export function create_your_cloud_deployer(): YourCloudDeployer {
  return new YourCloudDeployer();
}
```

Look at `aws-deployer.ts` for the minimum-viable shape (~500 lines, 3 handlers). For something fuller, `gcp-deployer.ts` + `providers/gcp/handlers/*` is the reference implementation (20+ resource types, handler-per-file).

Wire the new class into `packages/core/src/deploy/providers/index.ts` and re-export from a thin `packages/providers/your-cloud/` package if you want a public surface.

## Step 3 - Auth adapter

Authentication lives next to the deployer. For GCP it's `packages/core/src/deploy/providers/gcp/auth.ts`. Two key responsibilities:

- Take user-supplied credentials from the in-app **Settings → Providers** form.
- Validate them (a read-only call like "list projects" / `sts:GetCallerIdentity`) so we fail fast with a useful error instead of mid-deploy.

The validate function is registered in `packages/core/src/deploy/providers/registry.ts` and called by the gateway on credential save.

## Step 4 - Concept block variants

For each concept your provider should support, add a `ProviderVariant` to the concept's blueprint under `packages/blocks/src/common/concepts/<concept>/blueprint.ts`:

```ts
providers: ['aws', 'gcp', 'azure', 'your-cloud'],
providerVariants: [
  // …
  {
    provider: 'your-cloud',
    dataOverrides: {
      providerDisplayName: 'Your Cloud Storage Buckets',
    },
  },
],
```

Concepts are provider-agnostic in the palette - adding your provider here is what lights it up for users.

## Step 5 - Tests

Mirror the layout in `packages/core/src/deploy/providers/__tests__/`. The minimum:

- A unit test asserting `create` dispatches to the right private helper for each resource type.
- A unit test asserting `destroy` calls succeed when the provider API returns NOT_FOUND (treat as idempotent).
- A deploy-translation integration test for one happy path.

If you're adding to an experimental provider, also add a scenario YAML in `e2e/deployment-tests/scenarios/` for the resource you implemented and run `pnpm test:scenarios` against your sandbox.

## Step 6 - Documentation

- Add a `docs/deploying-to-your-cloud.md` page following the GCP guide's shape.
- Update `docs/provider-status.md` with what's covered.
- Update the [ROADMAP](../ROADMAP.md) if the parity story moves.

## Step 7 - Open the PR

The [pull request template](../.github/pull_request_template.md) has the checklist we run through on review. The important parts for a provider PR:

- `pnpm typecheck` and `pnpm test:unit` are green.
- Manual: I deployed at least one resource end-to-end against my own cloud account.
- A screenshot of the canvas with at least one block in the deployed state.

## See also

- [architecture.md](architecture.md) - overall flow.
- [core-engine.md](core-engine.md) - translate / plan / apply.
- [`packages/core/src/deploy/providers/gcp/`](../packages/core/src/deploy/providers/gcp/) - reference implementation.
- [`packages/core/src/deploy/providers/aws-deployer.ts`](../packages/core/src/deploy/providers/aws-deployer.ts) - minimum-viable shape.
- [provider-status.md](provider-status.md) - what's stable vs experimental.
