# DigitalOcean Deployer — Operator Notes

Routes `digitalocean.<service>.<resource>` types to per-service handlers
under `handlers/`. Single PAT auth; Spaces uses S3-compatible auth.

## Auth

- `DIGITALOCEAN_TOKEN` (Bearer) — required.
- `DIGITALOCEAN_REGION` — default `nyc3`.
- `DO_SPACES_ACCESS_KEY` / `DO_SPACES_SECRET_KEY` — required only when
  Spaces blocks are present.

Or pass `digitalocean_credentials` on DeployOptions.

## Rollout state

| Category   | Handlers                                                                                        | Status     |
| ---------- | ----------------------------------------------------------------------------------------------- | ---------- |
| Compute    | droplet.instance, apps.app, kubernetes.cluster, containerregistry.registry, apps.staticSite     | scaffolded |
| Serverless | functions.namespace, functions.function (doctl-driven deploy step external)                     | partial    |
| Database   | databases.cluster (postgres / mysql / mongodb / redis engines)                                  | scaffolded |
| Storage    | spaces.bucket (S3-compatible), volume.volume, droplet.snapshot                                  | scaffolded |
| Network    | loadbalancer.loadbalancer, vpc.network, domain.record, firewall.firewall, reservedip.reservedip | scaffolded |
| Security   | apps.envvar (App Platform-scoped secrets)                                                       | scaffolded |
| Monitoring | monitoring.alertpolicy                                                                          | scaffolded |

"Scaffolded" = handler + extractor + mocked-SDK dispatch test in
place. **Cardinal rule applies**: `PROVIDER_FLAGS.digitalocean.*`
stays `false` until a real deploy round-trip is observed.

## Quirks

- **dots-wrapper namespaces**: SDK methods are accessed via nested
  namespaces — `client.droplet.createDroplet`,
  `client.database.createDatabaseCluster`, `client.loadBalancer.*`,
  `client.app.*`, `client.kubernetes.*`, `client.containerRegistry.*`,
  `client.reservedIp.*`, `client.dropletAction.*`.
- **Spaces vs S3**: bucket handler reuses `@aws-sdk/client-s3` with
  `endpoint: https://<region>.digitaloceanspaces.com` and the operator's
  Spaces access key + secret. The handler instantiates command classes
  via the same indirect `Function('m', 'return import(m)')` loader.
- **Functions deploy is doctl-driven**: dots-wrapper exposes namespace
  CRUD but not per-function deploy. The function handler records the
  `<namespace>/<name>` mapping; the actual `doctl serverless deploy`
  step is an external follow-up.
- **App Platform spec composition**: `digitalocean.apps.app` takes a
  full app spec (services / databases / static sites / jobs / envs).
  The extractor would assemble it from connected canvas blocks; today
  it accepts a raw spec via `properties.spec` or sets a default web
  service from `github` / `git` connectors.
- **Container Registry is single-per-account**: handler is effectively
  a singleton — repeated creates with the same name are idempotent.
- **Cloud Firewall droplet binding**: rules + droplet IDs ship in one
  call; updates to droplet set are partial.

## Extension contract

Same shape as the other deployers: handler file in `handlers/`,
registry entry in `digitalocean-deployer.ts`, extractor in
`extractors/digitalocean/index.ts`, dispatch row in
`extractors/dispatch.ts`, mocked-SDK dispatch test in
`__tests__/digitalocean-handlers.test.ts`.
