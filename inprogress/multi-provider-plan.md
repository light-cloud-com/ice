# Multi-Provider Implementation Plan — Kubernetes / Alibaba / OCI / DigitalOcean / IBM

## Why this doc exists

Phases A (AWS) and B (Azure) are complete to the boundary of what code can guarantee — handlers shipped, mocked + live tests in place, SDK packages installed, four-layer verification passing, feature flags flipped. The remaining design-only providers in `feature-flags.ts` (Kubernetes, Alibaba, OCI, DigitalOcean, IBM) need the same treatment.

This plan applies the Azure-rebuild template (`inprogress/azure-rebuild.md`) to each new provider. Read this overview first; per-provider depth is in `kubernetes-deployer.md`, `alibaba-deployer.md`, `oci-deployer.md`, `digitalocean-deployer.md`, `ibm-deployer.md`.

## Operator decisions (recorded)

- **Kubernetes target**: vanilla `@kubernetes/client-node` against any K8s API server (works on EKS/AKS/GKE/OKE/IKS/DOKS/k3s/kind). No Helm-first path.
- **DigitalOcean SDK**: `dots-wrapper` (community) — mature, typed, covers ~90% of the DO API.
- **Implementation approach**: sequential. Finish Kubernetes end-to-end first, then Alibaba, OCI, DO, IBM. Each provider ships independently.

## Phase mapping

| Phase | Provider           | iceTypes prefix  | SDK family                          | Doc                        |
| ----- | ------------------ | ---------------- | ----------------------------------- | -------------------------- |
| E     | Kubernetes         | `k8s.*`          | `@kubernetes/client-node`           | `kubernetes-deployer.md`   |
| F     | Alibaba Cloud      | `alibaba.*`      | `@alicloud/*`                       | `alibaba-deployer.md`      |
| G     | Oracle Cloud (OCI) | `oci.*`          | `oci-*` family                      | `oci-deployer.md`          |
| H     | DigitalOcean       | `digitalocean.*` | `dots-wrapper`                      | `digitalocean-deployer.md` |
| I     | IBM Cloud          | `ibm.*`          | `ibm-cloud-sdk-core` + service SDKs | `ibm-deployer.md`          |

Estimated effort per provider: 12–25 hours of focused implementation (handlers + extractors + tests + live tests + docs + flag flip). Sequential total ≈ 70–110 hours across the five.

## Cardinal rule (unchanged)

A handler is "done" only after a real-cloud deploy round-trip has been observed on a developer's own account. Mocked-SDK tests + SDK verification layer-4 (`pnpm verify:sdk:all`) catch shape errors but do not substitute for a live deploy. Feature flags stay `enabled: false` for each provider until the per-handler deploy gate ticks in `progress.md` and the category's full handler set is verified.

## Shared per-handler contract (every phase, every provider)

For each handler shipped:

1. **Handler** at `packages/core/src/deploy/providers/<provider>/handlers/<service>.ts`
2. **Extractor** in `packages/core/src/deploy/extractors/<provider>/<file>.ts`
3. **HANDLER_REGISTRY entry** in `packages/core/src/deploy/providers/<provider>/<provider>-deployer.ts`
4. **dispatch.ts entry** mapping resource_type → extractor
5. **Mocked-SDK test** at `packages/core/src/deploy/providers/__tests__/<provider>-<service>.test.ts`
6. **Live test** at `packages/core/src/deploy/providers/__tests__/live/<provider>-<service>.live.test.ts` (developer-run, env-gated)
7. **SDK client** registered in `packages/core/src/deploy/providers/<provider>/sdk-loader.ts`
8. **Schema-DB alignment** — block properties match `packages/core/data/ice-schemas.db`
9. **Docs**:
   - `docs/deploying-to-<provider>.md` — "What works today"
   - `docs/blocks-reference.md` — per-block per-provider status
   - `docs/provider-status.md` — matrix
   - `packages/core/src/deploy/providers/<provider>/README.md` — rollout-state + quirks

