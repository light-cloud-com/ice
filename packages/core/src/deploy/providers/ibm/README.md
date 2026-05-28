# IBM Cloud Deployer — Operator Notes

Routes `ibm.<service>.<resource>` types to per-service handlers.
Resource-group + MZR region scoped. Most managed services land via
Resource Controller; a single factory in
`handlers/resource-instance.ts` backs the long tail.

## Auth

- `IBMCLOUD_API_KEY` — required (IAM API key).
- `IBMCLOUD_REGION` — default `us-south`.
- `IBMCLOUD_RESOURCE_GROUP_ID` — required for resources that live in a
  resource group (most managed services).
- `IBMCLOUD_ACCOUNT_ID` — optional; needed for COS bucket creation
  against a specific service instance.

Or pass `ibm_credentials` on DeployOptions.

`auth.ts` (planned) probes `IamIdentityV1.getApiKey()`.

## Rollout state

| Category   | Handlers                                                                            | Status     |
| ---------- | ----------------------------------------------------------------------------------- | ---------- |
| Compute    | codeengine.application, codeengine.function, codeengine.job, vpc.instance           | scaffolded |
| Database   | databases.postgresql, databases.mysql, databases.mongodb, databases.redis (factory) | scaffolded |
| Storage    | cos.bucket (S3-compatible)                                                          | scaffolded |
| Network    | vpc.vpc, vpc.subnet, vpc.securitygroup, vpc.loadbalancer, cis.zone, cis.wafrule     | scaffolded |
| Security   | secretsmanager.secret, secretsmanager.importedcert, appid.instance                  | scaffolded |
| Container  | containers.cluster, containerregistry.namespace                                     | scaffolded |
| Monitoring | logging.instance, monitoring.alert                                                  | scaffolded |
| Messaging  | cloudant.database, eventstreams.topic, mq.queuemanager, eventnotifications.instance | scaffolded |
| AI         | watsonx.deployment                                                                  | scaffolded |

"Scaffolded" = handler + extractor + mocked-SDK dispatch test in
place. **Cardinal rule applies**: `PROVIDER_FLAGS.ibm.*` stays
`false` until a real deploy round-trip is observed.

## Quirks

- **Resource Controller pattern**: most managed IBM services
  (Databases for X, CIS, IKS, Container Registry, App ID, Activity
  Tracker, Event Streams, Event Notifications, MQ on Cloud, Cloudant,
  watsonx.ai, Sysdig) land via the Resource Controller. A single
  factory in `handlers/resource-instance.ts` covers all of them —
  each handler binds a fixed `service_name` + `plan_id` from the IBM
  catalog and forwards through `createResourceInstance`. Post-create
  service-specific config (e.g. CIS zone records, IKS worker pools,
  Cloudant databases) is operator-driven and out of scope for the
  handler.
- **Databases for X password / version**: defaults come from each
  engine's catalog — Postgres 16, MySQL 8, MongoDB 7, Redis 7.
  Memory + disk default to 1024 / 5120 MB; per-block overrides are
  surfaced via `properties.memory_mb` / `properties.disk_mb`.
- **COS bucket**: requires a parent COS Service Instance (its CRN
  comes through `properties.cos_instance_crn`). The handler uses
  `ibm-cos-sdk` (S3-compatible) against the regional endpoint
  `s3.<region>.cloud-object-storage.appdomain.cloud`.
- **VPC instance prerequisites**: requires `vpc_id`, `subnet_id`,
  `image_id`. Default profile `bx2-2x8`; ssh keys flow from
  `properties.ssh_key_ids`.
- **CIS plan IDs**: zone uses `free`; WAF rule uses `standard`. Real
  plan IDs vary by IBM catalog; operators with paid plans should
  override via `properties.plan_id`.
- **Code Engine project pre-req**: applications / functions / jobs
  require a parent project. Canvas wiring is expected to provide
  `properties.project_id`; no auto-creation today.

## Extension contract

For a new managed-service block, the fastest path is to add a row to
`handlers/resource-instance.ts` (one line — `service_name` +
`plan_id`) and a dispatch entry. For services with custom CRUD
(VPC, Code Engine, COS, Secrets Manager), drop a new file in
`handlers/` and register it in `ibm-deployer.ts` HANDLER_REGISTRY.

Same shape as the other deployers: handler file in `handlers/`,
registry entry, extractor in `extractors/ibm/index.ts`, dispatch row
in `extractors/dispatch.ts`, mocked-SDK dispatch test in
`__tests__/ibm-handlers.test.ts`.
