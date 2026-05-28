# Kubernetes Deployer — Operator Notes

This file documents the Kubernetes-specific quirks the deployer handles silently, the assumptions it bakes in, and the deferred work future commits should pick up. Read this before changing any handler or adding a new K8s resource type.

## Rollout state

K8s is feature-flagged at the category level in `packages/constants/src/feature-flags.ts` (`PROVIDER_FLAGS.kubernetes`). All 14 categories are wired through dispatch but flip on per-category only after the category's full handler set has its real-cluster deploy gate ticked. Per the cardinal rule, the `enabled` flag stays `false` until that sweep completes.

| Category   | Handler set                                             | State                           |
| ---------- | ------------------------------------------------------- | ------------------------------- |
| Compute    | Deployment, StatefulSet, CronJob, Job, HPA, Knative     | code shipped, deploy gates open |
| Scheduler  | CronJob (`schedule_expression` branch)                  | code shipped                    |
| Frontend   | Ingress (Network.CustomDomain — covers most static)     | code shipped                    |
| Network    | Namespace, Service, NetworkPolicy, Ingress              | code shipped                    |
| Database   | StatefulSet (Postgres / MySQL / Redis / Mongo profiles) | code shipped                    |
| Cache      | StatefulSet (redis profile)                             | code shipped                    |
| Messaging  | StatefulSet (rabbitmq / kafka profiles)                 | code shipped                    |
| Storage    | PersistentVolumeClaim                                   | code shipped                    |
| Security   | Secret, ServiceAccount, cert-manager Certificate (CRD)  | code shipped                    |
| AI         | (no first-party K8s analog; KServe CRD planned)         | deferred                        |
| Analytics  | (no first-party K8s analog)                             | deferred                        |
| Monitoring | PrometheusRule (CRD)                                    | code shipped                    |
| Source     | (no first-party K8s analog; Argo Workflows planned)     | deferred                        |
| Config     | ConfigMap                                               | code shipped                    |

## Architecture

Mirrors the AWS / Azure / GCP layout:

- `kubernetes-deployer.ts` — `ProviderDeployer` implementation; dispatches via a `HANDLER_REGISTRY` of `{ prefix, handler }` entries. Type prefix `k8s.<api-group>.<kind>` (e.g., `k8s.apps.deployment`).
- `handlers/<kind>.ts` — per-resource handlers, each implementing `create / update / delete`.
- `sdk-loader.ts` — lazy-loads `@kubernetes/client-node` via `Function('m', 'return import(m)')` indirection. Instantiates `CoreV1Api`, `AppsV1Api`, `BatchV1Api`, `NetworkingV1Api`, `AutoscalingV2Api`, `RbacAuthorizationV1Api`, `PolicyV1Api`, and `CustomObjectsApi` (for CRDs).
- `auth.ts` — `validate_kubeconfig` connectivity probe + `list_contexts` picker.
- `namespace.ts` — `ensure_namespace` bootstrap helper (creates `ice-deploy` on first deploy).
- `handlers/_result.ts` — `ok` / `err` / `sdkMissing` builders + `isK8sNotFound` (treat 404 on delete as success).
- `handlers/_crd.ts` — generic CRD helper wrapping `CustomObjectsApi` — every CRD-backed handler reuses `createCrd` / `replaceCrd` / `deleteCrd` / `parseCrdProviderId`.

## Quirks the deployer hides

### Kubeconfig source precedence

1. Inline YAML via `DeployOptions.kubeconfig_raw`
2. Path via `DeployOptions.kubeconfig_path`
3. In-cluster service account when `KUBERNETES_SERVICE_HOST` is set
4. `$KUBECONFIG` env var
5. `~/.kube/config` default

Settings UI lets the operator pick a context from the list returned by `list_contexts`.

### Default namespace bootstrap

If no namespace was specified at connect time, the deployer falls back to `ice-deploy` and auto-creates it on first deploy. Every resource gets `app.kubernetes.io/managed-by: ice` so `kubectl get all -l app.kubernetes.io/managed-by=ice -A` lists everything ICE created.

### Idempotent apply semantics

Every handler treats `409 Conflict` on create as benign — the resource already exists. Update is read-then-replace (Deployment / Service / Ingress) or replace-with-builder-output (CronJob / NetworkPolicy / Job). Delete tolerates `404 Not Found` via `isK8sNotFound(error)` and reports success ("the goal was to make it gone, and it's gone").

### StatefulSet DB profiles