10. **`pnpm verify:sdk:all`** passes — adds the provider's SDK packages to `packages/core/package.json` dependencies, extends `scripts/verify-sdk-coverage.mjs` RESOLVE_FROM if needed, extends `scripts/verify-sdk-commands.mjs` with the provider's type-extraction strategy (per-SDK below).

## SDK verification per provider (layer-4)

The existing verifier covers AWS / Azure / GCP. Each new provider needs its own type-extraction strategy added to `scripts/verify-sdk-commands.mjs`:

| Provider         | Type layout                                                                                                                                                                                                                                                                                | Resolver to add                                                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Kubernetes**   | `@kubernetes/client-node` exposes typed API classes (CoreV1Api, AppsV1Api, etc.). Each method takes a body object whose shape matches the K8s OpenAPI spec — model interfaces (`V1Pod`, `V1Deployment`, `V1Service`) live in `node_modules/@kubernetes/client-node/dist/gen/model/*.d.ts`. | Glob `dist/gen/model/<Name>.d.ts`, extract `class V1<Name>` properties. Recursive through `super` (V1ObjectMeta, V1PodSpec) where present. |
| **Alibaba**      | `@alicloud/*` packages — each ships request/response classes in `dist/client.d.ts` with `<Op>Request` shapes. Similar to AWS v3's `<Cmd>Request`.                                                                                                                                          | Reuse AWS resolver pattern; point at `<pkg>/dist/client.d.ts` and look for `export class <Op>Request`.                                     |
| **OCI**          | `oci-*` packages expose request/details types in `lib/<service>/<request>.d.ts` (e.g., `oci-objectstorage/lib/request/put-object-request.d.ts`).                                                                                                                                           | Glob `lib/<service>/request/*.d.ts` and `lib/<service>/model/*.d.ts`, match by request-class name.                                         |
| **DigitalOcean** | `dots-wrapper` exports typed request shapes per service (e.g., `IDroplet`, `ICreateDropletApiRequest`).                                                                                                                                                                                    | Read `dist/modules/<service>/types/*.d.ts`.                                                                                                |
| **IBM Cloud**    | `@ibm-cloud/platform-services` and service-specific packages export typed `<Method>Params` interfaces (e.g., `CreateInstanceParams`).                                                                                                                                                      | Glob each package's `dist-types/*.d.ts`, match by `<Method>Params` interface name.                                                         |

These extensions land alongside each phase doc and roll up into a single `pnpm verify:sdk:all` run.

## Cross-cutting workstreams

These touch every provider and should be planned once, executed per-provider:

1. **Feature flag scaffolding** — `feature-flags.ts` already lists every provider with explicit per-category booleans. Each phase flips its provider's `enabled: true` only at the very end (cardinal rule).
2. **Cost data** — extend `packages/core/src/resources/scale-presets-data/*.ts` per category with per-provider `_providers.<provider>` entries. The C3 regression test in `scale-presets-data.test.ts` enforces presence on cross-cloud blocks.
3. **Provider metadata** — add each provider's icon, display name, region list to `packages/constants/src/providers.ts` (already partially present from the design-only registration).
4. **Importer** — `packages/core/src/importers/<provider>/` mirroring the AWS/Azure shape. Optional per provider (Phase C precedent: AWS importer is deferred; Azure has one).
5. **Live-test foundation** — `_live-helpers.ts` already exports `awsLive`, `azureLive`. Add `kubernetesLive`, `alibabaLive`, `ociLive`, `digitaloceanLive`, `ibmLive`. Each `*.live.test.ts` follows the existing template.

## Order of operations per phase (sequential)

For each phase E → F → G → H → I:

