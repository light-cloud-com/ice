# Core Engine & Deployers Backlog

## ENGINE-1: AWS canvas deployment completely non-functional (P1)

**Files:**
- `packages/core/src/deploy/card-translator.ts:577-578` — `// Stub: AWS type map not yet implemented`, returns `{}`
- `packages/core/src/deploy/providers/aws-deployer.ts` — only handles 3 types (EC2, S3, Lambda)

27 AWS blocks are defined in the registry but the card translator produces zero deployable nodes for AWS canvases. No errors are surfaced — just silent empty output.

**Fix:** Implement the AWS type map in `card-translator.ts`. Add handlers for key AWS services (ECS/Fargate, RDS, DynamoDB, SQS, SNS, API Gateway, CloudFront at minimum).

---

## ENGINE-2: Azure canvas deployment completely non-functional (P1)

**Files:**
- `packages/core/src/deploy/card-translator.ts:580-581` — `// Stub: Azure type map not yet implemented`, returns `{}`
- `packages/core/src/deploy/providers/azure-deployer.ts` — only handles 3 types (VM, Storage, Web App)

Same problem as AWS. 25 Azure blocks defined, zero deployable.

**Fix:** Implement Azure type map and key service handlers.

---

## ENGINE-3: Alibaba, DigitalOcean, Kubernetes — zero deployer support (P2)

**Files:** `packages/blocks/src/alibaba/`, `packages/blocks/src/digitalocean/`, `packages/blocks/src/kubernetes/`

11 Alibaba, 11 DigitalOcean, and multiple Kubernetes blocks are defined with no deployer support anywhere. Users can drag these onto the canvas but deploying them silently does nothing.

**Fix:** Either add deployer support or clearly mark these as "design-only" blocks in the UI with a warning on deploy.

---

## ENGINE-4: Apply engine hardcoded to mock provider (P2)

**File:** `packages/core/src/apply/apply-engine.ts:388-390`

```ts
// Always use mock provider for now
return create_mock_provider('mock');
```

The Plan/Apply pipeline always uses the mock. Real deployments (desktop app) bypass the apply engine entirely and call `GCPDeployer` directly.

**Fix:** Wire the apply engine to real provider deployers. This is the clean path for all deployment flows.

---

## ENGINE-5: `deploy:destroy` IPC handler returns "not implemented" (P2)

**File:** `apps/desktop/src/main/deploy-handler.ts:810-818`

Returns `{ success: false, error: 'Destroy not implemented' }`. There is no teardown flow for any provider.

---

## ENGINE-6: `deploy:getStatus` IPC handler is a stub (P2)

**File:** `apps/desktop/src/main/deploy-handler.ts:822-824`

Returns `{ status: 'unknown', deploymentId }` with no actual status lookup.

---

## ENGINE-7: GCP Load Balancer handler incomplete (P2)

**File:** `packages/core/src/deploy/providers/gcp/handlers/load-balancer.ts`

Only creates a `globalForwardingRule`. A real load balancer needs backend service, URL map, target HTTP/HTTPS proxy, and SSL certificates. The handler creates 1 of 4-5 necessary resources.

---

## ENGINE-8: GCP API Gateway handler incomplete (P2)

**File:** `packages/core/src/deploy/providers/gcp/handlers/api-gateway.ts`

Creates only the API object, not the ApiConfig or Gateway resource. A functional API Gateway requires all three.

---

## ENGINE-9: GCP Cloud Functions missing source attachment (P2)

**File:** `packages/core/src/deploy/providers/gcp/handlers/cloud-functions.ts`

The `buildConfig` sets `runtime` and `entryPoint` but has no `source.storageSource` or `source.repoSource`. Cloud Functions v2 requires a source — the current payload will fail at GCP's API.

---

## ENGINE-10: GCP Domain mapping — no handler in registry (P2)

**File:** `packages/core/src/deploy/card-translator.ts:98`

`Networking.Domain` maps to `gcp.run.domainMapping` which has a property extractor but no handler in `HANDLER_REGISTRY`. Deploying a Domain block returns `UNSUPPORTED_TYPE`.

---

## ENGINE-11: GCP Dataflow `update` is a no-op (P3)

**File:** `packages/core/src/deploy/providers/gcp/handlers/dataflow.ts:82`

`update` returns success without doing anything. Comment says "Dataflow jobs cannot be updated in-place; they must be drained and recreated" but no drain-and-recreate logic exists.

---

## ENGINE-12: GCP GKE `update` is labels-only (P3)

**File:** `packages/core/src/deploy/providers/gcp/handlers/gke.ts:103-119`

Only label changes supported. Scaling, machine type, and other changes are silently ignored.

---

## ENGINE-13: GCP Vertex AI type detection is fragile name heuristic (P3)

**File:** `packages/core/src/deploy/providers/gcp/handlers/vertex-ai.ts:56-57`

Type (index vs endpoint) inferred from resource name containing "vector" or "index". Breaks if users name resources differently.

**Fix:** Use an explicit type field on the block/node data instead of name heuristics.

---

## ENGINE-14: GCP Discovery Engine `update` is a no-op (P3)

**File:** `packages/core/src/deploy/providers/gcp/handlers/discovery-engine.ts:89`

Returns success immediately with no API calls.

---

## ENGINE-15: `Messaging.Topic` maps to `gcp.dataflow.job` — wrong mapping (P2)

**File:** `packages/core/src/deploy/card-translator.ts:88`

Topics are Pub/Sub, not Dataflow. Should map to `gcp.pubsub.topic`.

---

## ENGINE-16: Terraform/Pulumi importers not wired to UI (P3)

**Files:** `packages/core/src/importers/terraform/`, `packages/core/src/importers/pulumi/`

Both importers exist as modules but are not exposed via any IPC handler or API route. Users cannot invoke them.

---

## ENGINE-17: Duplicate deployer files across `packages/core/` and `packages/providers/` (P3)

**Files:**
- `packages/core/src/deploy/providers/gcp-deployer.ts` — legacy GCP (dead code)
- `packages/providers/gcp/src/gcp-deployer-legacy.ts` — duplicate of above
- `packages/providers/aws/src/aws-deployer.ts` — identical to `packages/core/src/deploy/providers/aws-deployer.ts`
- `packages/providers/azure/src/azure-deployer.ts` — identical to `packages/core/src/deploy/providers/azure-deployer.ts`

**Fix:** Delete the duplicates. Keep the canonical versions in `packages/core/` (where they're actually imported) or migrate fully to `packages/providers/`.

---

## ENGINE-18: IAM policy for Cloud Run applied outside handler (P3)

**File:** `apps/desktop/src/main/deploy-handler.ts:573-604`

Setting IAM policy for public Cloud Run access is done in `deploy-handler.ts` rather than in the Cloud Run handler because the handler's REST client "silently fails" for this call. This is fragile cross-cutting concern duplicated outside the deploy engine.

**Fix:** Fix the handler's REST client and move IAM policy setting into the Cloud Run handler.

---

## Coverage Summary

| Provider | Blocks Defined | Deployer Handlers | Card Translator | End-to-End |
|---|---|---|---|---|
| GCP | 26 | ~17 | Implemented | Mostly works |
| AWS | 27 | 3 (EC2, S3, Lambda) | Empty stub | Non-functional |
| Azure | 25 | 3 (VM, Storage, Web App) | Empty stub | Non-functional |
| Alibaba | 11 | 0 | None | Non-functional |
| DigitalOcean | 11 | 0 | None | Non-functional |
| Kubernetes | ~5 | 0 | None | Non-functional |