The extractor (`extractors/kubernetes/index.ts`) inspects the canvas iceType and picks image + port + mount-path:

| iceType                             | image                     | port  | mount                      |
| ----------------------------------- | ------------------------- | ----- | -------------------------- |
| `Database.PostgreSQL`               | `postgres:17-alpine`      | 5432  | `/var/lib/postgresql/data` |
| `Database.MySQL`                    | `mysql:9`                 | 3306  | `/var/lib/mysql`           |
| `Database.Redis` / `Database.Cache` | `redis:7-alpine`          | 6379  | `/data`                    |
| `Database.MongoDB`                  | `mongo:8`                 | 27017 | `/data/db`                 |
| `Messaging.RabbitMQ`                | `rabbitmq:3.13`           | 5672  | `/var/lib/rabbitmq`        |
| `Messaging.EventStream`             | `confluentinc/cp-kafka:7` | 9092  | `/var/lib/kafka`           |

Operators override via explicit `properties.image` / `properties.port` / `properties.data_path`. PVC template defaults to 10Gi; `properties.storage_class` overrides the cluster default.

### Ingress class + TLS

`Ingress.spec.ingressClassName` defaults to `nginx`. Override via `properties.ingress_class`. TLS modes:

- **cert-manager** — set `properties.cert_manager_issuer` to a ClusterIssuer name; the handler adds `cert-manager.io/cluster-issuer: <name>` annotation and includes the host in `spec.tls`. A sibling `k8s.certmanager.certificate` block manages the cert lifecycle.
- **Bring-your-own TLS Secret** — set `properties.tls_secret_name` to an existing Secret of type `kubernetes.io/tls`.
- **Plain HTTP** — leave both unset.

### Secret encoding

`properties.data` gets base64-encoded automatically. `properties.string_data` is passed through as the SDK's `stringData` field (Kubernetes encodes server-side). The deployer never invents secret material — operators paste values from a password manager or wire a Security.Secret block to an external source.

### HPA target

`autoscaling/v2` HorizontalPodAutoscaler. Default `scaleTargetRef.kind: Deployment` + `name: <hpa-name>`. Override via `properties.target_deployment`. Default metric is `Resource: cpu @ 70% averageUtilization`.

### CRD-backed handlers

The handler surfaces a clear error if the CRD isn't installed. Required operators per handler:

- `k8s.certmanager.certificate` → [cert-manager](https://cert-manager.io/) (`cert-manager.io/v1/Certificate`)
- `k8s.serving.service` → [Knative Serving](https://knative.dev/docs/serving/) (`serving.knative.dev/v1/Service`)
- `k8s.monitoring.prometheusrule` → [Prometheus Operator](https://prometheus-operator.dev/) (`monitoring.coreos.com/v1/PrometheusRule`)

## Extension contract

Adding a new Kubernetes resource type:

1. Add the handler at `handlers/<kind>.ts`. Use `_result.ts` helpers (`ok`, `err`, `sdkMissing`) so error messages stay consistent.
2. Register the SDK client in `sdk-loader.ts` if a new typed API class is needed.
3. Add a `{ prefix, handler }` entry to `HANDLER_REGISTRY` in `kubernetes-deployer.ts`.
4. Add an extractor function in `extractors/kubernetes/index.ts`.
5. Register the extractor in `extractors/dispatch.ts` — `PROPERTY_EXTRACTORS['k8s.<group>.<kind>']`.
6. Add a mocked-SDK test row in `packages/core/src/deploy/providers/__tests__/k8s-handlers.test.ts`.
7. Add a live test under `packages/core/src/deploy/providers/__tests__/live/k8s-<kind>.live.test.ts` so the developer can run `pnpm test:live:kubernetes <kind>` against their own cluster. Tick the deploy-gate row in `inprogress/progress.md` once the round-trip succeeds.

For CRD-backed handlers, use `handlers/_crd.ts` (`createCrd` / `replaceCrd` / `deleteCrd` / `parseCrdProviderId`) so the per-CRD handler stays tiny.

## Cardinal rule

A handler is only "done" once a successful real-cluster deploy round-trip is observed against a developer's own Kubernetes cluster. Mocked-SDK tests are necessary but not sufficient. Live tests live under `packages/core/src/deploy/providers/__tests__/live/` and are excluded from the default `pnpm test` run — use `pnpm test:live:kubernetes <kind>` with a working `KUBECONFIG` in the environment to verify.