1. **Scaffold** — directory structure, types.ts, sdk-loader.ts, auth.ts, region/project helpers, test harness, deployer class with empty HANDLER_REGISTRY, back-compat entry in the parent `providers/` index.
2. **SDK packages** — add to `packages/core/package.json` dependencies, `pnpm install`, verify they resolve.
3. **P0 handlers** — must-have core: Compute, Database (Postgres/MySQL/Redis), Storage, Network (VPC/Subnet/SG), Security (Secret), Messaging (Queue).
4. **P1 handlers** — important: Load Balancer, CDN, DNS, IAM, Container Registry, Kubernetes, Functions.
5. **P2 handlers** — long-tail: AI, Analytics, Monitoring, WAF, less common services.
6. **Extractors** — one extractor module per category (`compute.ts`, `database.ts`, `network.ts`, etc.).
7. **Quirks** — provider-specific edge cases (region handling, auth nuances, name constraints, billing modes).
8. **Live-test foundation** — add provider-specific live-helpers, `pnpm test:live:<provider>` script, e2e/<provider>-deployment-tests/ runs dir + cleanup-orphans.
9. **Mocked tests** — per-handler test files using the shared harness.
10. **Live tests** — per-handler `*.live.test.ts` (developer-run).
11. **SDK verification** — `pnpm verify:sdk:all` extended with the provider's type-resolver; passes against installed SDK packages.
12. **Docs** — `docs/deploying-to-<provider>.md`, `providers/<provider>/README.md`, `provider-status.md` row update.
13. **Cost presets** — `_providers.<provider>` entries for every cross-cloud block.
14. **Feature flag flip** — set `enabled: true` and each `categories.<X>: true` per category whose handler set has its full deploy-gate sweep green.
15. **Deploy verification log** — append to `progress.md` per handler.

## Estimated handler counts

| Provider     | P0  | P1  | P2  | Total | Notes                                 |
| ------------ | --- | --- | --- | ----- | ------------------------------------- |
| Kubernetes   | 12  | 8   | 5   | ~25   | Smaller — no managed services         |
| Alibaba      | 14  | 11  | 8   | ~33   | Comparable to Azure                   |
| OCI          | 14  | 10  | 7   | ~31   | Comparable to AWS                     |
| DigitalOcean | 10  | 6   | 4   | ~20   | Smaller surface                       |
| IBM          | 12  | 9   | 6   | ~27   | Watson + Cloud Foundry-style services |

Total: **~136 handlers** across 5 providers.

## Risk register

- **Auth complexity per provider** — Each provider has 2–4 different auth modes (kubeconfig, service principal, RAM keys, instance principal, API tokens, IAM API keys). Treat auth.ts as its own milestone per phase.
- **Long-running operations** — OCI, Alibaba, IBM all use work-request / async-task patterns rather than AWS waiters or Azure's `beginXxxAndWait`. Each phase needs a polling helper.
- **Region handling** — DigitalOcean uses datacenter slugs (nyc3, sfo3, ams3). OCI uses region identifiers (us-ashburn-1). IBM uses MZRs. Alibaba uses region IDs (cn-hangzhou). The deployer init contract needs per-provider region normalization.
- **Live-test cost** — Smoke-deploying a managed Postgres on every provider costs $1–5/hour. The cleanup-orphans pattern (already in `e2e/{aws,azure}-deployment-tests/`) is mandatory for every new provider.
- **SDK package availability** — Some providers ship dozens of small npm packages (Alibaba: 50+, OCI: 80+). Pick the minimum set per handler; don't `pnpm add` everything upfront.

## Done definition

The plan is done when:

1. Every leaf in the per-phase progress tree is 🟢 (handler + extractor + mocked test + schema + live test + docs).
2. `pnpm verify:sdk:all` passes with all 5 new providers' SDK packages installed.
3. The deploy verification log in `progress.md` has at least one row per handler per provider.
4. Feature flags for all 5 providers are flipped `enabled: true` with their categories on.
5. `docs/provider-status.md` matrix shows all 5 as `experimental` minimum.
6. CHANGELOG entry summarizes the new providers.

## What this session produced

- This overview doc
- `inprogress/kubernetes-deployer.md` (Phase E)
- `inprogress/alibaba-deployer.md` (Phase F)
- `inprogress/oci-deployer.md` (Phase G)
- `inprogress/digitalocean-deployer.md` (Phase H)
- `inprogress/ibm-deployer.md` (Phase I)
- Updates to `inprogress/progress.md` with Phase E–I subtrees
- Updates to `inprogress/README.md` referencing the new phases

No implementation code in this session — that comes in subsequent sessions, one phase at a time. A future session opens with the relevant phase doc, executes its step list, ticks the leaves in `progress.md`, commits per-handler.
