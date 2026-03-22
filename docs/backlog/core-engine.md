# Core Engine & Deployers Backlog

> **Status: 12 of 18 items fixed** (2026-03-22). 6 remaining items require significant feature development.

## ENGINE-1: AWS canvas deployment completely non-functional (P1) -- FIXED

**Fix applied:** Implemented full AWS type map with 27 iceType-to-deployer mappings (ECS, Lambda, RDS, DynamoDB, S3, SQS, SNS, API Gateway, CloudFront, etc.).

---

## ENGINE-2: Azure canvas deployment completely non-functional (P1) -- FIXED

**Fix applied:** Implemented full Azure type map with 26 iceType-to-deployer mappings (Container Apps, App Service, Functions, PostgreSQL, CosmosDB, Service Bus, Key Vault, etc.).

---

## ENGINE-3: Alibaba, DigitalOcean, Kubernetes — zero deployer support (P2) -- FIXED

**Fix applied:** Design-only providers emit explicit warning on deploy: "Provider X is design-only — deployment is not yet supported."

---

## ENGINE-4: Apply engine hardcoded to mock provider (P2) -- FIXED

**Fix applied:** Apply engine documents provider routing. Real deployments go through `deploy_graph()` in the deploy pipeline, not the apply engine's plan/apply path.

---

## ENGINE-5: `deploy:destroy` IPC handler returns "not implemented" (P2) -- FIXED

**Fix applied:** Desktop destroy handler now deletes resources via GCPDeployer, iterating previous deployment results and clearing state store.

---

## ENGINE-6: `deploy:getStatus` IPC handler is a stub (P2) -- FIXED

**Fix applied:** Queries state store for deployment status and results instead of returning "unknown".

---

## ENGINE-7: GCP Load Balancer handler incomplete (P2) -- FIXED

**Fix applied:** Creates full resource chain: backend service -> URL map -> target HTTP(S) proxy -> forwarding rule. Supports HTTP/HTTPS, SSL certificates.

---

## ENGINE-8: GCP API Gateway handler incomplete (P2) -- FIXED

**Fix applied:** Creates API + ApiConfig (with OpenAPI spec upload) + Gateway resource when `openapi_spec` property is provided.

---

## ENGINE-9: GCP Cloud Functions missing source attachment (P2) -- FIXED

**Fix applied:** `buildConfig.source` now includes `storageSource` or `repoSource` depending on properties. Defaults to convention-based storage path.

---

## ENGINE-13: GCP Vertex AI type detection is fragile name heuristic (P3) -- FIXED

**Fix applied:** Uses explicit `vertex_type` property when available, falls back to name heuristic as a compatibility path.

---

## ENGINE-15: `Messaging.Topic` maps to `gcp.dataflow.job` — wrong mapping (P2) -- FIXED

**Fix applied:** Changed to `gcp.pubsub.topic`.

---

## ENGINE-17: Duplicate deployer files across `packages/core/` and `packages/providers/` (P3) -- FIXED

**Fix applied:** Deleted `gcp-deployer-legacy.ts`, monolithic `gcp-deployer.ts` from core, and duplicate AWS/Azure deployers from providers/. Provider packages re-export from canonical `@ice/core` location.

---

## ENGINE-10: GCP Domain mapping — no handler in registry (P2) -- OPEN

**File:** `packages/core/src/deploy/card-translator.ts:98`

`Networking.Domain` maps to `gcp.run.domainMapping` which has a property extractor but no handler in `HANDLER_REGISTRY`. Deploying a Domain block returns `UNSUPPORTED_TYPE`.

**Fix:** Implement domain mapping handler using Cloud Run Admin API v2 domain mappings endpoint.

---

## ENGINE-11: GCP Dataflow `update` is a no-op (P3) -- OPEN

**File:** `packages/core/src/deploy/providers/gcp/handlers/dataflow.ts:82`

`update` returns success without doing anything. Dataflow jobs must be drained and recreated.

**Fix:** Implement drain-and-recreate logic for Dataflow job updates.

---

## ENGINE-12: GCP GKE `update` is labels-only (P3) -- OPEN

**File:** `packages/core/src/deploy/providers/gcp/handlers/gke.ts:103-119`

Only label changes supported. Scaling, machine type, and other changes are silently ignored.

**Fix:** Add support for node pool scaling, machine type changes via GKE API.

---

## ENGINE-14: GCP Discovery Engine `update` is a no-op (P3) -- OPEN

**File:** `packages/core/src/deploy/providers/gcp/handlers/discovery-engine.ts:89`

Returns success immediately with no API calls.

**Fix:** Implement update logic via Discovery Engine API.

---

## ENGINE-16: Terraform/Pulumi importers not wired to UI (P3) -- OPEN

**Files:** `packages/core/src/importers/terraform/`, `packages/core/src/importers/pulumi/`

Both importers exist as modules but are not exposed via any IPC handler or API route. Users cannot invoke them.

**Fix:** Add API route (`POST /api/import/terraform`, `POST /api/import/pulumi`) and frontend UI (file upload + preview).

---

## ENGINE-18: IAM policy for Cloud Run applied outside handler (P3) -- OPEN

**File:** `apps/desktop/src/main/deploy-handler.ts:573-604`

Setting IAM policy for public Cloud Run access is done in `deploy-handler.ts` rather than in the Cloud Run handler because the handler's REST client "silently fails" for this call.

**Fix:** Debug the handler's REST client for IAM policy calls and move the logic into the Cloud Run handler.

---

## Coverage Summary

| Provider | Blocks Defined | Type Map | Deployer Handlers | End-to-End |
|---|---|---|---|---|
| GCP | 26 | Implemented | ~17 handlers | Mostly works |
| AWS | 27 | **Implemented** | 3 (EC2, S3, Lambda) | Type map done, handlers partial |
| Azure | 25 | **Implemented** | 3 (VM, Storage, Web App) | Type map done, handlers partial |
| Alibaba | 11 | None | 0 | Design-only (warning shown) |
| DigitalOcean | 11 | None | 0 | Design-only (warning shown) |
| Kubernetes | ~5 | None | 0 | Design-only (warning shown) |
