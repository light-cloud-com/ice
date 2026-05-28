# Kubernetes deployment tests — developer notes

These are real-cluster tests. They live outside CI and run on the developer's own cluster. Run them once per handler before flipping a category in `PROVIDER_FLAGS.kubernetes.categories`.

## Prerequisites

- A reachable Kubernetes cluster.
- `kubectl` configured (KUBECONFIG env var pointing at the kubeconfig, or `~/.kube/config` default).
- The deployer creates `ice-test` namespace automatically (override via `ICE_K8S_TEST_NAMESPACE`).

## Run a single handler

```sh
pnpm test:live:kubernetes deployment
pnpm test:live:kubernetes statefulset
pnpm test:live:kubernetes ingress
```

Each test does a create + delete round-trip. JSONL run-state lives under `runs/<runId>.jsonl`. Append-only.

## Cluster requirements per handler

| Handler                                   | Requires                                                                                                    |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `k8s.apps.deployment`                     | basic permissions on apps/v1                                                                                |
| `k8s.apps.statefulset` (Postgres profile) | apps/v1 + a default StorageClass + 1Gi available                                                            |
| `k8s.networking.ingress`                  | ingress-nginx OR another ingress controller for routing to actually work; the API write succeeds without it |
| `k8s.certmanager.certificate`             | cert-manager installed in the cluster                                                                       |
| `k8s.serving.service`                     | Knative Serving installed                                                                                   |
| `k8s.monitoring.prometheusrule`           | Prometheus Operator installed                                                                               |

The test API-only verifies create/delete; routing / cert-issuance / metric-eval is the operator's responsibility.

## Cleanup

`finally` blocks clean up per-test. For orphaned resources (test crashed mid-run), run:

```sh
pnpm exec tsx e2e/kubernetes-deployment-tests/cleanup-orphans.ts --dry-run
pnpm exec tsx e2e/kubernetes-deployment-tests/cleanup-orphans.ts --delete
```

Filter: every resource the live tests create carries `app.kubernetes.io/managed-by: ice` and `ice.deploy/test-run-id=<runId>` labels.
