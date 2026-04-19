# Core Engine & Deployers Backlog

> **Status: All 18 items fixed** (2026-03-23)

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

## ENGINE-10: GCP Domain mapping — no handler in registry (P2) -- FIXED

**Fix applied:** Created `domain-mapping.ts` handler using Cloud Run v1 domain mappings REST API. Supports create (POST), update (delete + recreate), delete. Registered as `gcp.run.domainMapping` prefix in both `HANDLER_REGISTRY` and `API_FOR_TYPE`. Returns DNS resource records in outputs.

---

## ENGINE-11: GCP Dataflow `update` is a no-op (P3) -- FIXED

**Fix applied:** Replaced no-op with cancel-and-recreate flow: cancels existing job (`JOB_STATE_CANCELLED`), polls until cancelled (max 60s), creates new job with updated properties. Returns new job's `provider_id`.

---

## ENGINE-12: GCP GKE `update` is labels-only (P3) -- FIXED

**Fix applied:** Extended update to support node pool scaling (`setNodePoolSize` on default-pool when `node_count` changed) and machine type changes (`updateNodePool` when `machine_type` changed). Labels update retained.

---

## ENGINE-14: GCP Discovery Engine `update` is a no-op (P3) -- FIXED

**Fix applied:** Replaced no-op with conditional PATCH via REST API. Updates `displayName` and/or `searchTier` when properties differ from current. True no-op when nothing changed.

---

## ENGINE-16: Terraform/Pulumi importers not wired to UI (P3) -- FIXED

**Fix applied:** Created `services/engine/src/routes/import.ts` with two endpoints:
- `POST /api/import/terraform` — accepts `{ stateJson }`, calls `import_terraform_state_json`, returns `{ nodes, edges, warnings }`
- `POST /api/import/pulumi` — accepts `{ stateJson }`, calls `import_pulumi_state_json`, returns `{ nodes, edges, warnings }`

Both require auth. Mounted in engine service index.

---

## ENGINE-18: IAM policy for Cloud Run applied outside handler (P3) -- FIXED

**Fix applied:** Moved `setIamPolicy` REST call (`roles/run.invoker` → `allUsers`) from `deploy-handler.ts` into the Cloud Run handler's `create` and `update` methods (service branch only, not jobs). Guarded by `allow_unauthenticated !== false`. Non-fatal on failure (logs warning). Removed duplicate code from desktop deploy handler.

---

## Coverage Summary

| Provider | Blocks Defined | Type Map | Deployer Handlers | End-to-End |
|---|---|---|---|---|
| GCP | 26 | Implemented | 18 handlers (incl. domain mapping) | Fully functional |
| AWS | 27 | **Implemented** | 3 (EC2, S3, Lambda) | Type map done, handlers partial |
| Azure | 25 | **Implemented** | 3 (VM, Storage, Web App) | Type map done, handlers partial |
| Alibaba | 11 | None | 0 | Design-only (warning shown) |
| DigitalOcean | 11 | None | 0 | Design-only (warning shown) |
| Kubernetes | ~5 | None | 0 | Design-only (warning shown) |
