# Deploying to Kubernetes

ICE's Kubernetes provider deploys canvas blocks to any cluster reachable via your kubeconfig — EKS, AKS, GKE, OKE, IKS, DOKS, k3s, kind. The deployer talks to the K8s API directly via `@kubernetes/client-node`; no Helm dependency, no operators required (CRD-backed blocks gate on the operator being installed in your cluster).

## Prerequisites

- A working **kubeconfig** at `~/.kube/config` (or pointed at via `$KUBECONFIG`) with admin or namespace-admin permissions in the target namespace.
- `kubectl` for poking around after a deploy. Not required at deploy time — ICE drives the API directly.

## Connect Kubernetes in ICE

1. Open ICE (`pnpm dev:all`, [http://localhost:5173](http://localhost:5173)).
2. Top-right: **Settings → Providers → Add Kubernetes**.
3. Pick a context from the dropdown (read from your kubeconfig) OR paste an inline kubeconfig YAML.
4. Set the default namespace. ICE auto-creates `ice-deploy` if you leave it blank.

A read-only validation pass runs `kubectl auth can-i list namespaces` (via the typed CoreV1Api) to confirm the credentials reach the cluster.

## Build a canvas, plan, apply

Same flow as [deploying-to-gcp.md](deploying-to-gcp.md) — drag blocks, connect them, click **Deploy**, review the plan, click **Apply**. K8s resources show up as `<Group>/<Kind>/<namespace>/<name>` in the event log.

## What works today

17 service handlers across every CategoryId:

**Compute** — Deployment (Compute.Container, BackendAPI, Worker variants), StatefulSet (Database.{Postgres, MySQL, Redis, MongoDB} and Messaging.{RabbitMQ, EventStream} via image profiles), CronJob, Job, HorizontalPodAutoscaler, Knative Service (CRD — Compute.ServerlessFunction when Knative Serving is installed).

**Networking** — Namespace (Network.VPC analog), Service (Network.LoadBalancer when type=LoadBalancer), Ingress (Network.CustomDomain, default ingress class `nginx`), NetworkPolicy (Network.SecurityGroup).

**Storage** — PersistentVolumeClaim (Storage.Bucket on K8s — uses default StorageClass unless `storage_class` is set).

**Security** — Secret, ServiceAccount, Certificate (CRD — when cert-manager is installed).

**Observability** — PrometheusRule (CRD — when the Prometheus Operator is installed).

**Resilience** — PodDisruptionBudget.

## Kubernetes-specific quirks

The deployer handles several K8s-specific gotchas silently:

- **Default namespace** — `ice-deploy` is auto-created on first deploy if no namespace was set at connect time. Every resource gets `app.kubernetes.io/managed-by: ice` labels for easy `kubectl get all -l app.kubernetes.io/managed-by=ice` cleanup.
- **Idempotent apply** — every handler treats a 409 Conflict on create as benign (resource already exists). Update happens via read-then-replace. Delete tolerates 404 (already gone).
- **StatefulSet profile per Database block** — `Database.PostgreSQL` → `postgres:17-alpine` on port 5432 with `/var/lib/postgresql/data` mounted from a 10Gi PVC template. Same shape for MySQL (`mysql:9`), Redis (`redis:7-alpine`), MongoDB (`mongo:8`), RabbitMQ (`rabbitmq:3.13`), Kafka (`confluentinc/cp-kafka:7`).
- **Ingress** — defaults to `ingressClassName: nginx`. Set `properties.cert_manager_issuer` to a ClusterIssuer name to auto-annotate for cert-manager. TLS-without-cert-manager requires `properties.tls_secret_name` pointing at an existing `kubernetes.io/tls` Secret.
- **HPA** — uses `autoscaling/v2` and targets a Deployment by name (defaults to the block's name; override via `properties.target_deployment`). Default metric is `Resource: cpu @ 70% utilization`.
- **Secret data** — base64-encoded automatically. Operators paste plain strings into `properties.data` (or `properties.string_data` for the SDK's `stringData` field).
- **CRD-backed blocks** require the corresponding operator in the cluster:
  - `Security.Certificate` needs cert-manager (`cert-manager.io/v1`).
  - `Compute.ServerlessFunction` (Knative Service variant) needs Knative Serving (`serving.knative.dev/v1`).
  - `Monitoring.Alert` (PrometheusRule) needs the Prometheus Operator (`monitoring.coreos.com/v1`).

The handler surfaces a clear error if the CRD isn't installed.

## Known gaps vs. cloud providers

- No managed-services analogs — every Database / Messaging block runs as a StatefulSet in your cluster. For production-grade reliability use the cloud providers' managed offerings (RDS / Azure Postgres Flex / Cloud SQL).
- LoadBalancer Services need a cloud-provider integration in the cluster to get an external IP (k3s and kind clusters require MetalLB or similar; managed K8s services provision them automatically).
- No importer (`Import → From Kubernetes`) yet.

If you hit a gap that matters to you, file a feature request — Kubernetes parity tracks on the [ROADMAP](../ROADMAP.md).

## See also

- [`packages/core/src/deploy/providers/kubernetes/README.md`](../packages/core/src/deploy/providers/kubernetes/README.md) — operator notes covering every K8s quirk and the rollout-state table.
- [`packages/core/src/deploy/providers/kubernetes/handlers/`](../packages/core/src/deploy/providers/kubernetes/handlers/) — per-resource handler source.
- [`docs/deploying-to-gcp.md`](deploying-to-gcp.md) — the canonical end-to-end tutorial; the K8s flow mirrors it.
