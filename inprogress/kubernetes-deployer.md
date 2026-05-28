# Phase E — Kubernetes Deployer

## Goal

Ship a Kubernetes deployer using `@kubernetes/client-node` against any K8s API server (EKS/AKS/GKE/OKE/IKS/DOKS/k3s/kind). The canvas block iceTypes map to standard K8s primitives — no provider-specific extensions, no Helm dependency, no operators required beyond optional cert-manager / external-dns for cross-cloud parity.

## Provider primer

K8s is not a cloud provider — it's an orchestrator. The deployer applies/patches K8s resources in a target namespace. Differences from AWS/Azure/GCP:

- **No managed services**. A Postgres "block" becomes a StatefulSet running the official `postgres:17` image with a PVC backing.
- **Single auth surface**: kubeconfig (typed as `KubeConfig` in `@kubernetes/client-node`). Supports cluster-CA-bundle + bearer-token or client-cert auth flavors.
- **No region/project**. Operator-supplied `cluster_name` + `namespace` are the context.
- **CRUD is `kubectl apply`-style**: client.read first, replace or patch; create on 404. Idempotent by design.
- **Long-running ops** are tracked by polling resource `.status` (Deployment availableReplicas, StatefulSet readyReplicas, PVC phase, etc.).

## Block coverage matrix (25 handlers)

### P0 — must-have (12)

| Block iceType                       | K8s resource                                                                 | Handler                                                               |
| ----------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `Compute.Container` / `BackendAPI`  | Deployment + Service (ClusterIP) + optional Ingress                          | `k8s.apps.deployment` + `k8s.core.service` + `k8s.networking.ingress` |
| `Compute.Worker`                    | Deployment (no Service)                                                      | `k8s.apps.deployment` (worker variant via extractor)                  |
| `Compute.ServerlessFunction`        | Knative `Service` if cluster has Knative installed; else Deployment with HPA | `k8s.serving.service` (Knative)                                       |
| `Compute.CronJob`                   | CronJob                                                                      | `k8s.batch.cronjob`                                                   |
| `Database.PostgreSQL`               | StatefulSet `postgres:17` + Service + PVC                                    | `k8s.apps.statefulset` (postgres profile via extractor)               |
| `Database.MySQL`                    | StatefulSet `mysql:9` + Service + PVC                                        | `k8s.apps.statefulset` (mysql profile)                                |
| `Database.Redis` / `Database.Cache` | StatefulSet `redis:7` + Service                                              | `k8s.apps.statefulset` (redis profile)                                |
| `Database.MongoDB`                  | StatefulSet `mongo:8` + Service + PVC                                        | `k8s.apps.statefulset` (mongo profile)                                |
| `Storage.Bucket`                    | PersistentVolumeClaim                                                        | `k8s.core.persistentvolumeclaim`                                      |
| `Network.LoadBalancer`              | Service type=LoadBalancer                                                    | `k8s.core.service` (loadbalancer variant)                             |
| `Network.CustomDomain`              | Ingress (+ TLS via cert-manager Certificate)                                 | `k8s.networking.ingress`                                              |
| `Security.Secret`                   | Secret                                                                       | `k8s.core.secret`                                                     |

### P1 — important (8)

| Block iceType               | K8s resource                                                | Handler                                   |
| --------------------------- | ----------------------------------------------------------- | ----------------------------------------- |
| `Network.VPC`               | Namespace (logical isolation)                               | `k8s.core.namespace`                      |
| `Network.SecurityGroup`     | NetworkPolicy                                               | `k8s.networking.networkpolicy`            |
| `Compute.Kubernetes`        | (no-op — already K8s)                                       | n/a                                       |
| `Compute.ContainerRegistry` | ImageStream (OpenShift) / Harbor proxy (out of scope today) | `k8s.image.stream` — design-only          |
| `Security.Certificate`      | cert-manager `Certificate` CRD                              | `k8s.cert-manager.certificate`            |
| `Monitoring.Log`            | (no-op — `kubectl logs` is the path)                        | n/a                                       |
| `Monitoring.Alert`          | PrometheusRule CRD (when Prometheus is installed)           | `k8s.monitoring.prometheusrule`           |
| `Messaging.Queue`           | StatefulSet `rabbitmq:3.13` + Service                       | `k8s.apps.statefulset` (rabbitmq profile) |

