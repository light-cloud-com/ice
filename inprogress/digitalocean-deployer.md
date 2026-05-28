# Phase H — DigitalOcean Deployer

## Goal

Ship a DigitalOcean deployer covering DO's compute / managed-DB / storage / network / Kubernetes / serverless surface. DO's API is small relative to AWS / Azure / GCP — implementation is faster.

## Provider primer

- **Auth**: single Personal Access Token. `Authorization: Bearer <token>`. Spaces (object storage) uses a separate Spaces access key + secret (S3-compatible).
- **Regions**: datacenter slugs — `nyc1`, `nyc3`, `sfo3`, `ams3`, `lon1`, `fra1`, `sgp1`, `tor1`, `blr1`, `syd1`.
- **SDK**: `dots-wrapper` (community) — most popular, typed, single-package wrapper over the v2 REST API. Recommended by operator decision.
- **Long-running ops**: DO returns Action objects for async work. Poll `actions.getAction(id)` until `status` is `completed`.

## Block coverage matrix (20 handlers)

### P0 — must-have (10)

| Block iceType                      | DO service                                   | Handler                                                                |
| ---------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------- |
| `Compute.BackendAPI` / `Container` | Droplet (or App Platform)                    | `digitalocean.droplet.instance` or `digitalocean.apps.app`             |
| `Compute.ServerlessFunction`       | DO Functions                                 | `digitalocean.functions.namespace` + `digitalocean.functions.function` |
| `Compute.Container` (managed)      | App Platform service                         | `digitalocean.apps.app`                                                |
| `Database.PostgreSQL`              | Managed Postgres                             | `digitalocean.databases.cluster` (postgres engine)                     |
| `Database.MySQL`                   | Managed MySQL                                | `digitalocean.databases.cluster` (mysql engine)                        |
| `Database.MongoDB`                 | Managed MongoDB                              | `digitalocean.databases.cluster` (mongodb engine)                      |
| `Database.Redis` / `Cache`         | Managed Redis                                | `digitalocean.databases.cluster` (redis engine)                        |
| `Storage.Bucket`                   | Spaces (S3-compatible)                       | `digitalocean.spaces.bucket`                                           |
| `Network.LoadBalancer`             | Load Balancer                                | `digitalocean.loadbalancer.loadbalancer`                               |
| `Security.Secret`                  | App Platform env-secret OR Project Resources | `digitalocean.apps.envvar`                                             |

### P1 — important (6)

| Block                            | DO service               | Handler                                    |
| -------------------------------- | ------------------------ | ------------------------------------------ |
| `Network.VPC`                    | VPC                      | `digitalocean.vpc.network`                 |
| `Network.CustomDomain`           | Domains + DNS records    | `digitalocean.domain.record`               |
| `Network.SecurityGroup`          | Cloud Firewall           | `digitalocean.firewall.firewall`           |
| `Compute.Kubernetes`             | DOKS                     | `digitalocean.kubernetes.cluster`          |
| `Compute.ContainerRegistry`      | DOCR                     | `digitalocean.container_registry.registry` |
| `Compute.SSRSite` / `StaticSite` | App Platform static site | `digitalocean.apps.app` (static variant)   |

### P2 — long tail (4)

| Block                  | DO service              | Handler                               |
| ---------------------- | ----------------------- | ------------------------------------- |
| `Storage.BlockStorage` | Volume                  | `digitalocean.volume.volume`          |
| `Compute.Snapshot`     | Snapshot                | `digitalocean.droplet.snapshot`       |
| `Monitoring.Alert`     | Monitoring Alert Policy | `digitalocean.monitoring.alertpolicy` |
| `Network.FloatingIP`   | Reserved IP             | `digitalocean.reservedip.reservedip`  |

## SDK packages

```json
"dots-wrapper": "^3.13.0"
```

For Spaces (S3-compatible object storage), reuse `@aws-sdk/client-s3` with the DO Spaces endpoint (`<region>.digitaloceanspaces.com`).

## Scaffolding (H1)

```
packages/core/src/deploy/providers/digitalocean/
├── digitalocean-deployer.ts
├── types.ts                        # DOHandlerContext with access_token + region
├── sdk-loader.ts                   # createApiClient from dots-wrapper
├── auth.ts                         # validate_pat, list_account
├── action-poll.ts                  # poll Action until completed
├── _result.ts
├── handlers/
│   ├── droplet.ts
│   ├── app-platform.ts
│   ├── databases.ts
│   ├── spaces.ts
│   ├── loadbalancer.ts
│   ├── vpc.ts
│   ├── domain.ts
│   ├── firewall.ts
│   ├── kubernetes.ts
│   ├── container-registry.ts
│   ├── functions.ts
│   ├── volume.ts
│   ├── snapshot.ts
│   ├── monitoring.ts
│   └── reserved-ip.ts
└── README.md
```

Dispatch: `digitalocean.<service>.<resource>`.

## Quirks (H4)

- **Region/size**: every Droplet / DB / App needs a `region` slug + `size` slug. Defaults: `nyc3` + `s-1vcpu-1gb` (Droplet) / `db-s-1vcpu-1gb` (DB) / `basic-xxs` (App).
- **App Platform `spec`**: `digitalocean.apps.app` takes a full app spec — services, databases, static-sites, jobs, envs are all sub-blocks inside one App. The extractor projects them from connected canvas blocks.
- **Spaces vs S3**: Spaces uses S3-compatible signing. The bucket handler instantiates `@aws-sdk/client-s3` with `forcePathStyle: false` and `endpoint: https://<region>.digitaloceanspaces.com`.
- **Database engine + version**: postgres 15+ / mysql 8+ / mongodb 7+ / redis 7+. Defaults to latest stable per engine.
- **DO Functions namespace**: a Functions namespace must exist before functions can deploy. Auto-bootstrap (`ice-default-fns`) on first deploy.
- **Reserved IP regional locking**: Reserved IPs are tied to a region for the life of the IP. Region from properties or ctx.

## Auth (H5)

`validate_pat(token): Promise<boolean>` — runs `account.getAccount()` via dots-wrapper. Surface `Account.email` so the settings UI can confirm "logged in as <email>".

## SDK verification (H9)

dots-wrapper ships TypeScript types for every API. Request shapes live at `node_modules/dots-wrapper/dist/modules/<service>/types.d.ts`:

```ts
export interface ICreateDropletApiRequest {
  name: string;
  region: string;
  size: string;
  image: string | number;
  ...
}
```

The verifier extension:

- Resolve `dots-wrapper/dist/modules/<service>/types.d.ts`.
- Match handler call `client.<service>.createDroplet({...})` → find `interface ICreateDropletApiRequest` → extract properties.

For S3-via-Spaces calls, reuse the existing AWS resolver (`@aws-sdk/client-s3` resolves the request types).

## Estimated effort

P0 (10): ~6 hours + 3 hours testing + 1 hour docs.
P1 (6): ~4 hours + 2 hours testing.
P2 (4): ~3 hours + 1 hour testing.
Foundation + auth + sdk-loader: ~2 hours.
Live-test foundation: ~2 hours.
SDK verification extension: ~1 hour.

**Total: ~25 hours**. Realistic across 4–5 sessions.
