# Alibaba Cloud Deployer — Operator Notes

Routes `alibaba.<service>.<resource>` types to per-service handlers
under `handlers/`. Mirrors the AWS / Azure / GCP / Kubernetes shape:
one file per resource type, registered in `HANDLER_REGISTRY` inside
`alibaba-deployer.ts`.

## Auth

RAM AccessKey ID + AccessKey Secret. Operator-supplied via:

```ts
{ provider: 'alibaba',
  alibaba_credentials: { access_key_id, access_key_secret, region } }
```

…or via env vars consumed by `alibaba-deployer.ts initialize()`:

- `ALIBABA_CLOUD_ACCESS_KEY_ID`
- `ALIBABA_CLOUD_ACCESS_KEY_SECRET`
- `ALIBABA_CLOUD_SECURITY_TOKEN` (optional, STS short-lived sessions)
- `ALIBABA_CLOUD_REGION` (default `cn-hangzhou`)

`auth.ts → validate_alibaba_credentials()` probes STS GetCallerIdentity.

## Rollout state

| Category   | Handlers                                                       | Status     |
| ---------- | -------------------------------------------------------------- | ---------- |
| Compute    | ecs.instance, sae.application, fc.function, eci.containerGroup | scaffolded |
| Scheduler  | eventbridge.rule                                               | scaffolded |
| Network    | vpc.vpc, vpc.vSwitch, ecs.securityGroup, slb.loadBalancer,     |            |
|            | alidns.domainRecord, privatelink.endpoint, apigateway.api      | scaffolded |
| Database   | rds.dbInstance, dds.dbInstance, kvstore.instance               | scaffolded |
| Storage    | oss.bucket                                                     | scaffolded |
| Messaging  | mns.queue, mns.topic, amqp.instance                            | scaffolded |
| Security   | kms.secret, ram.user, cas.certificate, waf.policy              | scaffolded |
| Monitoring | sls.project                                                    | scaffolded |
| Container  | cs.managedCluster, cr.instance, cr.buildTask                   | scaffolded |
| Frontend   | cdn.domain                                                     | scaffolded |
| Analytics  | maxcompute.project, opensearch.app                             | scaffolded |
| AI         | paieas.service, pai.workspace                                  | scaffolded |

"Scaffolded" = handler + extractor + mocked-SDK dispatch test in
place. **Cardinal rule applies**: `PROVIDER_FLAGS.alibaba.*` stays
`false` until a real deploy round-trip is observed on each category.
Then the operator who ran it flips the flag.

## Quirks

- **Endpoint per region**: each `@alicloud/<svc>` package needs the
  right host. `sdk-loader.ts` maps short-name → `<prefix>.<region>.aliyuncs.com`.
- **OSS bucket names are global**: collisions throw `BucketAlreadyExists`;
  the handler currently treats this as benign and reuses the bucket
  by name. To force-create unique, the caller should pre-suffix.
- **RDS provisioning is 5–15 min**: handler returns on accept, not on
  `Running`. The orchestrator polls externally.
- **MNS namespace conflict**: `mns20220119` is the v3 SDK; v2 endpoints
  are still around but deprecated.
- **CR two-tier**: Instance (`alibaba.cr.instance`) is the regional
  registry; per-image repositories are sub-blocks (handler omitted for
  now — they show up as a separate canvas wiring).
- **Skipped community SDKs**: `alibaba.datahub.topic` and
  `alibaba.ots.instance` (Tablestore) have no first-party `@alicloud/*`
  packages — revisit when official SDKs ship.

## Extension contract

To add a new handler:

1. Add the `@alicloud/<svc><ver>` row to `SERVICE_PACKAGES` in
   `sdk-loader.ts` (service short-name + endpoint prefix).
2. Drop a new file in `handlers/<service>.ts` exporting an
   `AlibabaResourceHandler`.
3. Register `{ prefix: 'alibaba.<svc>.<res>', handler }` in
   `alibaba-deployer.ts HANDLER_REGISTRY`.
4. Add a property extractor to `extractors/alibaba/index.ts` + a
   dispatch row in `extractors/dispatch.ts`.
5. Add a dispatch assertion to
   `providers/__tests__/alibaba-handlers.test.ts`.
6. Once a real-cloud deploy round-trip is observed, flip the matching
   `PROVIDER_FLAGS.alibaba.categories.<Category>` to `true`.