### P2 — long tail (5)

| Block iceType              | K8s resource                                     | Handler                                     |
| -------------------------- | ------------------------------------------------ | ------------------------------------------- |
| `Messaging.EventStream`    | StatefulSet `confluentinc/cp-kafka:7` + Service  | `k8s.apps.statefulset` (kafka profile)      |
| `Compute.HPA` (autoscaler) | HorizontalPodAutoscaler                          | `k8s.autoscaling.hpa`                       |
| `Security.Identity`        | ServiceAccount + RoleBinding                     | `k8s.core.serviceaccount`                   |
| `Config.ConfigMap`         | ConfigMap                                        | `k8s.core.configmap`                        |
| `AI.ModelServing`          | Knative Service with KServe (out of scope today) | `k8s.kserve.inferenceservice` — design-only |

## SDK packages to install

```json
"@kubernetes/client-node": "^1.0.0"
```

That's it. The library covers every K8s API group via typed `<Group><Version>Api` classes (e.g., `CoreV1Api`, `AppsV1Api`, `BatchV1Api`, `NetworkingV1Api`, `AutoscalingV2Api`). Cert-manager + Knative + Prometheus CRDs are accessed via `CustomObjectsApi` (no extra package).

## Scaffolding (E1)

```
packages/core/src/deploy/providers/kubernetes/
├── kubernetes-deployer.ts          # ProviderDeployer impl + HANDLER_REGISTRY
├── types.ts                        # KubernetesHandlerContext + KubernetesResourceHandler
├── sdk-loader.ts                   # KubeConfig + per-API-class lazy loader
├── auth.ts                         # validate_kubeconfig, list_contexts
├── namespace.ts                    # ensure_namespace helper
├── _result.ts                      # ok/err/sdkMissing helpers (mirror AWS/Azure)
├── handlers/
│   ├── deployment.ts
│   ├── service.ts
│   ├── ingress.ts
│   ├── statefulset.ts
│   ├── cronjob.ts
│   ├── job.ts
│   ├── secret.ts
│   ├── configmap.ts
│   ├── namespace.ts
│   ├── networkpolicy.ts
│   ├── persistentvolumeclaim.ts
│   ├── serviceaccount.ts
│   ├── hpa.ts
│   ├── knative-service.ts          # via CustomObjectsApi
│   ├── cert-manager-certificate.ts # via CustomObjectsApi
│   └── prometheus-rule.ts          # via CustomObjectsApi
└── README.md                       # rollout-state + quirks
```

Dispatch regex: types follow `k8s.<group>.<kind>` shape (e.g., `k8s.apps.deployment`, `k8s.networking.ingress`). The existing regex `/^(gcp|aws|azure)\.[a-z0-9]+\.[a-zA-Z]+$/` needs `k8s` added.

## Quirks (E4)

- **kubeconfig source**: prefer in-cluster (`loadFromCluster`) when `KUBERNETES_SERVICE_HOST` is set; else `loadFromDefault` (~/.kube/config). Operator can override via `properties.kubeconfig_path` or inline `properties.kubeconfig`.
- **Default namespace**: `ice-deploy` if not specified. Auto-create on first deploy.
- **StatefulSet image profiles** for DB blocks: `postgres:17-alpine`, `mysql:9.0`, `redis:7-alpine`, `mongo:8`. PVC size defaults: 10Gi. The extractor projects these.
- **LoadBalancer external IP**: cloud-controlled (depends on which K8s the cluster runs on). Live tests poll for `service.status.loadBalancer.ingress[0].ip` with a 5-min timeout.
- **PVC StorageClass**: default storage class is used unless `properties.storage_class` is set.
- **Ingress class**: defaults to `nginx`; operator override via `properties.ingress_class`.
- **TLS**: when `properties.tls_enabled === true` AND cert-manager is installed, the handler creates a `Certificate` CRD alongside the Ingress with `cert-manager.io/cluster-issuer` annotation. Otherwise plain HTTP.
- **Apply semantics**: read-then-replace for typed APIs (Deployment, Service); strategic-merge patch for ConfigMap/Secret data; create-or-replace for namespaces. CRDs use server-side apply where supported.
- **Owner references**: every resource the deployer creates carries `metadata.ownerReferences` pointing at a synthetic ICE deploy object (a ConfigMap in the target namespace) so `kubectl delete -l ice.deploy/canvas=<id>` cleans up an entire canvas.

