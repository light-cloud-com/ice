# OCI Deployer — Operator Notes

Routes `oci.<service>.<resource>` types to per-service handlers under
`handlers/`. Mirrors the AWS / Azure / GCP / Kubernetes / Alibaba
shape: one file per resource type, registered in `HANDLER_REGISTRY`
inside `oci-deployer.ts`.

## Auth

4 auth modes — `OCI_AUTH_MODE` env var selects:

- `config-file` (default): reads `~/.oci/config`. Operator can override
  with `OCI_CONFIG_FILE` (path) + `OCI_CONFIG_PROFILE` (profile name).
- `instance-principal`: when running on an OCI VM with the right
  dynamic group + policy.
- `resource-principal`: when running inside an OCI Function or
  Container Instance with `OCI_RESOURCE_PRINCIPAL_VERSION` env vars set.
- `session-token`: short-lived session from `oci session authenticate`.

Required env vars / DeployOptions fields:

- `OCI_COMPARTMENT_ID` (or `oci_credentials.compartment_id`) — every
  resource lives in a compartment OCID.
- `OCI_REGION` (or `oci_credentials.region`) — default `us-ashburn-1`.

`auth.ts → validate_oci_credentials()` probes `listAvailabilityDomains`.

## Rollout state

| Category   | Handlers                                                                                                   | Status     |
| ---------- | ---------------------------------------------------------------------------------------------------------- | ---------- |
| Compute    | core.instance, containerinstance.instance, functions.function, resourcescheduler.schedule                  | scaffolded |
| Network    | core.vcn, core.subnet, core.networksecuritygroup, loadbalancer.loadbalancer, dns.zone, apigateway.gateway, |            |
|            | core.privateaccessgateway                                                                                  | scaffolded |
| Database   | psql.dbsystem, mysql.dbsystem, database.autonomousdatabase, nosql.table, redis.cluster                     | scaffolded |
| Storage    | objectstorage.bucket                                                                                       | scaffolded |
| Security   | vault.secret, identitydomains.user, certificates.certificate, waf.policy                                   | scaffolded |
| Monitoring | logging.loggroup, monitoring.alarm                                                                         | scaffolded |
| Container  | containerengine.cluster, artifacts.repository                                                              | scaffolded |
| Messaging  | queue.queue, streaming.stream, ons.topic                                                                   | scaffolded |
| Analytics  | analytics.instance                                                                                         | scaffolded |
| AI         | generativeai.endpoint, datascience.modeldeployment                                                         | scaffolded |

"Scaffolded" = handler + extractor + mocked-SDK dispatch test in
place. **Cardinal rule applies**: `PROVIDER_FLAGS.oci.*` stays
`false` until a real deploy round-trip is observed on each category.

## Quirks

- **Work requests**: every async OCI create returns
  `opc-work-request-id`. The handler returns the WR ID as
  `provider_id` for async creates (loadbalancer, apigateway, etc.); the
  orchestrator polls externally via `sdk-loader.ts: poll_work_request`.
- **Compartment OCIDs**: `ctx.compartment_id` is the default; per-block
  override via `properties.compartment_id` (not yet wired).
- **Object Storage namespace**: tenancy-scoped. Resolved by the
  handler on first use via `getNamespace()` and cached in
  `ctx.objectstorage_namespace`.
- **Autonomous DB password validation**: 12–30 chars, must include
  upper / lower / digit / `#` or `_`, no admin/user keywords. Handler
  surfaces a clear error if missing.
- **Identity Domains endpoint**: each domain has its own host. The
  current loader uses the profile region — multi-domain setups need a
  per-domain endpoint override (TODO).
- **PSQL credentials**: passwordType `PLAIN_TEXT` for now; Vault-backed
  passwords (`OCID_VAULT_SECRET`) are a future enhancement.

## Extension contract

To add a new handler:

1. Add `<service-shortname>: { pkg: 'oci-<svc>', clientName: '<Client>' }`
   to `SERVICE_PACKAGES` in `sdk-loader.ts`.
2. Drop a new file in `handlers/<service>.ts` exporting an
   `OCIResourceHandler`.
3. Register `{ prefix: 'oci.<svc>.<res>', handler }` in
   `oci-deployer.ts HANDLER_REGISTRY`.
4. Add a property extractor to `extractors/oci/index.ts` + a dispatch
   row in `extractors/dispatch.ts`.
5. Add a dispatch assertion to
   `providers/__tests__/oci-handlers.test.ts`.
6. Once a real-cloud deploy round-trip is observed, flip the matching
   `PROVIDER_FLAGS.oci.categories.<Category>` to `true`.