## Auth (E5)

`validate_kubeconfig(kubeconfig?: string): Promise<boolean>` — sets context and runs `coreV1Api.listNamespace({ limit: 1 })` as the connectivity probe. Returns false on auth/connectivity failure.

`list_contexts(): string[]` — reads the local kubeconfig and returns context names so the settings UI can offer a picker.

## Feature flags (E6)

Already present as `kubernetes` with all categories off. Flip per category as the handler set's deploy gates tick green.

## Docs (E7)

- `docs/deploying-to-kubernetes.md` — new file. Cover: prerequisites (kubectl + a cluster), connect ICE → choose context → deploy a Postgres + Backend API → kubectl get all.
- `packages/core/src/deploy/providers/kubernetes/README.md` — rollout-state table + quirks (above) + CRD-dependency notes.
- `docs/provider-status.md` — Kubernetes row updated when first category flips.

## Live-test foundation (E8)

- Extend `_live-helpers.ts` with `kubernetesLive`, `uniqueK8sName`, `createKubernetesDeployer`. Live tests need `KUBECONFIG` (or `KUBECTL_CONTEXT`) env var and a writable namespace.
- New `e2e/kubernetes-deployment-tests/{README.md,runs/.gitkeep,cleanup-orphans.ts}` mirroring the AWS/Azure layout.
- `pnpm test:live:kubernetes <service>` script in package.json.

## SDK verification (E9)

`scripts/verify-sdk-commands.mjs` needs a Kubernetes resolver:

- Each handler call is `await api.create<Kind>(<args>)` or `await api.replaceNamespaced<Kind>(name, ns, body)`.
- The body type is `V1<Kind>` (e.g., `V1Deployment`, `V1Service`, `V1Ingress`).
- Resolve from `node_modules/@kubernetes/client-node/dist/gen/model/v1<Kind>.d.ts` (case-sensitive lookup, e.g., `v1Deployment.d.ts`).
- Extract `class V1<Kind>` properties (including nested `spec: V1<Kind>Spec` — recursive resolution).

## Per-handler task checklist

For each handler in the matrix above:

- [ ] Handler file with create / update / delete
- [ ] Extractor function + dispatch.ts entry
- [ ] HANDLER_REGISTRY entry in `kubernetes-deployer.ts`
- [ ] Mocked-SDK test (uses `_kubernetes-test-harness.ts`)
- [ ] Live test under `__tests__/live/k8s-<kind>.live.test.ts`
- [ ] Schema entry in `ice-schemas.db` for the corresponding iceType
- [ ] Rollout-state row update in `providers/kubernetes/README.md`
- [ ] Deploy verification log entry (cardinal rule)

## Estimated effort

P0 (12 handlers): ~8 hours implementation + ~4 hours testing + ~2 hours docs.
P1 (8 handlers): ~5 hours + ~2 hours testing + ~1 hour docs.
P2 (5 handlers): ~3 hours + ~1 hour testing.
Foundation + auth + scaffolding: ~3 hours.
Live-test foundation + cleanup-orphans: ~2 hours.
SDK verification extension: ~1 hour.

**Total: ~30 hours**. Realistic across 4–5 focused sessions.
